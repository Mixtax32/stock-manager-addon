/* 
   Stock Manager v0.5.20 
   Reverted to Monolith JS for maximum compatibility with HA Ingress 
*/

// ===== Global State & Config =====
const API_BASE = `${window.location.pathname.replace(/\/$/, '')}/api`;
let products = [];
let filteredLocation = null;
let allLocations = [];
let selectedProducts = new Set();
let isSelectionMode = false;
let manageFilter = { name: '', location: '', category: '' };
let consumptionChart = null;
let kcalChart = null;
let fullKcalChart = null;
let html5QrCode;
let currentBarcode = null;
let currentScannedImageUrl = null;
let scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
let currentTicketItems = [];
let dateModalCallback = null;
let pickerState = { 
    inputId: null, 
    year: new Date().getFullYear(), 
    month: new Date().getMonth() + 1, 
    day: new Date().getDate(), 
    scrollOffset: {} 
};

// ===== Initialization =====
const init = async () => {
    console.log("Stock Manager: Initializing Monolith v0.5.20...");
    await loadProducts();
    initializeDatePicker();
    wrapDateInputsWithPicker();
    setupEventListeners();
    initNavigation();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ===== API Functions =====
async function apiCall(endpoint, method = 'GET', body = null) {
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

async function exportInventory() {
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
            const response = await fetch(`${API_BASE}/import`, { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
                showToast(`Importación completada: ${result.count} productos`, 'success');
                await loadProducts();
            } else throw new Error(result.detail || 'Error en la importación');
        } catch (error) { showToast('Error importando: ' + error.message, 'error'); }
    };
    input.click();
}

// ===== Utils =====
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
}

function getExpiryInfo(expiryDate) {
    if (!expiryDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    const daysLeft = Math.ceil((expiry - today) / 86400000);
    if (daysLeft < 0) return { text: 'CADUCADO', cls: 'expiry-expired' };
    if (daysLeft === 0) return { text: 'Caduca HOY', cls: 'expiry-expired' };
    if (daysLeft <= 7) return { text: `Caduca en ${daysLeft}d`, cls: 'expiry-soon' };
    return { text: `Cad: ${expiry.toLocaleDateString('es-ES')}`, cls: 'expiry-ok' };
}

function toggleSection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}

// ===== Inventory Functions =====
async function loadProducts() {
    try {
        products = await apiCall('/products');
        await updateUI();
        await updateCharts();
        await updateMacros();
    } catch (error) { console.error('Error loading products:', error); }
}

async function updateUI() {
    allLocations = await apiCall('/locations').catch(() => []);
    updateLocationFilter();
    updateShoppingList();
    updateProductList();
    updateStockPageSearch();
}

async function updateCharts() {
    try {
        const stats = await apiCall('/stats');
        document.getElementById('stat-total-p').textContent = stats.total_products || 0;
        document.getElementById('stat-total-u').textContent = stats.total_units || 0;
        document.getElementById('stat-low-s').textContent = stats.low_stock_count || 0;
        const data = await apiCall('/stats/consumption?days=30');
        const ctx = document.getElementById('consumptionChart').getContext('2d');
        const labels = data.map(d => {
            const date = new Date(d.day);
            return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });
        const values = data.map(d => d.total);
        if (consumptionChart) consumptionChart.destroy();
        consumptionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Consumo diario',
                    data: values,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#4ade80'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#555', stepSize: 1 }, grid: { color: '#222' } },
                    x: { ticks: { color: '#555', maxRotation: 0 }, grid: { display: false } }
                }
            }
        });
    } catch (e) { console.error('Error updating charts:', e); }
}

async function updateMacros() {
    try {
        const macros = await apiCall('/stats/daily-macros');
        const goals = await apiCall('/stats/macro-goals');
        
        const cKcal = Math.round(macros.total_kcal || 0);
        const gKcal = Math.round(goals.kcal || 2000);
        
        // Update Dashboard
        const dashKcal = document.getElementById('macro-kcal');
        const dashTarget = document.getElementById('target-kcal');
        if (dashKcal) dashKcal.textContent = cKcal;
        if (dashTarget) dashTarget.textContent = `/ ${gKcal} kcal`;
        
        // Update Full Page
        const fullKcal = document.getElementById('full-macro-kcal');
        const fullTarget = document.getElementById('full-target-kcal');
        if (fullKcal) fullKcal.textContent = cKcal;
        if (fullTarget) fullTarget.textContent = `/ ${gKcal} kcal`;

        // Update Charts
        updateDoughnutChart('kcalChart', kcalChart, cKcal, gKcal, c => kcalChart = c);
        updateDoughnutChart('full-kcalChart', fullKcalChart, cKcal, gKcal, c => fullKcalChart = c);

        ["proteins", "carbs", "fat"].forEach(m => {
            const consumed = Math.round(macros[`total_${m}`] || 0);
            const goal = Math.round(goals[m] || 1);
            const pct = Math.min(100, (consumed / goal) * 100);
            
            // Dashboard
            const dp = document.getElementById(`macro-${m}`);
            if (dp) dp.textContent = `${consumed}/${goal}g`;
            const df = document.getElementById(`fill-${m}`);
            if (df) df.style.width = pct + '%';

            // Full Page
            const fp = document.getElementById(`full-macro-${m}`);
            if (fp) fp.textContent = `${consumed}/${goal}g`;
            const ff = document.getElementById(`full-fill-${m}`);
            if (ff) ff.style.width = pct + '%';
        });
    } catch (e) { console.error('Error updating macros:', e); }
}

function updateDoughnutChart(canvasId, chartObj, val, target, setChart) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!chartObj) {
        const newChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [val, Math.max(0, target - val)],
                    backgroundColor: ['#4ade80', '#111'],
                    borderWidth: 0, cutout: '85%', borderRadius: 10
                }]
            },
            options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: false }
        });
        setChart(newChart);
    } else {
        chartObj.data.datasets[0].data = [val, Math.max(0, target - val)];
        chartObj.update();
    }
}

async function updateTodayMovements() {
    try {
        const moves = await apiCall('/stats/today-movements');
        const listIds = ['today-movements-list', 'full-today-movements-list'];
        
        const html = moves.length ? moves.map(m => `
            <div class="history-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #1a1a1a;">
                <div class="hi-info">
                    <div style="font-weight:600; color:#fff; font-size:14px;">${m.name}</div>
                    <div style="font-size:12px; color:#555;">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • ${Math.abs(m.quantity_change)} ud${Math.abs(m.quantity_change)>1?'s':''}</div>
                </div>
                <button class="btn-del" onclick="deleteMovement(${m.id})" style="color:#ef4444; font-size:16px;">✕</button>
            </div>
        `).join('') : '<div style="color:#555;font-size:13px;text-align:center;padding:20px;">No hay consumos hoy</div>';
        
        listIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
    } catch (e) { console.error('Error fetching history:', e); }
}

