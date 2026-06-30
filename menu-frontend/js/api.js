/**
 * api.js — The only file in this project that calls fetch().
 *
 * Reads APP_CONFIG from js/config.js (must be loaded first via <script>).
 * Exports window.MenuGateApi — an object of async functions, one per
 * backend endpoint, plus ApiError and ERROR_TYPE for typed error handling.
 *
 * Authenticated calls use credentials: 'include' so the browser sends
 * the Spring Security session cookie automatically. No bearer tokens.
 *
 * Usage in other JS files:
 *   const { listMenus, ApiError, ERROR_TYPE } = window.MenuGateApi;
 *   try {
 *     const menus = await listMenus();
 *   } catch (err) {
 *     if (err instanceof ApiError && err.type === ERROR_TYPE.AUTH) {
 *       // redirect to login
 *     }
 *   }
 */


/* ── Typed error ─────────────────────────────────────────── */

/**
 * All API failures throw an ApiError. Never a plain Error.
 *
 * @property {string} type    — one of ERROR_TYPE (use for switch/if logic)
 * @property {number} status  — HTTP status code (0 for network failures)
 * @property {*}      detail  — raw parsed response body, if any
 */
class ApiError extends Error {
  constructor(type, status, message, detail = null) {
    super(message);
    this.name   = 'ApiError';
    this.type   = type;
    this.status = status;
    this.detail = detail;
  }
}

/** String constants for ApiError.type — use these in calling code. */
const ERROR_TYPE = {
  AUTH:       'AUTH',       // 401 — user is not logged in; redirect to login
  FORBIDDEN:  'FORBIDDEN',  // 403 — logged in but lacks permission
  NOT_FOUND:  'NOT_FOUND',  // 404
  VALIDATION: 'VALIDATION', // 400 — bad request body; detail may have field errors
  NETWORK:    'NETWORK',    // fetch() threw (offline, CORS blocked, DNS failure)
  UNKNOWN:    'UNKNOWN',    // any other non-OK status
};


/* ── URL builder ─────────────────────────────────────────── */

/**
 * Build a full URL from an ENDPOINTS key and a replacements map.
 *
 * buildUrl('GET_MENU', { menuId: 7 })
 *   → "http://localhost:8080/api/menus/7"
 *
 * @param {string} endpointKey   — key in APP_CONFIG.ENDPOINTS
 * @param {Object} replacements  — e.g. { menuId: 1, itemId: 2 }
 * @returns {string}
 */
function buildUrl(endpointKey, replacements = {}) {
  const cfg = window.APP_CONFIG;
  let path = cfg.ENDPOINTS[endpointKey];

  for (const [key, value] of Object.entries(replacements)) {
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }

  return cfg.BASE_URL + path;
}


/* ── Core request helper ─────────────────────────────────── */

/**
 * Make one HTTP request and return the parsed JSON body (or null for 204).
 * All failures throw an ApiError — never resolves with an error shape.
 *
 * @param {string}  method       — 'GET' | 'POST' | 'PUT' | 'DELETE'
 * @param {string}  endpointKey  — key in APP_CONFIG.ENDPOINTS
 * @param {Object}  [options]
 * @param {Object}  [options.replacements] — URL path substitutions
 * @param {Object}  [options.body]         — request body (will be JSON-stringified)
 * @param {boolean} [options.auth]         — true → send session cookie
 * @returns {Promise<Object|null>}
 */
async function request(method, endpointKey, { replacements = {}, body = null, auth = false } = {}) {
  const url = buildUrl(endpointKey, replacements);

  const headers = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = { method, headers };

  if (auth) {
    // Spring Security reads the JSESSIONID cookie set after Google OAuth2.
    // credentials: 'include' ensures the browser sends it cross-origin.
    fetchOptions.credentials = 'include';
  }

  if (body !== null) {
    fetchOptions.body = JSON.stringify(body);
  }

  // ── Network call ───────────────────────────────────────
  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (networkErr) {
    throw new ApiError(
      ERROR_TYPE.NETWORK,
      0,
      'Unable to reach the server. Check your internet connection.',
      networkErr.message,
    );
  }

  // ── 204 No Content (all DELETE success responses) ──────
  if (response.status === 204) {
    return null;
  }

  // ── Parse body once, if JSON ───────────────────────────
  let responseBody = null;
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      responseBody = await response.json();
    } catch {
      // Body was declared JSON but couldn't parse — treat as empty.
      responseBody = null;
    }
  }

  // ── Map error statuses → typed errors ─────────────────
  if (!response.ok) {
    // Spring Boot's GlobalExceptionHandler returns { message, ... }
    const serverMessage = responseBody?.message || responseBody?.error || null;

    switch (response.status) {
      case 400:
        throw new ApiError(
          ERROR_TYPE.VALIDATION,
          400,
          serverMessage || 'The request contained invalid data.',
          responseBody,
        );
      case 401:
        throw new ApiError(
          ERROR_TYPE.AUTH,
          401,
          'You are not logged in. Please sign in with Google to continue.',
          responseBody,
        );
      case 403:
        throw new ApiError(
          ERROR_TYPE.FORBIDDEN,
          403,
          'You do not have permission to perform this action.',
          responseBody,
        );
      case 404:
        throw new ApiError(
          ERROR_TYPE.NOT_FOUND,
          404,
          serverMessage || 'The requested resource was not found.',
          responseBody,
        );
      default:
        throw new ApiError(
          ERROR_TYPE.UNKNOWN,
          response.status,
          serverMessage || `Unexpected server error (HTTP ${response.status}).`,
          responseBody,
        );
    }
  }

  return responseBody;
}


