package com.edgemarket.worker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Copy-trading settlement watcher.
 *
 * Separate from {@link TradeWatcherService} (which alerts on a followed
 * trader's *new* trades). This service watches the *user's own copied
 * positions* (the paper_trades table) and fires a push notification the
 * moment one of them settles — showing WIN/LOSS and the realized $ amount.
 *
 * A position is considered settled using the exact same signal the
 * portfolio endpoint (PaperTradesController) uses: Polymarket's own
 * `closed` flag, via closed-positions first and a direct Gamma market
 * lookup as a fallback. Once notified, `notified_closed` is flipped to
 * TRUE so the same close is never pushed twice.
 */
@Service
public class TradeSettlementWatcherService {

    private static final Logger log = LoggerFactory.getLogger(TradeSettlementWatcherService.class);

    private static final String CLOSED_POSITIONS_URL =
        "https://data-api.polymarket.com/closed-positions?user=%s&limit=500";

    private static final String GAMMA_MARKET_BY_CONDITION_URL =
        "https://gamma-api.polymarket.com/markets?conditionId=%s&limit=1";

    private static final String EXPO_PUSH_URL =
        "https://exp.host/--/api/v2/push/send";

    private static final Pattern NUMBER_PATTERN = Pattern.compile("[\\d.]+");
    private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("\"([^\"]+)\"");

    private final JdbcTemplate jdbc;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${watcher.interval.ms:60000}")
    private long intervalMs;

    public TradeSettlementWatcherService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelayString = "${watcher.interval.ms:60000}", initialDelay = 15000)
    public void runSettlementCycle() {
        log.debug("[settlementWatcher] Running cycle");

        List<Map<String, Object>> openTrades;
        try {
            openTrades = jdbc.queryForList(
                """
                SELECT id, user_address, target_address, market_id,
                       entry_price, shares, market_title, outcome
                FROM paper_trades
                WHERE notified_closed = FALSE
                """
            );
        } catch (Exception e) {
            log.error("[settlementWatcher] Failed to fetch open paper trades: {}", e.getMessage());
            return;
        }

        if (openTrades.isEmpty()) return;

        // Group by target wallet so we only hit the closed-positions endpoint once per trader
        Map<String, List<Map<String, Object>>> byTarget = new LinkedHashMap<>();
        for (Map<String, Object> row : openTrades) {
            String target = (String) row.get("target_address");
            byTarget.computeIfAbsent(target, k -> new ArrayList<>()).add(row);
        }

        List<Map<String, Object>> notifications = new ArrayList<>();

        for (Map.Entry<String, List<Map<String, Object>>> entry : byTarget.entrySet()) {
            String target = entry.getKey();
            Map<String, Double> closedPrices = new HashMap<>();
            fetchClosedPositions(target, closedPrices);

            for (Map<String, Object> row : entry.getValue()) {
                String conditionId = (String) row.get("market_id");
                if (conditionId == null) continue;

                Double closePrice = closedPrices.get(conditionId);
                boolean closed = closePrice != null;

                // Fallback: target may have fully exited already — ask Gamma directly
                String storedOutcome = (String) row.get("outcome");
                if (!closed) {
                    GammaResult gr = lookupGammaOutcome(conditionId, storedOutcome);
                    if (gr != null && gr.closed) {
                        closed = true;
                        closePrice = gr.price;
                    }
                }

                if (!closed) continue; // still open — check again next cycle

                double entryPrice = toDouble(row.get("entry_price"));
                double shares = toDouble(row.get("shares"));
                // closePrice may still be null if Gamma couldn't match the outcome label;
                // treat as a loss (0.0) only when we're certain the market is closed but
                // can't resolve which side won — safer to skip and retry than mis-notify.
                if (closePrice == null) continue;

                double realizedPnl = round2((closePrice - entryPrice) * shares);
                boolean isWin = realizedPnl > 0;

                markNotified((Number) row.get("id"), closePrice, realizedPnl);

                String userAddress = (String) row.get("user_address");
                String pushToken = getPushToken(userAddress);
                if (pushToken != null && pushToken.startsWith("ExponentPushToken[")) {
                    String marketTitle = (String) row.get("market_title");
                    String label = marketTitle != null && !marketTitle.isBlank()
                        ? marketTitle
                        : conditionId.substring(0, Math.min(12, conditionId.length())) + "…";

                    String title = isWin ? "✅ Trade won" : "❌ Trade closed at a loss";
                    String body = String.format(
                        "%s: %s %s (%s)",
                        label,
                        isWin ? "+" + formatUsd(realizedPnl) : "-" + formatUsd(Math.abs(realizedPnl)),
                        isWin ? "profit" : "loss",
                        isWin ? "WIN" : "LOSS"
                    );

                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("type", "trade_closed");
                    data.put("tradeId", row.get("id"));
                    data.put("result", isWin ? "WIN" : "LOSS");
                    data.put("realizedPnl", realizedPnl);

                    Map<String, Object> msg = new LinkedHashMap<>();
                    msg.put("to", pushToken);
                    msg.put("title", title);
                    msg.put("body", body);
                    msg.put("data", data);
                    notifications.add(msg);
                }
            }
        }

        if (!notifications.isEmpty()) {
            sendExpoPushNotifications(notifications);
        }
    }

    private void markNotified(Number id, double closePrice, double realizedPnl) {
        try {
            jdbc.update(
                """
                UPDATE paper_trades
                SET notified_closed = TRUE,
                    closed_price    = ?,
                    realized_pnl    = ?,
                    closed_at       = NOW()
                WHERE id = ?
                """,
                BigDecimal.valueOf(closePrice),
                BigDecimal.valueOf(realizedPnl),
                id
            );
        } catch (Exception e) {
            log.error("[settlementWatcher] Failed to mark trade {} as notified: {}", id, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void fetchClosedPositions(String target, Map<String, Double> closedPrices) {
        try {
            String url = String.format(CLOSED_POSITIONS_URL, target);
            Object response = restTemplate.getForObject(URI.create(url), Object.class);
            if (response instanceof List<?> list) {
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> p)) continue;
                    Object cidObj = p.get("conditionId");
                    if (cidObj == null) continue;
                    closedPrices.put(cidObj.toString(), toDouble(p.get("curPrice")));
                }
            }
        } catch (Exception e) {
            log.warn("[settlementWatcher] closed-positions fetch failed for {}: {}", target, e.getMessage());
        }
    }

    private GammaResult lookupGammaOutcome(String conditionId, String storedOutcome) {
        try {
            String url = String.format(GAMMA_MARKET_BY_CONDITION_URL, conditionId);
            Object resp = restTemplate.getForObject(URI.create(url), Object.class);
            if (!(resp instanceof List<?> list)) return null;

            Map<?, ?> market = null;
            for (Object item : list) {
                if (item instanceof Map<?, ?> m && conditionId.equalsIgnoreCase(str(m, "conditionId"))) {
                    market = m;
                    break;
                }
            }
            if (market == null) return null;

            boolean closed = Boolean.TRUE.equals(market.get("closed"));
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
            }
            return new GammaResult(closed, price);
        } catch (Exception e) {
            log.debug("[settlementWatcher] gamma lookup failed for {}: {}", conditionId, e.getMessage());
            return null;
        }
    }

    private String getPushToken(String userAddress) {
        try {
            List<String> rows = jdbc.queryForList(
                "SELECT push_token FROM push_tokens WHERE user_address=?",
                String.class, userAddress);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private void sendExpoPushNotifications(List<Map<String, Object>> messages) {
        int chunkSize = 100;
        for (int i = 0; i < messages.size(); i += chunkSize) {
            List<Map<String, Object>> chunk = messages.subList(i, Math.min(i + chunkSize, messages.size()));
            try {
                restTemplate.postForObject(EXPO_PUSH_URL, chunk, Object.class);
                log.info("[settlementWatcher] Sent {} trade-closed notification(s)", chunk.size());
            } catch (Exception e) {
                log.error("[settlementWatcher] Push send error: {}", e.getMessage());
            }
        }
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

    private String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        return v == null ? null : v.toString();
    }

    private double toDouble(Object val) {
        if (val == null) return 0.0;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return 0.0; }
    }

    private double round2(double val) {
        return BigDecimal.valueOf(val).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private String formatUsd(double val) {
        return "$" + BigDecimal.valueOf(val).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private record GammaResult(boolean closed, Double price) {}
}
