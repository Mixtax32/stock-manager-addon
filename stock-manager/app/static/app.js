import { loadProducts, updateProductList, setLocationFilter, toggleSelectionMode, toggleSelect, clearSelection, bulkAction, updateManageFilter, openManagePanel, saveAllChanges, isPendingChanges, markForDelete, undoDelete, checkProductChanges, checkBatchChange, getProducts } from './js/inventory.js';
import { apiCall, exportInventory, importInventory } from './js/api.js';
import { onScanSuccess, resetScanner, setHtml5QrCode, getHtml5QrCode, processTicketImage } from './js/scanner.js';
import { showToast, getExpiryInfo } from './js/utils.js';
import { initializeDatePicker, confirmDatePicker, closeDatePicker, openDateModal, wrapDateInputsWithPicker } from './js/datepicker.js';

// Aplicamos el inicio inmediato o tras DOMContentLoaded
const init = async () => {
    console.log("Stock Manager: Initializing...");
    await loadProducts();
    initializeDatePicker();
    wrapDateInputsWithPicker();
    setupEventListeners();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function setupEventListeners() {
    // Basic navigation
    document.querySelectorAll('.section-header').forEach(header => {
        header.onclick = (e) => {
            if (e.target.closest('.header-main-actions') || e.target.closest('button')) return;
            const section = header.parentElement;
            section.classList.toggle('collapsed');
        }
    });

    // Scanner
    document.getElementById('start-scan').onclick = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Cámara no disponible. Se requiere HTTPS.');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            stream.getTracks().forEach(track => track.stop());
            const html5QrCode = new Html5Qrcode("scanner-container");
            setHtml5QrCode(html5QrCode);
            await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, 
                (text) => onScanSuccess(text, getProducts()));
            document.getElementById('scanner-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('start-scan').classList.add('hidden');
            document.getElementById('start-ticket').classList.add('hidden');
            document.getElementById('stop-scan').classList.remove('hidden');
        } catch (err) { showToast('Error cámara: ' + err.message, 'error'); }
    };

    document.getElementById('stop-scan').onclick = async () => {
        const scanner = getHtml5QrCode();
        if (scanner) {
            await scanner.stop();
            document.getElementById('start-scan').classList.remove('hidden');
            document.getElementById('start-ticket').classList.remove('hidden');
            document.getElementById('stop-scan').classList.add('hidden');
        }
    };

    // Ticket
    document.getElementById('start-ticket').onclick = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Cámara no disponible. Se requiere HTTPS.');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
            const video = document.createElement('video');
            video.srcObject = stream;
            video.setAttribute('playsinline', 'true');
            await video.play();

            const container = document.getElementById('scanner-container');
            container.innerHTML = '';
            video.style.width = '100%';
            video.style.borderRadius = '8px';
            container.appendChild(video);

            const captureBtn = document.createElement('button');
            captureBtn.className = 'btn btn-add';
            captureBtn.style.cssText = 'width:100%;margin-top:8px;';
            captureBtn.textContent = 'Capturar ticket';
            container.appendChild(captureBtn);

            document.getElementById('start-scan').classList.add('hidden');
            document.getElementById('start-ticket').classList.add('hidden');
            document.getElementById('stop-scan').classList.remove('hidden');
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });

            captureBtn.onclick = async () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                stream.getTracks().forEach(t => t.stop());
                container.innerHTML = '';
                document.getElementById('start-scan').classList.remove('hidden');
                document.getElementById('start-ticket').classList.remove('hidden');
                document.getElementById('stop-scan').classList.add('hidden');
                
                await processTicketImage(canvas, getProducts(), (items, rawText) => showTicketResults(items, rawText));
            };
        } catch (err) { showToast('Error cámara: ' + err.message, 'error'); }
    };

    // Global actions
    window.useManualBarcode = () => {
        const input = document.getElementById('manual-barcode').value.trim();
        if (!input) { showToast('Introduce un código o nombre', 'info'); return; }
        const products = getProducts();
        const byBarcode = products.find(p => p.barcode === input);
        if (byBarcode) { onScanSuccess(input, products); document.getElementById('manual-barcode').value = ''; return; }
        const query = input.toLowerCase();
        const matches = products.filter(p => p.name.toLowerCase().includes(query));
        if (matches.length === 1) { onScanSuccess(matches[0].barcode, products); document.getElementById('manual-barcode').value = ''; }
        else if (matches.length > 1) showSearchResults(matches);
        else onScanSuccess(input, products);
    };

    window.toggleSelectionMode = toggleSelectionMode;
    window.clearSelection = clearSelection;
    window.bulkAction = bulkAction;
    window.exportInventory = exportInventory;
    window.importInventory = () => importInventory(loadProducts);
    window.saveAllChanges = saveAllChanges;
    window.tryClosePanel = () => { if (!isPendingChanges() || confirm('¿Salir sin guardar cambios?')) document.getElementById('manage-panel').classList.remove('active'); };
    window.openManagePanel = openManagePanel;
    window.confirmDatePicker = confirmDatePicker;
    window.closeDatePicker = closeDatePicker;
    window.resetScanner = resetScanner;
    window.toggleSection = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('collapsed');
    };
    window.updateManageFilter = () => {
        const data = {
            name: document.getElementById('manage-filter-name').value.toLowerCase(),
            location: document.getElementById('manage-filter-location').value,
            category: document.getElementById('manage-filter-category').value
        };
        updateManageFilter(data);
    };
    
    // Funciones requeridas por las plantillas inyectadas
    window.quickAdd = quickAdd;
    window.quickRemove = quickRemove;
    window.quickLost = quickLost;
    window.deleteProduct = deleteProduct;
    window.toggleSelect = toggleSelect;
    window.openManagePanelForProduct = (name) => {
        openManagePanel();
        document.getElementById('manage-filter-name').value = name;
        updateManageFilter({ name: name.toLowerCase() });
    };

    // Filters and delegates
    document.addEventListener('change', e => {
        if (e.target.id === 'location-select') setLocationFilter(e.target.value);
        if (e.target.id === 'manage-filter-location') updateManageFilter({ location: e.target.value });
        if (e.target.id === 'manage-filter-category') updateManageFilter({ category: e.target.value });
        if (e.target.classList.contains('edit-field')) {
            const bc = e.target.dataset.barcode;
            const values = {};
            document.querySelectorAll(`.edit-field[data-barcode="${bc}"]`).forEach(el => {
                let v = el.value;
                if (el.type === 'number') v = v ? (el.step ? parseFloat(v) : parseInt(v)) : (el.classList.contains('macro') ? null : (el.dataset.field === 'min_stock' ? 2 : 0));
                values[el.dataset.field] = v;
            });
            checkProductChanges(bc, values);
        }
        if (e.target.classList.contains('edit-batch-field')) {
            checkBatchChange(e.target.dataset.batchId, e.target.dataset.barcode, e.target.value);
        }
    });

    document.addEventListener('input', e => {
        if (e.target.id === 'manage-filter-name') updateManageFilter({ name: e.target.value.toLowerCase() });
    });

    document.addEventListener('click', e => {
        const t = e.target;
        if (t.classList.contains('add-stock')) { e.stopPropagation(); quickAdd(t.dataset.barcode); }
        if (t.classList.contains('remove-stock')) { e.stopPropagation(); quickRemove(t.dataset.barcode); }
        if (t.classList.contains('lost-stock')) { e.stopPropagation(); quickLost(t.dataset.barcode); }
        if (t.classList.contains('delete-product')) { e.stopPropagation(); deleteProduct(t.dataset.barcode); }
        if (t.classList.contains('manage-product')) { e.stopPropagation(); openManagePanel(); document.getElementById('manage-filter-name').value = t.dataset.barcode; updateManageFilter({ name: t.dataset.barcode.toLowerCase() }); }
        if (t.classList.contains('undo-delete')) undoDelete(t.dataset.barcode);
        if (t.classList.contains('mark-delete')) markForDelete(t.dataset.barcode);
        if (t.classList.contains('product-row') && isSelectionMode) toggleSelect(t.dataset.barcode);
        if (t.classList.contains('product-checkbox')) { e.stopPropagation(); toggleSelect(t.closest('.product-row').dataset.barcode); }
        
        // Modal and ticket actions
        if (t.id === 'btn-save-all') saveAllChanges();
    });
}

