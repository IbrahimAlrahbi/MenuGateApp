/**
 * dashboard.js — Logic for dashboard.html (owner's private dashboard).
 *
 * Depends on (must be loaded before this script):
 *   window.APP_CONFIG   — js/config.js
 *   window.MenuGateApi  — js/api.js
 *   window.MenuGateAuth — js/auth.js
 *   bootstrap           — Bootstrap 5 bundle
 *
 * Auth guard: redirects to login if not authenticated.
 *
 * "My menus" strategy: the backend has no dedicated GET /api/my-menus
 * endpoint. We call listMenus() (all menus) and filter client-side by
 * ownerEmail === current user's email.
 * ⚠️  Verify with the backend team whether a scoped endpoint exists or
 *     is planned, and replace this filter if so.
 *
 * Available field: MenuItemRequest has no 'available' field and the
 * service hardcodes available=true on create / never updates it.
 * Availability is shown read-only in the item list; no toggle in forms.
 */

(function () {
  'use strict';

  const { MenuGateApi, MenuGateAuth } = window;
  const { ERROR_TYPE } = MenuGateApi;

  /* ── State ───────────────────────────────────────────── */

  let _myMenus         = [];
  let _user            = null;
  let _expandedMenuIds = new Set(); // preserved across re-renders

  // Menu form
  let _menuFormMode  = 'create'; // 'create' | 'edit'
  let _editingMenuId = null;

  // Item form
  let _itemFormMode   = 'create'; // 'create' | 'edit'
  let _itemFormMenuId = null;     // which menu this item belongs to
  let _editingItemId  = null;

  // Delete confirmation
  let _pendingDelete = null; // { type: 'menu'|'item', menuId, itemId? }

  /* ── DOM refs (assigned in init) ─────────────────────── */

  let _nav, _menuList, _newMenuBtn, _welcomeEl, _toastContainer;

  // Menu form modal
  let _menuBsModal, _menuModalTitle, _menuForm;
  let _menuTitleInput, _menuCategoryInput, _menuFormError, _menuSaveBtn;

  // Item form modal
  let _itemBsModal, _itemModalTitle, _itemForm;
  let _itemNameInput, _itemDescInput, _itemPriceInput, _itemFormError, _itemSaveBtn;

  // Confirm delete modal
  let _confirmBsModal, _confirmTitle, _confirmBody, _confirmDeleteBtn;

  /* ── Init ────────────────────────────────────────────── */

  async function init() {
    // Cache DOM refs
    _nav            = document.querySelector('.mg-nav');
    _menuList       = document.getElementById('menu-list');
    _newMenuBtn     = document.getElementById('newMenuBtn');
    _welcomeEl      = document.getElementById('dashboardWelcome');
    _toastContainer = document.getElementById('toastContainer');

    // Menu modal
    _menuBsModal      = new bootstrap.Modal(document.getElementById('menuFormModal'));
    _menuModalTitle   = document.getElementById('menuModalTitle');
    _menuForm         = document.getElementById('menuForm');
    _menuTitleInput   = document.getElementById('menuTitle');
    _menuCategoryInput= document.getElementById('menuCategory');
    _menuFormError    = document.getElementById('menuFormError');
    _menuSaveBtn      = document.getElementById('menuSaveBtn');

    // Item modal
    _itemBsModal      = new bootstrap.Modal(document.getElementById('itemFormModal'));
    _itemModalTitle   = document.getElementById('itemModalTitle');
    _itemForm         = document.getElementById('itemForm');
    _itemNameInput    = document.getElementById('itemName');
    _itemDescInput    = document.getElementById('itemDescription');
    _itemPriceInput   = document.getElementById('itemPrice');
    _itemFormError    = document.getElementById('itemFormError');
    _itemSaveBtn      = document.getElementById('itemSaveBtn');

    // Confirm modal
    _confirmBsModal   = new bootstrap.Modal(document.getElementById('confirmModal'));
    _confirmTitle     = document.getElementById('confirmTitle');
    _confirmBody      = document.getElementById('confirmBody');
    _confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    // ── Auth guard ─────────────────────────────────────
    let user;
    try {
      user = await MenuGateAuth.checkAuthState();
    } catch (err) {
      // Unexpected auth error (not 401/404/network) — go home.
      console.error('[Dashboard] Auth check failed:', err);
      window.location.href = 'index.html';
      return;
    }

    if (!user) {
      // Not logged in — initiate Google login flow.
      MenuGateAuth.login();
      return;
    }

    _user = user;
    _welcomeEl.textContent = `Signed in as ${_user.name || _user.email}`;
    MenuGateAuth.renderNavAuthState(_nav);

    // ── Wire events ────────────────────────────────────
    _newMenuBtn.addEventListener('click', openCreateMenuModal);
    _menuForm.addEventListener('submit', submitMenuForm);
    _itemForm.addEventListener('submit', submitItemForm);
    _confirmDeleteBtn.addEventListener('click', executeConfirmedDelete);

    // Single delegated listener for all card/item actions.
    _menuList.addEventListener('click', handleMenuListClick);

    // Clear errors when modals close so stale messages don't linger.
    document.getElementById('menuFormModal')
      .addEventListener('hidden.bs.modal', clearMenuFormError);
    document.getElementById('itemFormModal')
      .addEventListener('hidden.bs.modal', clearItemFormError);

    // Load data
    await loadMyMenus();
  }

  /* ── Data loading ────────────────────────────────────── */

  async function loadMyMenus() {
    showListLoading();
    try {
      const all = await MenuGateApi.listMenus();

      // Filter to only this owner's menus.
      // ⚠️ No dedicated /api/my-menus endpoint — see module header comment.
      _myMenus = all.filter(m => m.ownerEmail === _user.email);

      renderMenuList(_myMenus);
    } catch (err) {
      showListError(err);
    }
  }

  /* ── Rendering ───────────────────────────────────────── */

  function renderMenuList(menus) {
    _menuList.innerHTML = '';

    if (menus.length === 0) {
      showEmptyState();
      return;
    }

    menus.forEach(menu => {
      _menuList.appendChild(createMenuCard(menu));

      // Restore expand state without triggering toggle animation.
      if (_expandedMenuIds.has(menu.menuId)) {
        const section = document.getElementById(`items-section-${menu.menuId}`);
        if (section) section.style.display = 'block';
        const toggleBtn = _menuList.querySelector(
          `[data-action="toggle-items"][data-menu-id="${menu.menuId}"]`
        );
        if (toggleBtn) {
          const count = Array.isArray(menu.items) ? menu.items.length : 0;
          toggleBtn.textContent = `Hide items (${count})`;
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      }
    });
  }

  /**
   * Build one menu card <article> with an embedded collapsible items section.
   * All interactive elements use data-action + data-menu-id / data-item-id
   * so the single delegated listener on #menu-list can dispatch them.
   *
   * @param {Object} menu — MenuResponse
   * @returns {HTMLElement}
   */
  function createMenuCard(menu) {
    const itemCount  = Array.isArray(menu.items) ? menu.items.length : 0;
    const itemNoun   = itemCount === 1 ? 'item' : 'items';

    const article = document.createElement('article');
    article.className = 'menu-card';
    article.id        = `menu-card-${menu.menuId}`;
    article.style.marginBottom = 'var(--space-5)';

    const categoryBadge = menu.category
      ? `<span class="badge-category">${escapeHtml(menu.category)}</span>`
      : '';

    article.innerHTML = `
      <div class="menu-card__header">
        <div class="d-flex align-items-start justify-content-between gap-3">
          <div style="min-width:0; flex:1;">
            <h2 class="menu-card__title">${escapeHtml(menu.title)}</h2>
            <div class="menu-card__meta mt-1">${categoryBadge}</div>
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              data-action="edit-menu"
              data-menu-id="${menu.menuId}"
              aria-label="Edit ${escapeHtml(menu.title)}"
            >Edit</button>
            <button
              type="button"
              class="btn btn-danger btn-sm"
              data-action="delete-menu"
              data-menu-id="${menu.menuId}"
              aria-label="Delete ${escapeHtml(menu.title)}"
            >Delete</button>
          </div>
        </div>
      </div>

      <div
        class="items-section"
        id="items-section-${menu.menuId}"
        style="display: none;"
        role="region"
        aria-label="Items in ${escapeHtml(menu.title)}"
      >
        <div class="menu-card__body">
          ${buildItemsHTML(menu)}
        </div>
      </div>

      <div class="menu-card__footer justify-content-between">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          data-action="toggle-items"
          data-menu-id="${menu.menuId}"
          aria-expanded="false"
          aria-controls="items-section-${menu.menuId}"
        >Show items (${itemCount})</button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-action="add-item"
          data-menu-id="${menu.menuId}"
        >+ Add item</button>
      </div>
    `;

    return article;
  }

  /** Build the innerHTML for the items section of a card. */
  function buildItemsHTML(menu) {
    if (!menu.items || menu.items.length === 0) {
      return `
        <div class="mg-state" style="padding: var(--space-8) 0;">
          <p class="mg-state__title" style="font-size: var(--text-base);">No items yet</p>
          <p class="mg-state__message" style="font-size: var(--text-sm);">
            Use "+ Add item" below to create your first item.
          </p>
        </div>
      `;
    }

    return menu.items.map(item => buildItemRowHTML(menu.menuId, item)).join('');
  }

  /**
   * Build the HTML string for one item row.
   * Availability shown as read-only badge — see module header for why
   * there is no toggle to change it via the API yet.
   */
  function buildItemRowHTML(menuId, item) {
    const available  = item.available !== false;
    const availBadge = available
      ? `<span class="badge-avail badge-avail--available">
           <span class="avail-dot avail-dot--available" aria-hidden="true"></span>
           Available
         </span>`
      : `<span class="badge-avail badge-avail--unavailable">
           <span class="avail-dot avail-dot--unavailable" aria-hidden="true"></span>
           Unavailable
         </span>`;

    const price = formatPrice(item.price);

    return `
      <div class="menu-item-row" id="item-row-${item.menuItemId}">
        <div class="menu-item-row__info">
          <p class="menu-item-row__name">${escapeHtml(item.name)}</p>
          ${item.description
            ? `<p class="menu-item-row__description">${escapeHtml(item.description)}</p>`
            : ''}
        </div>
        <div class="menu-item-row__right">
          <span class="price" aria-label="Price: ${escapeHtml(price)}">${escapeHtml(price)}</span>
          ${availBadge}
          <div class="menu-item-row__actions">
            <button
              type="button"
              class="btn-ghost btn-sm"
              data-action="edit-item"
              data-menu-id="${menuId}"
              data-item-id="${item.menuItemId}"
              aria-label="Edit ${escapeHtml(item.name)}"
            >Edit</button>
            <button
              type="button"
              class="btn-ghost danger btn-sm"
              data-action="delete-item"
              data-menu-id="${menuId}"
              data-item-id="${item.menuItemId}"
              aria-label="Delete ${escapeHtml(item.name)}"
              title="Remove item"
            >&times;</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Event delegation ────────────────────────────────── */

  function handleMenuListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const menuId = btn.dataset.menuId ? Number(btn.dataset.menuId) : null;
    const itemId = btn.dataset.itemId ? Number(btn.dataset.itemId) : null;

    switch (action) {
      case 'toggle-items':  toggleItems(menuId, btn);         break;
      case 'edit-menu':     openEditMenuModal(menuId);         break;
      case 'delete-menu':   openConfirmDeleteMenu(menuId);     break;
      case 'add-item':      openAddItemModal(menuId);          break;
      case 'edit-item':     openEditItemModal(menuId, itemId); break;
      case 'delete-item':   openConfirmDeleteItem(menuId, itemId); break;
    }
  }

  /* ── Expand / collapse ───────────────────────────────── */

  function toggleItems(menuId, btn) {
    const section    = document.getElementById(`items-section-${menuId}`);
    if (!section) return;

    const isExpanded = section.style.display !== 'none';
    const menu       = _myMenus.find(m => m.menuId === menuId);
    const count      = Array.isArray(menu?.items) ? menu.items.length : 0;

    if (isExpanded) {
      section.style.display = 'none';
      _expandedMenuIds.delete(menuId);
      btn.textContent = `Show items (${count})`;
      btn.setAttribute('aria-expanded', 'false');
    } else {
      section.style.display = 'block';
      _expandedMenuIds.add(menuId);
      btn.textContent = `Hide items (${count})`;
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  /* ── Menu CRUD ───────────────────────────────────────── */

  function openCreateMenuModal() {
    _menuFormMode  = 'create';
    _editingMenuId = null;
    _menuModalTitle.textContent = 'New menu';
    _menuForm.reset();
    clearMenuFormError();
    _menuBsModal.show();
    // Defer focus until transition completes.
    setTimeout(() => _menuTitleInput.focus(), 300);
  }

  function openEditMenuModal(menuId) {
    const menu = _myMenus.find(m => m.menuId === menuId);
    if (!menu) return;

    _menuFormMode  = 'edit';
    _editingMenuId = menuId;
    _menuModalTitle.textContent = 'Edit menu';
    _menuTitleInput.value    = menu.title;
    _menuCategoryInput.value = menu.category || '';
    clearMenuFormError();
    _menuBsModal.show();
    setTimeout(() => _menuTitleInput.focus(), 300);
  }

  async function submitMenuForm(e) {
    e.preventDefault();
    clearMenuFormError();

    const title    = _menuTitleInput.value.trim();
    const category = _menuCategoryInput.value.trim() || null;

    // Client-side validation (mirrors backend @NotBlank constraint).
    if (!title) {
      showMenuFormError('Menu title is required.');
      _menuTitleInput.focus();
      return;
    }

    setButtonLoading(_menuSaveBtn, true, 'Saving…');

    try {
      if (_menuFormMode === 'create') {
        await MenuGateApi.createMenu({ title, category });
        showToast('Menu created successfully.', 'success');
      } else {
        await MenuGateApi.updateMenu(_editingMenuId, { title, category });
        showToast('Menu updated.', 'success');
      }
      _menuBsModal.hide();
      await loadMyMenus();
    } catch (err) {
      showMenuFormError(err.message);
    } finally {
      setButtonLoading(_menuSaveBtn, false);
    }
  }

  /* ── Item CRUD ───────────────────────────────────────── */

  function openAddItemModal(menuId) {
    _itemFormMode   = 'create';
    _itemFormMenuId = menuId;
    _editingItemId  = null;
    _itemModalTitle.textContent = 'Add item';
    _itemForm.reset();
    clearItemFormError();
    _itemBsModal.show();
    setTimeout(() => _itemNameInput.focus(), 300);
  }

  function openEditItemModal(menuId, itemId) {
    const menu = _myMenus.find(m => m.menuId === menuId);
    const item = menu?.items?.find(i => i.menuItemId === itemId);
    if (!item) return;

    _itemFormMode   = 'edit';
    _itemFormMenuId = menuId;
    _editingItemId  = itemId;
    _itemModalTitle.textContent = 'Edit item';
    _itemNameInput.value  = item.name;
    _itemDescInput.value  = item.description || '';
    // price is BigDecimal → JSON number; toFixed(2) for clean display in input
    _itemPriceInput.value = item.price != null
      ? parseFloat(item.price).toFixed(2)
      : '';
    clearItemFormError();
    _itemBsModal.show();
    setTimeout(() => _itemNameInput.focus(), 300);
  }

  async function submitItemForm(e) {
    e.preventDefault();
    clearItemFormError();

    const name        = _itemNameInput.value.trim();
    const description = _itemDescInput.value.trim() || null;
    const priceRaw    = _itemPriceInput.value.trim();
    const price       = priceRaw !== '' ? parseFloat(priceRaw) : null;

    // Client-side validation (mirrors backend constraints).
    if (!name) {
      showItemFormError('Item name is required.');
      _itemNameInput.focus();
      return;
    }
    if (price === null || isNaN(price)) {
      showItemFormError('Price is required.');
      _itemPriceInput.focus();
      return;
    }
    if (price <= 0) {
      showItemFormError('Price must be greater than zero.');
      _itemPriceInput.focus();
      return;
    }

    setButtonLoading(_itemSaveBtn, true, 'Saving…');

    try {
      if (_itemFormMode === 'create') {
        // Note: backend ignores 'available' — it's hardcoded to true in the service.
        await MenuGateApi.addItem(_itemFormMenuId, { name, description, price });
        showToast('Item added.', 'success');
      } else {
        // Note: backend's updateMenuItem does not update 'available' currently.
        await MenuGateApi.updateItem(_itemFormMenuId, _editingItemId, { name, description, price });
        showToast('Item updated.', 'success');
      }
      _itemBsModal.hide();
      await loadMyMenus();
    } catch (err) {
      showItemFormError(err.message);
    } finally {
      setButtonLoading(_itemSaveBtn, false);
    }
  }

  /* ── Delete confirmation ─────────────────────────────── */

  function openConfirmDeleteMenu(menuId) {
    const menu = _myMenus.find(m => m.menuId === menuId);
    if (!menu) return;

    _pendingDelete = { type: 'menu', menuId };
    _confirmTitle.textContent = 'Delete menu?';

    const itemCount = Array.isArray(menu.items) ? menu.items.length : 0;
    const itemNote  = itemCount > 0
      ? `It contains <strong>${itemCount} item${itemCount !== 1 ? 's' : ''}</strong> that will also be deleted.`
      : 'It has no items.';

    _confirmBody.innerHTML = `
      <p class="mb-2">
        <strong>${escapeHtml(menu.title)}</strong> will be permanently deleted.
        This cannot be undone.
      </p>
      <p class="text-sm text-muted-warm mb-0">${itemNote}</p>
    `;
    _confirmBsModal.show();
  }

  function openConfirmDeleteItem(menuId, itemId) {
    const menu = _myMenus.find(m => m.menuId === menuId);
    const item = menu?.items?.find(i => i.menuItemId === itemId);
    if (!item) return;

    _pendingDelete = { type: 'item', menuId, itemId };
    _confirmTitle.textContent = 'Remove item?';
    _confirmBody.innerHTML = `
      <p class="mb-0">
        <strong>${escapeHtml(item.name)}</strong> will be permanently removed
        from this menu. This cannot be undone.
      </p>
    `;
    _confirmBsModal.show();
  }

  async function executeConfirmedDelete() {
    if (!_pendingDelete) return;

    setButtonLoading(_confirmDeleteBtn, true, 'Deleting…');

    const target = _pendingDelete;
    _pendingDelete = null;

    try {
      if (target.type === 'menu') {
        await MenuGateApi.deleteMenu(target.menuId);
        _expandedMenuIds.delete(target.menuId);
        showToast('Menu deleted.', 'success');
      } else {
        await MenuGateApi.deleteItem(target.menuId, target.itemId);
        showToast('Item removed.', 'success');
      }
      _confirmBsModal.hide();
      await loadMyMenus();
    } catch (err) {
      _confirmBsModal.hide();
      // Show error as a toast — the confirm modal is already closing.
      if (err.type === ERROR_TYPE.NOT_FOUND) {
        showToast('Could not find that item — it may have already been deleted.', 'error');
        await loadMyMenus(); // refresh to sync state
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setButtonLoading(_confirmDeleteBtn, false);
    }
  }

  /* ── State displays ──────────────────────────────────── */

  function showListLoading() {
    _menuList.innerHTML = `
      <div class="mg-loading">
        <div class="mg-spinner" role="status" aria-label="Loading your menus"></div>
        <span>Loading your menus…</span>
      </div>
    `;
  }

  function showListError(err) {
    _menuList.innerHTML = `
      <div class="mg-state mg-state--error">
        <div class="mg-state__icon" aria-hidden="true">⚠</div>
        <p class="mg-state__title">Could not load your menus</p>
        <p class="mg-state__message">${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-secondary btn-sm mt-3" id="retryLoadBtn">
          Try again
        </button>
      </div>
    `;
    document.getElementById('retryLoadBtn').addEventListener('click', loadMyMenus);
  }

  function showEmptyState() {
    _menuList.innerHTML = `
      <div class="mg-state">
        <div class="mg-state__icon" aria-hidden="true">🍽</div>
        <p class="mg-state__title">No menus yet</p>
        <p class="mg-state__message">
          Create your first menu and start adding items for your customers.
        </p>
        <button type="button" class="btn btn-primary mt-3" id="emptyNewMenuBtn">
          + Create your first menu
        </button>
      </div>
    `;
    document.getElementById('emptyNewMenuBtn').addEventListener('click', openCreateMenuModal);
  }

  /* ── Toast notifications ─────────────────────────────── */

  /**
   * Show a transient notification in the top-right corner.
   * Uses role="alert" for errors (interruptive) and role="status"
   * for success (polite) so screen readers announce appropriately.
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

    // Auto-dismiss after 4 s.
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

  /* ── Form helpers ────────────────────────────────────── */

  function showMenuFormError(message) {
    _menuFormError.textContent  = message;
    _menuFormError.style.display = 'flex';
  }

  function clearMenuFormError() {
    _menuFormError.textContent  = '';
    _menuFormError.style.display = 'none';
  }

  function showItemFormError(message) {
    _itemFormError.textContent  = message;
    _itemFormError.style.display = 'flex';
  }

  function clearItemFormError() {
    _itemFormError.textContent  = '';
    _itemFormError.style.display = 'none';
  }

  /**
   * Disable a button and replace its label with a spinner + text
   * while an async operation runs. Restores the original text when done.
   *
   * @param {HTMLButtonElement} btn
   * @param {boolean}           isLoading
   * @param {string}            [loadingText]
   */
  function setButtonLoading(btn, isLoading, loadingText = 'Please wait…') {
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = `
        <span class="mg-spinner mg-spinner--sm" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:6px;"></span>
        ${escapeHtml(loadingText)}
      `;
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || 'Save';
    }
  }

  /* ── Utilities ───────────────────────────────────────── */

  /** XSS-safe escaping via DOM — no regex edge cases. */
  function escapeHtml(value) {
    if (value == null) return '';
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(String(value)));
    return node.innerHTML;
  }

  /**
   * Format a price (number or BigDecimal-serialised string) as "$X.XX".
   * Returns "—" if absent or non-numeric.
   */
  function formatPrice(price) {
    if (price == null) return '—';
    const num = typeof price === 'number' ? price : parseFloat(price);
    return isNaN(num) ? '—' : `$${num.toFixed(2)}`;
  }

  /* ── Bootstrap ───────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', init);

}());
