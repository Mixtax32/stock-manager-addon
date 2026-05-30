/*
   Main entry — app initialization
   v0.8.7
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

// Map API recipe (backend format) → frontend format used by the UI
window._recipeFromApi = function(r) {
    return {
        id: r.id,
        name: r.name,
        serves: r.servings || 1,
        time: r.time || 15,
        tags: Array.isArray(r.tags) ? r.tags : [],
        ingredients: (r.ingredients || [])
            .filter(ing => ing.product_barcode)
            .map(ing => ({ productId: ing.product_barcode, qty: ing.quantity })),
        output_product_id: r.output_product_id || null,
        output_qty: r.output_qty || 0,
        default_expiry_days: (r.default_expiry_days === 0 || r.default_expiry_days) ? r.default_expiry_days : null,
    };
};

// Map frontend recipe draft → API payload (backend format)
window._recipeToApi = function(d) {
    const ed = (d.default_expiry_days === 0 || d.default_expiry_days) ? Number(d.default_expiry_days) : null;
    return {
        name: d.name.trim(),
        servings: d.serves,
        time: d.time,
        tags: d.tags || [],
        output_product_id: d.output_product_id || null,
        output_qty: d.output_qty || 0,
        default_expiry_days: (ed === null || Number.isNaN(ed)) ? null : ed,
        ingredients: (d.ingredients || []).map(ing => {
            const p = window.findProductById(ing.productId);
            const unit = p ? (p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g')) : 'g';
            return { product_barcode: ing.productId, quantity: ing.qty, unit };
        }),
    };
};

// Load recipes from HA backend into AppState.
// Also runs a one-time migration of any recipes stored in localStorage.
window.reloadRecipes = async function() {
    // One-time migration: move localStorage recipes to HA backend
    const LS_KEY = 'sm_recipes';
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
        try {
            const local = JSON.parse(stored);
            if (Array.isArray(local) && local.length > 0) {
                for (const r of local) {
                    try {
                        await window.apiCall('/recipes', 'POST', window._recipeToApi(r));
                    } catch (e) {
                        console.warn('Could not migrate recipe:', r.name, e.message);
                    }
                }
                window.showToast(`${local.length} receta(s) migradas a HA`, 'success');
            }
        } catch (e) {
            console.warn('Recipe migration error:', e);
        }
        localStorage.removeItem(LS_KEY);
    }

    try {
        const data = await window.apiCall('/recipes', 'GET');
        window.AppState.recipes = Array.isArray(data) ? data.map(window._recipeFromApi) : [];
    } catch (e) {
        console.error('reloadRecipes failed', e);
        window.AppState.recipes = [];
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

    // Fetch products and recipes from HA
    await window.reloadProducts();
    await window.reloadRecipes();
    window.renderPage();
});
