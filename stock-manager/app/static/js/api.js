import { showToast } from './utils.js';

const API_BASE = `${window.location.pathname.replace(/\/$/, '')}/api`;

export async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const url = `${API_BASE}${endpoint}`;
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            let msg;
            try { msg = JSON.parse(text).detail || `Error ${response.status}`; }
            catch { msg = `Error ${response.status}: ${text.substring(0, 200) || response.statusText}`; }
            throw new Error(msg);
        }
        if (method === 'DELETE') return true;
        return await response.json().catch(() => { throw new Error('Respuesta inválida'); });
    } catch (error) {
        console.error(`API Error [${method} ${url}]:`, error);
        showToast(error.message, 'error');
        throw error;
    }
}

export async function exportInventory() {
    try {
        const response = await fetch(`${API_BASE}/export`);
        if (!response.ok) throw new Error('Error al exportar');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('Inventario exportado correctamente', 'success');
    } catch (error) {
        showToast('Error exportando: ' + error.message, 'error');
    }
}

export async function importInventory(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE}/import`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                showToast(`Importación completada: ${result.count} productos`, 'success');
                if (callback) callback();
            } else {
                throw new Error(result.detail || 'Error en la importación');
            }
        } catch (error) {
            showToast('Error importando: ' + error.message, 'error');
        }
    };
    input.click();
}
