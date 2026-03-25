import { apiCall } from './api.js';
import { showToast, getExpiryInfo, wrapDateInputsWithPicker } from './utils.js';

let products = [];
let filteredLocation = null;
let allLocations = [];
let selectedProducts = new Set();
let isSelectionMode = false;
let manageFilter = { name: '', location: '', category: '' };
let consumptionChart = null;

export async function loadProducts() {
    try {
        products = await apiCall('/products');
        await updateUI();
        await updateCharts();
        await updateMacros();
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

export async function updateUI() {
    allLocations = await apiCall('/locations').catch(() => []);
    updateLocationFilter();
    updateShoppingList();
    updateProductList();
}

export async function updateCharts() {
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

export async function updateMacros() {
    try {
        const macros = await apiCall('/stats/daily-macros');
        ["kcal", "proteins", "carbs", "fat"].forEach(m => {
            const val = macros[`total_${m}`] || 0;
            document.getElementById(`macro-${m}`).textContent = Math.round(val) + (m === "kcal" ? "" : "g");
        });
    } catch (e) { console.error('Error updating macros:', e); }
}

function updateShoppingList() {
    const lowStock = products.filter(p => p.min_stock !== null && p.stock < p.min_stock);
    document.getElementById('shopping-list').innerHTML = lowStock.length ? 
        lowStock.map(p => `<div class="shopping-item"><span class="name">${p.name}</span><span class="qty">${p.min_stock - p.stock} uds</span></div>`).join('') : 
        '<div class="shopping-empty">Todo en orden</div>';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const expiringSoon = [];
    products.forEach(p => p.batches?.forEach(b => {
        if (b.expiry_date) {
            const exp = new Date(b.expiry_date + 'T00:00:00');
            if (exp >= today && exp <= nextWeek) expiringSoon.push({ name: p.name, expiry_date: b.expiry_date, quantity: b.quantity });
        }
    }));
    const expiringListEl = document.getElementById('expiring-soon-list');
    if (!expiringSoon.length) { expiringListEl.innerHTML = '<div class="shopping-empty">Nada caduca pronto</div>'; }
    else {
        expiringSoon.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
        expiringListEl.innerHTML = expiringSoon.map(item => {
            const exp = getExpiryInfo(item.expiry_date);
            return `<div class="shopping-item"><span class="name">${item.name} (${item.quantity} ud)</span><span class="${exp.cls}">${exp.text}</span></div>`;
        }).join('');
    }
}

export function updateProductList() {
    const list = document.getElementById('product-list');
    let filtered = filteredLocation ? products.filter(p => p.location === filteredLocation) : products;
    if (!filtered.length) { 
        list.innerHTML = `<div class="empty-state">Sin productos${filteredLocation ? ' en ' + filteredLocation : ''}.</div>`; 
        return; 
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = filtered.map(p => {
        const isLow = p.stock < p.min_stock;
        const isSelected = selectedProducts.has(p.barcode);
        let batches = p.batches?.map(b => {
            const exp = getExpiryInfo(b.expiry_date);
            return `<div class="batch-row"><span class="batch-qty">${b.quantity} ud</span>${exp ? `<span class="${exp.cls}">${exp.text}</span>` : '<span class="expiry-ok">Sin caducidad</span>'}</div>`;
        }).join('') || '';
        return `<div class="product-row ${isSelected ? 'selected' : ''}" data-barcode="${p.barcode}">
            <div class="product-top">
                ${isSelectionMode ? `<div class="product-checkbox-wrapper"><input type="checkbox" class="product-checkbox" ${isSelected ? 'checked' : ''}></div>` : ''}
                <div class="product-main">
                    ${p.image_url ? `<img src="${p.image_url}" class="product-img">` : `<div class="product-img-placeholder">📦</div>`}
                    <div class="product-info-wrapper"><div class="name">${p.name}</div><div class="meta">${p.category}${p.location ? ' • ' + p.location : ''}</div></div>
                </div>
                <div class="product-stock">
                    <button class="btn-round remove-stock" data-barcode="${p.barcode}">-</button>
                    <button class="btn-round lost-stock" data-barcode="${p.barcode}">?</button>
                    <span class="stock-num ${isLow ? 'low' : ''}">${p.stock}</span>
                    <button class="btn-round add-stock" data-barcode="${p.barcode}">+</button>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <button class="btn-del delete-product" data-barcode="${p.barcode}">&#x2715;</button>
                        <button class="btn-del manage-product" data-barcode="${p.name}">⚙</button>
                    </div>
                </div>
            </div>
            ${batches ? `<div class="batch-list">${batches}</div>` : ''}
        </div>`;
    }).join('');
}

function updateLocationFilter() {
    const container = document.getElementById('location-filter');
    if (!allLocations.length) { container.innerHTML = ''; return; }
    let html = `<div class="location-filter-container"><span class="location-filter-label">Filtrar por ubicación:</span><select class="location-filter-select" id="location-select"><option value="">Todas</option>`;
    allLocations.forEach(loc => { html += `<option value="${loc}" ${filteredLocation === loc ? 'selected' : ''}>${loc}</option>`; });
    container.innerHTML = html + `</select></div>`;
}

export function setLocationFilter(loc) { filteredLocation = loc || null; updateProductList(); }

export function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    document.getElementById('select-mode-btn').textContent = isSelectionMode ? 'Cancelar' : 'Seleccionar';
    if (!isSelectionMode) clearSelection();
    updateProductList();
}

export function toggleSelect(barcode) {
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

export function clearSelection() { selectedProducts.clear(); updateSelectionBar(); if (isSelectionMode) updateProductList(); }

export async function bulkAction(action) {
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

export function updateManageFilter(data) {
    manageFilter = { ...manageFilter, ...data };
    renderManageList();
}

let pendingChanges = {}, pendingBatchChanges = {}, originalData = {}, originalBatchData = {};

export function renderManageList() {
    const list = document.getElementById('manage-list');
    let filtered = products.filter(p => 
        (!manageFilter.name || p.name.toLowerCase().includes(manageFilter.name)) && 
        (!manageFilter.location || p.location === manageFilter.location) && 
        (!manageFilter.category || p.category === manageFilter.category)
    );
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
                    <label style="color:#4ade80; font-size:11px; margin-bottom: 4px; display: block;">Macros / 100g (Opcional)</label>
                    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
                        <div><input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="weight_g" value="${p.weight_g || ''}" placeholder="Peso(g)" ${isDel ? 'disabled' : ''}></div>
                        <div><input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="kcal_100g" value="${p.kcal_100g || ''}" placeholder="Kcal" ${isDel ? 'disabled' : ''}></div>
                        <div><input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="proteins_100g" value="${p.proteins_100g || ''}" placeholder="Prot" ${isDel ? 'disabled' : ''}></div>
                        <div><input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="carbs_100g" value="${p.carbs_100g || ''}" placeholder="Carbs" ${isDel ? 'disabled' : ''}></div>
                        <div><input type="number" step="0.1" class="edit-field" data-barcode="${p.barcode}" data-field="fat_100g" value="${p.fat_100g || ''}" placeholder="Grasa" ${isDel ? 'disabled' : ''}></div>
                    </div>
                </div>
            </div>
            <div class="edit-batch-list">
                ${p.batches?.map(b => `<div class="edit-batch-row"><span class="batch-qty-label">${b.quantity} ud</span><input type="date" class="edit-batch-field" data-batch-id="${b.id}" data-barcode="${p.barcode}" value="${b.expiry_date || ''}" ${isDel ? 'disabled' : ''}></div>`).join('')}
            </div>
            <div class="edit-actions">${isDel ? `<button class="btn-undo-sm undo-delete" data-barcode="${p.barcode}">Deshacer</button>` : `<button class="btn-delete-sm mark-delete" data-barcode="${p.barcode}">Eliminar</button>`}</div>
        </div>`;
    }).join('');
    setTimeout(wrapDateInputsWithPicker, 0);
}

export function openManagePanel() {
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

export function checkProductChanges(bc, values) {
    const orig = originalData[bc]; if (!orig || pendingChanges[bc]?.type === 'delete') return;
    const same = Object.keys(values).every(k => values[k] === orig[k]);
    if (!same) pendingChanges[bc] = { type: 'edit', name: values.name, data: values };
    else delete pendingChanges[bc];
    updateChangesUI();
}

export function checkBatchChange(id, bc, val) {
    const orig = originalBatchData[id] || '';
    if (val !== orig) pendingBatchChanges[id] = { barcode: bc, newExpiry: val };
    else delete pendingBatchChanges[id];
    updateChangesUI();
}

export function markForDelete(bc) { pendingChanges[bc] = { type: 'delete', name: originalData[bc].name }; updateChangesUI(); renderManageList(); }
export function undoDelete(bc) { delete pendingChanges[bc]; updateChangesUI(); renderManageList(); }

function updateChangesUI() {
    const total = Object.keys(pendingChanges).length + Object.keys(pendingBatchChanges).length;
    const btn = document.getElementById('btn-save-all');
    const container = document.getElementById('changes-container');
    if (btn) btn.disabled = total === 0;
    if (container) {
        if (total === 0) container.classList.add('hidden');
        else {
            container.classList.remove('hidden');
            container.innerHTML = `<div class="changes-summary">${total} cambios pendientes</div>`;
        }
    }
}

export async function saveAllChanges() {
    for (const [bc, c] of Object.entries(pendingChanges)) {
        if (c.type === 'delete') await apiCall(`/products/${bc}`, 'DELETE');
        else await apiCall(`/products/${bc}`, 'PATCH', c.data);
    }
    for (const [id, c] of Object.entries(pendingBatchChanges)) await apiCall(`/batches/${id}`, 'PATCH', { expiry_date: c.newExpiry || null });
    pendingChanges = {}; pendingBatchChanges = {}; await loadProducts(); 
    document.getElementById('manage-panel').classList.remove('active');
}

export function getProducts() { return products; }
export function isPendingChanges() { return Object.keys(pendingChanges).length + Object.keys(pendingBatchChanges).length > 0; }
