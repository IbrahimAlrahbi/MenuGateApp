package com.menugate.app.controller;

import com.menugate.app.dto.ErrorResponse;
import com.menugate.app.dto.MenuResponse;
import com.menugate.app.service.MenuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AdminMenuController provides admin-only endpoints for overseeing all menus
 * across all restaurant owners.
 *
 * <p>Admin users are identified by their email addresses being present in the
 * database with is_admin = true. Admin emails are set on first Google OAuth login
 * if the email matches the hardcoded admin list.</p>
 *
 * <p>Admins can view all menus regardless of ownership and can delete any menu
 * (along with its items via cascade). Admins cannot create or update menus
 * — those operations are reserved for the menu owners.</p>
 */
@Tag(name = "Admin", description = "Admin-only endpoints — view all menus across all owners and delete any menu")
@RestController
@RequestMapping("/api/admin/menus")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminMenuController {

    private final MenuService menuService;

    /**
     * View all menus across every registered restaurant owner.
     *
     * <p>Unlike the public GET /api/menus endpoint, this endpoint is restricted
     * to admin users only (is_admin = true in the database). It returns the
     * same data format but guarantees that admins can see all menus
     * irrespective of ownership.</p>
     */
    @Operation(
            summary = "Admin — view all menus",
            description = "Returns all menus from all restaurant owners for admin oversight. Requires admin role (is_admin = true)."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "List of all menus",
                    content = @Content(schema = @Schema(implementation = MenuResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not an admin user")
    })
    @GetMapping
    public ResponseEntity<List<MenuResponse>> getAllMenus() {
        return ResponseEntity.ok(menuService.adminGetAllMenus());
    }

    /**
     * Delete any menu from the system, regardless of ownership.
     *
     * <p>This allows admins to remove inappropriate or outdated menus.
     * The delete cascades to all menu items within the menu. This action
     * is irreversible — the menu and all its items will be permanently
     * removed.</p>
     */
    @Operation(
            summary = "Admin — delete any menu",
            description = "Deletes any menu and all its items (cascade delete), regardless of who owns it. Requires admin role (is_admin = true). This action is irreversible."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Menu deleted successfully"),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not an admin user"),
            @ApiResponse(responseCode = "404", description = "Menu not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @DeleteMapping("/{menuId}")
    public ResponseEntity<Void> deleteMenu(
            @Parameter(description = "ID of the menu to delete", required = true, example = "1")
            @PathVariable Long menuId) {
        menuService.adminDeleteMenu(menuId);
        return ResponseEntity.noContent().build();
    }
}
