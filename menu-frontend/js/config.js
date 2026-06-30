/**
 * config.js — Single source of truth for all backend connectivity.
 *
 * Every other JS file reads from window.APP_CONFIG.
 * To point the frontend at a different backend (e.g. a deployed server),
 * change BASE_URL here — nothing else needs to touch.
 *
 * ENDPOINTS values are path-only strings. {menuId} and {itemId} are literal
 * placeholders; api.js is responsible for replacing them before each call:
 *
 *   APP_CONFIG.ENDPOINTS.GET_MENU.replace('{menuId}', id)
 */

window.APP_CONFIG = {

  /**
   * Base URL of the Spring Boot backend.
   * Change this value for production deployment.
   * Local dev:  "http://localhost:8080"
   * Deployed:   "https://your-domain.com"   ← swap here only
   */
  BASE_URL: 'http://localhost:8080',

  ENDPOINTS: {

    // ── Public (no authentication required) ────────────────────────────────

    /** GET — returns all menus from all owners, including their items. */
    LIST_MENUS:   '/api/menus',

    /** GET — returns a single menu with all its items. Replace {menuId}. */
    GET_MENU:     '/api/menus/{menuId}',

    // ── Owner (Google OAuth2 session required) ─────────────────────────────
    // All owner calls must use credentials: 'include' so the session cookie
    // is sent. Spring Security will return 401 if the session is missing.

    /** POST — creates a new menu owned by the logged-in user.
     *  Body: { title: string, category?: string } */
    CREATE_MENU:  '/api/menus',

    /** PUT — updates title/category of own menu. Replace {menuId}.
     *  Body: { title: string, category?: string } */
    UPDATE_MENU:  '/api/menus/{menuId}',

    /** DELETE — deletes own menu and all its items. Replace {menuId}. */
    DELETE_MENU:  '/api/menus/{menuId}',

    /** POST — adds an item to own menu. Replace {menuId}.
     *  Body: { name: string, description?: string, price: number, available?: boolean } */
    ADD_ITEM:     '/api/menus/{menuId}/items',

    /** PUT — updates an item in own menu. Replace {menuId} and {itemId}.
     *  Body: { name: string, description?: string, price: number, available?: boolean } */
    UPDATE_ITEM:  '/api/menus/{menuId}/items/{itemId}',

    /** DELETE — removes an item from own menu. Replace {menuId} and {itemId}. */
    DELETE_ITEM:  '/api/menus/{menuId}/items/{itemId}',

    // ── Admin (ROLE_ADMIN required) ────────────────────────────────────────

    /** GET — returns all menus from every owner. Admin only. */
    ADMIN_LIST_MENUS:   '/api/admin/menus',

    /** DELETE — deletes any menu regardless of ownership. Replace {menuId}. */
    ADMIN_DELETE_MENU:  '/api/admin/menus/{menuId}',

    // ── Auth ───────────────────────────────────────────────────────────────

    /**
     * GET — returns the currently logged-in user's info.
     * Expected response shape: { email: string, name: string, isAdmin: boolean }
     *
     * ⚠️  PLACEHOLDER — this endpoint may not exist on the backend yet.
     *     Confirm with the backend team before wiring auth.js to this path.
     *     If the backend returns a different shape, update the usage in auth.js.
     *     Returns 401 when no session is active (user is logged out).
     */
    CURRENT_USER: '/api/me',

  },

};
