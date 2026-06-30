package com.menugate.app.controller;

import com.menugate.app.dto.*;
import com.menugate.app.service.MenuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * MenuController handles all menu and menu item operations for restaurant owners
 * and public visitors.
 *
 * <p>Public endpoints allow anyone to browse menus in read-only mode. Owner
 * endpoints require Google OAuth2 authentication and are scoped to the
 * authenticated user's own menus.</p>
 *
 * <p>The GET /api/menus/{menuId} endpoint serves as the shareable public URL
 * that restaurant owners can distribute to their customers.</p>
 */
@Tag(name = "Menus", description = "Menu management endpoints — public browsing, owner CRUD, and shareable menu URLs")
@RestController
@RequestMapping("/api/menus")
@RequiredArgsConstructor
public class MenuController {

    private final MenuService menuService;

    /**
     * Browse all menus from all restaurant owners.
     *
     * <p>No authentication is required. Returns a flat list of all menus
     * along with their menu items. This is the public-facing endpoint
     * for general visitors to explore available menus.</p>
     */
    @Operation(
            summary = "Browse all menus",
            description = "Returns all menus from all registered restaurant owners in read-only mode. No authentication required."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "List of all menus with their items",
                    content = @Content(schema = @Schema(implementation = MenuResponse.class)))
    })
    @GetMapping
    public ResponseEntity<List<MenuResponse>> getAllMenus() {
        return ResponseEntity.ok(menuService.getAllMenus());
    }

    /**
     * View a single menu with all its items.
     *
     * <p>This is the shareable public URL that restaurant owners can give
     * to their customers. No authentication required. Returns the full
     * menu including title, category, owner email, and all menu items
     * with their prices and availability status.</p>
     */
    @Operation(
            summary = "View a single menu (shareable URL)",
            description = "Returns a single menu with all its items. This is the public shareable URL that restaurant owners can share with customers. No authentication required."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Menu found",
                    content = @Content(schema = @Schema(implementation = MenuResponse.class))),
            @ApiResponse(responseCode = "404", description = "Menu not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @GetMapping("/{menuId}")
    public ResponseEntity<MenuResponse> getMenu(
            @Parameter(description = "Unique ID of the menu to retrieve", example = "1", required = true)
            @PathVariable Long menuId) {
        return ResponseEntity.ok(menuService.getMenu(menuId));
    }

    /**
     * Create a new menu for the authenticated restaurant owner.
     *
     * <p>Requires Google OAuth2 login. The authenticated user becomes the
     * owner of the new menu. The menu starts empty and items can be
     * added later via POST /api/menus/{menuId}/items.</p>
     */
    @Operation(
            summary = "Create a new menu",
            description = "Creates a new menu owned by the currently authenticated restaurant owner. Requires Google OAuth2 login."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Menu created successfully",
                    content = @Content(schema = @Schema(implementation = MenuResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation error (e.g. missing title)",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping
    public ResponseEntity<MenuResponse> createMenu(
            @Parameter(description = "Menu details (title is required, category is optional)")
            @Valid @RequestBody MenuRequest request,
            @AuthenticationPrincipal OidcUser principal) {
        MenuResponse response = menuService.createMenu(principal.getEmail(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Update an existing menu's title and category.
     *
     * <p>Only the owner of the menu can update it. The authenticated user
     * must match the owner_email on the menu record. Other owners cannot
     * modify someone else's menu.</p>
     */
    @Operation(
            summary = "Update own menu",
            description = "Updates the title and category of an existing menu. Only the menu owner can perform this action."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Menu updated successfully",
                    content = @Content(schema = @Schema(implementation = MenuResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation error",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not the menu owner"),
            @ApiResponse(responseCode = "404", description = "Menu not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @PutMapping("/{menuId}")
    public ResponseEntity<MenuResponse> updateMenu(
            @Parameter(description = "ID of the menu to update", required = true)
            @PathVariable Long menuId,
            @Parameter(description = "Updated menu details")
            @Valid @RequestBody MenuRequest request,
            @AuthenticationPrincipal OidcUser principal) {
        return ResponseEntity.ok(menuService.updateMenu(principal.getEmail(), menuId, request));
    }

    /**
     * Delete a menu and all its items.
     *
     * <p>Only the owner can delete their own menu. The delete cascades
     * to all menu items within it. Once deleted, the menu and its
     * items are permanently removed from the database.</p>
     */
    @Operation(
            summary = "Delete own menu",
            description = "Deletes a menu and all its items (cascade delete). Only the menu owner can perform this action."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Menu deleted successfully"),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not the menu owner"),
            @ApiResponse(responseCode = "404", description = "Menu not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @DeleteMapping("/{menuId}")
    public ResponseEntity<Void> deleteMenu(
            @Parameter(description = "ID of the menu to delete", required = true)
            @PathVariable Long menuId,
            @AuthenticationPrincipal OidcUser principal) {
        menuService.deleteMenu(principal.getEmail(), menuId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Add a new item to an existing menu.
     *
     * <p>Only the menu owner can add items. Items added are marked as
     * available by default. The price must be positive and both name
     * and price are required fields.</p>
     */
    @Operation(
            summary = "Add a menu item",
            description = "Adds a new item to an existing menu owned by the authenticated user. The item is marked as available by default."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Item created successfully",
                    content = @Content(schema = @Schema(implementation = MenuItemResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation error (name and positive price are required)",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not the menu owner"),
            @ApiResponse(responseCode = "404", description = "Menu not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @PostMapping("/{menuId}/items")
    public ResponseEntity<MenuItemResponse> addMenuItem(
            @Parameter(description = "ID of the menu to add the item to", required = true)
            @PathVariable Long menuId,
            @Parameter(description = "Item details (name and price are required)")
            @Valid @RequestBody MenuItemRequest request,
            @AuthenticationPrincipal OidcUser principal) {
        MenuItemResponse response = menuService.addMenuItem(principal.getEmail(), menuId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Update an existing menu item's details.
     *
     * <p>Only the menu owner can update items within their menu.
     * Both the menu and item must exist, and the item must belong
     * to the specified menu.</p>
     */
    @Operation(
            summary = "Update a menu item",
            description = "Updates the name, description, and price of an existing menu item. Only the menu owner can perform this action."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Item updated successfully",
                    content = @Content(schema = @Schema(implementation = MenuItemResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation error",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not the menu owner"),
            @ApiResponse(responseCode = "404", description = "Menu or item not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @PutMapping("/{menuId}/items/{itemId}")
    public ResponseEntity<MenuItemResponse> updateMenuItem(
            @Parameter(description = "ID of the menu containing the item", required = true)
            @PathVariable Long menuId,
            @Parameter(description = "ID of the menu item to update", required = true)
            @PathVariable Long itemId,
            @Parameter(description = "Updated item details")
            @Valid @RequestBody MenuItemRequest request,
            @AuthenticationPrincipal OidcUser principal) {
        return ResponseEntity.ok(menuService.updateMenuItem(principal.getEmail(), menuId, itemId, request));
    }

    /**
     * Remove a menu item from a menu.
     *
     * <p>Only the menu owner can delete items. The item is permanently
     * removed. Other items in the menu are unaffected.</p>
     */
    @Operation(
            summary = "Delete a menu item",
            description = "Removes a menu item from a menu. Only the menu owner can perform this action."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Item deleted successfully"),
            @ApiResponse(responseCode = "401", description = "Not authenticated"),
            @ApiResponse(responseCode = "403", description = "Not the menu owner"),
            @ApiResponse(responseCode = "404", description = "Menu or item not found",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @DeleteMapping("/{menuId}/items/{itemId}")
    public ResponseEntity<Void> deleteMenuItem(
            @Parameter(description = "ID of the menu containing the item", required = true)
            @PathVariable Long menuId,
            @Parameter(description = "ID of the menu item to delete", required = true)
            @PathVariable Long itemId,
            @AuthenticationPrincipal OidcUser principal) {
        menuService.deleteMenuItem(principal.getEmail(), menuId, itemId);
        return ResponseEntity.noContent().build();
    }
}
