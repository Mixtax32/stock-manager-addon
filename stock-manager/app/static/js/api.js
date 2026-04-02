/* 
   API Wrapper & Data Fetching
   v0.6.0
*/

async function apiCall(endpoint, method = 'GET', body = null, retries = 3) {
    const options = { 
        method, 
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        } 
    };
    if (body) options.body = JSON.stringify(body);
    
    // Cache busting for GET requests to prevent HA Proxy from serving empty/stale data
    const url = `${window.API_BASE}${endpoint}${method === 'GET' ? (endpoint.includes('?') ? '&' : '?') + 't=' + Date.now() : ''}`;
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (retries > 0 && [502, 503, 504].includes(response.status)) {
                console.warn(`Servidor despertando (${response.status}). Reintentando en 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                return apiCall(endpoint, method, body, retries - 1);
            }
            const text = await response.text().catch(() => '');
            let msg;
            try { msg = JSON.parse(text).detail || `Error ${response.status}`; }
            catch { msg = `Error ${response.status}: ${text.substring(0, 200) || response.statusText}`; }
            throw new Error(msg);
        }
        if (method === 'DELETE') return true;
        return await response.json().catch(() => { throw new Error('Respuesta inválida'); });
    } catch (error) {
        if (retries > 0) {
            console.warn(`Error de red o servidor. Reintentando (${retries})...`, error.message);
            await new Promise(r => setTimeout(r, 2000));
            return apiCall(endpoint, method, body, retries - 1);
        }
        console.error(`API Error Fatal [${method} ${url}]:`, error);
        throw error;
    }
}
window.apiCall = apiCall;

async function loadProducts() {
    try {
        window.products = await apiCall('/products');
        await window.updateUI();
        await window.updateCharts();
        await window.updateMacros();
    } catch (error) { console.error('Error loading products:', error); }
}
window.loadProducts = loadProducts;

async function exportInventory() {
    try {
        const response = await fetch(`${window.API_BASE}/export`);
        if (!response.ok) throw new Error('Error al exportar');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        window.showToast('Inventario exportado correctamente', 'success');
    } catch (error) {
        window.showToast('Error exportando: ' + error.message, 'error');
    }
}
window.exportInventory = exportInventory;

async function importInventory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${window.API_BASE}/import`, { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
                window.showToast(`Importación completada: ${result.count} productos`, 'success');
                await loadProducts();
            } else throw new Error(result.detail || 'Error en la importación');
        } catch (error) { window.showToast('Error importando: ' + error.message, 'error'); }
    };
    input.click();
}
window.importInventory = importInventory;
