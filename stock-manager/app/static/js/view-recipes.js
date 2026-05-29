/*
   View: Recipes — library + builder
   v0.7.0
*/

let recipesQuery = '';
let recipesFilter = 'todas'; // todas | rapidas | proteina | despensa
let recipeBuilder = null; // null when not building, otherwise {name, serves, time, tags, ingredients[]}

function _emptyDraft() {
    return { name: '', serves: 1, time: 15, tags: [], ingredients: [] };
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
                    <input class="input num" style="width:80px; height:32px; font-size:13px" type="number" value="${ing.qty}" data-ing-qty="${i}"/>
                    <span class="tiny" style="width:28px">${unit}</span>
                </div>
                <button class="btn icon sm ghost" data-ing-remove="${i}" title="Quitar">${window.icon('trash')}</button>
            </div>
        `;
    }).join('');

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
                <div class="grid cols-3 keep-2" style="gap:12px; margin-bottom:18px">
                    <div class="field" style="grid-column:span 3">
                        <label class="field-label">Nombre</label>
                        <input id="rb-name" class="input" placeholder="Ej. Bowl de pollo y arroz" value="${window.esc(d.name)}"/>
                    </div>
                    <div class="field">
                        <label class="field-label">Raciones</label>
                        <input id="rb-serves" class="input num" type="number" min="1" value="${d.serves}"/>
                    </div>
                    <div class="field">
                        <label class="field-label">Tiempo (min)</label>
                        <input id="rb-time" class="input num" type="number" min="0" value="${d.time}"/>
                    </div>
                    <div class="field">
                        <label class="field-label">Etiquetas</label>
                        <input id="rb-tags" class="input" placeholder="post-entreno, vegetariano…" value="${window.esc((d.tags || []).join(', '))}"/>
                    </div>
                </div>

                <div class="spread" style="margin-bottom:10px">
                    <div class="card-title">Ingredientes</div>
                    <button class="btn sm" data-action="add-ing">${window.icon('plus')} Añadir</button>
                </div>

                ${d.ingredients.length === 0 ? `<div class="empty"><div class="t">Sin ingredientes</div><div>Empieza añadiendo el primero.</div></div>` : ingredientsHTML}
            </div>

            <div class="stack" style="gap:16px">
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
            const r = (window.AppState.recipes || []).find(x => x.id === id);
            if (!r) return;
            recipeBuilder = Object.assign(_emptyDraft(), JSON.parse(JSON.stringify(r)));
            recipeBuilder._editing = true;
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-delete-recipe]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.deleteRecipe;
            const ok = await window.confirmDialog('¿Eliminar receta?');
            if (!ok) return;
            const next = (window.AppState.recipes || []).filter(r => r.id !== id);
            window.saveRecipes(next);
            window.renderPage();
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
    bind('rb-serves', 'serves', v => Math.max(1, parseInt(v) || 1));
    bind('rb-time', 'time', v => Math.max(0, parseInt(v) || 0));
    const tagsEl = root.querySelector('#rb-tags');
    if (tagsEl) tagsEl.addEventListener('input', e => {
        d.tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    });

    root.querySelectorAll('[data-ing-qty]').forEach(el => {
        el.addEventListener('input', e => {
            const i = Number(el.dataset.ingQty);
            d.ingredients[i].qty = Math.max(0, Number(e.target.value) || 0);
            window.renderPage();
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

    root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        recipeBuilder = null;
        window.renderPage();
    });

    root.querySelector('[data-action="save-recipe"]')?.addEventListener('click', () => {
        if (!d.name.trim()) { window.showToast('Pon un nombre a la receta', 'error'); return; }
        if (d.ingredients.length === 0) { window.showToast('Añade al menos un ingrediente', 'error'); return; }

        const all = (window.AppState.recipes || []).slice();
        const saved = {
            id: d._editing ? d.id : 'r' + Date.now(),
            name: d.name.trim(),
            serves: d.serves,
            time: d.time,
            tags: d.tags || [],
            ingredients: d.ingredients,
        };
        if (d._editing) {
            const idx = all.findIndex(r => r.id === d.id);
            if (idx >= 0) all[idx] = saved; else all.unshift(saved);
        } else {
            all.unshift(saved);
        }
        window.saveRecipes(all);
        window.showToast('Receta guardada', 'success');
        recipeBuilder = null;
        window.renderPage();
    });
}
