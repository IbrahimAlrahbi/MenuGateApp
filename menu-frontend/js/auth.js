/**
 * auth.js — Login state, user identity, and nav rendering.
 *
 * Must be loaded after config.js and api.js:
 *   <script src="js/config.js"></script>
 *   <script src="js/api.js"></script>
 *   <script src="js/auth.js"></script>
 *
 * Every page calls checkAuthState() once on load, then reads
 * getCurrentUser() / isAdmin() synchronously as needed.
 *
 * Exports window.MenuGateAuth.
 */

(function () {
  'use strict';

  const { MenuGateApi } = window;
  const { ERROR_TYPE }  = MenuGateApi;

  /* ── Private state ───────────────────────────────────── */

  /**
   * Cached user object after checkAuthState() resolves.
   * null  = logged out (or checkAuthState not yet called)
   * {...} = logged in  → { email, name, isAdmin }
   */
  let _currentUser = null;

  /** Prevents re-fetching if checkAuthState() is called more than once. */
  let _checked = false;


  /* ── checkAuthState() ────────────────────────────────── */

  /**
   * Fetch the logged-in user from the backend and cache the result.
   * Safe to call on every page load — errors are handled internally.
   *
   * Returns the user object if logged in, or null if not.
   * Never throws for expected "not logged in" conditions.
   *
   * ⚠️  PLACEHOLDER DEPENDENCY: This calls MenuGateApi.getCurrentUser()
   *     which hits GET /api/me — an endpoint that may not exist on the
   *     backend yet (see js/config.js CURRENT_USER comment).
   *     Until it is confirmed:
   *       - 401 → treated as "logged out"  (correct behaviour)
   *       - 404 → treated as "logged out"  (endpoint missing — graceful)
   *     Once /api/me is live, remove the NOT_FOUND branch below and
   *     verify the response shape matches { email, name, isAdmin }.
   *
   * @returns {Promise<Object|null>}
   */
  async function checkAuthState() {
    if (_checked) return _currentUser;

    try {
      _currentUser = await MenuGateApi.getCurrentUser();
    } catch (err) {
      if (err.type === ERROR_TYPE.AUTH) {
        // 401 — not logged in. Normal state for public visitors.
        _currentUser = null;

      } else if (err.type === ERROR_TYPE.NOT_FOUND) {
        // 404 — /api/me endpoint is not implemented yet.
        // ⚠️  Revisit this branch once backend confirms the route.
        console.warn(
          '[MenuGate] GET /api/me returned 404. ' +
          'The endpoint may not be implemented yet. Treating as logged out.'
        );
        _currentUser = null;

      } else if (err.type === ERROR_TYPE.NETWORK) {
        // Backend unreachable — treat as logged out so public pages
        // still render rather than crashing.
        console.warn('[MenuGate] Could not reach backend. Treating as logged out.');
        _currentUser = null;

      } else {
        // Unexpected server error — rethrow so the page can show a
        // proper error banner rather than silently acting logged out.
        throw err;
      }
    }

    _checked = true;
    return _currentUser;
  }


  /* ── Synchronous accessors ───────────────────────────── */

  /**
   * Returns the cached user object, or null if not logged in.
   * Call checkAuthState() first on page load; this never fetches.
   * @returns {{ email: string, name: string, isAdmin: boolean } | null}
   */
  function getCurrentUser() {
    return _currentUser;
  }

  /**
   * Returns true if the cached user has the admin flag set.
   * Returns false if logged out or isAdmin is falsy.
   * @returns {boolean}
   */
  function isAdmin() {
    return Boolean(_currentUser?.isAdmin);
  }


  /* ── login() ─────────────────────────────────────────── */

  /**
   * Redirect the browser to the Google OAuth2 login flow.
   *
   * This is a real browser navigation (window.location), NOT a fetch.
   * Spring Security intercepts /oauth2/authorization/google, redirects
   * to Google's consent screen, then back to the app on success.
   * The session cookie is set automatically after the callback.
   */
  function login() {
    window.location.href = window.APP_CONFIG.BASE_URL + '/oauth2/authorization/google';
  }


  /* ── logout() ────────────────────────────────────────── */

  /**
   * End the current session and return to the browse page.
   *
   * Uses POST /logout with credentials: 'include'.
   * CSRF is disabled in SecurityConfig.java (csrf.disable()), so
   * a plain POST without a CSRF token is accepted by Spring Security.
   *
   * ⚠️  Confirm the logout path with the backend team — Spring Security's
   *     default is POST /logout, but if it has been customised
   *     (e.g. /api/logout, or a GET endpoint) update the URL below.
   *
   * Local state is cleared regardless of whether the server call
   * succeeds, so the UI always returns to a logged-out state.
   */
  async function logout() {
    // Clear cached user immediately so UI updates even if the
    // server call fails.
    _currentUser = null;
    _checked     = false;

    try {
      await fetch(window.APP_CONFIG.BASE_URL + '/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors — local state is already cleared.
    }

    // Return to the public browse page.
    window.location.href = 'index.html';
  }


  /* ── renderNavAuthState() ────────────────────────────── */

  /**
   * Populate the [data-nav-auth] slot inside navElement with
   * login/logout controls appropriate to the current auth state.
   *
   * HTML pages must include a placeholder element:
   *   <div data-nav-auth></div>
   *
   * Call this after checkAuthState() has resolved.
   *
   * @param {HTMLElement} navElement — the <nav> (or any ancestor
   *   containing [data-nav-auth])
   */
  function renderNavAuthState(navElement) {
    const slot = navElement.querySelector('[data-nav-auth]');
    if (!slot) {
      console.warn('[MenuGate] renderNavAuthState: no [data-nav-auth] element found in nav.');
      return;
    }

    // Clear previous content before re-rendering.
    slot.innerHTML = '';

    if (!_currentUser) {
      _renderLoggedOut(slot);
    } else {
      _renderLoggedIn(slot, _currentUser);
    }
  }

  /**
   * Render the logged-out nav state: a single "Log in with Google" button.
   * @param {HTMLElement} slot
   */
  function _renderLoggedOut(slot) {
    const btn = document.createElement('button');
    btn.className   = 'btn btn-primary btn-sm';
    btn.textContent = 'Log in with Google';
    btn.setAttribute('aria-label', 'Log in with Google OAuth2');
    btn.addEventListener('click', login);
    slot.appendChild(btn);
  }

  /**
   * Render the logged-in nav state:
   *   [username] [Dashboard] [Admin?] [Log out]
   * @param {HTMLElement} slot
   * @param {{ name: string, isAdmin: boolean }} user
   */
  function _renderLoggedIn(slot, user) {
    // Current page — used to mark the active nav link.
    const currentPage = _currentPageName();

    // Username label
    const nameSpan = document.createElement('span');
    nameSpan.className   = 'mg-nav__username';
    nameSpan.textContent = user.name || user.email;
    slot.appendChild(nameSpan);

    // Dashboard link
    slot.appendChild(_navLink('Dashboard', 'dashboard.html', currentPage === 'dashboard'));

    // Admin link — only if user has ROLE_ADMIN
    if (user.isAdmin) {
      slot.appendChild(_navLink('Admin', 'admin.html', currentPage === 'admin'));
    }

    // Divider
    const divider = document.createElement('span');
    divider.setAttribute('aria-hidden', 'true');
    divider.style.cssText = 'color: var(--color-border); user-select: none;';
    divider.textContent = '|';
    slot.appendChild(divider);

    // Log out button
    const logoutBtn = document.createElement('button');
    logoutBtn.className   = 'btn btn-ghost btn-sm';
    logoutBtn.textContent = 'Log out';
    logoutBtn.setAttribute('aria-label', 'Log out of Menu Gate');
    logoutBtn.addEventListener('click', () => logout());
    slot.appendChild(logoutBtn);
  }

  /**
   * Build a single nav anchor element.
   * @param {string}  label    — link text
   * @param {string}  href     — relative URL
   * @param {boolean} isActive — whether to add the active class
   * @returns {HTMLAnchorElement}
   */
  function _navLink(label, href, isActive) {
    const a = document.createElement('a');
    a.href        = href;
    a.textContent = label;
    a.className   = 'mg-nav__link' + (isActive ? ' mg-nav__link--active' : '');
    if (isActive) a.setAttribute('aria-current', 'page');
    return a;
  }

  /**
   * Derive the current page name from the URL pathname.
   * Returns 'index', 'dashboard', or 'admin'.
   * @returns {string}
   */
  function _currentPageName() {
    const path = window.location.pathname;
    if (path.includes('dashboard')) return 'dashboard';
    if (path.includes('admin'))     return 'admin';
    return 'index';
  }


  /* ── Export ──────────────────────────────────────────── */

  window.MenuGateAuth = {
    checkAuthState,
    getCurrentUser,
    isAdmin,
    login,
    logout,
    renderNavAuthState,
  };

}());
