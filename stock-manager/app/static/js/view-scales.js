/*
   View: Básculas — smart scale management (ESP32 + HX711)
   v0.9.0
*/

const scalesData = {
    scales: null,
    products: null,
    refills: null,
    loading: false,
    pollTimer: null,
};

async function _loadScales() {
    scalesData.loading = true;
    try {
        const [scales, products, refills] = await Promise.all([
            window.apiCall('/scales', 'GET'),
            window.apiCall('/products', 'GET'),
            window.apiCall('/pending-refills?status=pending', 'GET'),
        ]);
        scalesData.scales = scales || [];
        scalesData.products = products || [];
        scalesData.refills = refills || [];
    } catch (e) {
        console.error('scales load failed', e);
        scalesData.scales = [];
        scalesData.products = [];
        scalesData.refills = [];
    } finally {
        scalesData.loading = false;
    }
}

function _findProduct(barcode) {
    if (!barcode || !scalesData.products) return null;
    return scalesData.products.find(p => p.barcode === barcode) || null;
}

function _formatWeight(g) {
    if (g == null) return '—';
    if (Math.abs(g) >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    return `${g.toFixed(1)} g`;
}

function _formatRelativeTime(iso) {
    if (!iso) return 'nunca';
    const then = new Date(iso);
    const diffMs = Date.now() - then.getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return 'hace segundos';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
}

function _webhookBase() {
    const { protocol, host } = window.location;
    return `${protocol}//${host}${window.API_BASE.replace(/\/api$/, '')}`;
}

function _scaleCard(scale) {
    const product = _findProduct(scale.product_barcode);
    const productLabel = product
        ? `${window.esc(product.name)}`
        : `<span class="muted">sin asignar</span>`;
    const weight = _formatWeight(scale.last_stable_weight_g);
    const lastEvent = _formatRelativeTime(scale.last_event_at);
    const webhook = `${_webhookBase()}/api/scales/${scale.id}/event`;
    const weightUrl = `${_webhookBase()}/api/scales/${scale.id}/weight`;

    const productOptions = [
        `<option value="">— sin asignar —</option>`,
        ...((scalesData.products || []).map(p =>
            `<option value="${window.esc(p.barcode)}" ${p.barcode === scale.product_barcode ? 'selected' : ''}>${window.esc(p.name)}</option>`
        )),
    ].join('');

    return `
        <div class="card" data-scale-id="${scale.id}">
            <div class="card-head">
                <div>
                    <div class="card-title">${window.esc(scale.name)}</div>
                    <span class="card-sub">id #${scale.id} · último evento ${lastEvent}</span>
                </div>
                <div style="font-size:1.8rem; font-weight:700; font-variant-numeric:tabular-nums;">
                    ${weight}
                </div>
            </div>

            <div class="stack" style="gap:10px; margin-top:12px;">
                <label class="field">
                    <span class="field-label">Producto asignado</span>
                    <select data-action="change-product">${productOptions}</select>
                </label>

                <details>
                    <summary style="cursor:pointer; font-size:.85rem; opacity:.7;">Webhook URLs para el ESP32</summary>
                    <div class="stack" style="gap:6px; margin-top:8px; font-family:var(--mono); font-size:.75rem; opacity:.8;">
                        <div><strong>Event:</strong> <span style="user-select:all">${window.esc(webhook)}</span></div>
                        <div><strong>Weight:</strong> <span style="user-select:all">${window.esc(weightUrl)}</span></div>
                    </div>
                </details>

                <div class="row" style="gap:8px; justify-content:flex-end;">
                    <button class="secondary" data-action="delete">Eliminar</button>
                </div>
            </div>
        </div>
    `;
}

function _addScaleForm() {
    const productOptions = [
        `<option value="">— sin asignar (configurar después) —</option>`,
        ...((scalesData.products || []).map(p =>
            `<option value="${window.esc(p.barcode)}">${window.esc(p.name)}${p.tracking_mode === 'scale' ? ' (ya en modo báscula)' : ''}</option>`
        )),
    ].join('');

    return `
        <div class="card" id="add-scale-form" hidden>
            <div class="card-head">
                <div class="card-title">Nueva báscula</div>
            </div>
            <div class="stack" style="gap:10px;">
                <label class="field">
                    <span class="field-label">Nombre (ej. "Arroz", "Café")</span>
                    <input type="text" id="new-scale-name" placeholder="Nombre identificativo">
                </label>
                <label class="field">
                    <span class="field-label">Producto asignado</span>
                    <select id="new-scale-product">${productOptions}</select>
                </label>
                <div class="row" style="gap:8px; justify-content:flex-end;">
                    <button class="secondary" id="cancel-add-scale">Cancelar</button>
                    <button id="confirm-add-scale">Crear</button>
                </div>
            </div>
        </div>
    `;
}

function _refillCard(refill) {
    const product = _findProduct(refill.product_barcode);
    const productLabel = product ? product.name : refill.product_barcode;
    const unit = product ? (product.unit_type || 'g') : 'g';
    const created = _formatRelativeTime(refill.created_at);
    return `
        <div class="row" data-refill-id="${refill.id}" style="align-items:center; gap:10px; padding:10px 12px; background:var(--bg-2, #1c1c1c); border-radius:8px;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600;">${window.esc(productLabel)}</div>
                <div style="font-size:.75rem; opacity:.6;">~${refill.qty_estimated} ${unit} · ${refill.source} · ${created}</div>
            </div>
            <button data-action="resolve-refill" data-qty="${refill.qty_estimated}">Resolver</button>
            <button class="secondary" data-action="cancel-refill">Cancelar</button>
        </div>
    `;
}

window.renderScales = function() {
    if (scalesData.scales === null && !scalesData.loading) {
        _loadScales().then(() => window.renderPage());
    }

    const scales = scalesData.scales || [];
    const refills = scalesData.refills || [];

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Hardware</div>
                <h1 class="page-title">Básculas</h1>
            </div>
            <button id="open-add-scale" class="primary">+ Nueva</button>
        </div>

        ${_addScaleForm()}

        ${refills.length > 0 ? `
            <div class="card" style="margin-bottom:14px;">
                <div class="card-head">
                    <div class="card-title">Refills pendientes</div>
                    <span class="card-sub">${refills.length} esperando NUEVO LOTE</span>
                </div>
                <div class="stack" style="gap:6px; margin-top:10px;">
                    ${refills.map(_refillCard).join('')}
                </div>
            </div>
        ` : ''}

        ${scalesData.loading
            ? `<div class="empty" style="padding:30px 0">Cargando…</div>`
            : (scales.length === 0
                ? `<div class="empty"><div class="t">Sin básculas configuradas</div><div>Tocá "+ Nueva" para registrar tu primera báscula ESP32.</div></div>`
                : `<div class="stack" style="gap:14px;">${scales.map(_scaleCard).join('')}</div>`)
        }
    `;
};

window.initScales = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    const addBtn = root.querySelector('#open-add-scale');
    const form = root.querySelector('#add-scale-form');
    const cancelBtn = root.querySelector('#cancel-add-scale');
    const confirmBtn = root.querySelector('#confirm-add-scale');

    if (addBtn && form) {
        addBtn.addEventListener('click', () => {
            form.hidden = false;
            const nameInput = root.querySelector('#new-scale-name');
            if (nameInput) nameInput.focus();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            form.hidden = true;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const name = root.querySelector('#new-scale-name').value.trim();
            const productBarcode = root.querySelector('#new-scale-product').value || null;
            if (!name) {
                window.showToast('Poné un nombre para la báscula', 'error');
                return;
            }
            try {
                const created = await window.apiCall('/scales', 'POST', {
                    name,
                    product_barcode: productBarcode,
                });
                // If the user picked a product, flip its tracking_mode to "scale".
                if (productBarcode) {
                    try {
                        await window.apiCall(`/products/${productBarcode}`, 'PATCH', { tracking_mode: 'scale' });
                    } catch (e) {
                        console.warn('Could not flip product to scale mode:', e);
                    }
                }
                window.showToast(`Báscula "${created.name}" creada (id #${created.id})`, 'success');
                scalesData.scales = null;  // force reload
                await _loadScales();
                if (window.reloadProducts) await window.reloadProducts();
                window.renderPage();
            } catch (e) {
                window.showToast('Error creando báscula: ' + e.message, 'error');
            }
        });
    }

    // Per-scale handlers
    root.querySelectorAll('[data-scale-id]').forEach(card => {
        const scaleId = parseInt(card.dataset.scaleId, 10);

        const productSel = card.querySelector('[data-action="change-product"]');
        if (productSel) {
            productSel.addEventListener('change', async () => {
                const newBarcode = productSel.value || null;
                try {
                    await window.apiCall(`/scales/${scaleId}`, 'PATCH', { product_barcode: newBarcode });
                    if (newBarcode) {
                        await window.apiCall(`/products/${newBarcode}`, 'PATCH', { tracking_mode: 'scale' });
                    }
                    window.showToast('Producto actualizado', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }

        const delBtn = card.querySelector('[data-action="delete"]');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta báscula? El producto asignado vuelve a modo manual.')) return;
                try {
                    const scale = (scalesData.scales || []).find(s => s.id === scaleId);
                    await window.apiCall(`/scales/${scaleId}`, 'DELETE');
                    if (scale && scale.product_barcode) {
                        await window.apiCall(`/products/${scale.product_barcode}`, 'PATCH', { tracking_mode: 'manual' });
                    }
                    window.showToast('Báscula eliminada', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
    });

    // Pending refill handlers
    root.querySelectorAll('[data-refill-id]').forEach(row => {
        const refillId = parseInt(row.dataset.refillId, 10);
        const resolveBtn = row.querySelector('[data-action="resolve-refill"]');
        const cancelBtn = row.querySelector('[data-action="cancel-refill"]');

        if (resolveBtn) {
            resolveBtn.addEventListener('click', async () => {
                const defaultQty = parseFloat(resolveBtn.dataset.qty) || 0;
                const input = window.prompt(`Cantidad real del lote (g):`, defaultQty);
                if (input == null) return;
                const qty = parseFloat(input);
                if (!qty || qty <= 0) {
                    window.showToast('Cantidad inválida', 'error');
                    return;
                }
                try {
                    await window.apiCall(`/pending-refills/${refillId}/resolve`, 'POST', { actual_qty: qty });
                    window.showToast('Refill resuelto', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (!confirm('¿Cancelar este refill pendiente?')) return;
                try {
                    await window.apiCall(`/pending-refills/${refillId}`, 'DELETE');
                    window.showToast('Refill cancelado', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
    });

    // Live polling: refresh weight every 3s while this tab is active.
    if (scalesData.pollTimer) clearInterval(scalesData.pollTimer);
    scalesData.pollTimer = setInterval(async () => {
        if (window.AppState.page !== 'scales') {
            clearInterval(scalesData.pollTimer);
            scalesData.pollTimer = null;
            return;
        }
        try {
            const fresh = await window.apiCall('/scales', 'GET');
            scalesData.scales = fresh || [];
            // Inline update of weight numbers only, avoid full re-render flicker.
            root.querySelectorAll('[data-scale-id]').forEach(card => {
                const sid = parseInt(card.dataset.scaleId, 10);
                const s = scalesData.scales.find(x => x.id === sid);
                if (!s) return;
                const weightEl = card.querySelector('.card-head > div:last-child');
                if (weightEl) weightEl.textContent = _formatWeight(s.last_stable_weight_g);
            });
        } catch (e) {
            // Silent fail — next tick may succeed.
        }
    }, 3000);
};
