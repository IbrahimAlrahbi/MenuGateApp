/**
 * browse.js — Logic for index.html (public browse page).
 *
 * Depends on (must be loaded before this script):
 *   window.APP_CONFIG   — js/config.js
 *   window.MenuGateApi  — js/api.js
 *   window.MenuGateAuth — js/auth.js
 *   bootstrap           — Bootstrap 5 bundle
 *
 * No login required. Auth state is checked only to render the nav bar.
 *
 * Data note: MenuResponse.ownerEmail is the only owner field returned
 * by the backend (MenuService maps owner → ownerEmail only, no name).
 * MenuItemResponse fields: menuItemId, name, description, price, available.
 */

(function () {
  'use strict';

  const { MenuGateApi, MenuGateAuth } = window;

  /* ── Private state ───────────────────────────────────── */

  let _allMenus      = [];   // full list from listMenus(), source of truth for filtering
  let _searchTimeout = null; // debounce handle

  /* ── DOM refs (populated in init) ───────────────────── */

  let _nav, _grid, _searchInput, _categorySelect, _resultsCount;
  let _modalEl, _modalTitle, _modalMeta, _modalBody, _bsModal;

  /* ── Init ────────────────────────────────────────────── */

  async function init() {
    _nav            = document.querySelector('.mg-nav');
    _grid           = document.getElementById('menu-grid');
    _searchInput    = document.getElementById('searchInput');
    _categorySelect = document.getElementById('categoryFilter');
    _resultsCount   = document.getElementById('resultsCount');
    _modalEl        = document.getElementById('menuDetailModal');
    _modalTitle     = document.getElementById('menuDetailTitle');
    _modalMeta      = document.getElementById('menuDetailMeta');
    _modalBody      = document.getElementById('menuDetailBody');
    _bsModal        = new bootstrap.Modal(_modalEl);

    // Show skeleton immediately — before any async work — so the page
    // never flashes blank during the auth check + data fetch.
    showLoadingSkeleton();

    // Auth is non-fatal on a public page — nav simply shows "Log in"
    // if the check fails or /api/me doesn't exist yet.
    try {
      await MenuGateAuth.checkAuthState();
    } catch {
      // ignore — nav will render logged-out state
    }
    MenuGateAuth.renderNavAuthState(_nav);

    // Load data and wire up controls
    await loadAllMenus();
    _searchInput.addEventListener('input', onSearchInput);
    _categorySelect.addEventListener('change', applyFilters);
  }

  /* ── Data loading ────────────────────────────────────── */

  async function loadAllMenus() {
    showLoadingSkeleton();
    try {
      _allMenus = await MenuGateApi.listMenus();
      buildCategoryOptions(_allMenus);
      applyFilters();
    } catch (err) {
      showNetworkError(err);
    }
  }

  /* ── Filtering ───────────────────────────────────────── */

  /** Debounced handler for the search input. */
  function onSearchInput() {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(applyFilters, 300);
  }

  /**
   * Filter _allMenus client-side and re-render.
   * Called on input change and on category change (immediate).
   */
  function applyFilters() {
    const query    = _searchInput.value.trim().toLowerCase();
    const category = _categorySelect.value;

    let results = _allMenus;

    if (query) {
      results = results.filter(m =>
        m.title?.toLowerCase().includes(query) ||
        m.category?.toLowerCase().includes(query)
      );
    }

    if (category) {
      results = results.filter(m => m.category === category);
    }

    // isFiltered = any filter is active (affects empty-state messaging)
    renderGrid(results, Boolean(query || category));
  }

  /** Populate the category <select> with sorted unique values from menus. */
  function buildCategoryOptions(menus) {
    // Clear any previously added options (e.g. after a retry) while
    // keeping the "All categories" placeholder at index 0.
    while (_categorySelect.options.length > 1) _categorySelect.remove(1);

    const seen = new Set();
    menus.forEach(m => { if (m.category) seen.add(m.category); });

    [...seen].sort().forEach(cat => {
      const opt       = document.createElement('option');
      opt.value       = cat;
      opt.textContent = cat;
      _categorySelect.appendChild(opt);
    });
  }

  /** Reset both filter controls and re-render the full list. */
  function clearFilters() {
    _searchInput.value    = '';
    _categorySelect.value = '';
    applyFilters();
    _searchInput.focus();
  }

  /* ── Grid rendering ──────────────────────────────────── */

  /**
   * Clear and repopulate the menu grid.
   * @param {Array}   menus      — filtered list to render
   * @param {boolean} isFiltered — true if any filter is active
   */
  function renderGrid(menus, isFiltered) {
    _grid.innerHTML = '';

    if (menus.length === 0) {
      _resultsCount.textContent = '';
      showEmptyState(isFiltered);
      return;
    }

    const noun = menus.length === 1 ? 'menu' : 'menus';
    _resultsCount.textContent = `${menus.length} ${noun}`;

    menus.forEach(menu => _grid.appendChild(createMenuCard(menu)));
  }

  /**
   * Build a single menu card as an <li> containing a full-card <button>.
   * Using <li> inside <ul#menu-grid> gives a proper list structure for
   * assistive tech without role conflicts.
   *
   * @param {Object} menu — MenuResponse: { menuId, title, category, ownerEmail, items }
   * @returns {HTMLLIElement}
   */
  function createMenuCard(menu) {
    const li = document.createElement('li');
    li.className = 'menu-card';

    const itemCount = Array.isArray(menu.items) ? menu.items.length : 0;
    const itemNoun  = itemCount === 1 ? 'item' : 'items';

    const categoryBadge = menu.category
      ? `<span class="badge-category">${escapeHtml(menu.category)}</span>`
      : '';

    const ownerLabel = menu.ownerEmail
      ? `<span class="owner-label">by ${escapeHtml(menu.ownerEmail)}</span>`
      : '';

    // .menu-card__trigger is a full-width, no-chrome button — see style.css
    const btn = document.createElement('button');
    btn.className   = 'menu-card__trigger';
    btn.setAttribute('aria-label', `View ${escapeHtml(menu.title)}`);
    btn.setAttribute('type', 'button');

    btn.innerHTML = `
      <div class="menu-card__header">
        <h2 class="menu-card__title">${escapeHtml(menu.title)}</h2>
        <div class="menu-card__meta">
          ${categoryBadge}
          ${ownerLabel}
        </div>
      </div>
      <div class="menu-card__body">
        <p class="text-sm text-muted-warm mb-0">
          ${itemCount} ${itemNoun}
        </p>
      </div>
      <div class="menu-card__footer">
        <span class="text-sm text-accent fw-medium" aria-hidden="true">
          View menu &rarr;
        </span>
      </div>
    `;

    btn.addEventListener('click', () => openMenuDetail(menu.menuId));
    li.appendChild(btn);
    return li;
  }

  /* ── Menu detail modal ───────────────────────────────── */

  /**
   * Open the detail modal and fetch the full menu (including items).
   * The modal opens immediately with a spinner so there's no perceived delay.
   * @param {number} menuId
   */
  async function openMenuDetail(menuId) {
    // Reset and open immediately — don't wait for the fetch.
    _modalTitle.textContent = 'Loading…';
    _modalMeta.textContent  = '';
    _modalBody.innerHTML    = `
      <div class="mg-loading">
        <div class="mg-spinner" role="status" aria-label="Loading menu details"></div>
        <span>Loading…</span>
      </div>
    `;
    _bsModal.show();

    try {
      const menu = await MenuGateApi.getMenu(menuId);
      renderMenuDetail(menu);
    } catch (err) {
      _modalTitle.textContent = 'Could not load menu';
      _modalMeta.textContent  = '';
      _modalBody.innerHTML    = `
        <div class="mg-state mg-state--error">
          <div class="mg-state__icon" aria-hidden="true">⚠</div>
          <p class="mg-state__title">Something went wrong</p>
          <p class="mg-state__message">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  /**
   * Populate the open modal with a fully fetched menu's data.
   * @param {Object} menu — full MenuResponse including items array
   */
  function renderMenuDetail(menu) {
    _modalTitle.textContent = menu.title;

    // Build subtitle: "Category · by owner@email.com"
    const metaParts = [];
    if (menu.category)   metaParts.push(menu.category);
    if (menu.ownerEmail) metaParts.push(`by ${menu.ownerEmail}`);
    _modalMeta.textContent = metaParts.join(' · ');

    if (!menu.items || menu.items.length === 0) {
      _modalBody.innerHTML = `
        <div class="mg-state">
          <div class="mg-state__icon" aria-hidden="true">🍽</div>
          <p class="mg-state__title">No items yet</p>
          <p class="mg-state__message">This menu doesn't have any items listed.</p>
        </div>
      `;
      return;
    }

    // Build item list
    const list = document.createElement('div');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', `Items in ${menu.title}`);

    menu.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'menu-item-row';
      row.setAttribute('role', 'listitem');

      // available defaults to true if the field is absent
      const available = item.available !== false;
      const availBadge = available
        ? `<span class="badge-avail badge-avail--available">
             <span class="avail-dot avail-dot--available" aria-hidden="true"></span>
             Available
           </span>`
        : `<span class="badge-avail badge-avail--unavailable">
             <span class="avail-dot avail-dot--unavailable" aria-hidden="true"></span>
             Unavailable
           </span>`;

      const formattedPrice = formatPrice(item.price);

      row.innerHTML = `
        <div class="menu-item-row__info">
          <p class="menu-item-row__name">${escapeHtml(item.name)}</p>
          ${item.description
            ? `<p class="menu-item-row__description">${escapeHtml(item.description)}</p>`
            : ''}
        </div>
        <div class="menu-item-row__right">
          <span class="price price--lg">
            ${escapeHtml(formattedPrice)}
          </span>
          ${availBadge}
        </div>
      `;

      list.appendChild(row);
    });

    _modalBody.innerHTML = '';
    _modalBody.appendChild(list);
  }

  /* ── State displays ──────────────────────────────────── */

  /** Show 6 skeleton card placeholders while the initial fetch runs. */
  function showLoadingSkeleton() {
    _grid.innerHTML = '';
    // Announce loading state to screen readers via the live region.
    _resultsCount.textContent = 'Loading menus…';

    for (let i = 0; i < 6; i++) {
      const li  = document.createElement('li');
      const div = document.createElement('div');
      div.className = 'skeleton skeleton-card';
      div.setAttribute('aria-hidden', 'true');
      li.appendChild(div);
      _grid.appendChild(li);
    }
  }

  /**
   * Show an empty-state message inside the grid.
   * @param {boolean} isFiltered — true → "no results" message;
   *                               false → "nothing here yet" message
   */
  function showEmptyState(isFiltered) {
    const li  = document.createElement('li');
    li.style.gridColumn = '1 / -1'; // span all columns

    if (isFiltered) {
      li.innerHTML = `
        <div class="mg-state">
          <div class="mg-state__icon" aria-hidden="true">🔍</div>
          <p class="mg-state__title">No menus match</p>
          <p class="mg-state__message">
            Try different search terms or select "All categories".
          </p>
          <button type="button" class="btn btn-secondary btn-sm mt-3" id="clearFiltersBtn">
            Clear filters
          </button>
        </div>
      `;
      li.querySelector('#clearFiltersBtn').addEventListener('click', clearFilters);
    } else {
      li.innerHTML = `
        <div class="mg-state">
          <div class="mg-state__icon" aria-hidden="true">🍽</div>
          <p class="mg-state__title">No menus yet</p>
          <p class="mg-state__message">
            Restaurant owners haven't added any menus yet. Check back soon!
          </p>
        </div>
      `;
    }

    _grid.appendChild(li);
  }

  /**
   * Show a full-grid error state with a retry button.
   * @param {ApiError|Error} err
   */
  function showNetworkError(err) {
    _grid.innerHTML           = '';
    _resultsCount.textContent = '';

    const li = document.createElement('li');
    li.style.gridColumn = '1 / -1';
    li.innerHTML = `
      <div class="mg-state mg-state--error">
        <div class="mg-state__icon" aria-hidden="true">⚠</div>
        <p class="mg-state__title">Could not load menus</p>
        <p class="mg-state__message">${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-secondary btn-sm mt-3" id="retryBtn">
          Try again
        </button>
      </div>
    `;
    li.querySelector('#retryBtn').addEventListener('click', loadAllMenus);
    _grid.appendChild(li);
  }

  /* ── Utilities ───────────────────────────────────────── */

  /**
   * XSS-safe HTML escaping via the DOM. Avoids regex edge cases.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    if (value == null) return '';
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(String(value)));
    return node.innerHTML;
  }

  /**
   * Format a price value as "$X.XX".
   * BigDecimal serialises to a JSON number or numeric string; handle both.
   * Returns "—" for null/missing/non-numeric values.
   * @param {number|string|null} price
   * @returns {string}
   */
  function formatPrice(price) {
    if (price == null) return '—';
    const num = typeof price === 'number' ? price : parseFloat(price);
    return isNaN(num) ? '—' : `$${num.toFixed(2)}`;
  }

  /* ── Bootstrap ───────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', init);

}());
