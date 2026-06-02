/*
   View: Pantry — Home Assistant API backed inventory
   v0.7.0
*/

let pantryCat = 'todas';
let pantryQuery = '';
const pantryData = { pollTimer: null, visibilityHandler: null };
const PANTRY_POLL_MS = 20000;

function _pantryShouldSkipRefresh() {
    // Don't disrupt: an open modal, or focused input/select/textarea on the page.
    const modalMount = document.getElementById('modal-mount');
    if (modalMount && modalMount.children.length > 0) return true;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return true;
    return false;
}

async function _pantryRefresh() {
    if (window.AppState.page !== 'pantry') return;
    if (_pantryShouldSkipRefresh()) return;
    try {
        await window.reloadProducts();
        window.renderPage();
    } catch (e) {
        // Silent — next tick may succeed.
    }
}

function _locForProduct(p) {
    return (p.location || 'otros').toLowerCase();
}

// Effective location for a single batch: batch.location overrides product.location
function _batchLoc(batch, product) {
    return (batch.location || product.location || 'otros').toLowerCase();
}

// Returns Map<location, totalQty> for a product's batches
function _stockByLocation(p) {
    const map = new Map();
    (p.batches || []).forEach(b => {
        const loc = _batchLoc(b, p);
        map.set(loc, (map.get(loc) || 0) + (b.quantity || 0));
    });
    if (map.size === 0 && (p.stock || 0) > 0) {
        // Product has stock but no batches (legacy edge case) — fall back to product.location
        map.set((p.location || 'otros').toLowerCase(), p.stock);
    }
    return map;
}

// Group batches and compute earliest expiry date for a product
function _earliestExpiry(p) {
    if (!p.batches || p.batches.length === 0) return null;
    const sorted = p.batches.filter(b => b.expiry_date).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    return sorted.length ? sorted[0].expiry_date : null;
}

