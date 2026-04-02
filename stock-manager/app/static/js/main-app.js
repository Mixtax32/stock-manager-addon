/* 
   Main App Entry Point & Event Scoping
   v0.6.0
*/

// Initialization Wheel Picker Logic
let dateModalCallback = null;
let pickerState = { 
    inputId: null, 
    year: new Date().getFullYear(), 
    month: new Date().getMonth() + 1, 
    day: new Date().getDate(), 
    scrollOffset: {} 
};

window.initializeDatePicker = () => {
    initializeWheel('day', 1, getDaysInMonth(pickerState.month, pickerState.year));
    initializeWheel('month', 1, 12);
    initializeWheel('year', new Date().getFullYear() - 5, 2099);
};

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

window.openDatePicker = (id) => {
    pickerState.inputId = id; const input = document.getElementById(id); if (input?.value) { const [y, m, d] = input.value.split('-').map(Number); pickerState.year = y; pickerState.month = m; pickerState.day = d; }
    window.updateWheelPosition('day', pickerState.day); window.updateWheelPosition('month', pickerState.month); window.updateWheelPosition('year', pickerState.year);
    document.getElementById('date-picker-modal').classList.add('show');
};

window.closeDatePicker = () => { document.getElementById('date-picker-modal').classList.remove('show'); pickerState.inputId = null; };

window.confirmDatePicker = () => {
    const date = `${pickerState.year}-${String(pickerState.month).padStart(2, '0')}-${String(pickerState.day).padStart(2, '0')}`;
    if (pickerState.inputId === '__modal__') { window.closeDatePicker(); if (dateModalCallback) dateModalCallback(date); }
    else { const input = document.getElementById(pickerState.inputId); if (input) { input.value = date; input.dispatchEvent(new Event('change', { bubbles: true })); } window.closeDatePicker(); }
};

window.openDateModal = (callback) => { dateModalCallback = callback; const today = new Date(); pickerState.year = today.getFullYear(); pickerState.month = today.getMonth() + 1; pickerState.day = today.getDate(); pickerState.inputId = '__modal__'; window.updateWheelPosition('day', pickerState.day); window.updateWheelPosition('month', pickerState.month); window.updateWheelPosition('year', pickerState.year); document.getElementById('date-picker-modal').classList.add('show'); };

window.wrapDateInputsWithPicker = () => {
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (input.parentElement.classList.contains('date-input-wrapper')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'date-input-wrapper';
        const btn = document.createElement('button'); btn.className = 'date-display-btn'; btn.type = 'button'; btn.textContent = input.value || 'Hoy'; btn.onclick = () => window.openDatePicker(input.id);
        input.style.display = 'none'; if (!input.id) input.id = 'date-' + Math.random().toString(36).substr(2, 9);
        input.addEventListener('change', () => btn.textContent = input.value || 'Hoy');
        input.parentElement.insertBefore(wrapper, input); wrapper.appendChild(btn); wrapper.appendChild(input);
    });
};

function setupEventListeners() {
    document.addEventListener('change', e => {
        if (e.target.id === 'location-select') window.setLocationFilter(e.target.value);
        if (e.target.id === 'manage-filter-location' || e.target.id === 'manage-filter-category') window.updateManageFilter();
        if (e.target.classList.contains('edit-field')) {
            const bc = e.target.dataset.barcode, values = {};
            document.querySelectorAll(`.edit-field[data-barcode="${bc}"]`).forEach(el => {
                let v = el.value; if (el.type === 'number') v = v ? (el.step ? parseFloat(v) : parseInt(v)) : (el.dataset.field === 'min_stock' ? 2 : 0); values[el.dataset.field] = v;
            });
            window.checkProductChanges(bc, values);
        }
        if (e.target.classList.contains('edit-batch-field')) window.checkBatchChange(e.target.dataset.batchId, e.target.dataset.barcode, e.target.value);
    });
    document.addEventListener('input', e => { if (e.target.id === 'manage-filter-name') window.updateManageFilter(); });
    document.addEventListener('click', e => {
        const t = e.target.closest('.product-grid-row') || e.target;
        if (t.classList.contains('product-grid-row') && window.isSelectionMode) window.toggleSelect(t.dataset.barcode);
        if (t.classList.contains('product-checkbox')) { e.stopPropagation(); window.toggleSelect(t.closest('.product-grid-row').dataset.barcode); }
        if (e.target.id === 'btn-save-all') window.saveAllChanges();
    });
    const catSelect = document.getElementById('product-category');
    if (catSelect) {
        catSelect.onchange = () => {
            const unitEl = document.getElementById('product-unit');
            if (unitEl) {
                if (catSelect.value === 'Alimentos') unitEl.value = 'g';
                else if (catSelect.value === 'Bebidas') unitEl.value = 'ml';
                else unitEl.value = 'uds';
            }
        };
    }
}

