// ═══════════════════════════════════════════════════════════════════════
// API CLIENT — Centralizado con caché, manejo de 401 y reintentos
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const cache = new Map();
  const CACHE_TTL = 60000; // 1 minuto

  function getToken() {
    return localStorage.getItem('token');
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  }

  function getRoles() {
    const user = getUser();
    if (Array.isArray(user.roles)) {
      return user.roles
        .map(r => (r && typeof r === 'object') ? r.nombre : r)
        .map(r => String(r || '').trim().toUpperCase())
        .filter(Boolean);
    }
    if (user.rol) return [String(user.rol).trim().toUpperCase()];
    return [];
  }

  function isAdmin() {
    const roles = getRoles();
    return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  }

  function isVendedor() {
    return getRoles().includes('VENDEDOR');
  }

  function buildUrl(endpoint, params) {
    const base = typeof API_BASE !== 'undefined' ? API_BASE : '';
    const url = new URL(endpoint.startsWith('http') ? endpoint : base + endpoint);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
    }
    return url.toString();
  }

  /**
   * Cache key = URL completa (ya incluye query params via buildUrl).
   * Esto garantiza que distintos filtros = distintas keys.
   */
  function cacheKey(url) {
    return url;
  }

  /**
   * Invalida entradas de caché que coincidan con un prefijo de endpoint.
   */
  function invalidateByPrefix(prefix) {
    const base = typeof API_BASE !== 'undefined' ? API_BASE : '';
    const full = base + prefix;
    for (const key of cache.keys()) {
      if (key.startsWith(full)) cache.delete(key);
    }
  }

  function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
  }

  function clearCache() {
    cache.clear();
  }

  /**
   * Fetch autenticado con manejo de errores centralizado.
   * @param {string} endpoint - Ruta relativa (ej: '/reportes/vendedor/resumen')
   * @param {object} opts - { params, method, body, useCache, signal }
   * @returns {Promise<any>} JSON parsed
   */
  async function fetchAuth(endpoint, opts = {}) {
    const { params, method = 'GET', body, useCache = true, signal } = opts;
    const url = buildUrl(endpoint, params);
    const key = cacheKey(url);

    // Intentar caché solo para GET
    if (method === 'GET' && useCache) {
      const cached = getCached(key);
      if (cached) return cached;
    }

    const token = getToken();
    if (!token) {
      window.location.href = 'login.html';
      throw new Error('No autenticado');
    }

    const headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };

    const fetchOpts = { method, headers, signal };
    if (body && method !== 'GET') {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, fetchOpts);

    // Sesión expirada
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
      throw new Error('Sesión expirada');
    }

    // Forbidden
    if (res.status === 403) {
      throw new Error('No tienes permisos para esta acción');
    }

    if (!res.ok) {
      let errorMsg = `Error HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        errorMsg = errBody.error || errBody.mensaje || errorMsg;
      } catch { /* ignore parse error */ }
      throw new Error(errorMsg);
    }

    const data = await res.json();

    // Guardar en caché si es GET
    if (method === 'GET' && useCache) {
      setCache(key, data);
    }

    return data;
  }

  /**
   * Fetch múltiple en paralelo con allSettled (no rompe si uno falla).
   * @param {Array<{endpoint, params}>} requests
   * @returns {Promise<Array<{status, value?, reason?}>>}
   */
  async function fetchAllSettled(requests) {
    return Promise.allSettled(
      requests.map(r => fetchAuth(r.endpoint, { params: r.params }))
    );
  }

  // Formateo de moneda (MXN)
  function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  // Formateo de número
  function formatNumber(value) {
    return new Intl.NumberFormat('es-MX').format(Number(value) || 0);
  }

  // Formateo de porcentaje
  function formatPercent(value) {
    const n = Number(value) || 0;
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(1) + '%';
  }

  // Formateo de fecha corta
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Escape HTML para prevenir XSS
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Exportar al global
  global.ApiClient = {
    fetchAuth,
    fetchAllSettled,
    clearCache,
    invalidateByPrefix,
    getToken,
    getUser,
    getRoles,
    isAdmin,
    isVendedor,
    formatCurrency,
    formatNumber,
    formatPercent,
    formatDate,
    escapeHtml
  };

})(window);
