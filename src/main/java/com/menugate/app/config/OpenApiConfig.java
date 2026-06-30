package com.menugate.app.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "MenuGate API",
                version = "1.0",
                description = """
                        MenuGate — Restaurant Menu Management API.

                        **Public Endpoints** — Browse menus and shareable menu URLs (no authentication required).

                        **Owner Endpoints** — Restaurant owners can manage their own menus and items after logging in via Google OAuth2.

                        **Admin Endpoints** — Admin users can view all menus across all owners and delete any menu.
                        """,
                contact = @Contact(name = "MenuGate Team"),
                license = @License(name = "Proprietary")
        )
)
@SecurityScheme(
        name = "Google OAuth2",
        type = SecuritySchemeType.OAUTH2,
        description = "Login with your Google account to access owner/admin endpoints"
)
public class OpenApiConfig {
}