function showSearchResults(matches) {
    const container = document.getElementById('search-results');
    container.innerHTML = matches.map(p => `
        <div class="search-result-item" onclick="onScanSuccess('${p.barcode}', getProducts()); document.getElementById('manual-barcode').value=''; document.getElementById('search-results').classList.add('hidden')">
            <span class="sr-name">${p.name}</span>
            <span class="sr-meta">${p.stock} uds · ${p.category}</span>
        </div>`).join('');
    container.classList.remove('hidden');
}

async function quickAdd(barcode) {
    const products = getProducts();
    const p = products.find(prod => prod.barcode === barcode);
    if (p && p.batches?.length) {
        await apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: 1 });
        await loadProducts();
    } else openDateModal(async (exp) => { await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: 1, expiry_date: exp }); await loadProducts(); });
}

async function quickRemove(barcode) {
    const p = getProducts().find(prod => prod.barcode === barcode);
    if (p && p.stock > 0 && p.batches?.length) {
        await apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: -1 });
        await loadProducts();
    }
}

async function quickLost(barcode) {
    const p = getProducts().find(prod => prod.barcode === barcode);
    if (p && p.stock > 0) {
        await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: -1, reason: 'lost' });
        await loadProducts();
    }
}

async function deleteProduct(barcode) {
    if (confirm('¿Eliminar este producto?')) { await apiCall(`/products/${barcode}`, 'DELETE'); await loadProducts(); }
}

