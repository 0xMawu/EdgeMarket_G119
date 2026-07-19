package com.edgemarket.service;

import com.edgemarket.exception.SubscriptionCheckoutException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Handles Paystack subscription lifecycle.
 *
 * Flow:
 *  1. createCheckoutSession()  →  calls POST /transaction/initialize with a plan code
 *                                 → returns authorization_url for the mobile app to open.
 *  2. Paystack fires webhook    →  processWebhookEvent() verifies HMAC-SHA512 and
 *                                  updates subscription_tier in the DB.
 *
 * Relevant Paystack webhook events handled:
 *   charge.success              – first payment / renewal succeeded
 *   subscription.create         – subscription object was created
 *   subscription.disable        – subscription cancelled
 *   subscription.not_renew      – renewal failed / customer opted out
 */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private static final String PAYSTACK_BASE = "https://api.paystack.co";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    private final JdbcTemplate jdbcTemplate;
    private final String secretKey;
    private final String planCode;

    public SubscriptionService(
            JdbcTemplate jdbcTemplate,
            @Value("${paystack.secret.key:}") String secretKey,
            @Value("${paystack.plan.code:}") String planCode) {
        this.jdbcTemplate = jdbcTemplate;
        this.secretKey = secretKey;
        this.planCode = planCode;
    }

    // ── Static helper ──────────────────────────────────────────────────────────

    /**
     * Returns true only when tier is "premium" AND expiresAt is in the future
     * (or null — Paystack subscriptions don't always carry an explicit expiry).
     */
    public static boolean computeIsPremium(String tier, Instant expiresAt) {
        if (!"premium".equals(tier)) return false;
        // If no expiry is stored, trust the tier value (managed by webhooks)
        if (expiresAt == null) return true;
        return expiresAt.isAfter(Instant.now());
    }

    // ── Checkout ───────────────────────────────────────────────────────────────

    /**
     * Initializes a Paystack transaction for a subscription plan.
     * Returns the authorization_url to open in the mobile web browser.
     */
    public String createCheckoutSession(UUID userId, String email) {
        if (secretKey == null || secretKey.isBlank()) {
            throw new SubscriptionCheckoutException("Paystack is not configured", null);
        }
        if (planCode == null || planCode.isBlank()) {
            throw new SubscriptionCheckoutException("Paystack plan code is not configured", null);
        }

        try {
            // Amount is required but for plan-based subscriptions Paystack will
            // use the plan's amount. We pass the plan's first-payment amount in
            // kobo (NGN) as a formality; set to 0 to let the plan dictate the charge.
            String body = MAPPER.writeValueAsString(Map.of(
                    "email", email,
                    "amount", 0,          // plan controls the amount
                    "plan", planCode,
                    "callback_url", "edgemarket://subscription/success"
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(PAYSTACK_BASE + "/transaction/initialize"))
                    .header("Authorization", "Bearer " + secretKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() != 200) {
                log.warn("[Subscription] Paystack initialize failed ({}): {}", resp.statusCode(), resp.body());
                throw new SubscriptionCheckoutException("Paystack initialization failed", null);
            }

            JsonNode json = MAPPER.readTree(resp.body());
            if (!json.path("status").asBoolean(false)) {
                String msg = json.path("message").asText("Unknown error");
                log.warn("[Subscription] Paystack initialize error: {}", msg);
                throw new SubscriptionCheckoutException("Paystack: " + msg, null);
            }

            String url = json.path("data").path("authorization_url").asText();
            if (url == null || url.isBlank()) {
                throw new SubscriptionCheckoutException("No authorization_url in Paystack response", null);
            }

            // Store the Paystack customer code if present (may not be in init response)
            String customerCode = json.path("data").path("customer").path("customer_code").asText(null);
            if (customerCode != null && !customerCode.isBlank()) {
                jdbcTemplate.update(
                        "UPDATE users SET paystack_customer_code = ? WHERE id = ?::uuid",
                        customerCode, userId.toString());
            }

            return url;

        } catch (SubscriptionCheckoutException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            log.error("[Subscription] HTTP error calling Paystack for userId={}", userId, e);
            throw new SubscriptionCheckoutException("Failed to reach Paystack", e);
        }
    }

    // ── Cancellation ───────────────────────────────────────────────────────────

    /**
     * Cancels the user's active Paystack subscription.
     * Calls POST /subscription/disable on Paystack and immediately downgrades
     * the user in the DB so the UI reflects the change without waiting for a webhook.
     *
     * @throws SubscriptionCheckoutException if the user has no subscription code or the API call fails
     */
    public void cancelSubscription(UUID userId) {
        if (secretKey == null || secretKey.isBlank()) {
            throw new SubscriptionCheckoutException("Paystack is not configured", null);
        }

        // Fetch the stored subscription code
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT paystack_subscription_code, subscription_tier FROM users WHERE id = ?::uuid",
                userId.toString());

        if (rows.isEmpty()) {
            throw new SubscriptionCheckoutException("User not found", null);
        }

        String subscriptionCode = (String) rows.get(0).get("paystack_subscription_code");
        String tier = (String) rows.get(0).get("subscription_tier");

        if (subscriptionCode == null || subscriptionCode.isBlank()) {
            // No subscription code on record — just downgrade locally
            jdbcTemplate.update(
                    "UPDATE users SET subscription_tier = 'basic', subscription_expires_at = NOW() " +
                    "WHERE id = ?::uuid",
                    userId.toString());
            log.info("[Subscription] cancelSubscription: no code on record, downgraded userId={} locally", userId);
            return;
        }

        // Also need the customer's email token (Paystack requires email_token for disable)
        // We get it by fetching the subscription from Paystack first
        try {
            HttpRequest fetchReq = HttpRequest.newBuilder()
                    .uri(URI.create(PAYSTACK_BASE + "/subscription/" + subscriptionCode))
                    .header("Authorization", "Bearer " + secretKey)
                    .GET()
                    .build();

            HttpResponse<String> fetchResp = HTTP.send(fetchReq, HttpResponse.BodyHandlers.ofString());
            JsonNode fetchJson = MAPPER.readTree(fetchResp.body());
            String emailToken = fetchJson.path("data").path("email_token").asText(null);

            if (emailToken == null || emailToken.isBlank()) {
                log.warn("[Subscription] cancelSubscription: no email_token for subscriptionCode={}", subscriptionCode);
                throw new SubscriptionCheckoutException("Could not retrieve subscription token from Paystack", null);
            }

            // Disable the subscription
            String disableBody = MAPPER.writeValueAsString(Map.of(
                    "code", subscriptionCode,
                    "token", emailToken
            ));

            HttpRequest disableReq = HttpRequest.newBuilder()
                    .uri(URI.create(PAYSTACK_BASE + "/subscription/disable"))
                    .header("Authorization", "Bearer " + secretKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(disableBody))
                    .build();

            HttpResponse<String> disableResp = HTTP.send(disableReq, HttpResponse.BodyHandlers.ofString());
            JsonNode disableJson = MAPPER.readTree(disableResp.body());

            if (!disableJson.path("status").asBoolean(false)) {
                String msg = disableJson.path("message").asText("Unknown error");
                log.warn("[Subscription] cancelSubscription: Paystack disable failed: {}", msg);
                throw new SubscriptionCheckoutException("Paystack cancel failed: " + msg, null);
            }

        } catch (SubscriptionCheckoutException e) {
            throw e;
        } catch (IOException | InterruptedException e) {
            log.error("[Subscription] HTTP error cancelling subscription for userId={}", userId, e);
            throw new SubscriptionCheckoutException("Failed to reach Paystack", e);
        }

        // Immediately downgrade in DB (webhook will also fire, but this makes the UI instant)
        jdbcTemplate.update(
                "UPDATE users SET subscription_tier = 'basic', subscription_expires_at = NOW(), " +
                "paystack_subscription_code = NULL WHERE id = ?::uuid",
                userId.toString());

        log.info("[Subscription] Cancelled and downgraded userId={} to basic", userId);
    }

    // ── Webhook ────────────────────────────────────────────────────────────────

    /**
     * Verifies the Paystack webhook signature and updates subscription tier in DB.
     *
     * Signature check: HMAC-SHA512(rawBody, secretKey) must equal the
     * x-paystack-signature header value (lowercase hex).
     *
     * @throws SecurityException if the signature is invalid.
     */
    public void processWebhookEvent(byte[] rawBody, String signatureHeader) {
        // 1. Verify signature
        String expected = hmacSha512Hex(rawBody, secretKey);
        if (!expected.equalsIgnoreCase(signatureHeader)) {
            throw new SecurityException("Invalid Paystack webhook signature");
        }

        // 2. Parse event
        JsonNode event;
        try {
            event = MAPPER.readTree(rawBody);
        } catch (IOException e) {
            log.warn("[Subscription] Could not parse webhook body", e);
            return;
        }

        String eventType = event.path("event").asText("");
        JsonNode data = event.path("data");

        log.info("[Subscription] Paystack webhook event={}", eventType);

        switch (eventType) {
            case "charge.success" -> handleChargeSuccess(data);
            case "subscription.create" -> handleSubscriptionCreate(data);
            case "subscription.disable",
                 "subscription.not_renew" -> handleSubscriptionDisable(data);
            default -> log.debug("[Subscription] Ignoring event={}", eventType);
        }
    }

    // ── Private event handlers ─────────────────────────────────────────────────

    /**
     * charge.success — fired when a payment (initial or renewal) succeeds.
     * Activates premium for the user identified by email in the event.
     */
    private void handleChargeSuccess(JsonNode data) {
        String email = data.path("customer").path("email").asText(null);
        String customerCode = data.path("customer").path("customer_code").asText(null);
        JsonNode subscriptionNode = data.path("subscription");
        String subscriptionCode = subscriptionNode.isMissingNode()
                ? null
                : subscriptionNode.path("subscription_code").asText(null);

        if (email == null || email.isBlank()) {
            log.warn("[Subscription] charge.success missing email");
            return;
        }

        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE email = ?", email);

        if (users.isEmpty()) {
            log.warn("[Subscription] charge.success — no user found for email={}", email);
            return;
        }

        UUID userId = (UUID) users.get(0).get("id");

        jdbcTemplate.update(
                "UPDATE users SET subscription_tier = 'premium', " +
                "paystack_customer_code = COALESCE(?, paystack_customer_code), " +
                "paystack_subscription_code = COALESCE(?, paystack_subscription_code) " +
                "WHERE id = ?::uuid",
                customerCode, subscriptionCode, userId.toString());

        log.info("[Subscription] Upgraded userId={} to premium via charge.success", userId);
    }

    /**
     * subscription.create — subscription object created after successful charge.
     * Same upgrade logic but keyed by subscription_code.
     */
    private void handleSubscriptionCreate(JsonNode data) {
        String email = data.path("customer").path("email").asText(null);
        String customerCode = data.path("customer").path("customer_code").asText(null);
        String subscriptionCode = data.path("subscription_code").asText(null);

        if (email == null || email.isBlank()) {
            log.warn("[Subscription] subscription.create missing email");
            return;
        }

        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE email = ?", email);

        if (users.isEmpty()) {
            log.warn("[Subscription] subscription.create — no user found for email={}", email);
            return;
        }

        UUID userId = (UUID) users.get(0).get("id");

        jdbcTemplate.update(
                "UPDATE users SET subscription_tier = 'premium', " +
                "paystack_customer_code = COALESCE(?, paystack_customer_code), " +
                "paystack_subscription_code = COALESCE(?, paystack_subscription_code) " +
                "WHERE id = ?::uuid",
                customerCode, subscriptionCode, userId.toString());

        log.info("[Subscription] Upgraded userId={} to premium via subscription.create", userId);
    }

    /**
     * subscription.disable / subscription.not_renew — subscription cancelled.
     */
    private void handleSubscriptionDisable(JsonNode data) {
        String email = data.path("customer").path("email").asText(null);

        if (email == null || email.isBlank()) {
            log.warn("[Subscription] disable event missing email");
            return;
        }

        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT id FROM users WHERE email = ?", email);

        if (users.isEmpty()) {
            log.warn("[Subscription] disable — no user found for email={}", email);
            return;
        }

        UUID userId = (UUID) users.get(0).get("id");

        jdbcTemplate.update(
                "UPDATE users SET subscription_tier = 'basic', subscription_expires_at = NOW() " +
                "WHERE id = ?::uuid",
                userId.toString());

        log.info("[Subscription] Downgraded userId={} to basic (subscription disabled)", userId);
    }

    // ── HMAC helper ────────────────────────────────────────────────────────────

    private static String hmacSha512Hex(byte[] data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return HexFormat.of().formatHex(mac.doFinal(data));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA512 computation failed", e);
        }
    }
}
