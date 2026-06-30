const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'include',
        headers: { ...JSON_HEADERS, ...(options.headers || {}) },
        ...options,
    });
    if (res.status === 401) {
        window.location.href = '/index.html';
        return null;
    }
    return res;
}

export async function checkAuth() {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
        window.location.href = '/index.html';
        return null;
    }
    return res.json();
}

export async function logout() {
    await fetch('/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/index.html';
}

export const api = {
    me: () => request('/api/auth/me'),

    menus: {
        list:   ()         => request('/api/menus'),
        get:    (id)       => request(`/api/menus/${id}`),
        create: (body)     => request('/api/menus', { method: 'POST', body: JSON.stringify(body) }),
        update: (id, body) => request(`/api/menus/${id}`, { method: 'PUT',  body: JSON.stringify(body) }),
        delete: (id)       => request(`/api/menus/${id}`, { method: 'DELETE' }),
    },

    items: {
        add:    (menuId, body)         => request(`/api/menus/${menuId}/items`, { method: 'POST', body: JSON.stringify(body) }),
        update: (menuId, itemId, body) => request(`/api/menus/${menuId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(body) }),
        delete: (menuId, itemId)       => request(`/api/menus/${menuId}/items/${itemId}`, { method: 'DELETE' }),
    },

    admin: {
        menus:      ()   => request('/api/admin/menus'),
        deleteMenu: (id) => request(`/api/admin/menus/${id}`, { method: 'DELETE' }),
    },
};
