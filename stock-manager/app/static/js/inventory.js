/* 
   Inventory Management & Product Lists
   v0.6.1
*/

window.updateProductList = () => {
    const list = document.getElementById('product-list');
    if (!list) return;

    let filtered = window.filteredLocation ? window.products.filter(p => p.location === window.filteredLocation) : window.products;
    
    if (!filtered.length) { 
        list.innerHTML = `<div class="empty-state">Sin productos${window.filteredLocation ? ' en ' + window.filteredLocation : ''}.</div>`; 
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
        const isSelected = window.selectedProducts.has(p.barcode);
        
        let expiryHtml = '<span class="text-dim">Sin fecha</span>';
        if (p.batches && p.batches.length > 0) {
            const sortedBatches = [...p.batches].sort((a,b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
            const firstExp = window.getExpiryInfo(sortedBatches[0].id ? sortedBatches[0].expiry_date : null);
            if (firstExp) {
                expiryHtml = `<span class="expiry-pill ${firstExp.cls}">${firstExp.text}</span>`;
            }
        }

        return `
            <div class="product-grid-row ${isSelected ? 'selected' : ''} ${isLow ? 'row-warning' : ''}" 
                 data-barcode="${p.barcode}" 
                 data-meta="${p.category}${p.location ? ' • ' + p.location : ''}">
                <div class="cell cell-main">
                    ${window.isSelectionMode ? `<input type="checkbox" class="product-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">` : ''}
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
                    <span class="stock-badge ${isLow ? 'low' : ''}">${p.stock.toFixed(2).replace(/\.00$/, '')} ${p.unit_type || 'uds'}</span>
                    <span class="min-stock-hint">/ ${p.min_stock}</span>
                </div>
                <div class="cell cell-actions">
                    <button class="btn-action-sm remove-stock" onclick="window.quickRemove('${p.barcode}')" title="Quitar 1">-</button>
                    <button class="btn-action-sm consume-stock" onclick="window.quickConsume('${p.barcode}')" title="Consumir">🍽️</button>
                    <button class="btn-action-sm add-stock" onclick="window.quickAdd('${p.barcode}')" title="Añadir 1">+</button>
                    <div class="action-divider"></div>
                    <button class="btn-action-sm manage-product" onclick="window.openManagePanel('${p.barcode}')" title="Gestionar">⚙</button>
                    <button class="btn-action-sm delete-product" onclick="window.deleteProduct('${p.barcode}')" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    list.innerHTML = html;
};

window.updateShoppingList = () => {
    const lowStock = window.products.filter(p => p.min_stock !== null && (p.stock || 0) < p.min_stock);
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
    window.products.forEach(p => p.batches?.forEach(b => {
        if (b.expiry_date) {
            const exp = new Date(b.expiry_date + 'T00:00:00');
            if (exp >= today && exp <= nextWeek) expiringSoon.push({ name: p.name, expiry_date: b.expiry_date, quantity: b.quantity, unit_type: p.unit_type });
        }
    }));

    let expiringHtml = '<div class="shopping-empty">Nada caduca pronto</div>';
    if (expiringSoon.length) {
        expiringSoon.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
        expiringHtml = expiringSoon.map(item => {
            const exp = window.getExpiryInfo(item.expiry_date);
            return `
                <div class="shopping-item">
                    <span class="name">${item.name} (${item.quantity.toFixed(2).replace(/\.00$/, '')}${item.unit_type || 'uds'})</span>
                    <span class="${exp.cls}">${exp.text}</span>
                </div>
            `;
        }).join('');
    }
    
    const miniExp = document.getElementById('expiring-soon-list');
    const fullExp = document.getElementById('expiring-soon-list-full');
    if (miniExp) miniExp.innerHTML = expiringHtml;
    if (fullExp) fullExp.innerHTML = expiringHtml;
};

window.quickAdd = async (barcode) => {
    const p = window.products.find(prod => prod.barcode === barcode);
    if (p && p.batches?.length) { 
        await window.apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: 1 }); 
        await window.loadProducts(); 
    }
    else if (window.openDateModal) {
        window.openDateModal(async exp => { 
            await window.apiCall(`/products/${barcode}/stock`, 'POST', { quantity: 1, expiry_date: exp }); 
            await window.loadProducts(); 
        });
    }
};

window.quickRemove = async (barcode) => {
    const p = window.products.find(prod => prod.barcode === barcode);
    if (p && p.stock > 0 && p.batches?.length) { 
        await window.apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: -1, reason: 'removed' }); 
        await window.loadProducts(); 
    } else {
        window.showToast("No hay stock para quitar", "info");
    }
};

window.quickConsume = async (barcode) => {
    const p = window.products.find(prod => prod.barcode === barcode);
    if (!p || p.stock <= 0) {
        window.showToast("No hay stock para consumir", "info");
        return;
    }
    
    if (p.unit_type === 'uds') {
        await window.apiCall(`/products/${barcode}/stock`, 'POST', { quantity: -1, reason: 'consumed' }); 
        await window.loadProducts(); 
    } else {
        if (window.openPortionPanel) window.openPortionPanel(barcode);
    }
};

window.deleteProduct = async (barcode) => { if (confirm('¿Eliminar este producto?')) { await window.apiCall(`/products/${barcode}`, 'DELETE'); await window.loadProducts(); } };

window.updateStockPageSearch = () => {
    const query = window.normalizeText(document.getElementById('stock-search')?.value || '');
    const location = document.getElementById('stock-location-filter')?.value || '';
    const rows = document.querySelectorAll('#product-list .product-grid-row');
    
    rows.forEach(row => {
        const name = window.normalizeText(row.querySelector('.product-name')?.textContent || '');
        const meta = window.normalizeText(row.querySelector('.product-meta-inline')?.textContent || '');
        const barcode = row.dataset.barcode || '';
        
        const matchesQuery = !query || name.includes(query) || barcode.includes(query) || meta.includes(query);
        const matchesLocation = !location || meta.includes(window.normalizeText(location));
        
        row.style.display = (matchesQuery && matchesLocation) ? '' : 'none';
    });
};

window.openManagePanel = (barcode = null) => {
    window.pendingChanges = {}; window.pendingBatchChanges = {};
    window.products.forEach(p => {
        window.originalData[p.barcode] = { 
            name: p.name, category: p.category, min_stock: p.min_stock, location: p.location || '',
            weight_g: p.weight_g || null, kcal_100g: p.kcal_100g || null, proteins_100g: p.proteins_100g || null,
            carbs_100g: p.carbs_100g || null, fat_100g: p.fat_100g || null, serving_size: p.serving_size || null
        };
        p.batches?.forEach(b => window.originalBatchData[b.id] = b.expiry_date || '');
    });
    
    if (barcode) document.getElementById('manage-filter-name').value = barcode;
    
    const locSelect = document.getElementById('manage-filter-location');
    if (locSelect) {
        const locs = [...new Set(window.products.map(p => p.location).filter(l => l))];
        locSelect.innerHTML = '<option value="">Todas</option>' + locs.map(l => `<option value="${l}">${l}</option>`).join('');
    }
    
    document.getElementById('manage-panel').classList.add('active');
    window.renderManageList(); window.updateChangesUI();
};

window.renderManageList = () => {
    const list = document.getElementById('manage-list');
    if (!list) return;

    let filtered = window.products.filter(p => (!window.manageFilter.name || p.name.toLowerCase().includes(window.manageFilter.name)) && (!window.manageFilter.location || p.location === window.manageFilter.location) && (!window.manageFilter.category || p.category === window.manageFilter.category));
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    list.innerHTML = filtered.map(p => {
        const isDel = window.pendingChanges[p.barcode]?.type === 'delete';
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
                <div class="form-group"><label>Ración Usual</label><input type="number" class="edit-field" data-barcode="${p.barcode}" data-field="serving_size" value="${p.serving_size || ''}" ${isDel ? 'disabled' : ''}></div>
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
            <div class="edit-actions">${isDel ? `<button class="btn-undo-sm undo-delete" onclick="window.undoDelete('${p.barcode}')">Deshacer</button>` : `<button class="btn-delete-sm mark-delete" onclick="window.markForDelete('${p.barcode}')">Eliminar</button>`}</div>
        </div>`;
    }).join('');
    if (window.wrapDateInputsWithPicker) setTimeout(window.wrapDateInputsWithPicker, 0);
};

window.checkProductChanges = (bc, values) => {
    const orig = window.originalData[bc]; 
    if (!orig || window.pendingChanges[bc]?.type === 'delete') return;
    const same = Object.keys(values).every(k => values[k] == orig[k]); // Use loosely comparison for numbers string in input
    if (!same) window.pendingChanges[bc] = { type: 'edit', name: values.name, data: values }; 
    else delete window.pendingChanges[bc];
    window.updateChangesUI();
};

window.checkBatchChange = (id, bc, val) => {
    if (val !== (window.originalBatchData[id] || '')) window.pendingBatchChanges[id] = { barcode: bc, newExpiry: val }; 
    else delete window.pendingBatchChanges[id];
    window.updateChangesUI();
};

window.markForDelete = (bc) => { window.pendingChanges[bc] = { type: 'delete', name: window.originalData[bc].name }; window.updateChangesUI(); window.renderManageList(); };
window.undoDelete = (bc) => { delete window.pendingChanges[bc]; window.updateChangesUI(); window.renderManageList(); };

window.updateChangesUI = () => {
    const total = Object.keys(window.pendingChanges).length + Object.keys(window.pendingBatchChanges).length;
    const btn = document.getElementById('btn-save-all');
    const container = document.getElementById('changes-container');
    if (btn) btn.disabled = total === 0;
    if (container) {
        if (total === 0) container.classList.add('hidden');
        else { container.classList.remove('hidden'); container.innerHTML = `<div class="changes-summary">${total} cambios pendientes</div>`; }
    }
};

window.saveAllChanges = async () => {
    for (const [bc, c] of Object.entries(window.pendingChanges)) {
        if (c.type === 'delete') await window.apiCall(`/products/${bc}`, 'DELETE'); 
        else await window.apiCall(`/products/${bc}`, 'PATCH', c.data);
    }
    for (const [id, c] of Object.entries(window.pendingBatchChanges)) await window.apiCall(`/batches/${id}`, 'PATCH', { expiry_date: c.newExpiry || null });
    window.pendingChanges = {}; window.pendingBatchChanges = {}; 
    await window.loadProducts(); 
    document.getElementById('manage-panel').classList.remove('active');
};

window.tryClosePanel = () => { 
    if ((!Object.keys(window.pendingChanges).length && !Object.keys(window.pendingBatchChanges).length) || confirm('¿Salir sin guardar cambios?')) {
        document.getElementById('manage-panel').classList.remove('active'); 
    }
};