// Global functions for events
window.wrapDateInputsWithPicker = wrapDateInputsWithPicker;
window.addStock = async () => {
    const bc = getCurrentBarcode();
    if (!bc) return;
    const data = {
        name: document.getElementById('product-name').value.trim(),
        category: document.getElementById('product-category').value,
        location: document.getElementById('product-location').value.trim() || null,
        min_stock: parseInt(document.getElementById('min-stock').value) || 2,
        weight_g: parseFloat(document.getElementById('new-weight').value) || null,
        kcal_100g: parseFloat(document.getElementById('new-kcal').value) || null,
        proteins_100g: parseFloat(document.getElementById('new-proteins').value) || null,
        carbs_100g: parseFloat(document.getElementById('new-carbs').value) || null,
        fat_100g: parseFloat(document.getElementById('new-fat').value) || null
    };
    if (!data.name) { showToast('Introduce el nombre del producto', 'info'); return; }
    const p = getProducts().find(prod => prod.barcode === bc);
    if (!p) await apiCall('/products', 'POST', { barcode: bc, ...data, image_url: getCurrentScannedImageUrl() });
    await apiCall(`/products/${bc}/stock`, 'POST', { quantity: parseInt(document.getElementById('quantity').value) || 1, expiry_date: document.getElementById('expiry-date').value || null });
    await loadProducts(); resetScanner();
};

window.addNewBatch = async () => {
    const bc = getCurrentBarcode(); if (!bc) return;
    const changes = getScanSessionChanges();
    for (const [id, delta] of Object.entries(changes.batches)) if (delta !== 0) await apiCall(`/batches/${id}/stock`, 'POST', { quantity: delta });
    const qty = parseInt(document.getElementById('new-batch-qty').value) || 0;
    if (qty > 0) await apiCall(`/products/${bc}/stock`, 'POST', { quantity: qty, expiry_date: document.getElementById('new-batch-expiry').value || null });
    await loadProducts(); resetScanner();
};

// Ticket UI
let currentTicketItems = [];
function showTicketResults(items, rawText) {
    currentTicketItems = items;
    const matched = items.filter(t => t.match);
    const unmatched = items.filter(t => !t.match);
    let html = '';

    if (matched.length > 0) {
        html += '<div class="ticket-section-title">Coinciden con tu inventario</div>';
        matched.forEach((item, idx) => {
            html += `<div class="ticket-item">
                <input type="checkbox" class="ticket-check" data-idx="${idx}" ${item.checked ? 'checked' : ''}>
                <div class="ti-info"><div class="ti-match">${item.match.name}</div><div class="ti-line">Ticket: ${item.name}</div></div>
                <div class="ti-qty"><label>Uds</label><input type="number" class="ticket-qty" data-idx="${idx}" value="${item.qty}" min="1"></div>
            </div>`;
        });
    }

    if (unmatched.length > 0) {
        html += '<div class="ticket-section-title unmatched">Detectados en ticket (sin coincidencia)</div>';
        const options = getProducts().map(p => `<option value="${p.barcode}">${p.name}</option>`).join('');
        unmatched.forEach((item, idx) => {
            const realIdx = items.indexOf(item);
            html += `<div class="ticket-item">
                <input type="checkbox" class="ticket-check" data-idx="${realIdx}" ${item.checked ? 'checked' : ''}>
                <div class="ti-info"><div class="ti-match" style="color:#f59e0b">${item.name}</div>
                <div style="margin-top:4px;"><select class="ticket-assign" data-idx="${realIdx}"><option value="">¿Asignar a producto?</option>${options}</select></div></div>
                <div class="ti-qty"><label>Uds</label><input type="number" class="ticket-qty" data-idx="${realIdx}" value="${item.qty}" min="1"></div>
            </div>`;
        });
    }

    html += `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #222;"><div class="ticket-section-title" style="color:#555;cursor:pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">Texto OCR</div><pre class="hidden" style="color:#555;font-size:11px;white-space:pre-wrap;word-break:break-all;background:#111;padding:10px;border-radius:6px;max-height:300px;overflow-y:auto">${rawText}</pre></div>`;
    
    document.getElementById('ticket-matched').innerHTML = html;
    document.getElementById('ticket-panel').classList.add('active');

    // Attach local ticket listeners
    document.querySelectorAll('.ticket-check').forEach(el => el.onchange = () => currentTicketItems[el.dataset.idx].checked = el.checked);
    document.querySelectorAll('.ticket-qty').forEach(el => el.onchange = () => currentTicketItems[el.dataset.idx].qty = parseInt(el.value));
    document.querySelectorAll('.ticket-assign').forEach(el => el.onchange = () => {
        const p = getProducts().find(prod => prod.barcode === el.value);
        currentTicketItems[el.dataset.idx].match = p;
        currentTicketItems[el.dataset.idx].checked = !!p;
        document.querySelector(`.ticket-check[data-idx="${el.dataset.idx}"]`).checked = !!p;
    });
}

window.confirmTicketItems = async () => {
    const selected = currentTicketItems.filter(t => t.checked && t.match);
    for (const item of selected) {
        const p = item.match;
        const endpoint = (p.batches?.length) ? `/batches/${p.batches[0].id}/stock` : `/products/${p.barcode}/stock`;
        await apiCall(endpoint, 'POST', { quantity: item.qty });
    }
    await loadProducts(); document.getElementById('ticket-panel').classList.remove('active');
    showToast(`${selected.length} productos añadidos`, 'success');
};

window.closeTicketPanel = () => document.getElementById('ticket-panel').classList.remove('active');