function updateShoppingList() {
    const lowStock = products.filter(p => p.min_stock !== null && (p.stock || 0) < p.min_stock);
    const shoppingHtml = lowStock.length ? 
        lowStock.map(p => `
            <div class="shopping-item">
                <span class="name">${p.name}</span>
                <span class="qty">${p.min_stock - (p.stock || 0)} uds</span>
            </div>
        `).join('') : 
        '<div class="shopping-empty">Todo en orden</div>';
    
    const miniShop = document.getElementById('shopping-list');
    const fullShop = document.getElementById('shopping-list-full');
    if (miniShop) miniShop.innerHTML = shoppingHtml;
    if (fullShop) fullShop.innerHTML = shoppingHtml;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const expiringSoon = [];
    products.forEach(p => p.batches?.forEach(b => {
        if (b.expiry_date) {
            const exp = new Date(b.expiry_date + 'T00:00:00');
            if (exp >= today && exp <= nextWeek) expiringSoon.push({ name: p.name, expiry_date: b.expiry_date, quantity: b.quantity });
        }
    }));

    let expiringHtml = '<div class="shopping-empty">Nada caduca pronto</div>';
    if (expiringSoon.length) {
        expiringSoon.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
        expiringHtml = expiringSoon.map(item => {
            const exp = getExpiryInfo(item.expiry_date);
            return `
                <div class="shopping-item">
                    <span class="name">${item.name} (${item.quantity} ud)</span>
                    <span class="${exp.cls}">${exp.text}</span>
                </div>
            `;
        }).join('');
    }
    
    const miniExp = document.getElementById('expiring-soon-list');
    const fullExp = document.getElementById('expiring-soon-list-full');
    if (miniExp) miniExp.innerHTML = expiringHtml;
    if (fullExp) fullExp.innerHTML = expiringHtml;
}

