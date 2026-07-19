package com.edgemarket.model;

import java.util.UUID;

public record UserDto(
    UUID id,
    String email,
    String displayName,
    boolean emailVerified,
    String walletAddress,
    int loginCount,
    boolean isPremium
) {}
