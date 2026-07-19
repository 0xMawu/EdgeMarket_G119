package com.edgemarket.controller;

import com.edgemarket.exception.SubscriptionCheckoutException;
import com.edgemarket.service.EmailAuthService;
import com.edgemarket.service.SubscriptionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/subscription")
public class SubscriptionController {

    private final SubscriptionService subscriptionService;
    private final EmailAuthService emailAuthService;

    public SubscriptionController(SubscriptionService subscriptionService,
                                  EmailAuthService emailAuthService) {
        this.subscriptionService = subscriptionService;
        this.emailAuthService = emailAuthService;
    }

    /**
     * POST /api/subscription/checkout
     * Protected — requires a valid JWT (see AuthFilter).
     * Returns {"url": "<paystack_authorization_url>"}.
     */
    @PostMapping("/checkout")
    public ResponseEntity<Map<String, String>> createCheckout(HttpServletRequest request) {
        String subject = (String) request.getAttribute("authenticatedAddress");
        if (subject == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized"));
        }

        try {
            UUID userId = UUID.fromString(subject);
            var user = emailAuthService.getUser(userId);
            String url = subscriptionService.createCheckoutSession(userId, user.email());
            return ResponseEntity.ok(Map.of("url", url));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized"));
        } catch (SubscriptionCheckoutException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "Failed to create checkout session"));
        }
    }

    /**
     * POST /api/subscription/cancel
     * Protected — requires a valid JWT. Cancels the user's Paystack subscription
     * and immediately downgrades their account to basic.
     */
    @PostMapping("/cancel")
    public ResponseEntity<Map<String, String>> cancelSubscription(HttpServletRequest request) {
        String subject = (String) request.getAttribute("authenticatedAddress");
        if (subject == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized"));
        }

        try {
            UUID userId = UUID.fromString(subject);
            subscriptionService.cancelSubscription(userId);
            return ResponseEntity.ok(Map.of("message", "Subscription cancelled"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized"));
        } catch (SubscriptionCheckoutException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * POST /api/subscription/webhook
     * Public — called by Paystack. Verifies x-paystack-signature (HMAC-SHA512).
     */
    @PostMapping("/webhook")
    public ResponseEntity<Void> handleWebhook(
            HttpServletRequest request,
            @RequestHeader(value = "x-paystack-signature", required = false) String sigHeader) throws IOException {

        if (sigHeader == null || sigHeader.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        byte[] rawBody;
        try (InputStream is = request.getInputStream()) {
            rawBody = is.readAllBytes();
        }

        try {
            subscriptionService.processWebhookEvent(rawBody, sigHeader);
            return ResponseEntity.ok().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
