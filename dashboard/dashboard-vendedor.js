// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD VENDEDOR — Lógica principal (v2 — estados parciales, KPIs PRO)
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const STORAGE_KEY = 'dash_vendedor_filters';
  let dashData = {};
  let tables = {};
  let refreshTimer = null;
  let lastActivity = Date.now();

  // ── Inicialización ──────────────────────────────────────────────────

  async function init() {
    const token = ApiClient.getToken();
    if (!token) { location.href = '../login.html'; return; }

    const roles = ApiClient.getRoles();
    if (!roles.includes('VENDEDOR') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      location.href = '../index.html';
      return;
    }

    const user = ApiClient.getUser();
    const nameEl = document.getElementById('vendedorNombre');
    if (nameEl) nameEl.textContent = user.nombre || user.email || 'Vendedor';

    restoreFilters();
    setupIdleDetection();
    await loadDashboard();
    startSmartRefresh();
  }

  // ── Persistencia de filtros ─────────────────────────────────────────

  function saveFilters() {
    const f = getFilters();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); } catch {}
  }

  function restoreFilters() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.fechaInicio && saved.fechaFin) {
        document.getElementById('filtroFechaInicio').value = saved.fechaInicio;
        document.getElementById('filtroFechaFin').value = saved.fechaFin;
        if (saved.agrupacion) document.getElementById('filtroAgrupacion').value = saved.agrupacion;
        return;
      }
    } catch {}
    setDefaultDates();
  }

  function setDefaultDates() {
    const today = new Date();
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    document.getElementById('filtroFechaInicio').value = monthAgo.toISOString().split('T')[0];
    document.getElementById('filtroFechaFin').value = today.toISOString().split('T')[0];
  }

  function getFilters() {
    return {
      fechaInicio: document.getElementById('filtroFechaInicio').value,
      fechaFin: document.getElementById('filtroFechaFin').value,
      agrupacion: document.getElementById('filtroAgrupacion').value
    };
  }

  // ── Auto-refresh inteligente ────────────────────────────────────────

  function setupIdleDetection() {
    ['mousemove', 'keydown', 'scroll', 'click'].forEach(ev => {
      document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true });
    });
  }

  function startSmartRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const isTabVisible = !document.hidden;
      const isIdle = (Date.now() - lastActivity) > 30000;
      if (isTabVisible && isIdle) {
        loadDashboard();
      }
    }, 5 * 60 * 1000);
  }

  // ── Carga principal — cada sección independiente ────────────────────

  async function loadDashboard() {
    const overlay = document.getElementById('loadingOverlay');
    const btnRefresh = document.getElementById('btnRefresh');

    btnRefresh.disabled = true;
    btnRefresh.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Cargando...';

    saveFilters();
    ApiClient.invalidateByPrefix('/reportes/vendedor');

    const filters = getFilters();

    // Mostrar loading en cada sección
    showSectionLoading('kpiRow');
    showSectionLoading('chartHistorial');
    showSectionLoading('chartDistribucion');
    showSectionLoading('chartTopProductos');
    showSectionLoading('tablaRentables');
    showSectionLoading('tablaStockMuerto');
    showSectionLoading('tablaRotacion');
    overlay.style.display = 'none';

    // Lanzar 5 requests en paralelo con allSettled
    const [resumenR, historialR, topR, rentablesR, inventarioR] = await Promise.allSettled([
      ReportesAPI.vendedorResumen(filters),
      ReportesAPI.vendedorHistorialGanancias(filters),
      ReportesAPI.vendedorTopProductos(filters),
      ReportesAPI.vendedorProductosRentables(filters),
      ReportesAPI.vendedorAnalisisInventario(filters)
    ]);

    dashData.resumen     = resumenR.status === 'fulfilled' ? resumenR.value : null;
    dashData.historial   = historialR.status === 'fulfilled' ? historialR.value : null;
    dashData.topProductos = topR.status === 'fulfilled' ? topR.value : null;
    dashData.rentables   = rentablesR.status === 'fulfilled' ? rentablesR.value : null;
    dashData.inventario  = inventarioR.status === 'fulfilled' ? inventarioR.value : null;

    // Renderizar cada sección independiente — si falla una, las demás siguen
    safeRender('kpiRow', renderKPIs, resumenR);
    safeRender('chartHistorial', renderHistorialChart, historialR);
    safeRender('chartDistribucion', renderDistribucionChart, topR);
    safeRender('chartTopProductos', renderTopProductosChart, topR);
    safeRender('tablaRentables', renderTablaRentables, rentablesR);
    safeRender('tablaStockMuerto', () => renderTablaStockMuerto(), inventarioR);
    safeRender('tablaRotacion', () => renderTablaRotacion(), inventarioR);

    // Alertas — usan datos combinados, toleran nulls
    renderAlerts();

    btnRefresh.disabled = false;
    btnRefresh.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
  }

  /**
   * Ejecuta un render. Si el promise falló, muestra error en esa sección.
   */
  function safeRender(containerId, renderFn, settledResult) {
    if (settledResult && settledResult.status === 'rejected') {
      showSectionError(containerId, settledResult.reason?.message || 'Error al cargar datos');
      return;
    }
    try {
      renderFn();
    } catch (err) {
      console.error(`Error renderizando ${containerId}:`, err);
      showSectionError(containerId, 'Error al renderizar: ' + err.message);
    }
  }

  function showSectionLoading(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Solo inyectar loading si es un contenedor de tabla/kpi (no canvas)
    if (el.tagName === 'CANVAS') {
      ChartFactory.renderChartLoading(id);
    } else {
      el.innerHTML = '<div class="dash-table-loading"><div class="dash-spinner-sm"></div><span>Cargando...</span></div>';
    }
  }

  function showSectionError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'CANVAS') {
      ChartFactory.renderChartEmpty(id, message);
    } else {
      el.innerHTML = `
        <div class="dash-alert" style="background:rgba(220,53,69,0.08); border-left:4px solid #dc3545; margin:0.5rem 0;">
          <div class="dash-alert-icon" style="color:#dc3545"><i class="fas fa-exclamation-circle"></i></div>
          <div class="dash-alert-body">
            <div class="dash-alert-title" style="color:#dc3545">Error</div>
            <div class="dash-alert-message">${ApiClient.escapeHtml(message)}</div>
          </div>
        </div>`;
    }
  }

  // ── KPIs — Ticket promedio, ROI, Margen promedio ────────────────────

  function renderKPIs() {
    const r = dashData.resumen || {};
    const historial = normalizeArray(dashData.historial);

    const totalVendido = Number(r.total_vendido) || 0;
    const gananciaNeta = Number(r.ganancia_neta) || 0;
    const totalCosto   = Number(r.total_costo) || 0;
    const totalPedidos = Number(r.total_pedidos) || 0;
    const totalComisiones = Number(r.total_comisiones) || 0;

    // Ticket promedio = ventas / pedidos
    const ticketPromedio = totalPedidos > 0 ? totalVendido / totalPedidos : 0;

    // ROI = ganancia_neta / costo_total * 100
    const roi = totalCosto > 0 ? (gananciaNeta / totalCosto) * 100 : 0;

    // Margen promedio = ganancia_neta / total_vendido * 100
    const margenPromedio = totalVendido > 0 ? (gananciaNeta / totalVendido) * 100 : 0;

    // Cambio % comparando últimos 2 periodos del historial
    let cambioGanancias = null;
    if (historial.length >= 2) {
      const last = Number(historial[historial.length - 1].ganancia_neta) || 0;
      const prev = Number(historial[historial.length - 2].ganancia_neta) || 0;
      if (prev > 0) cambioGanancias = ((last - prev) / prev) * 100;
    }

    const cards = [
      {
        label: 'Ganancia Neta',
        value: ApiClient.formatCurrency(gananciaNeta),
        rawValue: gananciaNeta,
        icon: 'fas fa-piggy-bank',
        color: 'success',
        change: cambioGanancias,
        subtitle: `${ApiClient.formatCurrency(totalComisiones)} en comisiones`
      },
      {
        label: 'Ticket Promedio',
        value: ApiClient.formatCurrency(ticketPromedio),
        rawValue: ticketPromedio,
        icon: 'fas fa-receipt',
        color: 'primary',
        subtitle: `${ApiClient.formatNumber(totalPedidos)} pedidos | ${ApiClient.formatCurrency(totalVendido)} vendido`
      },
      {
        label: 'ROI',
        value: roi.toFixed(1) + '%',
        rawValue: roi,
        icon: 'fas fa-chart-line',
        color: roi >= 20 ? 'success' : (roi >= 0 ? 'warning' : 'danger'),
        subtitle: `Retorno sobre ${ApiClient.formatCurrency(totalCosto)} invertido`
      },
      {
        label: 'Margen Neto',
        value: margenPromedio.toFixed(1) + '%',
        rawValue: margenPromedio,
        icon: 'fas fa-percentage',
        color: margenPromedio >= 25 ? 'success' : (margenPromedio >= 10 ? 'warning' : 'danger'),
        subtitle: r.inventario ? `${r.inventario.unidades_en_stock || 0} unid. en stock` : ''
      }
    ];

    KpiCard.renderKpiRow('kpiRow', cards);
  }

  // ── Gráficas ────────────────────────────────────────────────────────

  function renderHistorialChart() {
    const historial = normalizeArray(dashData.historial);
    ChartFactory.removeChartLoading('chartHistorial');

    if (historial.length === 0) {
      ChartFactory.renderChartEmpty('chartHistorial', 'No hay datos de ganancias en este periodo');
      return;
    }

    ChartFactory.clearChartEmpty('chartHistorial');
    ChartFactory.createLineChart('chartHistorial', {
      labels: historial.map(h => formatPeriodo(h.periodo)),
      datasets: [
        { label: 'Ganancia Neta', data: historial.map(h => Number(h.ganancia_neta) || 0), color: '#28a745' },
        { label: 'Ingresos Brutos', data: historial.map(h => Number(h.ingresos_brutos) || 0), color: '#667eea' },
        { label: 'Comisiones', data: historial.map(h => Number(h.comision_total) || 0), color: '#ffc107' }
      ],
      yPrefix: '$',
      fill: false
    });
  }

  function renderDistribucionChart() {
    const topProds = normalizeArray(dashData.topProductos);
    ChartFactory.removeChartLoading('chartDistribucion');

    if (topProds.length === 0) {
      ChartFactory.renderChartEmpty('chartDistribucion', 'Sin datos de distribución');
      return;
    }

    ChartFactory.clearChartEmpty('chartDistribucion');
    const top5 = topProds.slice(0, 6);
    ChartFactory.createPieChart('chartDistribucion', {
      labels: top5.map(p => truncate(p.nombre, 20)),
      data: top5.map(p => Number(p.ganancia_neta) || 0),
      type: 'doughnut'
    });
  }

  function renderTopProductosChart() {
    const topProds = normalizeArray(dashData.topProductos);
    ChartFactory.removeChartLoading('chartTopProductos');

    if (topProds.length === 0) {
      ChartFactory.renderChartEmpty('chartTopProductos', 'Sin datos de productos vendidos');
      return;
    }

    ChartFactory.clearChartEmpty('chartTopProductos');
    const top10 = topProds.slice(0, 10);
    ChartFactory.createBarChart('chartTopProductos', {
      labels: top10.map(p => truncate(p.nombre, 25)),
      datasets: [{
        label: 'Unidades Vendidas',
        data: top10.map(p => Number(p.unidades_vendidas) || 0),
        color: '#667eea'
      }],
      horizontal: true
    });
  }

  // ── Tablas con drill-down ───────────────────────────────────────────

  function renderTablaRentables() {
    const data = normalizeArray(dashData.rentables);
    tables.rentables = DataTable.createDataTable('tablaRentables', {
      columns: [
        { key: 'nombre', label: 'Producto', sortable: true },
        { key: 'ganancia_neta', label: 'Ganancia Neta', type: 'currency', align: 'right', sortable: true },
        { key: 'margen_pct', label: 'Margen', align: 'right', sortable: true,
          format: (v) => {
            const n = Number(v) || 0;
            const cls = n >= 30 ? 'dash-badge-success' : (n >= 10 ? 'dash-badge-warning' : 'dash-badge-danger');
            return `<span class="dash-badge ${cls}">${n.toFixed(1)}%</span>`;
          }
        },
        { key: 'unidades_vendidas', label: 'Vendidos', type: 'number', align: 'right', sortable: true },
        { key: 'comision_total', label: 'Comisión', type: 'currency', align: 'right', sortable: true }
      ],
      data: data,
      searchable: true,
      searchPlaceholder: 'Buscar producto...',
      pageSize: 5,
      emptyMessage: 'Sin productos rentables en este periodo',
      emptyIcon: 'fas fa-gem',
      rowClick: (row) => showDrillDown(row)
    });
  }

  function renderTablaStockMuerto() {
    const inv = dashData.inventario || {};
    const data = inv.stock_muerto || [];

    tables.stockMuerto = DataTable.createDataTable('tablaStockMuerto', {
      columns: [
        { key: 'nombre', label: 'Producto', sortable: true },
        { key: 'stock', label: 'Stock', type: 'number', align: 'right', sortable: true },
        { key: 'capital_retenido', label: 'Capital Retenido', type: 'currency', align: 'right', sortable: true,
          format: (v) => {
            const n = Number(v) || 0;
            const cls = n >= 500 ? 'dash-text-danger dash-fw-bold' : '';
            return `<span class="${cls}">${ApiClient.formatCurrency(n)}</span>`;
          }
        },
        { key: 'precio', label: 'P. Venta', type: 'currency', align: 'right', sortable: true },
        { key: 'costo_compra', label: 'Costo', type: 'currency', align: 'right', sortable: true }
      ],
      data: data,
      searchable: true,
      searchPlaceholder: 'Buscar producto...',
      pageSize: 5,
      emptyMessage: 'Sin stock muerto — todos tus productos rotan bien!',
      emptyIcon: 'fas fa-check-circle'
    });
  }

  function renderTablaRotacion() {
    const inv = dashData.inventario || {};
    const data = inv.mayor_rotacion || [];

    tables.rotacion = DataTable.createDataTable('tablaRotacion', {
      columns: [
        { key: 'nombre', label: 'Producto', sortable: true },
        { key: 'unidades_vendidas', label: 'Vendidas', type: 'number', align: 'right', sortable: true },
        { key: 'stock', label: 'Stock', type: 'number', align: 'right', sortable: true },
        { key: 'indice_rotacion', label: 'Rotación', align: 'center', sortable: true,
          format: (v) => {
            const n = Number(v) || 0;
            if (n >= 2) return '<span class="dash-badge dash-badge-success"><i class="fas fa-circle me-1" style="font-size:0.5rem"></i>Alta ' + n.toFixed(1) + '</span>';
            if (n >= 1) return '<span class="dash-badge dash-badge-warning"><i class="fas fa-circle me-1" style="font-size:0.5rem"></i>Media ' + n.toFixed(1) + '</span>';
            return '<span class="dash-badge dash-badge-danger"><i class="fas fa-circle me-1" style="font-size:0.5rem"></i>Baja ' + n.toFixed(1) + '</span>';
          }
        },
        { key: 'pct_conversion_inventario', label: 'Conversión', align: 'right', sortable: true,
          format: (v) => {
            const n = Number(v) || 0;
            return `<span class="dash-badge dash-badge-info">${n.toFixed(1)}%</span>`;
          }
        },
        { key: 'precio', label: 'Precio', type: 'currency', align: 'right', sortable: true }
      ],
      data: data,
      searchable: true,
      searchPlaceholder: 'Buscar producto...',
      pageSize: 8,
      emptyMessage: 'Sin datos de rotación en este periodo',
      emptyIcon: 'fas fa-fire',
      rowClick: (row) => showDrillDown(row)
    });
  }

  // ── Drill-down modal ────────────────────────────────────────────────

  function showDrillDown(row) {
    if (!row || !row.nombre) return;
    let modal = document.getElementById('drillDownModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'drillDownModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-lg">
          <div class="modal-content" style="background:var(--dash-surface); border:none; border-radius:var(--dash-radius);">
            <div class="modal-header" style="border-bottom:1px solid var(--dash-border);">
              <h5 class="modal-title" id="drillDownTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="drillDownBody"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    document.getElementById('drillDownTitle').innerHTML =
      `<i class="fas fa-search-plus me-2" style="color:var(--dash-primary)"></i>${ApiClient.escapeHtml(row.nombre)}`;

    const body = document.getElementById('drillDownBody');
    const fields = Object.entries(row).filter(([k]) => k !== 'imagen');
    const labels = {
      id_producto: 'ID Producto', nombre: 'Nombre', unidades_vendidas: 'Unidades Vendidas',
      ingresos_brutos: 'Ingresos Brutos', ganancia_neta: 'Ganancia Neta', ganancia_bruta: 'Ganancia Bruta',
      comision_total: 'Comisión Total', margen_pct: 'Margen %', costo_total: 'Costo Total',
      stock: 'Stock Actual', precio: 'Precio Venta', costo_compra: 'Costo Compra',
      capital_retenido: 'Capital Retenido', indice_rotacion: 'Índice Rotación',
      pct_conversion_inventario: '% Conversión', pedidos_distintos: 'Pedidos Distintos',
      unidades_compradas: 'Unidades Compradas'
    };

    body.innerHTML = `
      <div class="row g-3">
        ${fields.map(([k, v]) => {
          const label = labels[k] || k.replace(/_/g, ' ');
          const isMoney = ['ingresos_brutos','ganancia_neta','ganancia_bruta','comision_total',
            'costo_total','precio','costo_compra','capital_retenido'].includes(k);
          const isPct = ['margen_pct','pct_conversion_inventario'].includes(k);
          const display = isMoney ? ApiClient.formatCurrency(v) : isPct ? Number(v).toFixed(1) + '%' : v;
          return `<div class="col-md-4 col-6">
            <div style="background:#f8f9fa; padding:0.75rem; border-radius:8px;">
              <div style="font-size:0.7rem; color:var(--dash-muted); text-transform:uppercase; letter-spacing:0.5px;">${ApiClient.escapeHtml(label)}</div>
              <div style="font-size:1.1rem; font-weight:600; color:var(--dash-text);">${display}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  // ── Alertas ─────────────────────────────────────────────────────────

  function renderAlerts() {
    const historial = normalizeArray(dashData.historial);
    const alerts = AlertsEngine.analyzeVendedor({
      resumen: dashData.resumen,
      inventario: dashData.inventario,
      historial: historial
    });
    AlertsEngine.renderAlerts('alertsContainer', alerts);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  function normalizeArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function formatPeriodo(p) {
    if (!p) return '';
    const str = String(p);
    if (/^\d{4}-\d{2}$/.test(str)) {
      const [y, m] = str.split('-');
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return meses[parseInt(m) - 1] + ' ' + y.slice(2);
    }
    if (/^\d{4}-W\d{2}$/.test(str)) {
      return 'Sem ' + str.split('-W')[1] + ' ' + str.split('-')[0].slice(2);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const d = new Date(str);
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }
    return str;
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  // ── Refresh (llamado desde botón) ───────────────────────────────────

  async function refresh() {
    await loadDashboard();
  }

  global.DashVendedor = { refresh };
  document.addEventListener('DOMContentLoaded', init);

})(window);