window.useManualBarcode = () => {
    const input = document.getElementById('manual-barcode').value.trim();
    const resultsEl = document.getElementById('search-results');
    if (!input) { resultsEl.classList.add('hidden'); return; }
    const query = window.normalizeText(input);
    const matches = window.products.filter(p => window.normalizeText(p.name).includes(query) || p.barcode === input);
    if (matches.length > 0) {
        resultsEl.innerHTML = matches.map(p => `
            <div class="search-result-item" onclick="window.showPage('scan'); window.onScanSuccess('${p.barcode}')">
                <div class="sr-info"><span class="sr-name" title="${p.name}">${p.name}</span><span class="sr-meta">${p.stock.toFixed(2).replace(/\.00$/, '')}${p.unit_type || 'uds'} • ${p.category}</span></div>
                <div class="sr-actions" onclick="event.stopPropagation()">
                    <button class="btn-action-sm remove-stock" onclick="window.quickRemove('${p.barcode}')" title="Quitar 1">-</button>
                    <button class="btn-action-sm consume-stock" onclick="window.quickConsume('${p.barcode}')" title="🍽️">🍽️</button>
                    <button class="btn-action-sm add-stock" onclick="window.quickAdd('${p.barcode}')" title="Añadir 1">+</button>
                </div>
            </div>`).join('');
        resultsEl.classList.remove('hidden');
    } else {
        resultsEl.innerHTML = `<div class="btn-create-new" onclick="window.showPage('scan'); window.onScanSuccess('${input}')"><span>➕</span> Crear nuevo: <b>${input}</b></div>`;
        resultsEl.classList.remove('hidden');
    }
};

window.addStock = async () => {
    const bc = window.currentBarcode; if (!bc) return;
    const name = document.getElementById('product-name').value.trim(); if (!name) { window.showToast('Introduce el nombre', 'info'); return; }
    const p = window.products.find(prod => prod.barcode === bc);
    if (!p) await window.apiCall('/products', 'POST', { 
        barcode: bc, name, category: document.getElementById('product-category').value, 
        unit_type: document.getElementById('product-unit').value, 
        serving_size: parseFloat(document.getElementById('serving-size').value) || null, 
        location: document.getElementById('product-location').value.trim() || null, 
        min_stock: parseFloat(document.getElementById('min-stock').value) || 2, 
        kcal_100g: parseFloat(document.getElementById('new-kcal').value) || null, 
        proteins_100g: parseFloat(document.getElementById('new-proteins').value) || null, 
        carbs_100g: parseFloat(document.getElementById('new-carbs').value) || null, 
        fat_100g: parseFloat(document.getElementById('new-fat').value) || null, 
        image_url: window.currentScannedImageUrl 
    });
    await window.apiCall(`/products/${bc}/stock`, 'POST', { quantity: parseFloat(document.getElementById('quantity').value) || 1, expiry_date: document.getElementById('expiry-date').value || null });
    await window.loadProducts(); window.resetScanner(); window.showPage('dashboard');
};

window.addNewBatch = async () => {
    const bc = window.currentBarcode; if (!bc) return;
    const qty = parseInt(document.getElementById('new-batch-qty').value) || 0;
    if (qty > 0) await window.apiCall(`/products/${bc}/stock`, 'POST', { quantity: qty, expiry_date: document.getElementById('new-batch-expiry').value || null });
    await window.loadProducts(); window.resetScanner(); window.showPage('dashboard');
};

async function init() {
    try {
        console.log("Stock Manager: Initializing Refactored v0.6.0...");
        window.initializeDatePicker();
        window.wrapDateInputsWithPicker();
        setupEventListeners();
        window.initNavigation();
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.remove('hidden');
        await window.loadProducts();
        if (overlay) overlay.classList.add('hidden');
        console.log("Stock Manager: Ready.");
    } catch (err) {
        console.error("Fallo crítico:", err);
        const text = document.getElementById('loading-text');
        if (text) text.innerHTML = `<div style="color:#ef4444;">Error al conectar</div>`;
    }
}

window.updateUI = async () => {
    window.allLocations = await window.apiCall('/locations').catch(() => []);
    window.updateLocationFilter();
    window.updateShoppingList();
    window.updateProductList();
    window.updateStockPageSearch();
};

window.setLocationFilter = (loc) => { window.filteredLocation = loc || null; window.updateProductList(); };
window.updateLocationFilter = () => {
    const stockList = document.getElementById('stock-location-filter');
    const options = '<option value="">Todas las ubicaciones</option>' + (window.allLocations || []).map(loc => `<option value="${loc}">${loc}</option>`).join('');
    if (stockList) stockList.innerHTML = options;
};

