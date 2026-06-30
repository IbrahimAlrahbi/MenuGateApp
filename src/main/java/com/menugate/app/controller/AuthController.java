package com.menugate.app.controller;

import com.menugate.app.dto.AuthInfoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collection;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final OAuth2AuthorizedClientService authorizedClientService;

    @GetMapping("/me")
    public ResponseEntity<AuthInfoResponse> me(
            @AuthenticationPrincipal OidcUser principal,
            Authentication authentication) {

        OAuth2AuthorizedClient client = authorizedClientService.loadAuthorizedClient(
                "google", authentication.getName());

        String accessToken = client != null ? client.getAccessToken().getTokenValue() : null;
        String expiresAt = (client != null && client.getAccessToken().getExpiresAt() != null)
                ? client.getAccessToken().getExpiresAt().toString() : null;

        Collection<String> roles = principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        return ResponseEntity.ok(new AuthInfoResponse(
                principal.getEmail(),
                principal.getFullName() != null ? principal.getFullName() : principal.getName(),
                roles,
                principal.getIdToken().getTokenValue(),
                accessToken,
                expiresAt
        ));
    }
}
