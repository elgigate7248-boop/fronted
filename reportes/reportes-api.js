// ═══════════════════════════════════════════════════════════════════════
// REPORTES API — Wrapper para endpoints /reportes/vendedor/* y /reportes/admin/*
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  // ── Helpers de filtros ──────────────────────────────────────────────

  function buildFiltros(opts) {
    const p = {};
    if (opts.fechaInicio) p.fecha_inicio = opts.fechaInicio;
    if (opts.fechaFin)    p.fecha_fin = opts.fechaFin;
    if (opts.agrupacion)  p.agrupacion = opts.agrupacion;
    if (opts.ordenarPor)  p.ordenar_por = opts.ordenarPor;
    if (opts.limit)       p.limit = opts.limit;
    return p;
  }

  /**
   * Extrae la data útil del response.
   * El backend envuelve en { reporte, data } o { reporte, data: { advertencia, data } }
   */
  function unwrap(response) {
    if (!response) return null;
    // Si es directamente un array (admin top-vendedores sin advertencia)
    if (Array.isArray(response.data)) return response.data;
    // Si data tiene una propiedad "data" interna (con advertencia)
    if (response.data && response.data.data) {
      response.data._advertencia = response.data.advertencia || null;
      return response.data;
    }
    return response.data || response;
  }

  // ── VENDEDOR ────────────────────────────────────────────────────────

  /**
   * Resumen financiero del vendedor.
   * @returns {Promise<{total_pedidos, unidades_vendidas, total_vendido, ganancia_neta, total_comisiones, inventario}>}
   */
  async function vendedorResumen(opts = {}) {
    const res = await ApiClient.fetchAuth('/reportes/vendedor/resumen', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Historial de ganancias por periodo.
   * @returns {Promise<Array<{periodo, ganancia_neta, comision_total, ingresos_brutos}>>}
   */
  async function vendedorHistorialGanancias(opts = {}) {
    if (!opts.agrupacion) opts.agrupacion = 'dia';
    const res = await ApiClient.fetchAuth('/reportes/vendedor/historial-ganancias', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Top productos del vendedor.
   * @returns {Promise<Array<{nombre, unidades_vendidas, ingresos_brutos, ganancia_neta, margen_pct}>>}
   */
  async function vendedorTopProductos(opts = {}) {
    if (!opts.limit) opts.limit = 10;
    const res = await ApiClient.fetchAuth('/reportes/vendedor/top-productos', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Productos más rentables del vendedor.
   * @returns {Promise<Array>}
   */
  async function vendedorProductosRentables(opts = {}) {
    if (!opts.limit) opts.limit = 10;
    const res = await ApiClient.fetchAuth('/reportes/vendedor/productos-rentables', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Análisis de inventario (rotación + stock muerto).
   * @returns {Promise<{mayor_rotacion, stock_muerto, conversion_inventario}>}
   */
  async function vendedorAnalisisInventario(opts = {}) {
    if (!opts.limit) opts.limit = 10;
    const res = await ApiClient.fetchAuth('/reportes/vendedor/analisis-inventario', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  // ── ADMIN ───────────────────────────────────────────────────────────

  /**
   * Estadísticas generales del sistema.
   * @returns {Promise<{globales, periodo, por_estado, crecimiento}>}
   */
  async function adminEstadisticas(opts = {}) {
    const res = await ApiClient.fetchAuth('/reportes/admin/estadisticas', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Ingresos de la plataforma por periodo.
   * @returns {Promise<{totales, detalle}>}
   */
  async function adminIngresosPlataforma(opts = {}) {
    if (!opts.agrupacion) opts.agrupacion = 'mes';
    const res = await ApiClient.fetchAuth('/reportes/admin/ingresos-plataforma', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Top vendedores con ranking.
   * @returns {Promise<Array>}
   */
  async function adminTopVendedores(opts = {}) {
    if (!opts.limit) opts.limit = 10;
    const res = await ApiClient.fetchAuth('/reportes/admin/top-vendedores', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  /**
   * Top productos globales.
   * @returns {Promise<Array>}
   */
  async function adminTopProductos(opts = {}) {
    if (!opts.limit) opts.limit = 10;
    const res = await ApiClient.fetchAuth('/reportes/admin/top-productos', {
      params: buildFiltros(opts)
    });
    return unwrap(res);
  }

  global.ReportesAPI = {
    // Vendedor
    vendedorResumen,
    vendedorHistorialGanancias,
    vendedorTopProductos,
    vendedorProductosRentables,
    vendedorAnalisisInventario,
    // Admin
    adminEstadisticas,
    adminIngresosPlataforma,
    adminTopVendedores,
    adminTopProductos
  };

})(window);
