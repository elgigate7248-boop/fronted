// ═══════════════════════════════════════════════════════════════════════
// KPI CARD — Componente reutilizable para indicadores clave
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const COLORS = {
    primary:  { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', text: '#667eea', border: '#667eea' },
    success:  { bg: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)', text: '#28a745', border: '#28a745' },
    warning:  { bg: 'linear-gradient(135deg, #ffc107 0%, #fd7e14 100%)', text: '#e6a100', border: '#ffc107' },
    danger:   { bg: 'linear-gradient(135deg, #dc3545 0%, #e74c3c 100%)', text: '#dc3545', border: '#dc3545' },
    info:     { bg: 'linear-gradient(135deg, #17a2b8 0%, #0dcaf0 100%)', text: '#17a2b8', border: '#17a2b8' }
  };

  /**
   * Renderiza una tarjeta KPI.
   * @param {object} config
   * @param {string} config.containerId - ID del div contenedor
   * @param {string} config.label - Título del KPI
   * @param {string|number} config.value - Valor principal
   * @param {string} config.icon - Clase FontAwesome (ej: 'fas fa-dollar-sign')
   * @param {string} config.color - primary|success|warning|danger|info
   * @param {number|null} config.change - Porcentaje de cambio (null = sin cambio)
   * @param {string} config.subtitle - Texto secundario opcional
   * @param {boolean} config.loading - Mostrar skeleton
   */
  function renderKpiCard(config) {
    const container = document.getElementById(config.containerId);
    if (!container) return;

    const color = COLORS[config.color] || COLORS.primary;

    if (config.loading) {
      container.innerHTML = `
        <div class="dash-kpi-card" style="border-left-color: ${color.border}">
          <div class="dash-kpi-skeleton">
            <div class="skeleton-line skeleton-short"></div>
            <div class="skeleton-line skeleton-long"></div>
            <div class="skeleton-line skeleton-short"></div>
          </div>
        </div>`;
      return;
    }

    const changeHtml = buildChangeIndicator(config.change);
    const subtitleHtml = config.subtitle
      ? `<div class="dash-kpi-subtitle">${ApiClient.escapeHtml(config.subtitle)}</div>`
      : '';

    container.innerHTML = `
      <div class="dash-kpi-card" style="border-left-color: ${color.border}">
        <div class="dash-kpi-header">
          <div class="dash-kpi-icon" style="color: ${color.text}">
            <i class="${config.icon || 'fas fa-chart-bar'}"></i>
          </div>
          ${changeHtml}
        </div>
        <div class="dash-kpi-value" style="color: ${color.text}">${config.value}</div>
        <div class="dash-kpi-label">${ApiClient.escapeHtml(config.label)}</div>
        ${subtitleHtml}
      </div>`;

    // Animar el valor con conteo
    animateValue(container.querySelector('.dash-kpi-value'), config.rawValue);
  }

  /**
   * Renderiza una fila de KPI cards.
   * @param {string} containerId - ID del contenedor de la fila
   * @param {Array<object>} cards - Array de configs para renderKpiCard
   */
  function renderKpiRow(containerId, cards) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const colSize = Math.max(3, Math.floor(12 / cards.length));
    container.innerHTML = cards.map((card, i) =>
      `<div class="col-lg-${colSize} col-md-6 col-sm-6 mb-3">
        <div id="kpi-slot-${containerId}-${i}"></div>
      </div>`
    ).join('');

    cards.forEach((card, i) => {
      renderKpiCard({ ...card, containerId: `kpi-slot-${containerId}-${i}` });
    });
  }

  function buildChangeIndicator(change) {
    if (change === null || change === undefined) return '';

    const n = Number(change);
    if (isNaN(n)) return '';

    const isPositive = n > 0;
    const isZero = n === 0;
    const icon = isPositive ? 'fa-arrow-up' : (isZero ? 'fa-minus' : 'fa-arrow-down');
    const cls = isPositive ? 'dash-change-up' : (isZero ? 'dash-change-neutral' : 'dash-change-down');

    return `
      <div class="dash-kpi-change ${cls}">
        <i class="fas ${icon}"></i>
        <span>${Math.abs(n).toFixed(1)}%</span>
      </div>`;
  }

  function animateValue(el, rawValue) {
    if (!el || rawValue === undefined || rawValue === null) return;
    const n = Number(rawValue);
    if (isNaN(n) || n === 0) return;

    const finalText = el.textContent;
    const duration = 800;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = n * eased;

      if (finalText.startsWith('$')) {
        el.textContent = ApiClient.formatCurrency(current);
      } else if (finalText.includes('%')) {
        el.textContent = current.toFixed(1) + '%';
      } else {
        el.textContent = ApiClient.formatNumber(Math.round(current));
      }

      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = finalText;
    }

    requestAnimationFrame(step);
  }

  global.KpiCard = { renderKpiCard, renderKpiRow };

})(window);
