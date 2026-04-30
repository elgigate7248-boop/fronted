// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD ADMIN — Lógica principal (v2 — estados parciales, KPIs PRO)
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const STORAGE_KEY = 'dash_admin_filters';
  let dashData = {};
  let tables = {};
  let refreshTimer = null;
  let lastActivity = Date.now();

  // ── Inicialización ──────────────────────────────────────────────────

  async function init() {
    const token = ApiClient.getToken();
    if (!token) { location.href = '../login.html'; return; }

    // Guard de rol REAL — verifica array de roles
    const roles = ApiClient.getRoles();
    if (!roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      location.href = '../index.html';
      return;
    }

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
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    document.getElementById('filtroFechaInicio').value = threeMonthsAgo.toISOString().split('T')[0];
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
    ApiClient.invalidateByPrefix('/reportes/admin');

    const filters = getFilters();

    // Loading independiente por sección
    showSectionLoading('kpiRow');
    showSectionLoading('chartIngresos');
    showSectionLoading('chartEstados');
    showSectionLoading('chartTopVendedores');
    showSectionLoading('chartTopProductos');
    showSectionLoading('tablaVendedores');
    showSectionLoading('tablaProductos');
    overlay.style.display = 'none';

    // 4 requests en paralelo con allSettled
    const [estadisticasR, ingresosR, topVendedoresR, topProductosR] = await Promise.allSettled([
      ReportesAPI.adminEstadisticas(filters),
      ReportesAPI.adminIngresosPlataforma(filters),
      ReportesAPI.adminTopVendedores(filters),
      ReportesAPI.adminTopProductos(filters)
    ]);

    dashData.estadisticas  = estadisticasR.status === 'fulfilled' ? estadisticasR.value : null;
    dashData.ingresos      = ingresosR.status === 'fulfilled' ? ingresosR.value : null;
    dashData.topVendedores = topVendedoresR.status === 'fulfilled' ? topVendedoresR.value : null;
    dashData.topProductos  = topProductosR.status === 'fulfilled' ? topProductosR.value : null;

    // Renderizar cada sección — si falla una, las demás siguen
    safeRender('kpiRow', renderKPIs, estadisticasR);
    safeRender('comparacionRow', renderComparacion, estadisticasR);
    safeRender('chartIngresos', renderIngresosChart, ingresosR);
    safeRender('chartEstados', renderEstadosChart, estadisticasR);
    safeRender('chartTopVendedores', renderTopVendedoresChart, topVendedoresR);
    safeRender('chartTopProductos', renderTopProductosChart, topProductosR);
    safeRender('tablaVendedores', renderTablaVendedores, topVendedoresR);
    safeRender('tablaProductos', renderTablaProductos, topProductosR);

    renderAlerts();

    btnRefresh.disabled = false;
    btnRefresh.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
  }

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

  // ── KPIs — Ticket promedio reemplaza "Total Pedidos" genérico ───────

  function renderKPIs() {
    const est = dashData.estadisticas || {};
    const globales = est.globales || {};
    const periodo = est.periodo || {};
    const ing = dashData.ingresos || {};
    const totales = ing.totales || {};
    const crec = est.crecimiento || {};

    const ventasPeriodo = Number(periodo.ventas_periodo) || 0;
    const pedidosPeriodo = Number(periodo.pedidos_periodo) || 0;
    const ticketPromedio = pedidosPeriodo > 0 ? ventasPeriodo / pedidosPeriodo : 0;
    const comisionTotal = Number(totales.comision_total_recaudada) || 0;

    const cards = [
      {
        label: 'Ventas del Periodo',
        value: ApiClient.formatCurrency(ventasPeriodo),
        rawValue: ventasPeriodo,
        icon: 'fas fa-cash-register',
        color: 'primary',
        change: crec.variacion_ventas_pct,
        subtitle: `${ApiClient.formatNumber(pedidosPeriodo)} pedidos`
      },
      {
        label: 'Comisiones Recaudadas',
        value: ApiClient.formatCurrency(comisionTotal),
        rawValue: comisionTotal,
        icon: 'fas fa-coins',
        color: 'success',
        subtitle: `${ApiClient.formatNumber(totales.vendedores_activos || 0)} vendedores activos`
      },
      {
        label: 'Ticket Promedio',
        value: ApiClient.formatCurrency(ticketPromedio),
        rawValue: ticketPromedio,
        icon: 'fas fa-receipt',
        color: 'info',
        change: crec.variacion_pedidos_pct,
        subtitle: `${ApiClient.formatNumber(globales.total_pedidos || 0)} pedidos totales`
      },
      {
        label: 'Usuarios Activos',
        value: ApiClient.formatNumber(periodo.usuarios_activos),
        rawValue: periodo.usuarios_activos,
        icon: 'fas fa-users',
        color: 'warning',
        subtitle: `${ApiClient.formatNumber(globales.total_usuarios || 0)} registrados | ${ApiClient.formatNumber(globales.total_vendedores || 0)} vendedores`
      }
    ];

    KpiCard.renderKpiRow('kpiRow', cards);
  }

  // ── Comparación de Periodos ─────────────────────────────────────────

  function renderComparacion() {
    const est = dashData.estadisticas || {};
    const crec = est.crecimiento;

    const row = document.getElementById('comparacionRow');
    const badges = document.getElementById('comparacionBadges');

    if (!crec || (crec.variacion_ventas_pct === null && crec.variacion_pedidos_pct === null)) {
      row.style.display = 'none';
      return;
    }

    row.style.display = '';
    const items = [];

    if (crec.variacion_ventas_pct !== null) {
      const v = crec.variacion_ventas_pct;
      const cls = v > 0 ? 'dash-badge-success' : (v < 0 ? 'dash-badge-danger' : 'dash-badge-muted');
      const icon = v > 0 ? 'fa-arrow-up' : (v < 0 ? 'fa-arrow-down' : 'fa-minus');
      items.push(`
        <div class="text-center">
          <div class="dash-badge ${cls}" style="font-size:0.85rem; padding:0.5rem 1rem;">
            <i class="fas ${icon} me-1"></i> ${Math.abs(v).toFixed(1)}%
          </div>
          <div class="mt-1" style="font-size:0.7rem; color:var(--dash-muted);">Ventas</div>
        </div>`);
    }

    if (crec.variacion_pedidos_pct !== null) {
      const v = crec.variacion_pedidos_pct;
      const cls = v > 0 ? 'dash-badge-success' : (v < 0 ? 'dash-badge-danger' : 'dash-badge-muted');
      const icon = v > 0 ? 'fa-arrow-up' : (v < 0 ? 'fa-arrow-down' : 'fa-minus');
      items.push(`
        <div class="text-center">
          <div class="dash-badge ${cls}" style="font-size:0.85rem; padding:0.5rem 1rem;">
            <i class="fas ${icon} me-1"></i> ${Math.abs(v).toFixed(1)}%
          </div>
          <div class="mt-1" style="font-size:0.7rem; color:var(--dash-muted);">Pedidos</div>
        </div>`);
    }

    if (crec.periodo_anterior) {
      const pa = crec.periodo_anterior;
      items.push(`
        <div class="text-center" style="font-size:0.75rem; color:var(--dash-muted); border-left: 1px solid var(--dash-border); padding-left:1rem;">
          <div>Periodo anterior: <strong>${pa.inicio}</strong> a <strong>${pa.fin}</strong></div>
          <div>${ApiClient.formatNumber(pa.pedidos)} pedidos | ${ApiClient.formatCurrency(pa.ventas)}</div>
        </div>`);
    }

    badges.innerHTML = items.join('');
  }

  // ── Gráficas ────────────────────────────────────────────────────────

  function renderIngresosChart() {
    const ing = dashData.ingresos || {};
    const detalle = ing.detalle || [];
    ChartFactory.removeChartLoading('chartIngresos');

    if (detalle.length === 0) {
      ChartFactory.renderChartEmpty('chartIngresos', 'No hay datos de ingresos en este periodo');
      return;
    }

    ChartFactory.clearChartEmpty('chartIngresos');
    ChartFactory.createLineChart('chartIngresos', {
      labels: detalle.map(d => formatPeriodo(d.periodo)),
      datasets: [
        { label: 'Volumen de Ventas', data: detalle.map(d => Number(d.volumen_ventas) || 0), color: '#667eea' },
        { label: 'Comisión Recaudada', data: detalle.map(d => Number(d.comision_recaudada) || 0), color: '#28a745' },
        { label: 'Ganancia Vendedores', data: detalle.map(d => Number(d.ganancia_vendedores) || 0), color: '#ffc107' }
      ],
      yPrefix: '$',
      fill: false
    });
  }

  function renderEstadosChart() {
    const est = dashData.estadisticas || {};
    const porEstado = est.por_estado || [];
    ChartFactory.removeChartLoading('chartEstados');

    if (porEstado.length === 0) {
      ChartFactory.renderChartEmpty('chartEstados', 'Sin datos de estados');
      return;
    }

    ChartFactory.clearChartEmpty('chartEstados');
    ChartFactory.createPieChart('chartEstados', {
      labels: porEstado.map(e => e.estado || 'Sin estado'),
      data: porEstado.map(e => Number(e.cantidad) || 0),
      type: 'doughnut'
    });
  }

  function renderTopVendedoresChart() {
    const vendedores = normalizeArray(dashData.topVendedores);
    ChartFactory.removeChartLoading('chartTopVendedores');

    if (vendedores.length === 0) {
      ChartFactory.renderChartEmpty('chartTopVendedores', 'Sin datos de vendedores');
      return;
    }

    ChartFactory.clearChartEmpty('chartTopVendedores');
    const top8 = vendedores.slice(0, 8);
    ChartFactory.createBarChart('chartTopVendedores', {
      labels: top8.map(v => truncate(v.nombre_vendedor, 20)),
      datasets: [{
        label: 'Score Ponderado',
        data: top8.map(v => Number(v.score_ponderado) || 0),
        color: '#764ba2'
      }],
      horizontal: true
    });
  }

  function renderTopProductosChart() {
    const productos = normalizeArray(dashData.topProductos);
    ChartFactory.removeChartLoading('chartTopProductos');

    if (productos.length === 0) {
      ChartFactory.renderChartEmpty('chartTopProductos', 'Sin datos de productos');
      return;
    }

    ChartFactory.clearChartEmpty('chartTopProductos');
    const top8 = productos.slice(0, 8);
    ChartFactory.createBarChart('chartTopProductos', {
      labels: top8.map(p => truncate(p.nombre, 20)),
      datasets: [{
        label: 'Unidades Vendidas',
        data: top8.map(p => Number(p.unidades_vendidas) || 0),
        color: '#667eea'
      }],
      horizontal: true
    });
  }

  // ── Tablas con drill-down ───────────────────────────────────────────

  function renderTablaVendedores() {
    const data = normalizeArray(dashData.topVendedores);
    tables.vendedores = DataTable.createDataTable('tablaVendedores', {
      columns: [
        { key: 'rank', label: '#', align: 'center', sortable: false,
          format: (_, row) => {
            const idx = data.indexOf(row) + 1;
            const medal = idx === 1 ? '<i class="fas fa-trophy" style="color:#ffd700"></i>' :
                          idx === 2 ? '<i class="fas fa-medal" style="color:#c0c0c0"></i>' :
                          idx === 3 ? '<i class="fas fa-medal" style="color:#cd7f32"></i>' : idx;
            return `<span class="fw-bold">${medal}</span>`;
          }
        },
        { key: 'nombre_vendedor', label: 'Vendedor', sortable: true },
        { key: 'email_vendedor', label: 'Email', sortable: true,
          format: (v) => `<span style="font-size:0.8rem; color:var(--dash-muted)">${ApiClient.escapeHtml(v)}</span>`
        },
        { key: 'total_vendido', label: 'Ventas', type: 'currency', align: 'right', sortable: true },
        { key: 'ganancia_neta_vendedor', label: 'Ganancia', type: 'currency', align: 'right', sortable: true },
        { key: 'comision_generada', label: 'Comisión', type: 'currency', align: 'right', sortable: true },
        { key: 'total_pedidos', label: 'Pedidos', type: 'number', align: 'right', sortable: true },
        { key: 'score_ponderado', label: 'Score', align: 'right', sortable: true,
          format: (v) => {
            const n = Number(v) || 0;
            const cls = n >= 60 ? 'dash-badge-success' : (n >= 30 ? 'dash-badge-warning' : 'dash-badge-danger');
            return `<span class="dash-badge ${cls}">${n.toFixed(1)}</span>`;
          }
        }
      ],
      data: data,
      searchable: true,
      searchPlaceholder: 'Buscar vendedor...',
      pageSize: 10,
      emptyMessage: 'No hay vendedores con ventas en este periodo',
      emptyIcon: 'fas fa-store',
      rowClick: (row) => showDrillDown(row, 'Vendedor')
    });
  }

  function renderTablaProductos() {
    const data = normalizeArray(dashData.topProductos);
    tables.productos = DataTable.createDataTable('tablaProductos', {
      columns: [
        { key: 'nombre', label: 'Producto', sortable: true },
        { key: 'categoria', label: 'Categoría', sortable: true,
          format: (v) => v ? `<span class="dash-badge dash-badge-info">${ApiClient.escapeHtml(v)}</span>` : '<span class="dash-text-muted">N/A</span>'
        },
        { key: 'vendedor', label: 'Vendedor', sortable: true },
        { key: 'unidades_vendidas', label: 'Vendidas', type: 'number', align: 'right', sortable: true },
        { key: 'pedidos_distintos', label: 'Pedidos', type: 'number', align: 'right', sortable: true },
        { key: 'ingresos_brutos', label: 'Ingresos', type: 'currency', align: 'right', sortable: true },
        { key: 'comision_generada', label: 'Comisión', type: 'currency', align: 'right', sortable: true }
      ],
      data: data,
      searchable: true,
      searchPlaceholder: 'Buscar producto...',
      pageSize: 10,
      emptyMessage: 'No hay productos vendidos en este periodo',
      emptyIcon: 'fas fa-box',
      rowClick: (row) => showDrillDown(row, 'Producto')
    });
  }

  // ── Drill-down modal ────────────────────────────────────────────────

  function showDrillDown(row, type) {
    if (!row) return;
    const name = row.nombre || row.nombre_vendedor || 'Detalle';
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
      `<i class="fas fa-search-plus me-2" style="color:var(--dash-primary)"></i>${ApiClient.escapeHtml(type + ': ' + name)}`;

    const body = document.getElementById('drillDownBody');
    const fields = Object.entries(row).filter(([k]) => k !== 'imagen');
    const labels = {
      id_producto: 'ID', id_vendedor: 'ID Vendedor', nombre: 'Nombre', nombre_vendedor: 'Vendedor',
      email_vendedor: 'Email', unidades_vendidas: 'Unidades Vendidas', ingresos_brutos: 'Ingresos Brutos',
      ganancia_neta: 'Ganancia Neta', ganancia_neta_vendedor: 'Ganancia Neta', ganancia_bruta_vendedor: 'Ganancia Bruta',
      comision_generada: 'Comisión Generada', total_vendido: 'Total Vendido', total_pedidos: 'Total Pedidos',
      score_ponderado: 'Score', pedidos_distintos: 'Pedidos', categoria: 'Categoría', vendedor: 'Vendedor'
    };

    body.innerHTML = `
      <div class="row g-3">
        ${fields.map(([k, v]) => {
          const label = labels[k] || k.replace(/_/g, ' ');
          const isMoney = ['ingresos_brutos','ganancia_neta','ganancia_neta_vendedor','ganancia_bruta_vendedor',
            'comision_generada','total_vendido'].includes(k);
          const isPct = ['score_ponderado'].includes(k);
          const display = isMoney ? ApiClient.formatCurrency(v) : isPct ? Number(v).toFixed(1) : v;
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
    const alerts = AlertsEngine.analyzeAdmin({
      estadisticas: dashData.estadisticas
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

  async function refresh() {
    await loadDashboard();
  }

  global.DashAdmin = { refresh };
  document.addEventListener('DOMContentLoaded', init);

})(window);
