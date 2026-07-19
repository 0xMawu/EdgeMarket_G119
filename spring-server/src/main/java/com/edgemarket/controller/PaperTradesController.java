package com.edgemarket.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Paper trading endpoints.
 *
 * POST /api/paper-trades
 *   Copies the target wallet's current open positions on Polymarket into the
 *   authenticated user's paper portfolio. Idempotent — existing positions are
 *   skipped (entry_price / created_at preserved).
 *   Requires: Authorization: Bearer <jwt>, body: { userAddress, targetAddress }
 *
 * GET /api/paper-trades/{userAddress}
 *   Returns the user's paper portfolio enriched with live prices and unrealised
 *   P&L fetched from the Polymarket positions endpoint. Public — no JWT needed.
 *
 * Settlement note:
 *   Whether a market is "settled" is determined ONLY by Polymarket's own
 *   `closed` flag (via closed-positions, or a direct Gamma API lookup as a
 *   fallback). `end_date` is stored and returned for display purposes only —
 *   it is NOT used to decide settlement, because markets frequently resolve
 *   before or after their listed end date.
 */
@RestController
@RequestMapping("/api/paper-trades")
public class PaperTradesController {

    private static final Logger log = LoggerFactory.getLogger(PaperTradesController.class);

    private static final String POSITIONS_URL =
            "https://data-api.polymarket.com/positions?user=%s&limit=100&sortBy=CURRENTVALUE&sortDirection=DESC";

    private static final String CLOSED_POSITIONS_URL =
            "https://data-api.polymarket.com/closed-positions?user=%s&limit=500";

    private static final String GAMMA_MARKET_BY_CONDITION_URL =
            "https://gamma-api.polymarket.com/markets?conditionId=%s&limit=1";

    private static final Pattern ADDRESS_PATTERN =
            Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private static final Pattern NUMBER_PATTERN = Pattern.compile("[\\d.]+");
    private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("\"([^\"]+)\"");

    private final JdbcTemplate jdbc;
    private final RestTemplate restTemplate = new RestTemplate();

    public PaperTradesController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── POST /api/paper-trades ────────────────────────────────────────────────
    // Body variants:
    //   { userAddress, targetAddress }                      — copy ALL positions (legacy)
    //   { userAddress, targetAddress, conditionId,
    //     entryPrice, shares, marketTitle, outcome,
    //     betAmount }                                        — copy a single position

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> copyPositions(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {

        String userAddress   = str(body, "userAddress");
        String targetAddress = str(body, "targetAddress");

        // 1. Address format validation
        if (!isValidAddress(userAddress) || !isValidAddress(targetAddress)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "userAddress and targetAddress must be valid Ethereum addresses or UUIDs"));
        }

        // 2. JWT sub-match (AuthFilter already validated the JWT; this checks ownership)
        String authenticatedAddress = (String) request.getAttribute("authenticatedAddress");
        if (authenticatedAddress == null || !authenticatedAddress.equalsIgnoreCase(userAddress)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden: token subject does not match userAddress"));
        }

        String userLower   = userAddress.toLowerCase();
        String targetLower = targetAddress.toLowerCase();

        // ── Single-position copy ────────────────────────────────────────────
        String singleConditionId = str(body, "conditionId");
        if (singleConditionId != null && !singleConditionId.isBlank()) {
            return copySinglePosition(body, userLower, targetLower, singleConditionId);
        }

