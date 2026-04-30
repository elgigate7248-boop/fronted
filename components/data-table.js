// ═══════════════════════════════════════════════════════════════════════
// DATA TABLE — Tabla dinámica con ordenamiento, filtros y búsqueda
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  /**
   * Crea una tabla dinámica dentro de un contenedor.
   * @param {string} containerId - ID del div contenedor
   * @param {object} config
   * @param {Array<{key, label, sortable?, format?, align?}>} config.columns
   * @param {Array<object>} config.data - Filas de datos
   * @param {string} config.searchPlaceholder
   * @param {boolean} config.searchable
   * @param {number} config.pageSize - Filas por página (0 = sin paginación)
   * @param {string} config.emptyMessage
   * @param {string} config.emptyIcon
   * @param {Function} config.rowClick - callback(row)
   */
  function createDataTable(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const state = {
      data: config.data || [],
      filtered: config.data || [],
      sortKey: null,
      sortDir: 'desc',
      searchTerm: '',
      page: 0,
      pageSize: config.pageSize || 0
    };

    function render() {
      const sorted = sortData(state.filtered, state.sortKey, state.sortDir);
      const paged = state.pageSize > 0
        ? sorted.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize)
        : sorted;
      const totalPages = state.pageSize > 0 ? Math.ceil(sorted.length / state.pageSize) : 1;

      let html = '';

      // Barra de búsqueda
      if (config.searchable !== false) {
        html += `
          <div class="dash-table-toolbar">
            <div class="dash-table-search">
              <i class="fas fa-search"></i>
              <input type="text" placeholder="${config.searchPlaceholder || 'Buscar...'}" 
                     value="${ApiClient.escapeHtml(state.searchTerm)}" 
                     data-action="search">
            </div>
            <div class="dash-table-count">
              ${sorted.length} resultado${sorted.length !== 1 ? 's' : ''}
            </div>
          </div>`;
      }

      // Tabla
      html += '<div class="dash-table-wrap"><table class="dash-table"><thead><tr>';

      config.columns.forEach(col => {
        const sortable = col.sortable !== false;
        const isActive = state.sortKey === col.key;
        const dirIcon = isActive
          ? (state.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down')
          : 'fa-sort';
        const sortAttr = sortable ? `data-sort="${col.key}"` : '';
        const sortClass = sortable ? 'dash-th-sortable' : '';
        const activeClass = isActive ? 'dash-th-active' : '';
        const align = col.align === 'right' ? 'text-end' : (col.align === 'center' ? 'text-center' : '');

        html += `<th class="${sortClass} ${activeClass} ${align}" ${sortAttr}>
          ${ApiClient.escapeHtml(col.label)}
          ${sortable ? `<i class="fas ${dirIcon} ms-1"></i>` : ''}
        </th>`;
      });

      html += '</tr></thead><tbody>';

      if (paged.length === 0) {
        html += `<tr><td colspan="${config.columns.length}" class="dash-table-empty">
          <i class="${config.emptyIcon || 'fas fa-inbox'}"></i>
          <p>${config.emptyMessage || 'No hay datos disponibles'}</p>
        </td></tr>`;
      } else {
        paged.forEach((row, idx) => {
          const clickAttr = config.rowClick ? `data-row-idx="${idx}"` : '';
          const clickClass = config.rowClick ? 'dash-tr-clickable' : '';
          html += `<tr class="${clickClass}" ${clickAttr}>`;

          config.columns.forEach(col => {
            const val = row[col.key];
            const align = col.align === 'right' ? 'text-end' : (col.align === 'center' ? 'text-center' : '');
            let display;

            if (col.format) {
              display = col.format(val, row);
            } else if (col.type === 'currency') {
              display = ApiClient.formatCurrency(val);
            } else if (col.type === 'number') {
              display = ApiClient.formatNumber(val);
            } else if (col.type === 'percent') {
              display = ApiClient.formatPercent(val);
            } else {
              display = ApiClient.escapeHtml(val);
            }

            html += `<td class="${align}">${display}</td>`;
          });

          html += '</tr>';
        });
      }

      html += '</tbody></table></div>';

      // Paginación
      if (state.pageSize > 0 && totalPages > 1) {
        html += `<div class="dash-table-pagination">
          <button class="dash-page-btn" data-action="prev" ${state.page === 0 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="dash-page-info">Pág. ${state.page + 1} de ${totalPages}</span>
          <button class="dash-page-btn" data-action="next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>`;
      }

      container.innerHTML = html;
      bindEvents();
    }

    function bindEvents() {
      // Búsqueda
      const searchInput = container.querySelector('[data-action="search"]');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          state.searchTerm = e.target.value;
          state.filtered = filterData(state.data, state.searchTerm, config.columns);
          state.page = 0;
          render();
          // Re-focus y posición del cursor
          const newInput = container.querySelector('[data-action="search"]');
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(state.searchTerm.length, state.searchTerm.length);
          }
        });
      }

      // Ordenamiento
      container.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.sort;
          if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            state.sortDir = 'desc';
          }
          render();
        });
      });

      // Paginación
      const prevBtn = container.querySelector('[data-action="prev"]');
      const nextBtn = container.querySelector('[data-action="next"]');
      if (prevBtn) prevBtn.addEventListener('click', () => { state.page--; render(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { state.page++; render(); });

      // Row click
      if (config.rowClick) {
        container.querySelectorAll('[data-row-idx]').forEach(tr => {
          tr.addEventListener('click', () => {
            const idx = parseInt(tr.dataset.rowIdx);
            const sorted = sortData(state.filtered, state.sortKey, state.sortDir);
            const offset = state.pageSize > 0 ? state.page * state.pageSize : 0;
            config.rowClick(sorted[offset + idx]);
          });
        });
      }
    }

    function filterData(data, term, columns) {
      if (!term.trim()) return data;
      const lower = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return data.filter(row =>
        columns.some(col => {
          const val = String(row[col.key] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return val.includes(lower);
        })
      );
    }

    function sortData(data, key, dir) {
      if (!key) return data;
      return [...data].sort((a, b) => {
        let va = a[key], vb = b[key];
        if (va == null) va = '';
        if (vb == null) vb = '';
        const na = Number(va), nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) {
          return dir === 'asc' ? na - nb : nb - na;
        }
        const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
        return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    // Mostrar loading
    function showLoading() {
      container.innerHTML = `
        <div class="dash-table-loading">
          <div class="dash-spinner-sm"></div>
          <span>Cargando datos...</span>
        </div>`;
    }

    // Actualizar datos
    function updateData(newData) {
      state.data = newData || [];
      state.filtered = filterData(state.data, state.searchTerm, config.columns);
      state.page = 0;
      render();
    }

    // Render inicial
    render();

    return { render, updateData, showLoading };
  }

  global.DataTable = { createDataTable };

})(window);