window.renderPantry = function() {
    const products = window.AppState.products || [];

    const cats = [
        { id: 'todas',      name: 'Todo',       ico: 'pantry' },
        { id: 'nevera',     name: 'Nevera',     ico: 'fridge' },
        { id: 'congelador', name: 'Congelador', ico: 'freezer' },
        { id: 'despensa',   name: 'Despensa',   ico: 'cupboard' },
        { id: 'otros',      name: 'Otros',      ico: 'pantry' },
    ];

    function countIn(cid) {
        if (cid === 'todas') return products.length;
        return products.filter(p => _stockByLocation(p).has(cid)).length;
    }

    const filtered = products.filter(p => {
        if (pantryCat !== 'todas' && !_stockByLocation(p).has(pantryCat)) return false;
        if (pantryQuery && !(p.name || '').toLowerCase().includes(pantryQuery.toLowerCase())) return false;
        return true;
    }).sort((a, b) => {
        const da = window.daysUntil(_earliestExpiry(a));
        const db = window.daysUntil(_earliestExpiry(b));
        return da - db;
    });

    const alerts = products
        .map(p => ({ p, exp: _earliestExpiry(p) }))
        .filter(x => x.exp)
        .map(x => ({ p: x.p, d: window.daysUntil(x.exp) }))
        .filter(x => x.d <= 3)
        .sort((a, b) => a.d - b.d);

    const alertsHTML = alerts.length === 0 ? '' : `
        <div class="alert">
            <span class="ico">${window.icon('alert')}</span>
            <div>
                <div class="title">${alerts.length} producto${alerts.length > 1 ? 's' : ''} a punto de caducar</div>
                <div class="sub">
                    ${alerts.slice(0, 3).map((a, i) => {
                        const txt = a.d < 0 ? `caducó hace ${-a.d}d` : a.d === 0 ? 'hoy' : `en ${a.d}d`;
                        return `${i > 0 ? ' · ' : ''}<strong>${window.esc(a.p.name)}</strong> (${txt})`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    const tabsHTML = cats.map(c => `
        <button class="pantry-tab" aria-pressed="${pantryCat === c.id}" data-cat="${c.id}">
            ${window.icon(c.ico)}
            ${c.name}
            <span class="count">${countIn(c.id)}</span>
        </button>
    `).join('');

    const itemsHTML = filtered.map(p => {
        const exp = _earliestExpiry(p);
        const d = window.daysUntil(exp);
        const expCls = !exp ? '' : d < 0 ? 'bad' : d <= 3 ? 'warn' : '';
        const expTxt = !exp ? 'sin caducidad' : d < 0 ? `caducado hace ${-d}d` : d === 0 ? 'caduca hoy' : d === Infinity ? '' : `caduca en ${d}d`;
        const unit = p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g');
        const isLow = p.min_stock != null && (p.stock || 0) < p.min_stock;

        // Stock quantity: show location-specific qty when on a specific tab
        const stockByLoc = _stockByLocation(p);
        const stockNum = pantryCat === 'todas' ? (p.stock || 0) : (stockByLoc.get(pantryCat) || 0);
        const stockRounded = stockNum % 1 === 0 ? stockNum : Math.round(stockNum * 10) / 10;
        const stockDisplay = stockRounded;

        return `
            <div class="stock-item">
                <div class="stock-ico">${p.image_url ? `<img src="${window.esc(p.image_url)}" alt="">` : '📦'}</div>
                <div>
                    <div class="stock-name">${window.esc(p.name)}${p.tracking_mode === 'scale' ? `<span title="Controlado por báscula (umbral ${p.scale_min_delta_g ?? 10}g)" style="color:var(--primary); display:inline-flex; vertical-align:middle; margin-left:6px; width:16px; height:16px">${window.icon('scale')}</span>` : ''}${isLow ? `<span title="Stock bajo (mínimo: ${p.min_stock})" style="color:var(--carbs); display:inline-flex; vertical-align:middle; margin-left:6px; width:16px; height:16px">${window.icon('alert')}</span>` : ''}</div>
                </div>
                <div class="row" style="gap:10px">
                    ${exp ? `<span class="exp-pill ${expCls}">${expTxt}</span>` : ''}
                    <div class="qty-pill">
                        <button data-qty="-1" data-barcode="${window.esc(p.barcode)}">−</button>
                        <input class="qty-input" type="number" step="any" min="0" inputmode="decimal" value="${stockDisplay}" data-barcode="${window.esc(p.barcode)}" data-current="${stockNum}"/>
                        <span class="qty-unit">${unit}</span>
                        <button data-qty="1" data-barcode="${window.esc(p.barcode)}">+</button>
                    </div>
                </div>
                <div class="row" style="gap:4px">
                    <button class="btn icon sm ghost" data-action="edit" data-barcode="${window.esc(p.barcode)}" title="Editar">${window.icon('edit')}</button>
                    <button class="btn icon sm ghost" data-action="delete" data-barcode="${window.esc(p.barcode)}" title="Quitar">${window.icon('trash')}</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Inventario · ${products.length} productos</div>
                <h1 class="page-title">Mi despensa</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn" data-page="scan">${window.icon('scan')} Escanear</button>
            </div>
        </div>

        ${alerts.length > 0 ? `<div style="margin-bottom:22px">${alertsHTML}</div>` : ''}

        <div class="row" style="gap:10px; margin-bottom:16px; flex-wrap:wrap">
            <div class="search" style="min-width:240px; flex:1; max-width:360px">
                ${window.icon('search')}
                <input id="pantry-search" placeholder="Buscar en mi despensa…" value="${window.esc(pantryQuery)}"/>
            </div>
        </div>

        <div class="pantry-cat-tabs">${tabsHTML}</div>

        <div class="card" style="padding:0">
            ${filtered.length === 0 ? `<div class="empty"><div class="t">Sin productos</div><div>Cambia el filtro o escanea uno nuevo.</div></div>` : itemsHTML}
        </div>
    `;
};

window.initPantry = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    root.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => window.gotoPage(btn.dataset.page));
    });

    const search = root.querySelector('#pantry-search');
    if (search) search.addEventListener('input', e => {
        pantryQuery = e.target.value;
        const q = e.target.value.toLowerCase();
        root.querySelectorAll('.stock-item').forEach(el => {
            const name = el.querySelector('.stock-name')?.textContent.toLowerCase() || '';
            el.style.display = !q || name.includes(q) ? '' : 'none';
        });
    });

    root.querySelectorAll('[data-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            pantryCat = btn.dataset.cat;
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-qty]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const delta = Number(btn.dataset.qty);
            const barcode = btn.dataset.barcode;
            const p = window.findProductById(barcode);
            if (!p) return;
            try {
                if (p.batches && p.batches.length > 0) {
                    await window.apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: delta, reason: delta < 0 ? 'removed' : 'added' });
                } else if (delta > 0) {
                    await window.apiCall(`/products/${barcode}/stock`, 'POST', { quantity: delta });
                } else {
                    window.showToast('Sin stock para quitar', 'info');
                    return;
                }
                await window.reloadProducts();
            } catch (e) {
                window.showToast('Error: ' + e.message, 'error');
            }
        });
    });

    root.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', async () => {
            const barcode = input.dataset.barcode;
            const oldVal = Number(input.dataset.current) || 0;
            const newVal = parseFloat(input.value);
            if (!Number.isFinite(newVal) || newVal < 0) {
                input.value = oldVal;
                return;
            }
            const delta = newVal - oldVal;
            if (delta === 0) return;
            const p = window.findProductById(barcode);
            if (!p) return;
            try {
                if (p.batches && p.batches.length > 0) {
                    await window.apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: delta, reason: delta < 0 ? 'removed' : 'added' });
                } else if (delta > 0) {
                    await window.apiCall(`/products/${barcode}/stock`, 'POST', { quantity: delta });
                } else {
                    window.showToast('Sin stock para quitar', 'info');
                    input.value = oldVal;
                    return;
                }
                await window.reloadProducts();
            } catch (e) {
                window.showToast('Error: ' + e.message, 'error');
                input.value = oldVal;
            }
        });
    });

    root.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => window.openEditProduct(btn.dataset.barcode));
    });

    root.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const barcode = btn.dataset.barcode;
            const ok = await window.confirmDialog('¿Eliminar este producto del inventario?');
            if (!ok) return;
            try {
                await window.apiCall(`/products/${barcode}`, 'DELETE');
                await window.reloadProducts();
                window.showToast('Producto eliminado', 'success');
            } catch (e) {
                window.showToast('Error: ' + e.message, 'error');
            }
        });
    });

    // Live refresh: poll every 20s while on this page; also refresh immediately
    // when the tab regains visibility. This is what surfaces scale-driven stock
    // updates without forcing the user to navigate away and back.
    if (pantryData.pollTimer) clearInterval(pantryData.pollTimer);
    pantryData.pollTimer = setInterval(() => {
        if (window.AppState.page !== 'pantry') {
            clearInterval(pantryData.pollTimer);
            pantryData.pollTimer = null;
            return;
        }
        _pantryRefresh();
    }, PANTRY_POLL_MS);

    if (pantryData.visibilityHandler) {
        document.removeEventListener('visibilitychange', pantryData.visibilityHandler);
    }
    pantryData.visibilityHandler = () => {
        if (!document.hidden && window.AppState.page === 'pantry') _pantryRefresh();
    };
    document.addEventListener('visibilitychange', pantryData.visibilityHandler);
};

window.openEditProduct = function(barcode) {
    const p = window.findProductById(barcode);
    if (!p) return;
    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    const unitLabel = p.unit_type === 'ml' ? '100 ml' : p.unit_type === 'uds' ? 'ud' : '100 g';
    const round2 = v => v == null ? '' : Math.round(Number(v) * 100) / 100;

    mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1" style="max-height:80vh; overflow-y:auto">
                <div class="spread" style="margin-bottom:16px">
                    <div>
                        <div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:.05em">Editar producto</div>
                        <h3 style="margin:2px 0 0; font-size:18px; font-weight:600">${window.esc(p.name)}</h3>
                    </div>
                    <button class="btn icon sm ghost" data-action="close" aria-label="Cerrar">${window.icon('close')}</button>
                </div>
                <div class="stack" style="gap:14px">
                    <div>
                        <div class="field-label" style="font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:10px">Lotes</div>
                        ${(p.batches && p.batches.length > 0) ? p.batches.map(b => {
                            const bQtyDisplay = (b.quantity || 0) % 1 === 0 ? b.quantity : Number(b.quantity).toFixed(2).replace(/\.?0+$/, '');
                            const bUnit = p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g');
                            const bLoc = b.location || '';
                            const bExp = b.expiry_date || '';
                            const bPrice = b.last_price != null ? Number(b.last_price).toFixed(2) : '';
                            return `
                            <div class="batch-row" data-batch-id="${b.id}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap">
                                <span class="muted" style="font-size:12px; min-width:60px">${bQtyDisplay} ${bUnit}</span>
                                <div class="field" style="flex:1; min-width:120px; margin:0">
                                    <label class="field-label">Caducidad</label>
                                    <input type="date" class="input batch-exp" style="font-size:13px" value="${window.esc(bExp)}" data-batch-id="${b.id}"/>
                                </div>
                                <div class="field" style="flex:1; min-width:120px; margin:0">
                                    <label class="field-label">Ubicación</label>
                                    <select class="input batch-loc" style="font-size:13px" data-batch-id="${b.id}">
                                        <option value="" ${!bLoc ? 'selected' : ''}>Sin ubicación</option>
                                        <option value="Nevera" ${bLoc === 'Nevera' ? 'selected' : ''}>Nevera</option>
                                        <option value="Congelador" ${bLoc === 'Congelador' ? 'selected' : ''}>Congelador</option>
                                        <option value="Despensa" ${bLoc === 'Despensa' ? 'selected' : ''}>Despensa</option>
                                        <option value="Otros" ${bLoc === 'Otros' ? 'selected' : ''}>Otros</option>
                                    </select>
                                </div>
                                <div class="field" style="flex:0 1 110px; min-width:90px; margin:0">
                                    <label class="field-label">Precio (€/pack)</label>
                                    <input type="number" inputmode="decimal" step="0.01" min="0" class="input num batch-price" style="font-size:13px" placeholder="—" value="${bPrice}" data-batch-id="${b.id}" data-original="${bPrice}"/>
                                </div>
                            </div>`;
                        }).join('') : `<div class="muted" style="font-size:13px">Sin lotes registrados</div>`}
                    </div>

                    <details style="border-top:1px solid var(--border); padding-top:12px">
                        <summary style="cursor:pointer; font-weight:600; font-size:13px; padding:4px 0">Macros (por ${unitLabel})</summary>
                        <div class="grid cols-2 keep" style="gap:10px; margin-top:10px">
                            <div class="field">
                                <label class="field-label">Energía (kcal)</label>
                                <input id="ep-kcal" class="input num" type="number" step="0.01" placeholder="ej. 350" value="${round2(p.kcal_100g)}"/>
                            </div>
                            <div class="field">
                                <label class="field-label">Proteína (g)</label>
                                <input id="ep-prot" class="input num" type="number" step="0.01" placeholder="ej. 25" value="${round2(p.proteins_100g)}"/>
                            </div>
                            <div class="field">
                                <label class="field-label">Carbohidratos (g)</label>
                                <input id="ep-carbs" class="input num" type="number" step="0.01" placeholder="ej. 40" value="${round2(p.carbs_100g)}"/>
                            </div>
                            <div class="field">
                                <label class="field-label">Grasas (g)</label>
                                <input id="ep-fat" class="input num" type="number" step="0.01" placeholder="ej. 10" value="${round2(p.fat_100g)}"/>
                            </div>
                        </div>
                    </details>

                    <details style="border-top:1px solid var(--border); padding-top:12px">
                        <summary style="cursor:pointer; font-weight:600; font-size:13px; padding:4px 0">Ajustes avanzados</summary>
                        <div class="stack" style="gap:12px; margin-top:10px">
                            <div class="field">
                                <label class="field-label">Ubicación por defecto</label>
                                <input id="ep-loc" class="input" placeholder="Nevera, Despensa…" value="${window.esc(p.location || '')}"/>
                                <div class="muted" style="font-size:11px; margin-top:4px">Se usa cuando un lote no tiene su propia ubicación.</div>
                            </div>
                            <div class="field">
                                <label class="field-label">Nombre</label>
                                <input id="ep-name" class="input" value="${window.esc(p.name)}"/>
                            </div>
                            <div class="grid cols-2 keep" style="gap:10px">
                                <div class="field">
                                    <label class="field-label">Categoría</label>
                                    <select id="ep-cat" class="input">
                                        ${['Alimentos','Bebidas','Limpieza','Higiene','Otros'].map(c =>
                                            `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div class="field">
                                    <label class="field-label">Stock mínimo</label>
                                    <input id="ep-min" class="input num" type="number" step="0.1" value="${p.min_stock ?? ''}"/>
                                </div>
                                <div class="field">
                                    <label class="field-label">Unidad</label>
                                    <select id="ep-unit" class="input">
                                        <option value="g" ${p.unit_type === 'g' ? 'selected' : ''}>Gramos (g)</option>
                                        <option value="ml" ${p.unit_type === 'ml' ? 'selected' : ''}>Mililitros (ml)</option>
                                        <option value="uds" ${p.unit_type === 'uds' ? 'selected' : ''}>Unidades</option>
                                    </select>
                                </div>
                                <div class="field">
                                    <label class="field-label">Peso por unidad / paquete (g)</label>
                                    <input id="ep-weight" class="input num" type="number" step="0.1" placeholder="ej. 200" value="${p.weight_g ?? ''}"/>
                                </div>
                                <div class="field">
                                    <label class="field-label">Ración estándar</label>
                                    <input id="ep-serving" class="input num" type="number" step="0.1" placeholder="ej. 30" value="${p.serving_size ?? ''}"/>
                                </div>
                                ${p.tracking_mode === 'scale' ? `
                                <div class="field">
                                    <label class="field-label">Umbral báscula (g)</label>
                                    <input id="ep-scale-delta" class="input num" type="number" step="0.1" min="0" placeholder="10" value="${p.scale_min_delta_g ?? 10}"/>
                                </div>` : ''}
                            </div>
                            <div class="field">
                                <label class="field-label">URL de imagen</label>
                                <input id="ep-img" class="input" type="url" placeholder="https://…" value="${window.esc(p.image_url || '')}"/>
                            </div>
                        </div>
                    </details>
                </div>

                <div class="row" style="justify-content:flex-end; gap:8px; margin-top:20px">
                    <button class="btn ghost" data-action="close">Cancelar</button>
                    <button class="btn accent" data-action="save">Guardar cambios</button>
                </div>
            </div>
        </div>`;

    const close = () => { mount.innerHTML = ''; };
    mount.querySelector('[data-close]').addEventListener('click', e => {
        if (e.target.dataset.close === '1') close();
    });
    mount.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));

    // Batch fields: auto-save on blur
    async function _saveBatchField(batchId, payload) {
        try {
            await window.apiCall(`/batches/${batchId}`, 'PATCH', payload);
            await window.reloadProducts();
        } catch (e) {
            window.showToast('Error actualizando lote: ' + e.message, 'error');
        }
    }
    mount.querySelectorAll('.batch-exp').forEach(el => {
        el.addEventListener('change', async () => {
            const batchId = el.dataset.batchId;
            await _saveBatchField(batchId, { expiry_date: el.value || null });
        });
    });
    mount.querySelectorAll('.batch-loc').forEach(el => {
        el.addEventListener('change', async () => {
            const batchId = el.dataset.batchId;
            await _saveBatchField(batchId, { location: el.value || null });
        });
    });
    // Batch price is NOT auto-saved — it's deferred to the "Guardar cambios"
    // button so the user can nudge the value without each step polluting any
    // state. The button compares against data-original to know what to send.

    mount.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const name = mount.querySelector('#ep-name').value.trim();
        if (!name) { window.showToast('El nombre no puede estar vacío', 'error'); return; }
        const minVal    = mount.querySelector('#ep-min').value;
        const weightVal = mount.querySelector('#ep-weight').value;
        const servingVal= mount.querySelector('#ep-serving').value;
        const imgVal    = mount.querySelector('#ep-img').value.trim();
        const kcalVal   = mount.querySelector('#ep-kcal').value;
        const protVal   = mount.querySelector('#ep-prot').value;
        const carbsVal  = mount.querySelector('#ep-carbs').value;
        const fatVal    = mount.querySelector('#ep-fat').value;

        const numOrNull = v => v === '' ? null : Number(v);

        const payload = {
            name,
            location:      mount.querySelector('#ep-loc').value.trim() || null,
            category:      mount.querySelector('#ep-cat').value,
            min_stock:     numOrNull(minVal),
            unit_type:     mount.querySelector('#ep-unit').value,
        };
        if (weightVal  !== '') payload.weight_g      = Number(weightVal);
        if (servingVal !== '') payload.serving_size  = Number(servingVal);
        if (imgVal     !== '') payload.image_url     = imgVal;
        if (kcalVal    !== '') payload.kcal_100g     = Number(kcalVal);
        if (protVal    !== '') payload.proteins_100g = Number(protVal);
        if (carbsVal   !== '') payload.carbs_100g    = Number(carbsVal);
        if (fatVal     !== '') payload.fat_100g      = Number(fatVal);
        const scaleDeltaEl = mount.querySelector('#ep-scale-delta');
        if (scaleDeltaEl && scaleDeltaEl.value !== '') payload.scale_min_delta_g = Number(scaleDeltaEl.value);

        // Collect dirty batch-price inputs (compared against data-original).
        const priceUpdates = [];
        mount.querySelectorAll('.batch-price').forEach(el => {
            const raw = el.value.trim();
            const original = (el.dataset.original || '').trim();
            if (raw === original) return; // unchanged
            if (raw === '') return; // leaving empty = don't touch the batch
            const val = parseFloat(raw);
            if (!isFinite(val) || val < 0) {
                priceUpdates.push({ batchId: el.dataset.batchId, invalid: true });
                return;
            }
            priceUpdates.push({ batchId: el.dataset.batchId, value: val });
        });

        if (priceUpdates.some(u => u.invalid)) {
            window.showToast('Algún precio es inválido', 'error');
            return;
        }

        try {
            await window.apiCall(`/products/${barcode}`, 'PATCH', payload);
            for (const u of priceUpdates) {
                await window.apiCall(`/batches/${u.batchId}/price`, 'PATCH', {
                    unit_price: u.value,
                    source: 'manual',
                });
            }
            await window.reloadProducts();
            close();
            const priceNote = priceUpdates.length > 0 ? ` (${priceUpdates.length} precio${priceUpdates.length !== 1 ? 's' : ''})` : '';
            window.showToast(`Producto actualizado${priceNote}`, 'success');
        } catch (e) {
            window.showToast('Error: ' + e.message, 'error');
        }
    });
};