        // ── Bulk copy (legacy) — copy all positions from target wallet ──────
        return copyAllPositions(userLower, targetLower);
    }

    private ResponseEntity<?> copySinglePosition(
            Map<String, Object> body, String userLower, String targetLower, String conditionId) {

        double entryPrice = toDouble(body.get("entryPrice"));
        double betAmount  = toDouble(body.get("betAmount"));
        String title      = str(body, "marketTitle");
        String outcome    = str(body, "outcome");
        String endDateStr = str(body, "endDate"); // ISO string from frontend positions data — display only

        if (entryPrice <= 0) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "entryPrice must be greater than 0"));
        }
        if (betAmount <= 0) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "betAmount must be greater than 0"));
        }

        double shares = round2(betAmount / entryPrice);

        java.sql.Timestamp endDate = null;
        if (endDateStr != null && !endDateStr.isBlank()) {
            try {
                endDate = java.sql.Timestamp.from(java.time.Instant.parse(endDateStr));
            } catch (Exception ignored) {
                // leave null — display-only field, not worth failing the request over
            }
        }

        try {
            int rows = jdbc.update(
                    """
                    INSERT INTO paper_trades
                        (user_address, target_address, market_id, entry_price, shares, market_title, outcome, end_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (user_address, target_address, market_id) DO UPDATE
                        SET entry_price  = EXCLUDED.entry_price,
                            shares       = EXCLUDED.shares,
                            market_title = EXCLUDED.market_title,
                            outcome      = EXCLUDED.outcome,
                            end_date     = EXCLUDED.end_date
                    """,
                    userLower, targetLower, conditionId,
                    BigDecimal.valueOf(entryPrice),
                    BigDecimal.valueOf(shares),
                    title, outcome, endDate
            );
            return ResponseEntity.status(rows > 0 ? HttpStatus.CREATED : HttpStatus.OK)
                    .body(Map.of("created", 1, "skipped", 0, "shares", shares));
        } catch (Exception e) {
            log.error("[paperTrades] DB insert error (single): {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }
    }

    private ResponseEntity<?> copyAllPositions(String userLower, String targetLower) {
        List<Map<String, Object>> positions;
        try {
            Object response = restTemplate.getForObject(
                    URI.create(String.format(POSITIONS_URL, targetLower)), Object.class);
            if (!(response instanceof List<?> list) || list.isEmpty()) {
                return ResponseEntity.unprocessableEntity()
                        .body(Map.of("error", "Target wallet has no open positions to copy"));
            }
            //noinspection unchecked
            positions = (List<Map<String, Object>>) list;
        } catch (Exception e) {
            log.warn("[paperTrades] Polymarket fetch failed for {}: {}", targetLower, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Unable to fetch target wallet positions", "upstream", e.getMessage()));
        }

        if (positions.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("error", "Target wallet has no open positions to copy"));
        }

        int created = 0;
        int skipped = 0;

        for (Map<String, Object> pos : positions) {
            String conditionId = str(pos, "conditionId");
            double avgPrice    = toDouble(pos.get("avgPrice"));
            double size        = toDouble(pos.get("size"));
            String title       = str(pos, "title");
            String outcome     = str(pos, "outcome");

            if (conditionId == null || conditionId.isBlank() || avgPrice <= 0 || size <= 0) {
                continue; // skip malformed entries
            }

            try {
                int rows = jdbc.update(
                        """
                        INSERT INTO paper_trades
                            (user_address, target_address, market_id, entry_price, shares, market_title, outcome)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (user_address, target_address, market_id) DO NOTHING
                        """,
                        userLower, targetLower, conditionId,
                        BigDecimal.valueOf(avgPrice),
                        BigDecimal.valueOf(size),
                        title, outcome
                );
                if (rows > 0) created++; else skipped++;
            } catch (Exception e) {
                log.error("[paperTrades] DB insert error: {}", e.getMessage());
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", "Internal server error"));
            }
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("created", created, "skipped", skipped));
    }

    // ── GET /api/paper-trades/backfill/{userAddress} ────────────────────────
    // Best-effort: populates end_date for display purposes. Not used for
    // settlement logic (see class-level note).

    @GetMapping("/backfill/{userAddress}")
    public ResponseEntity<?> backfillDates(@PathVariable String userAddress) {
        if (!isValidAddress(userAddress)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid address"));
        }
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList(
                    "SELECT id, market_id FROM paper_trades WHERE user_address = ?",
                    userAddress.toLowerCase());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", e.getMessage()));
        }

        int updated = 0;
        for (Map<String, Object> row : rows) {
            String marketId = (String) row.get("market_id");
            if (marketId == null) continue;
            try {
                Map<?, ?> market = fetchGammaMarket(marketId);
                if (market != null) {
                    String endDateStr = str(market, "endDate");
                    if (endDateStr != null) {
                        java.sql.Timestamp ts = java.sql.Timestamp.from(java.time.Instant.parse(endDateStr));
                        jdbc.update("UPDATE paper_trades SET end_date = ? WHERE id = ?", ts, row.get("id"));
                        updated++;
                    }
                }
            } catch (Exception e) {
                log.debug("[backfill] failed for market_id={}: {}", marketId, e.getMessage());
            }
        }
        return ResponseEntity.ok(Map.of("updated", updated, "total", rows.size()));
    }

    // ── GET /api/paper-trades/{userAddress} ───────────────────────────────────

    @GetMapping("/{userAddress}")
    public ResponseEntity<?> getPortfolio(@PathVariable String userAddress) {
        if (!isValidAddress(userAddress)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid wallet address"));
        }

        String userLower = userAddress.toLowerCase();

        // 1. Load stored paper trades
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList(
                    """
                    SELECT id, target_address, market_id, entry_price, shares,
                           market_title, outcome, end_date, created_at,
                           notified_closed, closed_price, realized_pnl, closed_at
                    FROM paper_trades
                    WHERE user_address = ?
                    ORDER BY created_at DESC
                    """,
                    userLower
            );
        } catch (Exception e) {
            log.error("[paperTrades] DB read error: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Internal server error"));
        }

        if (rows.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "trades", List.of(),
                    "portfolioSummary", Map.of(
                            "totalTrades", 0,
                            "totalUnrealisedPnl", 0.0,
                            "groupedByTarget", Map.of()
                    )
            ));
        }

        // 2. Group by target_address
        Map<String, List<Map<String, Object>>> byTarget = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String target = (String) row.get("target_address");
            byTarget.computeIfAbsent(target, k -> new ArrayList<>()).add(row);
        }

        // 3. Fetch live + closed positions per target wallet (batch, deduplicated)
        Map<String, Double> livePrices    = new HashMap<>(); // conditionId -> current price (open)
        Map<String, String> liveOutcomes  = new HashMap<>();
        Map<String, String> liveTitles    = new HashMap<>();
        Map<String, Double> closedPrices  = new HashMap<>(); // conditionId -> resolved price (1.0/0.0)
        Set<String> closedConditionIds    = new HashSet<>(); // conditionIds confirmed resolved

        for (String target : byTarget.keySet()) {
            fetchOpenPositions(target, livePrices, liveOutcomes, liveTitles);
            fetchClosedPositions(target, closedPrices, closedConditionIds, liveOutcomes, liveTitles);
        }

        // 4. Enrich each trade
        List<Map<String, Object>> enrichedTrades = new ArrayList<>();
        double totalUnrealisedPnl = 0.0;

        for (Map<String, Object> row : rows) {
            String conditionId = (String) row.get("market_id");
            double entryPrice  = toDouble(row.get("entry_price"));
            double shares       = toDouble(row.get("shares"));

            Double livePrice   = conditionId != null ? livePrices.get(conditionId) : null;
            Double closedPrice = conditionId != null ? closedPrices.get(conditionId) : null;

            boolean settled = (livePrice == null && closedPrice != null)
                    || (conditionId != null && closedConditionIds.contains(conditionId));
            Double effectivePrice = livePrice != null ? livePrice : closedPrice;

            // Once the settlement watcher has frozen this trade's close, use its
            // stored values so the figure shown here always matches the amount
            // that was pushed to the user in the "trade closed" notification.
            boolean notifiedClosed = Boolean.TRUE.equals(row.get("notified_closed"));
            Double frozenClosePrice = row.get("closed_price") != null ? toDouble(row.get("closed_price")) : null;
            if (notifiedClosed && frozenClosePrice != null) {
                settled = true;
                effectivePrice = frozenClosePrice;
            }

            // Fallback: market not found in the target's open/closed positions
            // (e.g. target already fully exited). Ask Gamma directly and trust
            // its `closed` flag — the only authoritative resolution signal.
            if (conditionId != null && (effectivePrice == null || !settled)) {
                GammaLookupResult gammaResult = lookupGammaOutcome(
                        conditionId, liveOutcomes.getOrDefault(conditionId, str(row, "outcome")));
                if (gammaResult != null) {
                    settled = settled || gammaResult.closed;
                    if (effectivePrice == null && gammaResult.price != null) {
                        effectivePrice = gammaResult.price;
                    }
                    if (gammaResult.title != null) {
                        liveTitles.putIfAbsent(conditionId, gammaResult.title);
                    }
                }
            }

            Double unrealisedPnl = null;
            Double pnlPercentage = null;
            if (effectivePrice != null && entryPrice > 0) {
                unrealisedPnl = round2((effectivePrice - entryPrice) * shares);
                pnlPercentage = round2(((effectivePrice - entryPrice) / entryPrice) * 100);
                totalUnrealisedPnl += unrealisedPnl;
            }

            // end_date is display-only — NOT used to determine settlement,
            // since markets can resolve before or after their listed end date.
            java.sql.Timestamp endDateTs = row.get("end_date") instanceof java.sql.Timestamp ts ? ts : null;

            Map<String, Object> trade = new LinkedHashMap<>();
            trade.put("id",            row.get("id"));
            trade.put("targetAddress", row.get("target_address"));
            trade.put("marketId",      conditionId);
            trade.put("marketTitle",   liveTitles.getOrDefault(conditionId, str(row, "market_title")));
            trade.put("outcome",       liveOutcomes.getOrDefault(conditionId, str(row, "outcome")));
            trade.put("entryPrice",    entryPrice);
            trade.put("shares",        shares);
            trade.put("livePrice",     effectivePrice);
            trade.put("settled",       settled);
            trade.put("unrealisedPnl", unrealisedPnl);
            trade.put("pnlPercentage", pnlPercentage);
            trade.put("endDate",       endDateTs != null ? endDateTs.toInstant().toString() : null);
            trade.put("createdAt",     row.get("created_at").toString());
            trade.put("notifiedClosed", notifiedClosed);
            trade.put("closedAt",      row.get("closed_at") instanceof java.sql.Timestamp cts ? cts.toInstant().toString() : null);
            enrichedTrades.add(trade);
        }

        // 5. Build groupedByTarget map
        Map<String, List<Map<String, Object>>> groupedByTarget = new LinkedHashMap<>();
        for (Map<String, Object> trade : enrichedTrades) {
            String target = (String) trade.get("targetAddress");
            groupedByTarget.computeIfAbsent(target, k -> new ArrayList<>()).add(trade);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalTrades",        enrichedTrades.size());
        summary.put("totalUnrealisedPnl", round2(totalUnrealisedPnl));
        summary.put("groupedByTarget",    groupedByTarget);

        return ResponseEntity.ok(Map.of(
                "trades", enrichedTrades,
                "portfolioSummary", summary
        ));
    }

    // ── Position fetch helpers ──────────────────────────────────────────────

    private void fetchOpenPositions(
            String target,
            Map<String, Double> livePrices,
            Map<String, String> liveOutcomes,
            Map<String, String> liveTitles) {
        try {
            Object response = restTemplate.getForObject(
                    URI.create(String.format(POSITIONS_URL, target)), Object.class);
            if (response instanceof List<?> list) {
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> p)) continue;
                    String cid = str(p, "conditionId");
                    if (cid == null) continue;
                    livePrices.put(cid, toDouble(p.get("curPrice")));
                    if (p.get("outcome") != null) liveOutcomes.put(cid, str(p, "outcome"));
                    if (p.get("title") != null) liveTitles.put(cid, str(p, "title"));
                }
            }
        } catch (Exception e) {
            log.warn("[paperTrades] live price fetch failed for {}: {}", target, e.getMessage());
        }
    }

    private void fetchClosedPositions(
            String target,
            Map<String, Double> closedPrices,
            Set<String> closedConditionIds,
            Map<String, String> liveOutcomes,
            Map<String, String> liveTitles) {
        try {
            Object response = restTemplate.getForObject(
                    URI.create(String.format(CLOSED_POSITIONS_URL, target)), Object.class);
            if (response instanceof List<?> list) {
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> p)) continue;
                    String cid = str(p, "conditionId");
                    if (cid == null) continue;
                    // curPrice=1 means the target held the winning outcome, curPrice=0 = losing
                    closedPrices.put(cid, toDouble(p.get("curPrice")));
                    closedConditionIds.add(cid);
                    if (p.get("outcome") != null) liveOutcomes.putIfAbsent(cid, str(p, "outcome"));
                    if (p.get("title") != null) liveTitles.putIfAbsent(cid, str(p, "title"));
                }
            }
        } catch (Exception e) {
            log.warn("[paperTrades] closed-positions fetch failed for {}: {}", target, e.getMessage());
        }
    }

    /**
     * Direct Gamma API lookup by conditionId, used when a market isn't found
     * via the target wallet's open/closed positions (e.g. the target has
     * fully exited). Returns whether the market is closed and, if a stored
     * outcome name is supplied and matches one of Gamma's outcome labels,
     * the resolved/current price for that outcome.
     */
    private GammaLookupResult lookupGammaOutcome(String conditionId, String storedOutcome) {
        Map<?, ?> market = fetchGammaMarket(conditionId);
        if (market == null) return null;

        boolean closed = Boolean.TRUE.equals(market.get("closed"));
        String title = str(market, "title");
        Double price = null;

        String outcomePricesStr = str(market, "outcomePrices");
        String outcomesStr = str(market, "outcomes");
        if (outcomePricesStr != null && outcomesStr != null && storedOutcome != null) {
            List<Double> prices = parseNumberList(outcomePricesStr);
            List<String> names = parseQuotedStringList(outcomesStr);
            for (int i = 0; i < names.size() && i < prices.size(); i++) {
                if (names.get(i).equalsIgnoreCase(storedOutcome)) {
                    price = prices.get(i);
                    break;
                }
            }
            if (price == null) {
                log.debug("[paperTrades] outcome '{}' not matched in Gamma outcomes {} for market {}",
                        storedOutcome, names, conditionId);
            }
        }

        return new GammaLookupResult(closed, price, title);
    }

    private Map<?, ?> fetchGammaMarket(String conditionId) {
        try {
            String url = String.format(GAMMA_MARKET_BY_CONDITION_URL, conditionId);
            Object resp = restTemplate.getForObject(URI.create(url), Object.class);
            if (resp instanceof List<?> list) {
                // find the exact match — the API does partial search so verify conditionId
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m && conditionId.equalsIgnoreCase(str(m, "conditionId"))) {
                        return m;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[paperTrades] gamma lookup failed for {}: {}", conditionId, e.getMessage());
        }
        return null;
    }

    private List<Double> parseNumberList(String raw) {
        List<Double> out = new ArrayList<>();
        Matcher m = NUMBER_PATTERN.matcher(raw);
        while (m.find()) out.add(Double.parseDouble(m.group()));
        return out;
    }

    private List<String> parseQuotedStringList(String raw) {
        List<String> out = new ArrayList<>();
        Matcher m = QUOTED_STRING_PATTERN.matcher(raw);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    private record GammaLookupResult(boolean closed, Double price, String title) {}

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean isValidAddress(String addr) {
        return addr != null && (ADDRESS_PATTERN.matcher(addr).matches()
            || UUID_PATTERN.matcher(addr).matches());
    }

    private double toDouble(Object val) {
        if (val == null) return 0.0;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0.0; }
    }

    private double round2(double val) {
        return BigDecimal.valueOf(val).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        return v == null ? null : v.toString();
    }
}