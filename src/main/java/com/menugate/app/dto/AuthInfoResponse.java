package com.menugate.app.dto;

import java.util.Collection;

public record AuthInfoResponse(
        String email,
        String name,
        Collection<String> roles,
        String idToken,
        String accessToken,
        String tokenExpiresAt
) {}
