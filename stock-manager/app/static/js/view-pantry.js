/*
   View: Pantry — Home Assistant API backed inventory
   v0.7.0
*/

let pantryCat = 'todas';
let pantryQuery = '';

function _locForProduct(p) {
    return (p.location || 'otros').toLowerCase();
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
        return products.filter(p => _locForProduct(p) === cid).length;
    }

    const filtered = products.filter(p => {
        if (pantryCat !== 'todas' && _locForProduct(p) !== pantryCat) return false;
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

    const low = products.filter(p => p.min_stock != null && (p.stock || 0) < p.min_stock);

    // Suggestable recipes: pantry has every ingredient
    const pantryIds = new Set(products.map(p => String(p.barcode)));
    const suggestable = (window.AppState.recipes || []).filter(r =>
        (r.ingredients || []).every(ing => pantryIds.has(String(ing.productId)))
    );

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

    const lowHTML = low.length === 0 ? '' : `
        <div class="alert" style="background:color-mix(in oklab, var(--carbs-soft) 60%, var(--bg) 40%); border-color:var(--carbs-soft)">
            <span class="ico" style="color:var(--carbs)">${window.icon('alert')}</span>
            <div>
                <div class="title">${low.length} producto${low.length > 1 ? 's' : ''} con stock bajo</div>
                <div class="sub">
                    ${low.slice(0, 3).map((p, i) => `${i > 0 ? ' · ' : ''}<strong>${window.esc(p.name)}</strong> (${p.stock || 0} ${p.unit_type || 'ud'})`).join('')}
                    · <a data-action="low-to-shopping" style="color:var(--ink); cursor:pointer; text-decoration:underline; text-underline-offset:3px">añadir a la compra</a>
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
        const stockNum = (p.stock || 0);
        const stockDisplay = stockNum % 1 === 0 ? stockNum : stockNum.toFixed(2).replace(/\.?0+$/, '');
        return `
            <div class="stock-item">
                <div class="stock-ico">${p.image_url ? `<img src="${window.esc(p.image_url)}" alt="">` : '📦'}</div>
                <div>
                    <div class="stock-name">${window.esc(p.name)}</div>
                    <div class="stock-sub">${(p.location || 'Sin ubicación').toUpperCase()} · ${p.kcal_100g ? `${p.kcal_100g} kcal/100${unit}` : 'sin macros'}</div>
                </div>
                <div class="row" style="gap:10px">
                    ${exp ? `<span class="exp-pill ${expCls}">${expTxt}</span>` : ''}
                    <div class="qty-pill">
                        <button data-qty="-1" data-barcode="${window.esc(p.barcode)}">−</button>
                        <span class="qty">${stockDisplay} ${unit}</span>
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

    const suggestHTML = suggestable.length === 0 ? `
        <div class="empty"><div class="t">Nada por ahora</div><div>Añade más productos para ver sugerencias.</div></div>
    ` : suggestable.slice(0, 5).map(r => {
        const m = window.recipeMacros(r);
        return `
            <div class="suggest">
                <div class="suggest-thumb">🍽️</div>
                <div>
                    <div class="suggest-title">${window.esc(r.name)}</div>
                    <div class="suggest-sub">
                        <span class="num">${Math.round(m.kcal)}</span> kcal · <span class="num">${Math.round(m.p)}g</span> P · ${r.time || '?'} min
                    </div>
                </div>
                <span class="suggest-fit">✓ Tengo todo</span>
            </div>
        `;
    }).join('');

    const countByLoc = (loc) => products.filter(p => _locForProduct(p) === loc).length;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Inventario · ${products.length} productos</div>
                <h1 class="page-title">Mi despensa</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn" data-page="scan">${window.icon('scan')} Escanear</button>
                <button class="btn ghost" data-action="reload">${window.icon('refresh')} Actualizar</button>
            </div>
        </div>

        ${(alerts.length > 0 || low.length > 0) ? `
        <div class="grid cols-2" style="margin-bottom:22px">
            ${alertsHTML}
            ${lowHTML}
        </div>` : ''}

        <div class="pantry-layout">
            <div>
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
            </div>

            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">${window.icon('sparkle')} Cocina con lo que tienes</div>
                        <span class="card-sub">${suggestable.length} recetas</span>
                    </div>
                    <div class="muted" style="font-size:12px; margin-bottom:8px">Recetas en las que tienes todos los ingredientes en casa.</div>
                    ${suggestHTML}
                </div>

                <div class="card sunken">
                    <div class="card-title" style="margin-bottom:10px">Resumen</div>
                    <div class="grid cols-3" style="gap:12px">
                        <div class="kpi"><div class="l">Nevera</div><div class="v">${countByLoc('nevera')}</div></div>
                        <div class="kpi"><div class="l">Congelador</div><div class="v">${countByLoc('congelador')}</div></div>
                        <div class="kpi"><div class="l">Despensa</div><div class="v">${countByLoc('despensa')}</div></div>
                    </div>
                </div>
            </div>
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

    root.querySelector('[data-action="reload"]')?.addEventListener('click', async () => {
        await window.reloadProducts();
        window.showToast('Inventario actualizado', 'success');
    });

    root.querySelector('[data-action="low-to-shopping"]')?.addEventListener('click', () => {
        const low = (window.AppState.products || []).filter(p => p.min_stock != null && (p.stock || 0) < p.min_stock);
        const newItems = low.map(p => ({
            id: 's' + Date.now() + '-' + p.barcode,
            name: p.name,
            qty: `${Math.max(1, (p.min_stock || 1) - (p.stock || 0))} ${p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g')}`,
            cat: p.category || 'Otros',
            auto: true,
            done: false,
        }));
        window.saveShopping(newItems.concat(window.AppState.shopping || []));
        window.showToast(`${newItems.length} productos añadidos a la lista`, 'success');
        window.gotoPage('shopping');
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
};

window.openEditProduct = function(barcode) {
    const p = window.findProductById(barcode);
    if (!p) return;
    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1">
                <div class="spread" style="margin-bottom:16px">
                    <h3 style="margin:0; font-size:18px; font-weight:600">Editar producto</h3>
                    <button class="btn icon sm ghost" data-action="close" aria-label="Cerrar">${window.icon('close')}</button>
                </div>
                <div class="stack" style="gap:12px">
                    <div class="field">
                        <label class="field-label">Nombre</label>
                        <input id="ep-name" class="input" value="${window.esc(p.name)}"/>
                    </div>
                    <div class="grid cols-2 keep" style="gap:10px">
                        <div class="field">
                            <label class="field-label">Ubicación</label>
                            <input id="ep-loc" class="input" placeholder="Nevera, Despensa…" value="${window.esc(p.location || '')}"/>
                        </div>
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
                    </div>
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

    mount.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const name = mount.querySelector('#ep-name').value.trim();
        if (!name) { window.showToast('El nombre no puede estar vacío', 'error'); return; }
        const minVal = mount.querySelector('#ep-min').value;
        try {
            await window.apiCall(`/products/${barcode}`, 'PATCH', {
                name,
                location: mount.querySelector('#ep-loc').value.trim() || null,
                category: mount.querySelector('#ep-cat').value,
                min_stock: minVal === '' ? null : Number(minVal),
                unit_type: mount.querySelector('#ep-unit').value,
            });
            await window.reloadProducts();
            close();
            window.showToast('Producto actualizado', 'success');
        } catch (e) {
            window.showToast('Error: ' + e.message, 'error');
        }
    });
};