window.deleteMovement = async (id) => {
    if (!confirm('¿Eliminar?')) return;
    const restore = confirm('¿Devolver al stock?');
    try {
        await window.apiCall(`/movements/${id}?restore_stock=${restore}`, 'DELETE');
        window.updateTodayMovements(); window.updateMacros(); await window.loadProducts();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

window.updateManageFilter = () => {
    window.manageFilter = { 
        name: document.getElementById('manage-filter-name').value.toLowerCase(), 
        location: document.getElementById('manage-filter-location').value, 
        category: document.getElementById('manage-filter-category').value 
    };
    window.renderManageList();
};

window.toggleSelect = (barcode) => {
    if (window.selectedProducts.has(barcode)) window.selectedProducts.delete(barcode); else window.selectedProducts.add(barcode);
    window.updateSelectionBar(); window.updateProductList();
};

window.updateSelectionBar = () => {
    const bar = document.getElementById('selection-bar'), countEl = document.getElementById('selection-count');
    if (window.selectedProducts.size > 0 && window.isSelectionMode) { bar.classList.remove('hidden'); countEl.textContent = `${window.selectedProducts.size} seleccionados`; } else bar.classList.add('hidden');
};

window.assignTicketMatch = (i, bc) => { 
    window.currentTicketItems[i].match = window.products.find(p=>p.barcode===bc); 
    window.currentTicketItems[i].checked = !!window.currentTicketItems[i].match; 
    window.showTicketResults(window.currentTicketItems);
};

window.updateTicketCheck = (i, c) => window.currentTicketItems[i].checked = c;
window.updateTicketQty = (i, q) => window.currentTicketItems[i].qty = parseInt(q);

window.confirmTicketItems = async () => { 
    for (const it of window.currentTicketItems.filter(t=>t.checked && t.match)) await window.apiCall(`/products/${it.match.barcode}/stock`, 'POST', { quantity: it.qty }); 
    await window.loadProducts(); window.closeTicketPanel(); window.showToast('Actualizado', 'success'); 
};
window.closeTicketPanel = () => document.getElementById('ticket-panel').classList.remove('active');

window.resetScanner = () => {
    window.currentBarcode = null;
    ['scanned-code', 'product-action', 'existing-product-view', 'new-product-fields'].forEach(id => document.getElementById(id).classList.add('hidden'));
};

window.deleteMacroHistory = async () => { if (confirm('¿Limpiar?')) { await window.apiCall('/movements/today', 'DELETE'); window.updateTodayMovements(); window.updateMacros(); } };

window.toggleAdvancedFields = () => {
    const fields = document.getElementById('advanced-fields'), chevron = document.getElementById('advanced-chevron');
    if (fields) { fields.classList.toggle('show'); if (chevron) chevron.classList.toggle('rotate'); }
};

window.openPortionPanel = (barcode) => {
    const p = window.products.find(prod => prod.barcode === barcode);
    if (!p) return;
    window.currentPortionBarcode = barcode;
    const unit = p.unit_type || 'g';
    document.getElementById('portion-title').innerText = `Consumir ${p.name}`;
    document.getElementById('portion-stock-info').innerText = `Stock actual: ${p.stock.toFixed(2)}${unit}`;
    let portions = unit === 'g' ? [50, 100, 200, 250, 500] : [100, 200, 250, 330, 500];
    let optionsHtml = p.serving_size ? `<button class="btn btn-add" style="grid-column: span 2; margin-bottom: 8px;" onclick="window.consumeAmount(${p.serving_size})">🍕 Ración Sugerida: ${p.serving_size}${unit}</button>` : '';
    optionsHtml += portions.map(amt => `<button class="btn btn-secondary" onclick="window.consumeAmount(${amt})">${amt}${unit}</button>`).join('') + `<button class="btn btn-del" onclick="window.consumeAmount(${p.stock})">Terminar todo</button>`;
    document.getElementById('portion-options').innerHTML = optionsHtml;
    document.getElementById('portion-panel').classList.add('active');
};

window.closePortionPanel = () => { document.getElementById('portion-panel').classList.remove('active'); };

window.consumeAmount = async (amount) => {
    if (!window.currentPortionBarcode) return;
    await window.apiCall(`/products/${window.currentPortionBarcode}/stock`, 'POST', { quantity: -amount, reason: 'consumed' });
    window.closePortionPanel(); await window.loadProducts();
};

window.tryClosePanel = () => { if (confirm('¿Cerrar?')) document.getElementById('manage-panel').classList.remove('active'); };

window.openMacroGoalsPanel = async () => {
    try {
        const goals = await window.apiCall('/stats/macro-goals');
        document.getElementById('goal-kcal').value = goals.kcal;
        document.getElementById('goal-proteins').value = goals.proteins;
        document.getElementById('goal-carbs').value = goals.carbs;
        document.getElementById('goal-fat').value = goals.fat;
        document.getElementById('macro-goals-panel').classList.add('active');
        window.updateTodayMovements();
    } catch (e) { window.showToast('Error', 'error'); }
};

window.closeMacroGoalsPanel = () => document.getElementById('macro-goals-panel').classList.remove('active');

document.addEventListener('DOMContentLoaded', init);
