package com.edgemarket.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/push-tokens")
public class PushTokensController {

    private static final java.util.regex.Pattern WALLET_PATTERN =
            java.util.regex.Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private final JdbcTemplate jdbc;

    public PushTokensController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Resolves the authenticated identity to a wallet address.
     * <ul>
     *   <li>If {@code authenticatedAddress} matches a wallet address pattern, returns it directly.</li>
     *   <li>Otherwise treats it as a UUID and looks up {@code wallet_address} in the users table.</li>
     * </ul>
     *
     * @return resolved wallet address, or {@code null} if the UUID has no linked wallet
     * @throws EmptyResultDataAccessException if no user row is found for the UUID
     */
    private String resolveWalletAddress(String authenticatedAddress) {
        if (WALLET_PATTERN.matcher(authenticatedAddress).matches()) {
            return authenticatedAddress;
        }
        // UUID — look up wallet_address
        try {
            return jdbc.queryForObject(
                "SELECT wallet_address FROM users WHERE id = ?::uuid",
                String.class,
                authenticatedAddress
            );
        } catch (EmptyResultDataAccessException e) {
            // No row found — treat same as no wallet linked
            return null;
        }
    }

    // POST /api/push-tokens  body: { pushToken }
    @PostMapping
    public ResponseEntity<?> upsertToken(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String authenticatedAddress = (String) request.getAttribute("authenticatedAddress");
        if (authenticatedAddress == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Unauthorized"));
        }

        String userAddress;
        try {
            userAddress = resolveWalletAddress(authenticatedAddress);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Database error"));
        }
        if (userAddress == null) {
            return ResponseEntity.status(422)
                .body(Map.of("error", "No wallet linked to this account"));
        }

        String pushToken = body.get("pushToken");
        if (pushToken == null) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "pushToken is required"));
        }
        try {
            jdbc.update(
                """
                INSERT INTO push_tokens (user_address, push_token, updated_at)
                VALUES (?, ?, NOW())
                ON CONFLICT (user_address)
                DO UPDATE SET push_token = EXCLUDED.push_token, updated_at = NOW()
                """,
                userAddress.toLowerCase(), pushToken
            );
            return ResponseEntity.ok(Map.of("ok", true, "persisted", true));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "DB error"));
        }
    }

    // DELETE /api/push-tokens  body: {}  (identity from JWT)
    @DeleteMapping
    public ResponseEntity<?> deleteToken(@RequestBody(required = false) Map<String, String> body,
                                          HttpServletRequest request) {
        String authenticatedAddress = (String) request.getAttribute("authenticatedAddress");
        if (authenticatedAddress == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Unauthorized"));
        }

        String userAddress;
        try {
            userAddress = resolveWalletAddress(authenticatedAddress);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Database error"));
        }
        if (userAddress == null) {
            return ResponseEntity.status(422)
                .body(Map.of("error", "No wallet linked to this account"));
        }

        try {
            jdbc.update(
                "DELETE FROM push_tokens WHERE user_address = ?",
                userAddress.toLowerCase()
            );
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "DB error"));
        }
    }
}
