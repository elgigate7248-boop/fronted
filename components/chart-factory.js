// ═══════════════════════════════════════════════════════════════════════
// CHART FACTORY — Creación de gráficas con tema unificado
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const PALETTE = [
    '#667eea', '#764ba2', '#28a745', '#ffc107', '#dc3545',
    '#17a2b8', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c'
  ];

  const PALETTE_ALPHA = PALETTE.map(c => c + '20');

  const instances = {};

  function destroyChart(canvasId) {
    if (instances[canvasId]) {
      instances[canvasId].destroy();
      delete instances[canvasId];
    }
  }

  function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    destroyChart(canvasId);
    return el;
  }

  const DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: 'inherit', size: 12 }, padding: 16 } },
      tooltip: {
        backgroundColor: 'rgba(30,30,60,0.92)',
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: true
      }
    }
  };

  /**
   * Gráfica de línea — historial de ganancias, tendencias.
   * @param {string} canvasId
   * @param {object} config
   * @param {string[]} config.labels
   * @param {Array<{label, data, color?}>} config.datasets
   * @param {boolean} config.fill
   * @param {string} config.yPrefix - ej: '$'
   */
  function createLineChart(canvasId, config) {
    const ctx = getCtx(canvasId);
    if (!ctx) return null;

    const datasets = config.datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || PALETTE[i % PALETTE.length],
      backgroundColor: ds.color ? ds.color + '20' : PALETTE_ALPHA[i % PALETTE.length],
      borderWidth: 3,
      fill: config.fill !== false,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: ds.color || PALETTE[i % PALETTE.length]
    }));

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: config.labels, datasets },
      options: {
        ...DEFAULTS,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => config.yPrefix ? config.yPrefix + Number(v).toLocaleString() : v.toLocaleString(),
              font: { size: 11 }
            },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });

    instances[canvasId] = chart;
    return chart;
  }

  /**
   * Gráfica de barras — top productos, rankings.
   * @param {string} canvasId
   * @param {object} config
   * @param {string[]} config.labels
   * @param {Array<{label, data, color?}>} config.datasets
   * @param {boolean} config.horizontal
   * @param {string} config.yPrefix
   */
  function createBarChart(canvasId, config) {
    const ctx = getCtx(canvasId);
    if (!ctx) return null;

    const datasets = config.datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.colors || ds.color || PALETTE[i % PALETTE.length],
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.7,
      categoryPercentage: 0.8
    }));

    const yAxis = {
      beginAtZero: true,
      ticks: {
        callback: v => config.yPrefix ? config.yPrefix + Number(v).toLocaleString() : v.toLocaleString(),
        font: { size: 11 }
      },
      grid: { color: 'rgba(0,0,0,0.06)' }
    };

    const xAxis = {
      ticks: { font: { size: 11 } },
      grid: { display: false }
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: config.labels, datasets },
      options: {
        ...DEFAULTS,
        indexAxis: config.horizontal ? 'y' : 'x',
        scales: config.horizontal
          ? { x: yAxis, y: { ...xAxis, ticks: { ...xAxis.ticks, autoSkip: false } } }
          : { y: yAxis, x: xAxis }
      }
    });

    instances[canvasId] = chart;
    return chart;
  }

  /**
   * Gráfica de pie/doughnut — distribución.
   * @param {string} canvasId
   * @param {object} config
   * @param {string[]} config.labels
   * @param {number[]} config.data
   * @param {string} config.type - 'pie' | 'doughnut'
   */
  function createPieChart(canvasId, config) {
    const ctx = getCtx(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx, {
      type: config.type || 'doughnut',
      data: {
        labels: config.labels,
        datasets: [{
          data: config.data,
          backgroundColor: PALETTE.slice(0, config.data.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        ...DEFAULTS,
        cutout: config.type === 'pie' ? 0 : '60%',
        plugins: {
          ...DEFAULTS.plugins,
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
        }
      }
    });

    instances[canvasId] = chart;
    return chart;
  }

  /**
   * Renderiza un contenedor de gráfica vacío con loading state.
   */
  function renderChartLoading(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      const existing = parent.querySelector('.chart-loading-placeholder');
      if (!existing) {
        const placeholder = document.createElement('div');
        placeholder.className = 'chart-loading-placeholder';
        placeholder.innerHTML = '<div class="dash-spinner-sm"></div><span>Cargando datos...</span>';
        parent.style.position = 'relative';
        parent.appendChild(placeholder);
      }
      canvas.style.opacity = '0.3';
    }
  }

  function removeChartLoading(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      const placeholder = parent.querySelector('.chart-loading-placeholder');
      if (placeholder) placeholder.remove();
      canvas.style.opacity = '1';
    }
  }

  /**
   * Muestra estado vacío en el contenedor de una gráfica.
   */
  function renderChartEmpty(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);
    const parent = canvas.parentElement;
    if (parent) {
      canvas.style.display = 'none';
      let empty = parent.querySelector('.chart-empty-state');
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'chart-empty-state';
        parent.appendChild(empty);
      }
      empty.innerHTML = `
        <i class="fas fa-chart-bar"></i>
        <p>${ApiClient.escapeHtml(message || 'No hay datos disponibles')}</p>`;
    }
  }

  function clearChartEmpty(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.style.display = '';
    const parent = canvas.parentElement;
    if (parent) {
      const empty = parent.querySelector('.chart-empty-state');
      if (empty) empty.remove();
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach(destroyChart);
  }

  global.ChartFactory = {
    createLineChart,
    createBarChart,
    createPieChart,
    renderChartLoading,
    removeChartLoading,
    renderChartEmpty,
    clearChartEmpty,
    destroyChart,
    destroyAll,
    PALETTE
  };

})(window);
