/**
 * admin.js — Logic for admin.html (admin moderation view).
 *
 * Depends on (must be loaded before this script):
 *   window.APP_CONFIG   — js/config.js
 *   window.MenuGateApi  — js/api.js
 *   window.MenuGateAuth — js/auth.js
 *   bootstrap           — Bootstrap 5 bundle
 *
 * Auth guard: redirects non-admins to index.html?notice=admin_required
 * and unauthenticated users to index.html?notice=login_required.
 * The ?notice= param is read and displayed by the inline script in index.html.
 *
 * Fetches all menus via adminListMenus() (GET /api/admin/menus).
 * Filtering is client-side by title or ownerEmail — no pagination.
 */

(function () {
  'use strict';

  const { MenuGateApi, MenuGateAuth } = window;
  const { ERROR_TYPE } = MenuGateApi;

  /* ── State ───────────────────────────────────────────── */

  let _allMenus            = []; // full list from adminListMenus()
  let _pendingDeleteMenuId = null;
  let _searchTimeout       = null;

  /* ── DOM refs (assigned in init) ─────────────────────── */

  let _nav, _tbody, _resultsCount, _searchInput, _refreshBtn, _toastContainer;
  let _confirmBsModal, _confirmTitle, _confirmBody, _confirmDeleteBtn;

  /* ── Init ────────────────────────────────────────────── */

  async function init() {
    _nav            = document.querySelector('.mg-nav');
    _tbody          = document.getElementById('adminTableBody');
    _resultsCount   = document.getElementById('resultsCount');
    _searchInput    = document.getElementById('adminSearch');
    _refreshBtn     = document.getElementById('refreshBtn');
    _toastContainer = document.getElementById('toastContainer');

    _confirmBsModal   = new bootstrap.Modal(document.getElementById('confirmModal'));
    _confirmTitle     = document.getElementById('confirmTitle');
    _confirmBody      = document.getElementById('confirmBody');
    _confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    // Show table loading immediately so the page is never blank during auth check.
    showTableLoading();

    // ── Auth guard ─────────────────────────────────────
    let user;
    try {
      user = await MenuGateAuth.checkAuthState();
    } catch (err) {
      console.error('[Admin] Auth check failed:', err);
      window.location.href = 'index.html?notice=login_required';
      return;
    }

    if (!user) {
      window.location.href = 'index.html?notice=login_required';
      return;
    }

    if (!MenuGateAuth.isAdmin()) {
      window.location.href = 'index.html?notice=admin_required';
      return;
    }

    MenuGateAuth.renderNavAuthState(_nav);

    // ── Wire events ────────────────────────────────────
    _searchInput.addEventListener('input', onSearchInput);
    _refreshBtn.addEventListener('click', loadAllMenus);
    _confirmDeleteBtn.addEventListener('click', executeDelete);

    // Single delegated listener for all Delete buttons in the table.
    _tbody.addEventListener('click', handleTableClick);

    await loadAllMenus();
  }

  /* ── Data loading ────────────────────────────────────── */

  async function loadAllMenus() {
    showTableLoading();
    try {
      _allMenus = await MenuGateApi.adminListMenus();
      applySearch();
    } catch (err) {
      if (err.type === ERROR_TYPE.AUTH) {
        window.location.href = 'index.html?notice=login_required';
        return;
      }
      if (err.type === ERROR_TYPE.FORBIDDEN) {
        window.location.href = 'index.html?notice=admin_required';
        return;
      }
      showTableError(err);
    }
  }

  /* ── Filtering ───────────────────────────────────────── */

  function onSearchInput() {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(applySearch, 300);
  }

  function applySearch() {
    const query = _searchInput.value.trim().toLowerCase();

    const results = query
      ? _allMenus.filter(m =>
          m.title?.toLowerCase().includes(query) ||
          m.ownerEmail?.toLowerCase().includes(query) ||
          m.category?.toLowerCase().includes(query)
        )
      : _allMenus;

    renderTable(results, Boolean(query));
  }

  /* ── Table rendering ─────────────────────────────────── */

  function renderTable(menus, isFiltered) {
    _tbody.innerHTML = '';

    if (menus.length === 0) {
      showEmptyRow(isFiltered);
      _resultsCount.textContent = '';
      return;
    }

    const noun = menus.length === 1 ? 'menu' : 'menus';
    _resultsCount.textContent = `${menus.length} ${noun}`;

    menus.forEach(menu => _tbody.appendChild(buildRow(menu)));
  }

  /**
   * Build one <tr> for a menu.
   * data-label on each <td> enables the mobile block-list layout
   * defined in style.css (::before { content: attr(data-label) }).
   *
   * @param {Object} menu — MenuResponse: { menuId, title, category, ownerEmail, items }
   * @returns {HTMLTableRowElement}
   */
  function buildRow(menu) {
    const itemCount = Array.isArray(menu.items) ? menu.items.length : 0;
    const itemNoun  = itemCount === 1 ? 'item' : 'items';

    const categoryBadge = menu.category
      ? `<span class="badge-category" style="margin-top:var(--space-2);display:inline-flex;">${escapeHtml(menu.category)}</span>`
      : '';

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td data-label="Menu">
        <span class="font-display fw-bold" style="font-size: var(--text-base); color: var(--color-text);">
          ${escapeHtml(menu.title)}
        </span>
        ${categoryBadge ? `<div>${categoryBadge}</div>` : ''}
      </td>
      <td data-label="Owner">
        <span class="owner-label" style="font-size: var(--text-sm);">
          ${escapeHtml(menu.ownerEmail || '—')}
        </span>
      </td>
      <td data-label="Items" style="text-align: center;">
        <span class="text-sm text-muted-warm">
          ${itemCount} ${itemNoun}
        </span>
      </td>
      <td data-label="Actions" style="text-align: right;">
        <button
          type="button"
          class="btn btn-danger btn-sm"
          data-action="delete"
          data-menu-id="${menu.menuId}"
          aria-label="Delete ${escapeHtml(menu.title)} by ${escapeHtml(menu.ownerEmail)}"
        >Delete</button>
      </td>
    `;

    return tr;
  }

  /* ── Event delegation ────────────────────────────────── */

  function handleTableClick(e) {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const menuId = Number(btn.dataset.menuId);
    if (menuId) openConfirmDelete(menuId);
  }

  /* ── Delete confirmation ─────────────────────────────── */

  function openConfirmDelete(menuId) {
    const menu = _allMenus.find(m => m.menuId === menuId);
    if (!menu) return;

    _pendingDeleteMenuId = menuId;

    const itemCount = Array.isArray(menu.items) ? menu.items.length : 0;
    const itemNote  = itemCount > 0
      ? `It contains <strong>${itemCount} item${itemCount !== 1 ? 's' : ''}</strong> that will also be permanently deleted.`
      : 'It has no items.';

    _confirmTitle.textContent = 'Delete menu?';
    _confirmBody.innerHTML = `
      <p class="mb-2">
        <strong>${escapeHtml(menu.title)}</strong>
        <span class="text-muted-warm text-sm"> — owned by ${escapeHtml(menu.ownerEmail)}</span>
      </p>
      <p class="text-sm mb-2">${itemNote}</p>
      <p class="text-sm text-muted-warm mb-0">This action cannot be undone.</p>
    `;

    _confirmBsModal.show();
  }

  async function executeDelete() {
    if (!_pendingDeleteMenuId) return;

    const menuId = _pendingDeleteMenuId;
    _pendingDeleteMenuId = null;

    setButtonLoading(_confirmDeleteBtn, true, 'Deleting…');

    try {
      await MenuGateApi.adminDeleteMenu(menuId);
      _confirmBsModal.hide();
      showToast('Menu deleted successfully.', 'success');
      await loadAllMenus();
    } catch (err) {
      _confirmBsModal.hide();

      if (err.type === ERROR_TYPE.AUTH) {
        window.location.href = 'index.html?notice=login_required';
        return;
      }
      if (err.type === ERROR_TYPE.FORBIDDEN) {
        window.location.href = 'index.html?notice=admin_required';
        return;
      }
      if (err.type === ERROR_TYPE.NOT_FOUND) {
        showToast('That menu may have already been deleted.', 'error');
        await loadAllMenus(); // resync to current state
        return;
      }
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(_confirmDeleteBtn, false);
    }
  }

  /* ── Table state helpers ─────────────────────────────── */

  /** Replace tbody with a single full-width spinner row. */
  function showTableLoading() {
    _resultsCount.textContent = '';
    _tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding: var(--space-12) var(--space-6);">
          <div class="mg-loading" style="padding:0;">
            <div class="mg-spinner" role="status" aria-label="Loading menus"></div>
            <span class="text-sm text-muted-warm">Loading menus…</span>
          </div>
        </td>
      </tr>
    `;
  }

  /** Full-width error row with a retry link. */
  function showTableError(err) {
    _resultsCount.textContent = '';
    _tbody.innerHTML = `
      <tr>
        <td colspan="4" style="padding: var(--space-10) var(--space-6);">
          <div class="mg-state mg-state--error" style="padding:0;">
            <div class="mg-state__icon" aria-hidden="true">⚠</div>
            <p class="mg-state__title">Could not load menus</p>
            <p class="mg-state__message">${escapeHtml(err.message)}</p>
            <button type="button" class="btn btn-secondary btn-sm mt-3" id="retryBtn">
              Try again
            </button>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('retryBtn').addEventListener('click', loadAllMenus);
  }

  /**
   * Full-width empty row.
   * @param {boolean} isFiltered — true → "no matches" message; false → "no menus"
   */
  function showEmptyRow(isFiltered) {
    if (isFiltered) {
      _tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: var(--space-10) var(--space-6);">
            <div class="mg-state" style="padding:0;">
              <div class="mg-state__icon" aria-hidden="true">🔍</div>
              <p class="mg-state__title">No menus match</p>
              <p class="mg-state__message">Try a different search term.</p>
              <button type="button" class="btn btn-secondary btn-sm mt-3" id="clearSearchBtn">
                Clear search
              </button>
            </div>
          </td>
        </tr>
      `;
      document.getElementById('clearSearchBtn').addEventListener('click', () => {
        _searchInput.value = '';
        applySearch();
        _searchInput.focus();
      });
    } else {
      _tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: var(--space-10) var(--space-6);">
            <div class="mg-state" style="padding:0;">
              <div class="mg-state__icon" aria-hidden="true">🍽</div>
              <p class="mg-state__title">No menus yet</p>
              <p class="mg-state__message">Restaurant owners haven't created any menus.</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  /* ── Toast notifications ─────────────────────────────── */

  /**
   * Show a transient notification in the top-right corner.
   * role="alert" for errors (interruptive), role="status" for success (polite).
   *
   * @param {string} message
   * @param {'success'|'error'} type
   */
  function showToast(message, type = 'success') {
    const alertClass = type === 'success' ? 'mg-alert--success' : 'mg-alert--error';

    const toast = document.createElement('div');
    toast.className = `mg-alert ${alertClass}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.style.cssText = `
      min-width: 240px;
      max-width: 360px;
      box-shadow: var(--shadow-md);
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    `;

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    msgSpan.style.flex  = '1';

    const closeBtn = document.createElement('button');
    closeBtn.type      = 'button';
    closeBtn.className = 'btn-ghost btn-sm';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'flex-shrink:0; font-size:1.1rem; line-height:1;';
    closeBtn.addEventListener('click', () => toast.remove());

    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);
    _toastContainer.appendChild(toast);

    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

  /* ── Helpers ─────────────────────────────────────────── */

  function setButtonLoading(btn, isLoading, loadingText = 'Please wait…') {
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = `
        <span class="mg-spinner mg-spinner--sm" aria-hidden="true"
              style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>
        ${escapeHtml(loadingText)}
      `;
    } else {
      btn.disabled    = false;
      btn.textContent = btn.dataset.originalText || 'Delete';
    }
  }

  /** XSS-safe escaping via the DOM — no regex edge cases. */
  function escapeHtml(value) {
    if (value == null) return '';
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(String(value)));
    return node.innerHTML;
  }

  /* ── Bootstrap ───────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', init);

}());