function updateProductList() {
    const list = document.getElementById('product-list');
    let filtered = filteredLocation ? products.filter(p => p.location === filteredLocation) : products;
    
    if (!filtered.length) { 
        list.innerHTML = `<div class="empty-state">Sin productos${filteredLocation ? ' en ' + filteredLocation : ''}.</div>`; 
        return; 
    }
    
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    let html = `
        <div class="inventory-grid-header">
            <div class="header-cell">Producto</div>
            <div class="header-cell">Categoría</div>
            <div class="header-cell">Ubicación</div>
            <div class="header-cell">Estado / Caducidad</div>
            <div class="header-cell" style="text-align:center">Stock</div>
            <div class="header-cell" style="text-align:right">Acciones</div>
        </div>
    `;

    html += filtered.map(p => {
        const isLow = p.stock < p.min_stock;
        const isSelected = selectedProducts.has(p.barcode);
        
        // Get primary expiry info
        let expiryHtml = '<span class="text-dim">Sin fecha</span>';
        if (p.batches && p.batches.length > 0) {
            const sortedBatches = [...p.batches].sort((a,b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
            const firstExp = getExpiryInfo(sortedBatches[0].id ? sortedBatches[0].expiry_date : null);
            if (firstExp) {
                expiryHtml = `<span class="expiry-pill ${firstExp.cls}">${firstExp.text}</span>`;
            }
        }

        return `
            <div class="product-grid-row ${isSelected ? 'selected' : ''} ${isLow ? 'row-warning' : ''}" 
                 data-barcode="${p.barcode}" 
                 data-meta="${p.category}${p.location ? ' • ' + p.location : ''}">
                <div class="cell cell-main">
                    ${isSelectionMode ? `<input type="checkbox" class="product-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">` : ''}
                    <div class="product-img-mini">
                        ${p.image_url ? `<img src="${p.image_url}">` : `<span>📦</span>`}
                    </div>
                    <div class="product-name-wrapper">
                        <span class="product-name">${p.name}</span>
                        <span class="product-meta-inline">${p.category}${p.location ? ' • ' + p.location : ''}</span>
                        <span class="product-barcode">${p.barcode}</span>
                    </div>
                </div>
                <div class="cell text-dim">${p.category}</div>
                <div class="cell">${p.location || '—'}</div>
                <div class="cell">${expiryHtml}</div>
                <div class="cell cell-stock">
                    <span class="stock-badge ${isLow ? 'low' : ''}">${p.stock}</span>
                    <span class="min-stock-hint">/ ${p.min_stock}</span>
                </div>
                <div class="cell cell-actions">
                    <button class="btn-action-sm remove" data-barcode="${p.barcode}" title="Quitar 1">-</button>
                    <button class="btn-action-sm consume" data-barcode="${p.barcode}" title="Consumir">🍽️</button>
                    <button class="btn-action-sm add" data-barcode="${p.barcode}" title="Añadir 1">+</button>
                    <div class="action-divider"></div>
                    <button class="btn-action-sm edit manage-product" data-barcode="${p.barcode}" title="Gestionar">⚙</button>
                    <button class="btn-action-sm delete delete-product" data-barcode="${p.barcode}" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    list.innerHTML = html;
}

function updateLocationFilter() {
    const list = document.getElementById('location-filter');
    const stockList = document.getElementById('stock-location-filter');
    if (!allLocations.length) return;
    
    const options = '<option value="">Todas</option>' + 
        allLocations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
    
    if (list) list.innerHTML = options;
    if (stockList) stockList.innerHTML = options;
}

function setLocationFilter(loc) { filteredLocation = loc || null; updateProductList(); }
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    document.getElementById('select-mode-btn').textContent = isSelectionMode ? 'Cancelar' : 'Seleccionar';
    if (!isSelectionMode) clearSelection();
    updateProductList();
}
function toggleSelect(barcode) {
    if (selectedProducts.has(barcode)) selectedProducts.delete(barcode); else selectedProducts.add(barcode);
    updateSelectionBar(); updateProductList();
}
function updateSelectionBar() {
    const bar = document.getElementById('selection-bar');
    const countEl = document.getElementById('selection-count');
    if (selectedProducts.size > 0 && isSelectionMode) {
        bar.classList.remove('hidden');
        countEl.textContent = `${selectedProducts.size} seleccionados`;
    } else bar.classList.add('hidden');
}
function clearSelection() { selectedProducts.clear(); updateSelectionBar(); if (isSelectionMode) updateProductList(); }
async function bulkAction(action) {
    const barcodes = Array.from(selectedProducts);
    if (!barcodes.length) return;
    if (action === 'delete') {
        if (confirm(`¿Eliminar ${barcodes.length} productos?`)) {
            for (const bc of barcodes) try { await apiCall(`/products/${bc}`, 'DELETE'); } catch (e) { }
            await loadProducts(); toggleSelectionMode();
        }
    } else {
        const val = action === 'location' ? prompt('Nueva ubicación:') : prompt('Nueva categoría (Alimentos, Bebidas, Limpieza, Higiene, Otros):');
        if (val) {
            for (const bc of barcodes) try { await apiCall(`/products/${bc}`, 'PATCH', { [action]: val }); } catch (e) { }
            await loadProducts(); toggleSelectionMode();
        }
    }
}

// ===== Management Functions =====
let pendingChanges = {}, pendingBatchChanges = {}, originalData = {}, originalBatchData = {};
function openManagePanel() {
    pendingChanges = {}; pendingBatchChanges = {};
    products.forEach(p => {
        originalData[p.barcode] = { 
            name: p.name, category: p.category, min_stock: p.min_stock, location: p.location || '',
            weight_g: p.weight_g || null, kcal_100g: p.kcal_100g || null, proteins_100g: p.proteins_100g || null,
            carbs_100g: p.carbs_100g || null, fat_100g: p.fat_100g || null
        };
        p.batches?.forEach(b => originalBatchData[b.id] = b.expiry_date || '');
    });
    const locSelect = document.getElementById('manage-filter-location');
    const locs = [...new Set(products.map(p => p.location).filter(l => l))];
    locSelect.innerHTML = '<option value="">Todas</option>' + locs.map(l => `<option value="${l}">${l}</option>`).join('');
    document.getElementById('manage-panel').classList.add('active');
    renderManageList(); updateChangesUI();
}
function updateManageFilter() {
    manageFilter = { 
        name: document.getElementById('manage-filter-name').value.toLowerCase(), 
        location: document.getElementById('manage-filter-location').value, 
        category: document.getElementById('manage-filter-category').value 
    };
    renderManageList();
}
function renderManageList() {
    const list = document.getElementById('manage-list');
    let filtered = products.filter(p => (!manageFilter.name || p.name.toLowerCase().includes(manageFilter.name)) && (!manageFilter.location || p.location === manageFilter.location) && (!manageFilter.category || p.category === manageFilter.category));
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = filtered.map(p => {
        const isDel = pendingChanges[p.barcode]?.type === 'delete';
        return `<div class="edit-card ${isDel ? 'to-delete' : ''}" id="edit-${p.barcode}">
            <div class="edit-card-header"><div><span class="name">${p.name}</span><br><span class="barcode">${p.barcode}</span></div></div>
            <div class="edit-grid">
                <div class="form-group"><label>Nombre</label><input type="text" class="edit-field" data-barcode="${p.barcode}" data-field="name" value="${p.name}" ${isDel ? 'disabled' : ''}></div>
                <div class="form-group"><label>Ubicación</label><input type="text" class="edit-field" data-barcode="${p.barcode}" data-field="location" value="${p.location || ''}" ${isDel ? 'disabled' : ''}></div>
                <div class="form-group"><label>Categoría</label><select class="edit-field" data-barcode="${p.barcode}" data-field="category" ${isDel ? 'disabled' : ''}>
                    <option value="Alimentos" ${p.category === 'Alimentos' ? 'selected' : ''}>Alimentos</option>
                    <option value="Bebidas" ${p.category === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                    <option value="Limpieza" ${p.category === 'Limpieza' ? 'selected' : ''}>Limpieza</option>
                    <option value="Higiene" ${p.category === 'Higiene' ? 'selected' : ''}>Higiene</option>
                    <option value="Otros" ${p.category === 'Otros' ? 'selected' : ''}>Otros</option>
                </select></div>
                <div class="form-group"><label>Stock Mín</label><input type="number" class="edit-field" data-barcode="${p.barcode}" data-field="min_stock" value="${p.min_stock}" ${isDel ? 'disabled' : ''}></div>
                <div class="form-group" style="grid-column: 1 / -1; margin-top: 4px; border-top: 1px dashed #333; padding-top: 6px;">
                    <label style="color:#4ade80; font-size:11px; margin-bottom: 4px; display: block;">Macros / 100g</label>
                    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
                        <input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="weight_g" value="${p.weight_g || ''}" placeholder="Peso(g)">
                        <input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="kcal_100g" value="${p.kcal_100g || ''}" placeholder="Kcal">
                        <input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="proteins_100g" value="${p.proteins_100g || ''}" placeholder="Prot">
                        <input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="carbs_100g" value="${p.carbs_100g || ''}" placeholder="Carbs">
                        <input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="fat_100g" value="${p.fat_100g || ''}" placeholder="Grasa">
                    </div>
                </div>
            </div>
            <div class="edit-batch-list">${p.batches?.map(b => `<div class="edit-batch-row"><span class="batch-qty-label">${b.quantity} ud</span><input type="date" class="edit-batch-field" data-batch-id="${b.id}" data-barcode="${p.barcode}" value="${b.expiry_date || ''}"></div>`).join('')}</div>
            <div class="edit-actions">${isDel ? `<button class="btn-undo-sm undo-delete" data-barcode="${p.barcode}">Deshacer</button>` : `<button class="btn-delete-sm mark-delete" data-barcode="${p.barcode}">Eliminar</button>`}</div>
        </div>`;
    }).join('');
    setTimeout(wrapDateInputsWithPicker, 0);
}
function checkProductChanges(bc, values) {
    const orig = originalData[bc]; if (!orig || pendingChanges[bc]?.type === 'delete') return;
    const same = Object.keys(values).every(k => values[k] === orig[k]);
    if (!same) pendingChanges[bc] = { type: 'edit', name: values.name, data: values }; else delete pendingChanges[bc];
    updateChangesUI();
}
function checkBatchChange(id, bc, val) {
    if (val !== (originalBatchData[id] || '')) pendingBatchChanges[id] = { barcode: bc, newExpiry: val }; else delete pendingBatchChanges[id];
    updateChangesUI();
}
function markForDelete(bc) { pendingChanges[bc] = { type: 'delete', name: originalData[bc].name }; updateChangesUI(); renderManageList(); }
function undoDelete(bc) { delete pendingChanges[bc]; updateChangesUI(); renderManageList(); }
function updateChangesUI() {
    const total = Object.keys(pendingChanges).length + Object.keys(pendingBatchChanges).length;
    const btn = document.getElementById('btn-save-all');
    const container = document.getElementById('changes-container');
    if (btn) btn.disabled = total === 0;
    if (container) {
        if (total === 0) container.classList.add('hidden');
        else { container.classList.remove('hidden'); container.innerHTML = `<div class="changes-summary">${total} cambios pendientes</div>`; }
    }
}
async function saveAllChanges() {
    for (const [bc, c] of Object.entries(pendingChanges)) {
        if (c.type === 'delete') await apiCall(`/products/${bc}`, 'DELETE'); else await apiCall(`/products/${bc}`, 'PATCH', c.data);
    }
    for (const [id, c] of Object.entries(pendingBatchChanges)) await apiCall(`/batches/${id}`, 'PATCH', { expiry_date: c.newExpiry || null });
    pendingChanges = {}; pendingBatchChanges = {}; await loadProducts(); document.getElementById('manage-panel').classList.remove('active');
}

// ===== Scanner & Ticket Functions =====
async function onScanSuccess(decodedText) {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        document.getElementById('start-scan').classList.remove('hidden');
        document.getElementById('start-ticket').classList.remove('hidden');
        document.getElementById('stop-scan').classList.add('hidden');
    }
    currentBarcode = decodedText;
    scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
    const fields = ['new-batch-qty', 'new-batch-expiry', 'product-name', 'product-location', 'min-stock', 'expiry-date', 'quantity'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = (f === 'new-batch-qty' || f === 'quantity') ? 1 : (f === 'min-stock' ? 2 : '');
    });
    document.getElementById('new-batch-qty').value = 0;
    document.getElementById('scanned-code').textContent = 'Código: ' + decodedText;
    document.getElementById('scanned-code').classList.remove('hidden');
    document.getElementById('product-action').classList.remove('hidden');
    const product = products.find(p => p.barcode === currentBarcode);
    currentScannedImageUrl = product ? product.image_url : null;
    if (product) {
        document.getElementById('existing-product-view').classList.remove('hidden');
        document.getElementById('new-product-fields').classList.add('hidden');
        document.getElementById('existing-product-name').textContent = product.name;
        document.getElementById('existing-product-stock').textContent = `(${product.stock} uds)`;
        renderScanImage(product.image_url);
        renderExistingBatches(product);
    } else {
        document.getElementById('existing-product-view').classList.add('hidden');
        document.getElementById('new-product-fields').classList.remove('hidden');
        try {
            const barcodeData = await apiCall(`/barcode/${currentBarcode}`, 'GET');
            if (barcodeData && barcodeData.found) {
                currentScannedImageUrl = barcodeData.image_url;
                renderScanImage(barcodeData.image_url);
                document.getElementById('product-name').value = barcodeData.name || '';
                const apiCategory = barcodeData.category || '';
                const valid = ['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'];
                document.getElementById('product-category').value = valid.includes(apiCategory) ? apiCategory : 'Otros';
                document.getElementById('new-weight').value = barcodeData.weight_g ?? '';
                document.getElementById('new-kcal').value = barcodeData.kcal_100g ?? '';
                document.getElementById('new-proteins').value = barcodeData.proteins_100g ?? '';
                document.getElementById('new-carbs').value = barcodeData.carbs_100g ?? '';
                document.getElementById('new-fat').value = barcodeData.fat_100g ?? '';
            } else renderScanImage(null);
        } catch (e) { console.error(e); renderScanImage(null); }
    }
    wrapDateInputsWithPicker();
}
function renderScanImage(url) {
    const parent = document.getElementById('product-action');
    const oldImg = parent.querySelector('.scan-product-img');
    if (oldImg) oldImg.remove();
    if (url) {
        const img = document.createElement('img'); img.src = url; img.className = 'scan-product-img'; img.style.float = 'left';
        parent.insertBefore(img, parent.firstChild);
    }
}
function renderExistingBatches(product) {
    const container = document.getElementById('existing-batches');
    if (!product.batches || product.batches.length === 0) { container.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0;">Sin stock actualmente</div>'; return; }
    container.innerHTML = product.batches.map(b => {
        const delta = scanSessionChanges.batches[b.id] || 0;
        const finalQty = b.quantity + delta;
        const exp = getExpiryInfo(b.expiry_date);
        return `<div class="existing-batch-row" style="border-bottom: 1px solid #222; padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
            <div class="eb-info">
                <span class="eb-qty" style="color: #fff; font-weight: 600;">${finalQty} ud${finalQty !== 1 ? 's' : ''}${delta !== 0 ? `<small style="color:${delta > 0 ? '#4ade80' : '#ef4444'}; margin-left:4px;">(${delta > 0 ? '+' : ''}${delta})</small>` : ''}</span>
                <span class="eb-expiry">${exp ? `<span class="${exp.cls}">${exp.text}</span>` : '<span style="color:#555">Sin caducidad</span>'}</span>
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="btn-round remove-batch" data-batch-id="${b.id}" onclick="event.stopPropagation(); window.updateBatchDelta(${b.id}, -1)">-</button>
                <button class="btn-round add-batch" data-batch-id="${b.id}" onclick="event.stopPropagation(); window.updateBatchDelta(${b.id}, 1)">+</button>
            </div>
        </div>`;
    }).join('');
}
function resetScanner() {
    currentBarcode = null; scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
    document.getElementById('new-batch-qty').value = 0; document.getElementById('new-batch-expiry').value = '';
    ['scanned-code', 'product-action', 'existing-product-view', 'new-product-fields'].forEach(id => document.getElementById(id).classList.add('hidden'));
}
window.updateBatchDelta = (id, delta) => {
    scanSessionChanges.batches[id] = (scanSessionChanges.batches[id] || 0) + delta;
    renderExistingBatches(products.find(p => p.barcode === currentBarcode));
};
async function processTicketImage(canvas) {
    const progress = document.getElementById('ticket-progress');
    const statusEl = document.getElementById('ticket-status');
    const fillEl = document.getElementById('ticket-fill');
    progress.classList.remove('hidden'); statusEl.textContent = 'Preparando imagen...'; fillEl.style.width = '5%';
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const bw = ((((gray / 255 - 0.5) * 1.8 + 0.5) * 255) > 140) ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);
    statusEl.textContent = 'Leyendo ticket...'; fillEl.style.width = '10%';
    try {
        const result = await Tesseract.recognize(canvas, 'spa', { logger: m => { if (m.status === 'recognizing text') { const pct = Math.round(m.progress * 100); fillEl.style.width = pct + '%'; statusEl.textContent = `Leyendo ticket... ${pct}%`; } } });
        progress.classList.add('hidden');
        currentTicketItems = parseTicketText(result.data.text, products);
        showTicketResults(currentTicketItems, result.data.text);
    } catch (err) { progress.classList.add('hidden'); showToast('Error al leer ticket: ' + err.message, 'error'); }
}
function parseTicketText(text, products) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const items = [];
    for (const line of lines) {
        if (isJunkLine(line)) continue;
        let qty = 1, name = line;
        const qtyMatch = name.match(/^(\d+)\s*[xX×]\s+(.+)/); if (qtyMatch) { qty = parseInt(qtyMatch[1]); name = qtyMatch[2]; }
        name = name.replace(/\d+[,.]\d{2}\s*€?/g, '').replace(/\d+[,.]\d{1,3}\s*(kg|g|l|ml|cl|ud|uds)\b/gi, '').replace(/^\d{3,}\s+/, '').replace(/^[\-\*\.\,\s]+/, '').replace(/[\-\*\.\,\s]+$/, '').trim();
        if (name.length < 2) continue;
        let bestMatch = null, bestScore = 0;
        for (const p of products) { const score = similarityScore(normalizeText(name), normalizeText(p.name)); if (score > bestScore && score >= 0.35) { bestScore = score; bestMatch = p; } }
        const existing = items.find(t => t.match && t.match.barcode === (bestMatch?.barcode));
        if (existing) { existing.qty += qty; } else items.push({ line, name, qty, match: bestMatch, score: bestScore, checked: bestMatch !== null });
    }
    return items;
}

// ===== Date Picker Functions =====
function initializeDatePicker() {
    initializeWheel('day', 1, getDaysInMonth(pickerState.month, pickerState.year));
    initializeWheel('month', 1, 12);
    initializeWheel('year', new Date().getFullYear() - 5, 2099);
}
function getDaysInMonth(m, y) { return new Date(y, m, 0).getDate(); }
function initializeWheel(type, min, max) {
    const container = document.getElementById(`${type}-items`); if (!container) return;
    container.innerHTML = '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>' + Array.from({length: max-min+1}, (_, i) => `<div class="wheel-item" data-value="${min+i}" onclick="window.updateWheelPosition('${type}', ${min+i})">${String(min+i).padStart(2, '0')}</div>`).join('') + '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>';
    setupWheelScroller(type);
}
function setupWheelScroller(type) {
    const scroller = document.getElementById(`${type}-wheel`), items = document.getElementById(`${type}-items`);
    if (!scroller || !items) return;
    let startY = 0, currentOffset = 0;
    scroller.addEventListener('touchstart', e => { startY = e.touches[0].clientY; currentOffset = pickerState.scrollOffset[type] || 0; items.classList.remove('snapping'); });
    scroller.addEventListener('touchmove', e => { e.preventDefault(); updateWheelScroll(type, currentOffset + (e.touches[0].clientY - startY)); });
    scroller.addEventListener('touchend', () => { items.classList.add('snapping'); snapToNearestValue(type); });
    scroller.addEventListener('mousedown', e => {
        startY = e.clientY; currentOffset = pickerState.scrollOffset[type] || 0; items.classList.remove('snapping');
        const move = me => updateWheelScroll(type, currentOffset + (me.clientY - startY));
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); items.classList.add('snapping'); snapToNearestValue(type); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    scroller.addEventListener('wheel', e => { e.preventDefault(); window.updateWheelPosition(type, pickerState[type] - (e.deltaY > 0 ? -1 : 1)); }, { passive: false });
}
function updateWheelScroll(type, offset) {
    const items = document.getElementById(`${type}-items`); if (!items) return;
    pickerState.scrollOffset[type] = offset; items.style.transform = `translateY(${offset}px)`;
}
function snapToNearestValue(type) {
    const items = document.getElementById(`${type}-items`), children = items.querySelectorAll('.wheel-item:not(.spacer)');
    let bestChild = children[0], bestDist = Infinity;
    children.forEach(child => { const dist = Math.abs(pickerState.scrollOffset[type] - (64 - Array.from(items.children).indexOf(child) * 32)); if (dist < bestDist) { bestDist = dist; bestChild = child; } });
    window.updateWheelPosition(type, parseInt(bestChild.dataset.value));
}
window.updateWheelPosition = (type, val) => {
    const items = document.getElementById(`${type}-items`); if (!items) return;
    const children = Array.from(items.children); const idx = children.findIndex(c => c.dataset.value == val); if (idx === -1) return;
    updateWheelScroll(type, 64 - idx * 32); children.forEach((c, i) => c.classList.toggle('active', i === idx));
    pickerState[type] = val;
    if (type !== 'day') {
        const max = getDaysInMonth(pickerState.month, pickerState.year);
        if (document.getElementById('day-items')?.querySelectorAll('.wheel-item:not(.spacer)').length !== max) {
            initializeWheel('day', 1, max); if (pickerState.day > max) pickerState.day = max; window.updateWheelPosition('day', pickerState.day);
        }
    }
    const el = document.getElementById('date-preview'); if (el) el.textContent = `${String(pickerState.day).padStart(2, '0')} / ${String(pickerState.month).padStart(2, '0')} / ${pickerState.year}`;
};
function openDatePicker(id) {
    pickerState.inputId = id; const input = document.getElementById(id); if (input?.value) { const [y, m, d] = input.value.split('-').map(Number); pickerState.year = y; pickerState.month = m; pickerState.day = d; }
    window.updateWheelPosition('day', pickerState.day); window.updateWheelPosition('month', pickerState.month); window.updateWheelPosition('year', pickerState.year);
    document.getElementById('date-picker-modal').classList.add('show');
}
function closeDatePicker() { document.getElementById('date-picker-modal').classList.remove('show'); pickerState.inputId = null; }
function confirmDatePicker() {
    const date = `${pickerState.year}-${String(pickerState.month).padStart(2, '0')}-${String(pickerState.day).padStart(2, '0')}`;
    if (pickerState.inputId === '__modal__') { closeDatePicker(); if (dateModalCallback) dateModalCallback(date); }
    else { const input = document.getElementById(pickerState.inputId); if (input) { input.value = date; input.dispatchEvent(new Event('change', { bubbles: true })); } closeDatePicker(); }
}
function openDateModal(callback) { dateModalCallback = callback; const today = new Date(); pickerState.year = today.getFullYear(); pickerState.month = today.getMonth() + 1; pickerState.day = today.getDate(); pickerState.inputId = '__modal__'; window.updateWheelPosition('day', pickerState.day); window.updateWheelPosition('month', pickerState.month); window.updateWheelPosition('year', pickerState.year); document.getElementById('date-picker-modal').classList.add('show'); }
function wrapDateInputsWithPicker() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (input.parentElement.classList.contains('date-input-wrapper')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'date-input-wrapper';
        const btn = document.createElement('button'); btn.className = 'date-display-btn'; btn.type = 'button'; btn.textContent = input.value || 'Hoy'; btn.onclick = () => openDatePicker(input.id);
        input.style.display = 'none'; if (!input.id) input.id = 'date-' + Math.random().toString(36).substr(2, 9);
        input.addEventListener('change', () => btn.textContent = input.value || 'Hoy');
        input.parentElement.insertBefore(wrapper, input); wrapper.appendChild(btn); wrapper.appendChild(input);
    });
}

// ===== Event Listeners & UI Helpers =====
function setupEventListeners() {
    document.querySelectorAll('.section-header').forEach(header => header.onclick = e => { if (!e.target.closest('.header-main-actions') && !e.target.closest('button')) header.parentElement.classList.toggle('collapsed'); });
    document.getElementById('start-scan').onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); stream.getTracks().forEach(track => track.stop());
            html5QrCode = new Html5Qrcode("scanner-container"); await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess);
            document.getElementById('scanner-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('start-scan').classList.add('hidden'); document.getElementById('start-ticket').classList.add('hidden'); document.getElementById('stop-scan').classList.remove('hidden');
        } catch (err) { showToast('Error cámara: ' + err.message, 'error'); }
    };
    document.getElementById('stop-scan').onclick = async () => { if (html5QrCode) { await html5QrCode.stop(); document.getElementById('start-scan').classList.remove('hidden'); document.getElementById('start-ticket').classList.remove('hidden'); document.getElementById('stop-scan').classList.add('hidden'); } };
    document.getElementById('start-ticket').onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
            const video = document.createElement('video'); video.srcObject = stream; video.setAttribute('playsinline', 'true'); await video.play();
            const container = document.getElementById('scanner-container'); container.innerHTML = ''; video.style.width = '100%'; video.style.borderRadius = '8px'; container.appendChild(video);
            const captureBtn = document.createElement('button'); captureBtn.className = 'btn btn-add'; captureBtn.style.cssText = 'width:100%;margin-top:8px;'; captureBtn.textContent = 'Capturar ticket'; container.appendChild(captureBtn);
            document.getElementById('start-scan').classList.add('hidden'); document.getElementById('start-ticket').classList.add('hidden'); document.getElementById('stop-scan').classList.remove('hidden'); container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            captureBtn.onclick = async () => {
                const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); stream.getTracks().forEach(t => t.stop()); container.innerHTML = ''; document.getElementById('start-scan').classList.remove('hidden'); document.getElementById('start-ticket').classList.remove('hidden'); document.getElementById('stop-scan').classList.add('hidden');
                await processTicketImage(canvas);
            };
        } catch (err) { showToast('Error cámara: ' + err.message, 'error'); }
    };
    document.addEventListener('change', e => {
        if (e.target.id === 'location-select') setLocationFilter(e.target.value);
        if (e.target.id === 'manage-filter-location' || e.target.id === 'manage-filter-category') updateManageFilter();
        if (e.target.classList.contains('edit-field')) {
            const bc = e.target.dataset.barcode, values = {};
            document.querySelectorAll(`.edit-field[data-barcode="${bc}"]`).forEach(el => {
                let v = el.value; if (el.type === 'number') v = v ? (el.step ? parseFloat(v) : parseInt(v)) : (el.dataset.field === 'min_stock' ? 2 : 0); values[el.dataset.field] = v;
            });
            checkProductChanges(bc, values);
        }
        if (e.target.classList.contains('edit-batch-field')) checkBatchChange(e.target.dataset.batchId, e.target.dataset.barcode, e.target.value);
    });
    document.addEventListener('input', e => { if (e.target.id === 'manage-filter-name') updateManageFilter(); });
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.classList.contains('add-stock')) { e.stopPropagation(); quickAdd(t.dataset.barcode); }
        if (t.classList.contains('remove-stock')) { e.stopPropagation(); quickRemove(t.dataset.barcode); }
        if (t.classList.contains('consume-stock')) { e.stopPropagation(); quickConsume(t.dataset.barcode); }
        if (t.classList.contains('delete-product')) { e.stopPropagation(); deleteProduct(t.dataset.barcode); }
        if (t.classList.contains('manage-product')) { e.stopPropagation(); document.getElementById('manage-filter-name').value = t.dataset.barcode; openManagePanel(); updateManageFilter(); }
        if (t.classList.contains('undo-delete')) undoDelete(t.dataset.barcode);
        if (t.classList.contains('mark-delete')) markForDelete(t.dataset.barcode);
        if (t.classList.contains('product-row') && isSelectionMode) toggleSelect(t.dataset.barcode);
        if (t.classList.contains('product-checkbox')) { e.stopPropagation(); toggleSelect(t.closest('.product-row').dataset.barcode); }
        if (t.id === 'btn-save-all') saveAllChanges();
    });
}
window.useManualBarcode = () => {
    const input = document.getElementById('manual-barcode').value.trim(); if (!input) return;
    const byBarcode = products.find(p => p.barcode === input); if (byBarcode) { onScanSuccess(input); return; }
    const matches = products.filter(p => p.name.toLowerCase().includes(input.toLowerCase()));
    if (matches.length === 1) onScanSuccess(matches[0].barcode); else if (matches.length > 1) {
        document.getElementById('search-results').innerHTML = matches.map(p => `<div class="search-result-item" onclick="onScanSuccess('${p.barcode}'); document.getElementById('manual-barcode').value=''; document.getElementById('search-results').classList.add('hidden')"><span class="sr-name">${p.name}</span><span class="sr-meta">${p.stock} uds</span></div>`).join('');
        document.getElementById('search-results').classList.remove('hidden');
    } else onScanSuccess(input);
};
async function quickAdd(barcode) {
    const p = products.find(prod => prod.barcode === barcode);
    if (p && p.batches?.length) { await apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: 1 }); await loadProducts(); }
    else openDateModal(async exp => { await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: 1, expiry_date: exp }); await loadProducts(); });
}
async function quickRemove(barcode) {
    const p = products.find(prod => prod.barcode === barcode);
    if (p && p.stock > 0 && p.batches?.length) { 
        await apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: -1, reason: 'removed' }); 
        await loadProducts(); 
    }
}
async function quickConsume(barcode) {
    const p = products.find(prod => prod.barcode === barcode);
    if (p && p.stock > 0) { 
        await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: -1, reason: 'consumed' }); 
        await loadProducts(); 
    }
}
async function deleteProduct(barcode) { if (confirm('¿Eliminar este producto?')) { await apiCall(`/products/${barcode}`, 'DELETE'); await loadProducts(); } }
window.addStock = async () => {
    const bc = currentBarcode; if (!bc) return;
    const name = document.getElementById('product-name').value.trim(); if (!name) { showToast('Introduce el nombre', 'info'); return; }
    const p = products.find(prod => prod.barcode === bc);
    if (!p) await apiCall('/products', 'POST', { barcode: bc, name, category: document.getElementById('product-category').value, location: document.getElementById('product-location').value.trim() || null, min_stock: parseInt(document.getElementById('min-stock').value) || 2, weight_g: parseFloat(document.getElementById('new-weight').value) || null, kcal_100g: parseFloat(document.getElementById('new-kcal').value) || null, proteins_100g: parseFloat(document.getElementById('new-proteins').value) || null, carbs_100g: parseFloat(document.getElementById('new-carbs').value) || null, fat_100g: parseFloat(document.getElementById('new-fat').value) || null, image_url: currentScannedImageUrl });
    await apiCall(`/products/${bc}/stock`, 'POST', { quantity: parseInt(document.getElementById('quantity').value) || 1, expiry_date: document.getElementById('expiry-date').value || null });
    await loadProducts(); resetScanner();
};
window.addNewBatch = async () => {
    const bc = currentBarcode; if (!bc) return;
    for (const [id, delta] of Object.entries(scanSessionChanges.batches)) if (delta !== 0) await apiCall(`/batches/${id}/stock`, 'POST', { quantity: delta });
    const qty = parseInt(document.getElementById('new-batch-qty').value) || 0;
    if (qty > 0) await apiCall(`/products/${bc}/stock`, 'POST', { quantity: qty, expiry_date: document.getElementById('new-batch-expiry').value || null });
    await loadProducts(); resetScanner();
};
function showTicketResults(items, rawText) {
    const matched = items.filter(t => t.match), unmatched = items.filter(t => !t.match);
    let html = matched.length ? '<div class="ticket-section-title">Coinciden</div>' + matched.map((it, i) => `<div class="ticket-item"><input type="checkbox" onchange="window.updateTicketCheck(${items.indexOf(it)}, this.checked)" ${it.checked ? 'checked' : ''}><div class="ti-info"><div class="ti-match">${it.match.name}</div><div class="ti-line">${it.name}</div></div><div class="ti-qty"><input type="number" value="${it.qty}" onchange="window.updateTicketQty(${items.indexOf(it)}, this.value)"></div></div>`).join('') : '';
    html += unmatched.length ? '<div class="ticket-section-title">Nuevos</div>' + unmatched.map((it, i) => `<div class="ticket-item"><input type="checkbox" onchange="window.updateTicketCheck(${items.indexOf(it)}, this.checked)" ${it.checked ? 'checked' : ''}><div class="ti-info"><div class="ti-match">${it.name}</div><select onchange="window.assignTicketMatch(${items.indexOf(it)}, this.value)"><option value="">¿Asignar?</option>${products.map(p=>`<option value="${p.barcode}">${p.name}</option>`).join('')}</select></div><div class="ti-qty"><input type="number" value="${it.qty}" onchange="window.updateTicketQty(${items.indexOf(it)}, this.value)"></div></div>`).join('') : '';
    document.getElementById('ticket-matched').innerHTML = html; document.getElementById('ticket-panel').classList.add('active');
}
window.updateTicketCheck = (i, c) => currentTicketItems[i].checked = c;
window.updateTicketQty = (i, q) => currentTicketItems[i].qty = parseInt(q);
window.assignTicketMatch = (i, bc) => { currentTicketItems[i].match = products.find(p=>p.barcode===bc); currentTicketItems[i].checked = !!currentTicketItems[i].match; document.getElementById('ticket-panel').querySelectorAll('input[type="checkbox"]')[i].checked = currentTicketItems[i].checked; };
window.confirmTicketItems = async () => { for (const it of currentTicketItems.filter(t=>t.checked && t.match)) await apiCall((it.match.batches?.length ? `/batches/${it.match.batches[0].id}` : `/products/${it.match.barcode}`) + '/stock', 'POST', { quantity: it.qty }); await loadProducts(); window.closeTicketPanel(); showToast('Añadidos', 'success'); };
window.closeTicketPanel = () => document.getElementById('ticket-panel').classList.remove('active');
window.exportInventory = exportInventory;
window.importInventory = importInventory;
window.toggleSelectionMode = toggleSelectionMode;
window.clearSelection = clearSelection;
window.bulkAction = bulkAction;
window.openManagePanel = openManagePanel;
window.saveAllChanges = saveAllChanges;
window.resetScanner = resetScanner;
window.closeDatePicker = closeDatePicker;
window.confirmDatePicker = confirmDatePicker;
window.tryClosePanel = () => { if (!Object.keys(pendingChanges).length && !Object.keys(pendingBatchChanges).length || confirm('¿Salir?')) document.getElementById('manage-panel').classList.remove('active'); };
window.toggleSection = toggleSection;
window.openMacroGoalsPanel = async () => {
    try {
        const goals = await apiCall('/stats/macro-goals');
        document.getElementById('goal-kcal').value = goals.kcal;
        document.getElementById('goal-proteins').value = goals.proteins;
        document.getElementById('goal-carbs').value = goals.carbs;
        document.getElementById('goal-fat').value = goals.fat;
        document.getElementById('macro-goals-panel').classList.add('active');
        updateTodayMovements();
    } catch (e) { showToast('Error al cargar objetivos', 'error'); }
};
window.closeMacroGoalsPanel = () => {
    document.getElementById('macro-goals-panel').classList.remove('active');
};
window.deleteMovement = async (id) => {
    if (!confirm('¿Eliminar este registro de consumo del historial?')) return;
    const restore = confirm('¿Deseas devolver la unidad al Inventario (Stock)?\n\n[Aceptar] - Sí, devolver al stock\n[Cancelar] - No, dejar el stock como está');
    try {
        await apiCall(`/movements/${id}?restore_stock=${restore}`, 'DELETE');
        showToast('Registro eliminado', 'success');
        updateTodayMovements();
        updateMacros();
        loadProducts(); // Update stock in list
    } catch (e) { showToast('Error al eliminar: ' + e.message, 'error'); }
};
window.saveMacroGoals = async () => {
    const kcal = parseFloat(document.getElementById('goal-kcal').value);
    const proteins = parseFloat(document.getElementById('goal-proteins').value);
    const carbs = parseFloat(document.getElementById('goal-carbs').value);
    const fat = parseFloat(document.getElementById('goal-fat').value);
    
    try {
        await apiCall('/stats/macro-goals', 'PATCH', { kcal, proteins, carbs, fat });
        showToast('Objetivos guardados', 'success');
        updateMacros();
        closeMacroGoalsPanel();
    } catch (e) { showToast('Error al guardar: ' + e.message, 'error'); }
};

// Junk Line Detection Logic
function isJunkLine(line) {
    const trimmed = line.trim(); const norm = normalizeText(line); if (norm.length < 3) return true;
    if (/^\d+$/.test(norm) || /^[\d\s\-\/\.\,\*\#\:\;\(\)\[\]]+$/.test(trimmed) || /\d{7,}/.test(trimmed)) return true;
    const letterCount = (trimmed.match(/[a-zA-Záéíóúñ]/g) || []).length; if (letterCount < 2) return true;
    const junk = [/total/i, /iva/i, /base\s*imp/i, /efectivo/i, /tarjeta/i, /nif/i, /cif/i, /ticket/i, /fecha/i, /tel/i, /super/i, /mercadona/i, /carrefour/i];
    return junk.some(p => p.test(trimmed));
}
function similarityScore(a, b) {
    if (!a || !b) return 0; if (a.includes(b) || b.includes(a)) return 0.95;
    const d = (s1, s2) => {
        const m = s1.length, n = s2.length; let dp = Array.from({length:m+1}, () => new Uint32Array(n+1));
        for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j;
        for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(s1[i-1]===s2[j-1]?0:1));
        return dp[m][n];
    };
    const lev = 1 - d(a,b)/Math.max(a.length,b.length);
    const wA = a.split(/\s+/).filter(w=>w.length>=3), wB = b.split(/\s+/).filter(w=>w.length>=3);
    let matches = 0; if(wA.length && wB.length) for(const wa of wA) if(wB.some(wb=>wb.includes(wa)||wa.includes(wb))) matches++;
    return (lev*0.7) + ((matches/Math.max(wA.length,wB.length||1))*0.3);
}

// ===== Redesign Additions =====
window.showPage = (targetPage) => {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    pages.forEach(p => {
        if (p.getAttribute('data-page') === targetPage) {
            p.classList.remove('hidden');
            const navItem = Array.from(navItems).find(i => i.getAttribute('data-page') === targetPage);
            
            navItems.forEach(i => i.classList.remove('active'));
            if (navItem) {
                navItem.classList.add('active');
                if (pageTitle) pageTitle.textContent = navItem.querySelector('span')?.textContent || targetPage;
            } else {
                if (pageTitle) pageTitle.textContent = targetPage.charAt(0).toUpperCase() + targetPage.slice(1);
            }
            
            if (targetPage === 'scan') window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            p.classList.add('hidden');
        }
    });
};

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            showPage(item.getAttribute('data-page'));
        });
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.onclick = () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        };
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
        }
    }

    // Default page
    showPage('dashboard');
}

function updateStockPageSearch() {
    const query = normalizeText(document.getElementById('stock-search')?.value || '');
    const location = document.getElementById('stock-location-filter')?.value || '';
    const rows = document.querySelectorAll('#product-list .product-grid-row');
    
    rows.forEach(row => {
        const name = normalizeText(row.querySelector('.product-name')?.textContent || '');
        const meta = normalizeText(row.querySelector('.product-meta-inline')?.textContent || '');
        const barcode = row.dataset.barcode || '';
        
        const matchesQuery = !query || name.includes(query) || barcode.includes(query) || meta.includes(query);
        const matchesLocation = !location || meta.includes(normalizeText(location));
        
        row.style.display = (matchesQuery && matchesLocation) ? '' : 'none';
    });
}

window.onload = () => {
    // If init hasn't run yet, it will be called by DOMContentLoaded.
    // But initNavigation can be called safely here too.
    if (typeof initNavigation === 'function') initNavigation();
};

// ===== Macro Fill Logic =====
let currentMacroFillResults = [];

window.startMacroFillPreview = async () => {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (!overlay) return;
    
    overlay.classList.remove('hidden');
    loadingText.textContent = "Buscando macros en Open Food Facts...";

    try {
        const results = await apiCall('/products/macro-fill-preview');
        overlay.classList.add('hidden');
        
        if (!results || results.length === 0) {
            showToast("No se han encontrado productos para actualizar o no hay coincidencias en la API", "info");
            return;
        }

        currentMacroFillResults = results;
        const container = document.getElementById('macro-fill-results');
        container.innerHTML = results.map((res, i) => `
            <div class="macro-fill-item">
                <input type="checkbox" checked id="macro-check-${i}" style="width:20px; height:20px; accent-color: var(--accent);">
                <div class="product-img-mini" style="width:40px; height:40px;">
                    <img src="${res.suggested.image_url || ''}" onerror="this.src='https://placehold.co/40x40/111/444?text=?'">
                </div>
                <div class="mfi-info">
                    <span class="mfi-name">${res.name}</span>
                    <span class="mfi-barcode">${res.barcode}</span>
                    <div class="mfi-suggested">
                        <span>🔥 ${res.suggested.kcal_100g} kcal</span>
                        <span>🥩 P: ${res.suggested.proteins_100g}g</span>
                        <span>🍞 C: ${res.suggested.carbs_100g}g</span>
                        <span>🥑 G: ${res.suggested.fat_100g}g</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        document.getElementById('macro-fill-preview-area').classList.remove('hidden');
        document.getElementById('btn-macro-auto').disabled = true;
    } catch (e) {
        if (overlay) overlay.classList.add('hidden');
        showToast("Error al buscar macros: " + e.message, "error");
    }
};

window.hideMacroFillArea = () => {
    document.getElementById('macro-fill-preview-area').classList.add('hidden');
    document.getElementById('btn-macro-auto').disabled = false;
};

window.confirmMacroFill = async () => {
    const confirmed = [];
    currentMacroFillResults.forEach((res, i) => {
        const check = document.getElementById(`macro-check-${i}`);
        if (check && check.checked) {
            confirmed.push({
                barcode: res.barcode,
                ...res.suggested
            });
        }
    });

    if (confirmed.length === 0) {
        showToast("Selecciona al menos un producto", "info");
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    overlay.classList.remove('hidden');
    loadingText.textContent = "Actualizando base de datos...";

    try {
        const resp = await apiCall('/products/macro-fill-confirm', 'POST', confirmed);
        overlay.classList.add('hidden');
        showToast(resp.message, "success");
        window.hideMacroFillArea();
        await loadProducts(); 
    } catch (e) {
        overlay.classList.add('hidden');
        showToast("Error al guardar: " + e.message, "error");
    }
};

