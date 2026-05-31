/*
   View: Recipes — library + builder
   v0.8.8
*/

let recipesQuery = '';
let recipesFilter = 'todas';
let recipeBuilder = null;

function _emptyDraft() {
    return { name: '', serves: 1, time: 15, tags: [], meal_types: [], ingredients: [], output_product_id: null, output_qty: 1, default_expiry_days: null, fridge_expiry_days: null, freezer_expiry_days: null };
}

function _filterRecipes() {
    const all = window.AppState.recipes || [];
    const pantryIds = new Set((window.AppState.products || []).map(p => String(p.barcode)));
    return all.filter(r => {
        if (recipesQuery && !r.name.toLowerCase().includes(recipesQuery.toLowerCase())) return false;
        if (recipesFilter === 'rapidas' && (r.time || 0) > 15) return false;
        if (recipesFilter === 'proteina') {
            const m = window.recipeMacros(r);
            if (m.kcal === 0 || (m.p * 4) / m.kcal < 0.35) return false;
        }
        if (recipesFilter === 'despensa') {
            const has = (r.ingredients || []).every(ing => pantryIds.has(String(ing.productId)));
            if (!has) return false;
        }
        return true;
    });
}

window.renderRecipes = function() {
    if (recipeBuilder) return _renderBuilder();

    const filtered = _filterRecipes();
    const pantryIds = new Set((window.AppState.products || []).map(p => String(p.barcode)));

    const cards = filtered.map((r, i) => {
        const m = window.recipeMacros(r);
        const hasAll = (r.ingredients || []).every(ing => pantryIds.has(String(ing.productId)));
        return `
            <div class="recipe-card" data-rid="${window.esc(r.id)}">
                <div class="recipe-thumb">${window.recipeThumbHTML(i, `receta · ${r.time || '?'} min`)}</div>
                <div class="recipe-body">
                    <h3 class="recipe-title">${window.esc(r.name)}</h3>
                    <div class="recipe-meta">
                        <span>${r.time || '?'} min</span>
                        <span>·</span>
                        <span>${r.serves || 1} ración${(r.serves || 1) > 1 ? 'es' : ''}</span>
                        <span>·</span>
                        <span>${(r.ingredients || []).length} ingredientes</span>
                    </div>
                    <div class="recipe-macros">${window.macroChipsHTML(m, true)}</div>
                    <div class="row" style="margin-top:12px; gap:6px; flex-wrap:wrap">
                        ${(r.tags || []).map(t => `<span class="chip dot">${window.esc(t)}</span>`).join('')}
                        ${hasAll ? `<span class="chip good">✓ Tengo todo</span>` : ''}
                    </div>
                    <div class="row" style="margin-top:12px; justify-content:flex-end; gap:6px">
                        <button class="btn sm accent" data-make="${window.esc(r.id)}">🍳 Hacer</button>
                        <button class="btn sm ghost" data-edit="${window.esc(r.id)}">${window.icon('edit')}</button>
                        <button class="btn sm ghost" data-delete-recipe="${window.esc(r.id)}">${window.icon('trash')}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Biblioteca</div>
                <h1 class="page-title">Recetas</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn accent" data-action="new">${window.icon('plus')} Nueva receta</button>
            </div>
        </div>

        <div class="row" style="gap:10px; margin-bottom:18px; flex-wrap:wrap">
            <div class="search" style="min-width:280px; flex:1; max-width:420px">
                ${window.icon('search')}
                <input id="r-search" placeholder="Buscar receta…" value="${window.esc(recipesQuery)}"/>
            </div>
            <div class="seg-scroll">
                <div class="seg">
                    <button aria-pressed="${recipesFilter === 'todas'}" data-filter="todas">Todas</button>
                    <button aria-pressed="${recipesFilter === 'rapidas'}" data-filter="rapidas">≤ 15 min</button>
                    <button aria-pressed="${recipesFilter === 'proteina'}" data-filter="proteina">Alto en proteína</button>
                    <button aria-pressed="${recipesFilter === 'despensa'}" data-filter="despensa">Con mi despensa</button>
                </div>
            </div>
        </div>

        <div class="grid cols-3 recipes-grid" style="gap:18px">
            ${cards}
            ${filtered.length === 0 ? `<div class="card empty" style="grid-column:1 / -1"><div class="t">Ninguna receta encaja</div><div>Prueba otro filtro o crea una nueva.</div></div>` : ''}
        </div>
    `;
};

function _renderBuilder() {
    const d = recipeBuilder;
    const totals = window.sumMacros(d.ingredients);
    const serves = Math.max(1, d.serves || 1);
    const perServe = {
        kcal: totals.kcal / serves,
        p:    totals.p / serves,
        c:    totals.c / serves,
        fat:  totals.fat / serves,
    };

    const ingredientsHTML = d.ingredients.map((ing, i) => {
        const p = window.findProductById(ing.productId);
        const name = p ? p.name : `Producto ${ing.productId}`;
        const unit = p ? (p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g')) : 'g';
        const m = window.macrosFor(ing.productId, ing.qty);
        return `
            <div class="food-row">
                <div class="row">
                    <span style="font-size:20px; margin-right:10px;">🍽️</span>
                    <div>
                        <div class="ttl">${window.esc(name)}</div>
                        <div class="sub muted">${Math.round(m.kcal)} kcal · P${Math.round(m.p)} C${Math.round(m.c)} G${Math.round(m.fat)}</div>
                    </div>
                </div>
                <div class="row" style="gap:6px">
                    <input class="input num" style="width:80px; font-size:13px" type="number" value="${ing.qty}" data-ing-qty="${i}"/>
                    <span class="tiny" style="width:28px">${unit}</span>
                </div>
                <button class="btn icon sm ghost" data-ing-remove="${i}" title="Quitar">${window.icon('trash')}</button>
            </div>
        `;
    }).join('');

    const outputProduct = d.output_product_id ? window.findProductById(d.output_product_id) : null;
    const outputName = outputProduct ? outputProduct.name : null;
    const outputUnit = outputProduct ? (outputProduct.unit_type === 'uds' ? 'ud' : (outputProduct.unit_type || 'ud')) : 'ud';
    const autoName = d.name.trim() || 'tu receta';

    const linkBlock = outputName ? `
        <div class="card sunken" style="padding:10px 14px; display:flex; align-items:center; gap:10px; margin-bottom:10px">
            <span style="font-size:18px">📦</span>
            <div style="flex:1">
                <div style="font-size:13px; font-weight:600">${window.esc(outputName)}</div>
                <div class="muted" style="font-size:11px">producto vinculado manualmente</div>
            </div>
            <button class="btn icon sm ghost" data-action="clear-output" title="Desvincular">✕</button>
        </div>
    ` : `
        <div class="card sunken" style="padding:10px 14px; display:flex; align-items:center; gap:10px; margin-bottom:10px">
            <span style="font-size:18px">✨</span>
            <div style="flex:1">
                <div style="font-size:13px; font-weight:600">Se creará «${window.esc(autoName)}»</div>
                <div class="muted" style="font-size:11px">la primera vez que la hagas se generará un artículo en tu despensa</div>
            </div>
        </div>
    `;

    const fridgeVal = (d.fridge_expiry_days === 0 || d.fridge_expiry_days) ? d.fridge_expiry_days : '';
    const freezerVal = (d.freezer_expiry_days === 0 || d.freezer_expiry_days) ? d.freezer_expiry_days : '';

    const outputHTML = `
        <div style="margin-top:18px; padding-top:16px; border-top:1px solid var(--border)">
            <div class="card-title" style="margin-bottom:10px">Al hacer la receta</div>
            ${linkBlock}
            <div class="grid cols-2" style="gap:12px">
                <div class="field">
                    <label class="field-label">Unidades producidas${outputName ? ` (${outputUnit})` : ''}</label>
                    <input id="rb-output-qty" class="input num" type="number" min="0" step="0.1" value="${d.output_qty || 0}"/>
                </div>
            </div>
            <div class="grid cols-2" style="gap:12px; margin-top:12px">
                <div class="field">
                    <label class="field-label">Caducidad en nevera (días)</label>
                    <input id="rb-fridge-days" class="input num" type="number" min="0" step="1" value="${fridgeVal}" placeholder="ej. 4"/>
                </div>
                <div class="field">
                    <label class="field-label">Caducidad en congelador (días)</label>
                    <input id="rb-freezer-days" class="input num" type="number" min="0" step="1" value="${freezerVal}" placeholder="ej. 60"/>
                </div>
            </div>
            <div class="muted" style="font-size:11px; margin-top:6px">
                Al hacer la receta elegirás dónde guardarlo y se usará la caducidad correspondiente. Déjalo en blanco para no fijar caducidad.
            </div>

            <details style="margin-top:14px">
                <summary class="muted" style="font-size:12px; cursor:pointer">Avanzado: vincular a un producto existente</summary>
                <div style="margin-top:8px">
                    <button class="btn sm" data-action="pick-output">${outputName ? 'Cambiar producto' : 'Elegir producto…'}</button>
                    <div class="muted" style="font-size:11px; margin-top:6px">
                        Si vinculás un producto, el stock se sumará a ese en vez de a uno autogenerado.
                    </div>
                </div>
            </details>
        </div>
    `;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">${d._editing ? 'Editar receta' : 'Crear receta'}</div>
                <h1 class="page-title">${d._editing ? d.name || 'Receta' : 'Nueva receta'}</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="cancel">Cancelar</button>
                <button class="btn accent" data-action="save-recipe">Guardar receta</button>
            </div>
        </div>

        <div class="grid cols-2 layout-panel-r" style="gap:22px">
            <div class="card">
                <div class="stack" style="gap:12px; margin-bottom:18px">
                    <div class="field">
                        <label class="field-label">Nombre</label>
                        <input id="rb-name" class="input" placeholder="Ej. Bowl de pollo y arroz" value="${window.esc(d.name)}"/>
                    </div>
                    <div class="grid cols-2" style="gap:12px">
                        <div class="field">
                            <label class="field-label">Raciones</label>
                            <input id="rb-serves" class="input num" type="number" min="1" value="${d.serves}"/>
                        </div>
                        <div class="field">
                            <label class="field-label">Tiempo (min)</label>
                            <input id="rb-time" class="input num" type="number" min="0" value="${d.time}"/>
                        </div>
                    </div>
                    <div class="field">
                        <label class="field-label">Etiquetas</label>
                        <input id="rb-tags" class="input" placeholder="post-entreno, vegetariano…" value="${window.esc((d.tags || []).join(', '))}"/>
                    </div>
                    <div class="field">
                        <label class="field-label">Para qué comida</label>
                        <div class="row" id="rb-meal-types" style="gap:6px; flex-wrap:wrap">
                            ${['desayuno','almuerzo','comida','merienda','cena','snacks'].map(mt => {
                                const on = (d.meal_types || []).includes(mt);
                                const label = { desayuno:'Desayuno', almuerzo:'Almuerzo', comida:'Comida', merienda:'Merienda', cena:'Cena', snacks:'Snacks' }[mt];
                                return `<button type="button" class="chip ${on ? 'chip-on' : ''}" data-meal-type="${mt}">${label}</button>`;
                            }).join('')}
                        </div>
                        <div class="muted" style="font-size:11px; margin-top:4px">El generador semanal usará esto para sugerir la receta en esas comidas.</div>
                    </div>
                </div>

                <div class="spread" style="margin-bottom:10px">
                    <div class="card-title">Ingredientes</div>
                    <button class="btn sm" data-action="add-ing">${window.icon('plus')} Añadir</button>
                </div>

                ${d.ingredients.length === 0 ? `<div class="empty"><div class="t">Sin ingredientes</div><div>Empieza añadiendo el primero.</div></div>` : ingredientsHTML}

                ${outputHTML}
            </div>

            <div class="stack" id="rb-macros" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">Por ración</div>
                        <span class="card-sub">${d.serves} raciones</span>
                    </div>
                    <div style="display:flex; justify-content:center; padding:8px 0 14px">
                        ${window.macroRingHTML(perServe.kcal, Math.max(perServe.kcal, 500), perServe.p, perServe.c, perServe.fat, 180, 14)}
                    </div>
                    ${window.macroBarsHTML(perServe, { kcal: Math.max(Math.round(perServe.kcal), 1), p: Math.max(Math.round(perServe.p), 1), c: Math.max(Math.round(perServe.c), 1), fat: Math.max(Math.round(perServe.fat), 1) })}
                </div>
                <div class="card sunken">
                    <div class="card-title" style="margin-bottom:6px">Receta completa</div>
                    <div class="muted" style="font-size:12px; margin-bottom:8px">Total para ${d.serves} ración${d.serves > 1 ? 'es' : ''}</div>
                    ${window.macroChipsHTML(totals)}
                </div>
            </div>
        </div>
    `;
}

function _refreshMacros() {
    const d = recipeBuilder;
    if (!d) return;
    const panel = document.getElementById('rb-macros');
    if (!panel) return;
    const totals = window.sumMacros(d.ingredients);
    const serves = Math.max(1, d.serves || 1);
    const perServe = {
        kcal: totals.kcal / serves,
        p:    totals.p / serves,
        c:    totals.c / serves,
        fat:  totals.fat / serves,
    };
    panel.innerHTML = `
        <div class="card">
            <div class="card-head">
                <div class="card-title">Por ración</div>
                <span class="card-sub">${serves} raciones</span>
            </div>
            <div style="display:flex; justify-content:center; padding:8px 0 14px">
                ${window.macroRingHTML(perServe.kcal, Math.max(perServe.kcal, 500), perServe.p, perServe.c, perServe.fat, 180, 14)}
            </div>
            ${window.macroBarsHTML(perServe, { kcal: Math.max(Math.round(perServe.kcal), 1), p: Math.max(Math.round(perServe.p), 1), c: Math.max(Math.round(perServe.c), 1), fat: Math.max(Math.round(perServe.fat), 1) })}
        </div>
        <div class="card sunken">
            <div class="card-title" style="margin-bottom:6px">Receta completa</div>
            <div class="muted" style="font-size:12px; margin-bottom:8px">Total para ${serves} ración${serves > 1 ? 'es' : ''}</div>
            ${window.macroChipsHTML(totals)}
        </div>
    `;
}

function _autoBarcodeFor(recipeId) {
    return `rcp-${recipeId}`;
}

function _expiryFromDays(days) {
    if (days === null || days === undefined || days === '') return null;
    const n = Number(days);
    if (Number.isNaN(n) || n < 0) return null;
    const dt = new Date(); dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
}

async function _ensureOutputProduct(r) {
    const outputQty = Number(r.output_qty) || 0;
    if (outputQty <= 0) return null;

    const linked = r.output_product_id ? window.findProductById(r.output_product_id) : null;
    if (linked) return r.output_product_id;

    // Manual link that no longer exists → fail loudly
    if (r.output_product_id && !r.output_product_id.startsWith(`rcp-${r.id}`)) {
        window.showToast('El producto vinculado ya no existe', 'error');
        return null;
    }

    // (Re)create autogenerated product
    const barcode = _autoBarcodeFor(r.id);
    const totals = window.sumMacros(r.ingredients || []);
    const per = {
        kcal: totals.kcal / outputQty,
        p:    totals.p / outputQty,
        c:    totals.c / outputQty,
        fat:  totals.fat / outputQty,
    };
    try {
        await window.apiCall('/products', 'POST', {
            barcode,
            name: r.name,
            category: 'Recetas',
            unit_type: 'uds',
            min_stock: 0,
            weight_g: 100,
            kcal_100g: per.kcal,
            proteins_100g: per.p,
            carbs_100g: per.c,
            fat_100g: per.fat,
        });
    } catch (e) {
        const m = String(e.message || '').toLowerCase();
        if (!m.includes('already') && !m.includes('exist')) {
            window.showToast('No se pudo crear el artículo: ' + e.message, 'error');
            return null;
        }
    }

    if (!r.output_product_id) {
        try {
            await window.apiCall(`/recipes/${r.id}`, 'PUT', window._recipeToApi({ ...r, output_product_id: barcode }));
        } catch (e) {
            console.warn('No se pudo guardar el vínculo en la receta', e);
        }
    }
    return barcode;
}

async function _makeRecipe(r) {
    const ingredients = r.ingredients || [];
    if (ingredients.length === 0) {
        window.showToast('Esta receta no tiene ingredientes', 'error');
        return;
    }

    window.openMakeRecipeDialog({
        recipe: r,
        onConfirm: async ({ qty, storage }) => {
            const baseQty = (Number(r.output_qty) > 0) ? Number(r.output_qty) : (r.serves || 1);
            const ratio = qty / baseQty;
            if (ratio <= 0) {
                window.showToast('La cantidad debe ser mayor a 0', 'error');
                return;
            }

            // Soft warning if any ingredient is short (non-blocking)
            const short = [];
            for (const ing of ingredients) {
                const p = window.findProductById(ing.productId);
                if (!p) continue;
                if ((p.stock || 0) < ing.qty * ratio) short.push(p.name);
            }
            if (short.length > 0) {
                window.showToast(`Stock insuficiente: ${short.join(', ')}`, 'warn');
            }

            // Deduct ingredients
            for (const ing of ingredients) {
                const p = window.findProductById(ing.productId);
                if (!p) continue;
                const needed = ing.qty * ratio;
                try {
                    await window.apiCall(`/products/${p.barcode}/stock`, 'POST', { quantity: -needed, reason: 'recipe' });
                } catch (e) {
                    window.showToast(`Error descontando ${p.name}`, 'error');
                }
            }

            // Add output product if configured
            const outputQty = Number(r.output_qty) || 0;
            if (outputQty > 0) {
                const outputProduced = outputQty * ratio;
                let expiryDays = null;
                if (storage === 'freezer') {
                    expiryDays = r.freezer_expiry_days != null ? r.freezer_expiry_days : r.default_expiry_days;
                } else {
                    expiryDays = r.fridge_expiry_days != null ? r.fridge_expiry_days : r.default_expiry_days;
                }
                const outputBarcode = await _ensureOutputProduct(r);
                if (outputBarcode) {
                    try {
                        await window.apiCall(`/products/${outputBarcode}/stock`, 'POST', {
                            quantity: outputProduced,
                            expiry_date: _expiryFromDays(expiryDays),
                        });
                    } catch (e) {
                        window.showToast('Error añadiendo resultado al stock', 'error');
                    }
                    const locationLabel = storage === 'freezer' ? 'Congelador' : 'Nevera';
                    try {
                        await window.apiCall(`/products/${outputBarcode}`, 'PATCH', { location: locationLabel });
                    } catch (e) {
                        console.warn('Could not set product location', e);
                    }
                }
            }

            if (window.reloadProducts) await window.reloadProducts();
            if (window.reloadRecipes) await window.reloadRecipes();
            window.showToast(`"${r.name}" lista. Stock actualizado.`, 'success');
        }
    });
}

window.initRecipes = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    if (recipeBuilder) {
        _wireBuilder(root);
        return;
    }

    const search = root.querySelector('#r-search');
    if (search) search.addEventListener('input', e => { recipesQuery = e.target.value; window.renderPage(); });

    root.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            recipesFilter = btn.dataset.filter;
            window.renderPage();
        });
    });

    root.querySelector('[data-action="new"]')?.addEventListener('click', () => {
        recipeBuilder = _emptyDraft();
        window.renderPage();
    });

    root.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.edit;
            const r = (window.AppState.recipes || []).find(x => String(x.id) === String(id));
            if (!r) return;
            recipeBuilder = Object.assign(_emptyDraft(), JSON.parse(JSON.stringify(r)));
            recipeBuilder._editing = true;
            // Legacy migration: if no fridge_expiry_days but default_expiry_days is set, pre-fill fridge
            if (recipeBuilder.fridge_expiry_days == null && recipeBuilder.default_expiry_days != null) {
                recipeBuilder.fridge_expiry_days = recipeBuilder.default_expiry_days;
            }
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-delete-recipe]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.deleteRecipe;
            const ok = await window.confirmDialog('¿Eliminar receta?');
            if (!ok) return;
            try {
                await window.apiCall(`/recipes/${id}`, 'DELETE');
                await window.reloadRecipes();
                window.renderPage();
            } catch (e) {
                window.showToast('Error eliminando receta', 'error');
            }
        });
    });

    root.querySelectorAll('[data-make]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.make;
            const r = (window.AppState.recipes || []).find(x => String(x.id) === String(id));
            if (!r) return;
            await _makeRecipe(r);
        });
    });
};

function _wireBuilder(root) {
    const d = recipeBuilder;

    function bind(id, key, parse) {
        const el = root.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', e => {
            d[key] = parse ? parse(e.target.value) : e.target.value;
        });
    }
    bind('rb-name', 'name');
    bind('rb-time', 'time', v => Math.max(0, parseInt(v) || 0));

    const tagsEl = root.querySelector('#rb-tags');
    if (tagsEl) tagsEl.addEventListener('input', e => {
        d.tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    });

    root.querySelectorAll('[data-meal-type]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const mt = btn.dataset.mealType;
            d.meal_types = d.meal_types || [];
            if (d.meal_types.includes(mt)) {
                d.meal_types = d.meal_types.filter(x => x !== mt);
            } else {
                d.meal_types.push(mt);
            }
            btn.classList.toggle('chip-on');
        });
    });

    // Serves updates model + refreshes macros panel without re-render
    const servesEl = root.querySelector('#rb-serves');
    if (servesEl) servesEl.addEventListener('input', e => {
        d.serves = Math.max(1, parseInt(e.target.value) || 1);
        _refreshMacros();
    });

    // Qty changes update model + refresh macros only — no full re-render (fixes focus loss)
    root.querySelectorAll('[data-ing-qty]').forEach(el => {
        el.addEventListener('input', e => {
            const i = Number(el.dataset.ingQty);
            d.ingredients[i].qty = Math.max(0, Number(e.target.value) || 0);
            _refreshMacros();
        });
    });

    root.querySelectorAll('[data-ing-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = Number(btn.dataset.ingRemove);
            d.ingredients.splice(i, 1);
            window.renderPage();
        });
    });

    root.querySelector('[data-action="add-ing"]')?.addEventListener('click', () => {
        window.openFoodPicker({
            title: 'Añadir ingrediente',
            onPick: (item) => {
                d.ingredients.push({ productId: item.productId, qty: item.qty });
                window.renderPage();
            }
        });
    });

    root.querySelector('[data-action="pick-output"]')?.addEventListener('click', () => {
        window.openFoodPicker({
            title: 'Producto resultado',
            onPick: (item) => {
                d.output_product_id = item.productId;
                window.renderPage();
            }
        });
    });

    root.querySelector('[data-action="clear-output"]')?.addEventListener('click', () => {
        d.output_product_id = null;
        window.renderPage();
    });

    const outputQtyEl = root.querySelector('#rb-output-qty');
    if (outputQtyEl) outputQtyEl.addEventListener('input', e => {
        d.output_qty = Math.max(0, Number(e.target.value) || 0);
    });

    const fridgeDaysEl = root.querySelector('#rb-fridge-days');
    if (fridgeDaysEl) fridgeDaysEl.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '' || v === null || v === undefined) {
            d.fridge_expiry_days = null;
        } else {
            const n = parseInt(v, 10);
            d.fridge_expiry_days = Number.isNaN(n) || n < 0 ? null : n;
        }
    });

    const freezerDaysEl = root.querySelector('#rb-freezer-days');
    if (freezerDaysEl) freezerDaysEl.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '' || v === null || v === undefined) {
            d.freezer_expiry_days = null;
        } else {
            const n = parseInt(v, 10);
            d.freezer_expiry_days = Number.isNaN(n) || n < 0 ? null : n;
        }
    });

    root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        recipeBuilder = null;
        window.renderPage();
    });

    root.querySelector('[data-action="save-recipe"]')?.addEventListener('click', async () => {
        if (!d.name.trim()) { window.showToast('Pon un nombre a la receta', 'error'); return; }
        if (d.ingredients.length === 0) { window.showToast('Añade al menos un ingrediente', 'error'); return; }

        try {
            if (d._editing) {
                await window.apiCall(`/recipes/${d.id}`, 'PUT', window._recipeToApi(d));
            } else {
                await window.apiCall('/recipes', 'POST', window._recipeToApi(d));
            }
            await window.reloadRecipes();
            window.showToast('Receta guardada', 'success');
            recipeBuilder = null;
            window.renderPage();
        } catch (e) {
            window.showToast('Error guardando receta: ' + e.message, 'error');
        }
    });
}