/* ── Public API functions ────────────────────────────────── */

// ── Public endpoints (no auth required) ───────────────────

/**
 * Fetch all menus from all restaurant owners.
 * Returns an array of menu objects (each includes their items).
 * @returns {Promise<Array>}
 */
async function listMenus() {
  return request('GET', 'LIST_MENUS');
}

/**
 * Fetch a single menu and all its items.
 * This is the shareable public URL — no login needed.
 * @param {number|string} menuId
 * @returns {Promise<Object>}
 */
async function getMenu(menuId) {
  return request('GET', 'GET_MENU', { replacements: { menuId } });
}

// ── Owner endpoints (session cookie required) ──────────────

/**
 * Create a new menu owned by the currently authenticated user.
 * @param {{ title: string, category?: string }} data
 * @returns {Promise<Object>} the created menu
 */
async function createMenu({ title, category }) {
  return request('POST', 'CREATE_MENU', {
    body: { title, category },
    auth: true,
  });
}

/**
 * Update an existing menu's title and/or category.
 * Only the menu's owner may call this.
 * @param {number|string} menuId
 * @param {{ title: string, category?: string }} data
 * @returns {Promise<Object>} the updated menu
 */
async function updateMenu(menuId, { title, category }) {
  return request('PUT', 'UPDATE_MENU', {
    replacements: { menuId },
    body: { title, category },
    auth: true,
  });
}

/**
 * Delete a menu and all its items (cascade).
 * Only the menu's owner may call this.
 * @param {number|string} menuId
 * @returns {Promise<null>}
 */
async function deleteMenu(menuId) {
  return request('DELETE', 'DELETE_MENU', {
    replacements: { menuId },
    auth: true,
  });
}

/**
 * Add a new item to one of the authenticated user's menus.
 * @param {number|string} menuId
 * @param {{ name: string, description?: string, price: number, available?: boolean }} data
 * @returns {Promise<Object>} the created menu item
 */
async function addItem(menuId, { name, description, price, available }) {
  return request('POST', 'ADD_ITEM', {
    replacements: { menuId },
    body: { name, description, price, available },
    auth: true,
  });
}

/**
 * Update an existing menu item.
 * Only the owning menu's owner may call this.
 * @param {number|string} menuId
 * @param {number|string} itemId
 * @param {{ name: string, description?: string, price: number, available?: boolean }} data
 * @returns {Promise<Object>} the updated menu item
 */
async function updateItem(menuId, itemId, { name, description, price, available }) {
  return request('PUT', 'UPDATE_ITEM', {
    replacements: { menuId, itemId },
    body: { name, description, price, available },
    auth: true,
  });
}

/**
 * Remove a menu item permanently.
 * Only the owning menu's owner may call this.
 * @param {number|string} menuId
 * @param {number|string} itemId
 * @returns {Promise<null>}
 */
async function deleteItem(menuId, itemId) {
  return request('DELETE', 'DELETE_ITEM', {
    replacements: { menuId, itemId },
    auth: true,
  });
}

// ── Admin endpoints (ROLE_ADMIN required) ─────────────────

/**
 * Fetch all menus across every owner. Admin only.
 * Returns 403 if the logged-in user is not an admin.
 * @returns {Promise<Array>}
 */
async function adminListMenus() {
  return request('GET', 'ADMIN_LIST_MENUS', { auth: true });
}

/**
 * Delete any menu regardless of ownership. Admin only.
 * @param {number|string} menuId
 * @returns {Promise<null>}
 */
async function adminDeleteMenu(menuId) {
  return request('DELETE', 'ADMIN_DELETE_MENU', {
    replacements: { menuId },
    auth: true,
  });
}

// ── Auth endpoint ──────────────────────────────────────────

/**
 * Get the currently logged-in user's profile.
 * Expected response: { email: string, name: string, isAdmin: boolean }
 *
 * Throws ApiError(AUTH) if not logged in (401).
 *
 * ⚠️  This calls ENDPOINTS.CURRENT_USER ("/api/me"), which is a placeholder
 *     and may not exist on the backend yet. If it returns 404, that means
 *     the route is not implemented — treat it as "not logged in" in auth.js
 *     until the backend team confirms the endpoint shape.
 *
 * @returns {Promise<{ email: string, name: string, isAdmin: boolean }>}
 */
async function getCurrentUser() {
  return request('GET', 'CURRENT_USER', { auth: true });
}


/* ── Export ──────────────────────────────────────────────── */

window.MenuGateApi = {
  // Public
  listMenus,
  getMenu,

  // Owner (authenticated)
  createMenu,
  updateMenu,
  deleteMenu,
  addItem,
  updateItem,
  deleteItem,

  // Admin
  adminListMenus,
  adminDeleteMenu,

  // Auth
  getCurrentUser,

  // Error utilities — import these in every calling file
  ApiError,
  ERROR_TYPE,
};
