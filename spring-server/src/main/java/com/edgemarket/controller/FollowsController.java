package com.edgemarket.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/follows")
public class FollowsController {

    private static final java.util.regex.Pattern WALLET_PATTERN =
            java.util.regex.Pattern.compile("^0x[0-9a-fA-F]{40}$");

    private final JdbcTemplate jdbc;

    public FollowsController(JdbcTemplate jdbc) {
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
     * @throws IllegalArgumentException if no user row is found for the UUID
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

    // GET /api/follows/{walletAddress}
    @GetMapping("/{walletAddress}")
    public ResponseEntity<?> getFollows(@PathVariable String walletAddress) {
        if (walletAddress == null || walletAddress.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "walletAddress is required"));
        }
        try {
            List<String> addresses = jdbc.queryForList(
                "SELECT target_address FROM follows WHERE user_address = ? ORDER BY created_at DESC",
                String.class,
                walletAddress.toLowerCase()
            );
            return ResponseEntity.ok(addresses);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Database error"));
        }
    }

    // POST /api/follows  body: { targetAddress }
    @PostMapping
    public ResponseEntity<?> follow(@RequestBody Map<String, String> body, HttpServletRequest request) {
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

        String targetAddress = body.get("targetAddress");
        if (targetAddress == null) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "targetAddress is required"));
        }
        try {
            jdbc.update(
                """
                INSERT INTO follows (user_address, target_address)
                VALUES (?, ?)
                ON CONFLICT (user_address, target_address) DO NOTHING
                """,
                userAddress.toLowerCase(), targetAddress.toLowerCase()
            );
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Database error"));
        }
    }

    // DELETE /api/follows  body: { targetAddress }
    @DeleteMapping
    public ResponseEntity<?> unfollow(@RequestBody Map<String, String> body, HttpServletRequest request) {
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

        String targetAddress = body.get("targetAddress");
        if (targetAddress == null) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "targetAddress is required"));
        }
        try {
            jdbc.update(
                "DELETE FROM follows WHERE user_address = ? AND target_address = ?",
                userAddress.toLowerCase(), targetAddress.toLowerCase()
            );
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Database error"));
        }
    }
}
