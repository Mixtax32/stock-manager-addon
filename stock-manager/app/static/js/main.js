/*
   Main entry — app initialization
   v0.7.0
*/

// Wrap HA API call (api.js)'s loadProducts to populate AppState.products
// and trigger a re-render.
window.reloadProducts = async function() {
    try {
        const data = await window.apiCall('/products', 'GET');
        window.AppState.products = Array.isArray(data) ? data : [];
        // Keep legacy global in sync for any old code paths still around
        window.products = window.AppState.products;
        window.renderNav();
        window.renderPage();
        return window.AppState.products;
    } catch (e) {
        console.error('reloadProducts failed', e);
        window.showToast('Error cargando inventario: ' + e.message, 'error');
        return [];
    }
};

// Provide no-op shims for things old api.js refers to during initial load.
window.updateUI = window.updateUI || function() {};
window.updateCharts = window.updateCharts || function() {};
window.updateMacros = window.updateMacros || function() {};

document.addEventListener('DOMContentLoaded', async () => {
    // Initial render with empty data
    window.renderNav();
    window.renderPage();

    // Then fetch products from HA in the background
    await window.reloadProducts();
});
