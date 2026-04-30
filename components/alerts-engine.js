// ═══════════════════════════════════════════════════════════════════════
// ALERTS ENGINE — Motor de alertas inteligentes contextuales
// ═══════════════════════════════════════════════════════════════════════
;(function (global) {
  'use strict';

  const ALERT_TYPES = {
    danger:  { icon: 'fas fa-exclamation-circle', bg: '#dc354515', border: '#dc3545', color: '#dc3545' },
    warning: { icon: 'fas fa-exclamation-triangle', bg: '#ffc10715', border: '#ffc107', color: '#e6a100' },
    info:    { icon: 'fas fa-info-circle', bg: '#17a2b815', border: '#17a2b8', color: '#17a2b8' },
    success: { icon: 'fas fa-check-circle', bg: '#28a74515', border: '#28a745', color: '#28a745' }
  };

  /**
   * Analiza datos del vendedor y genera alertas contextuales.
   * @param {object} data
   * @param {object} data.resumen - Respuesta de /vendedor/resumen
   * @param {object} data.inventario - Respuesta de /vendedor/analisis-inventario
   * @param {Array} data.historial - Respuesta de /vendedor/historial-ganancias
   * @returns {Array<{type, title, message, action?}>}
   */
  function analyzeVendedor(data) {
    const alerts = [];

    // 1. Stock muerto
    if (data.inventario && data.inventario.stock_muerto) {
      const muertos = data.inventario.stock_muerto;
      if (muertos.length > 0) {
        const nombres = muertos.slice(0, 3).map(p => p.nombre).join(', ');
        const capitalRetenido = muertos.reduce((s, p) => s + Number(p.capital_retenido || 0), 0);
        alerts.push({
          type: 'warning',
          title: `${muertos.length} producto${muertos.length > 1 ? 's' : ''} sin ventas en el periodo`,
          message: `${nombres}${muertos.length > 3 ? '...' : ''} — Capital retenido: ${ApiClient.formatCurrency(capitalRetenido)}. Considera liquidar o hacer descuento.`
        });
      }
    }

    // 2. Caída de ganancias
    if (data.historial && Array.isArray(data.historial) && data.historial.length >= 2) {
      const last = data.historial[data.historial.length - 1];
      const prev = data.historial[data.historial.length - 2];
      const gananciaLast = Number(last.ganancia_neta) || 0;
      const gananciaPrev = Number(prev.ganancia_neta) || 0;

      if (gananciaPrev > 0) {
        const cambio = ((gananciaLast - gananciaPrev) / gananciaPrev) * 100;
        if (cambio <= -20) {
          alerts.push({
            type: 'danger',
            title: 'Tus ganancias bajaron significativamente',
            message: `Caída del ${Math.abs(cambio).toFixed(1)}% respecto al periodo anterior (${prev.periodo}). Revisa precios y estrategia de ventas.`
          });
        } else if (cambio >= 20) {
          alerts.push({
            type: 'success',
            title: 'Tus ganancias subieron!',
            message: `Crecimiento del ${cambio.toFixed(1)}% respecto al periodo anterior. Sigue así!`
          });
        }
      }
    }

    // 3. Productos sin ventas (advertencia del backend)
    if (data.resumen && data.resumen.advertencia) {
      alerts.push({
        type: 'info',
        title: 'Sin movimientos de venta',
        message: data.resumen.advertencia
      });
    }

    // 4. Ganancia neta negativa
    if (data.resumen) {
      const gn = Number(data.resumen.ganancia_neta) || 0;
      if (gn < 0) {
        alerts.push({
          type: 'danger',
          title: 'Ganancia neta negativa',
          message: `Tu ganancia neta es ${ApiClient.formatCurrency(gn)}. Verifica que los precios de venta cubran costos + comisión.`
        });
      }
    }

    // 5. Conversión de inventario baja
    if (data.inventario && data.inventario.conversion_inventario) {
      const pct = Number(data.inventario.conversion_inventario.pct_conversion_global) || 0;
      if (pct > 0 && pct < 30) {
        alerts.push({
          type: 'warning',
          title: 'Baja conversión de inventario',
          message: `Solo el ${pct.toFixed(1)}% de tu inventario comprado se ha vendido. Revisa tu estrategia de marketing.`
        });
      }
    }

    return alerts;
  }

  /**
   * Analiza datos del admin y genera alertas.
   * @param {object} data
   * @param {object} data.estadisticas - Respuesta de /admin/estadisticas
   * @returns {Array}
   */
  function analyzeAdmin(data) {
    const alerts = [];

    if (data.estadisticas && data.estadisticas.crecimiento) {
      const c = data.estadisticas.crecimiento;

      if (c.variacion_ventas_pct !== null && c.variacion_ventas_pct <= -15) {
        alerts.push({
          type: 'danger',
          title: 'Caída en ventas de la plataforma',
          message: `Las ventas bajaron un ${Math.abs(c.variacion_ventas_pct).toFixed(1)}% respecto al periodo anterior.`
        });
      } else if (c.variacion_ventas_pct !== null && c.variacion_ventas_pct >= 15) {
        alerts.push({
          type: 'success',
          title: 'Crecimiento en ventas',
          message: `Las ventas crecieron un ${c.variacion_ventas_pct.toFixed(1)}% respecto al periodo anterior.`
        });
      }

      if (c.variacion_pedidos_pct !== null && c.variacion_pedidos_pct <= -20) {
        alerts.push({
          type: 'warning',
          title: 'Menos pedidos que el periodo anterior',
          message: `Los pedidos cayeron un ${Math.abs(c.variacion_pedidos_pct).toFixed(1)}%. Verifica si hay problemas con la plataforma o campañas.`
        });
      }
    }

    // Pedidos pendientes acumulados
    if (data.estadisticas && data.estadisticas.por_estado) {
      const pendientes = data.estadisticas.por_estado.find(e =>
        (e.estado || '').toLowerCase().includes('pendiente')
      );
      if (pendientes && Number(pendientes.cantidad) > 10) {
        alerts.push({
          type: 'warning',
          title: `${pendientes.cantidad} pedidos pendientes`,
          message: 'Hay una acumulación de pedidos sin procesar. Revisa con los vendedores.'
        });
      }
    }

    return alerts;
  }

  /**
   * Renderiza las alertas en un contenedor.
   * @param {string} containerId
   * @param {Array} alerts
   */
  function renderAlerts(containerId, alerts) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!alerts || alerts.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    container.innerHTML = alerts.map(alert => {
      const style = ALERT_TYPES[alert.type] || ALERT_TYPES.info;
      return `
        <div class="dash-alert" style="background:${style.bg}; border-left: 4px solid ${style.border};">
          <div class="dash-alert-icon" style="color:${style.color}">
            <i class="${style.icon}"></i>
          </div>
          <div class="dash-alert-body">
            <div class="dash-alert-title" style="color:${style.color}">${ApiClient.escapeHtml(alert.title)}</div>
            <div class="dash-alert-message">${ApiClient.escapeHtml(alert.message)}</div>
          </div>
          <button class="dash-alert-close" onclick="this.closest('.dash-alert').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>`;
    }).join('');
  }

  global.AlertsEngine = { analyzeVendedor, analyzeAdmin, renderAlerts };

})(window);
