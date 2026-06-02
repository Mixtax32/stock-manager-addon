/*
   Shared UI components — vanilla JS HTML builders
   v0.7.0
*/

// ===== Tiny HTML helper =====
window.esc = function(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// ===== MacroRing — multi-segment SVG ring =====
window.macroRingHTML = function(kcal, target, p, c, fat, size, stroke) {
    size = size || 220;
    stroke = stroke || 18;
    const r = (size - stroke) / 2;
    const C = 2 * Math.PI * r;
    const pct = target > 0 ? Math.min(kcal / target, 1) : 0;

    const kP = (p || 0) * 4, kC = (c || 0) * 4, kF = (fat || 0) * 9;
    const totalK = Math.max(kP + kC + kF, 1);
    const arcUsed = C * pct;
    const segP = arcUsed * (kP / totalK);
    const segC = arcUsed * (kC / totalK);
    const segF = arcUsed * (kF / totalK);

    const segments = [
        { len: segP, color: 'var(--protein)' },
        { len: segC, color: 'var(--carbs)' },
        { len: segF, color: 'var(--fat)' },
    ];

    let offset = 0;
    const segSVG = segments.map((s) => {
        const dash = `${s.len} ${C - s.len}`;
        const el = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" stroke-linecap="butt" style="transition: stroke-dasharray 280ms ease, stroke-dashoffset 280ms ease;"/>`;
        offset += s.len;
        return el;
    }).join('');

    return `
        <div class="ring-wrap" style="width:${size}px;height:${size}px">
            <svg width="${size}" height="${size}" style="transform: rotate(-90deg)">
                <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-sunken)" stroke-width="${stroke}"/>
                ${segSVG}
            </svg>
            <div class="ring-center">
                <div class="big">${Math.round(kcal || 0)}</div>
                <div class="lbl">de ${Math.round(target || 0)} kcal</div>
            </div>
        </div>
    `;
};

// ===== MacroBars =====
window.macroBarsHTML = function(totals, goals) {
    const rows = [
        { name: 'Calorías', val: totals.kcal || 0, goal: goals.kcal || 0, unit: 'kcal', color: 'var(--kcal)' },
        { name: 'Proteína', val: totals.p || 0,    goal: goals.p || 0,    unit: 'g',    color: 'var(--protein)' },
        { name: 'Carbos',   val: totals.c || 0,    goal: goals.c || 0,    unit: 'g',    color: 'var(--carbs)' },
        { name: 'Grasas',   val: totals.fat || 0,  goal: goals.fat || 0,  unit: 'g',    color: 'var(--fat)' },
    ];
    return `<div class="stack" style="gap:14px">` + rows.map(r => {
        const pct = r.goal > 0 ? Math.min((r.val / r.goal) * 100, 100) : 0;
        const over = r.val > r.goal;
        const overText = over ? `<span style="color:var(--warn); margin-left:6px">(+${Math.round(r.val - r.goal)})</span>` : '';
        return `
            <div class="macro-bar">
                <div class="name">${r.name}</div>
                <div class="track"><div class="fill" style="width:${pct}%; background:${r.color}"></div></div>
                <div class="vals"><strong>${Math.round(r.val)}</strong><span> / ${Math.round(r.goal)} ${r.unit}</span>${overText}</div>
            </div>
        `;
    }).join('') + `</div>`;
};

// ===== MacroChips =====
window.macroChipsHTML = function(totals, compact) {
    const kcal = Math.round(totals.kcal || 0);
    const p = Math.round(totals.p || 0);
    const c = Math.round(totals.c || 0);
    const fat = Math.round(totals.fat || 0);
    if (compact) {
        return `
            <div class="row" style="gap:6px">
                <span class="chip k">${kcal} kcal</span>
                <span class="chip p">P ${p}</span>
                <span class="chip c">C ${c}</span>
                <span class="chip f">G ${fat}</span>
            </div>
        `;
    }
    return `
        <div class="row" style="gap:6px">
            <span class="chip k">${kcal} kcal</span>
            <span class="chip p">P ${p}g</span>
            <span class="chip c">C ${c}g</span>
            <span class="chip f">G ${fat}g</span>
        </div>
    `;
};

// ===== Recipe thumb (placeholder) =====
window.recipeThumbHTML = function(seed, label) {
    const palettes = [
        ['#e8eedb', '#5c8a3a'],
        ['#f6e8cf', '#c98a2e'],
        ['#f6e2d3', '#c4602b'],
        ['#ece6d2', '#7a6a3f'],
        ['#efece2', '#1a1a1a'],
        ['#f3f0e8', '#5c8a3a'],
    ];
    const [bg, fg] = palettes[(seed || 0) % palettes.length];
    const stripes = [];
    for (let i = 0; i < 8; i++) {
        stripes.push(`<rect x="${i * 22 - 10}" y="-10" width="3" height="120" fill="${fg}" opacity="0.08" transform="rotate(20 80 45)"/>`);
    }
    return `
        <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
            <rect width="160" height="90" fill="${bg}"/>
            ${stripes.join('')}
            <text x="80" y="50" text-anchor="middle" font-family="Geist Mono, monospace" font-size="10" fill="${fg}" opacity="0.55">${window.esc(label || '')}</text>
        </svg>
    `;
};

// ===== Product thumb =====
// Returns a small image element if the product has image_url, else empty string.
window.productThumbHTML = function(p, size) {
    if (!p || !p.image_url) return '';
    const url = String(p.image_url).trim();
    if (!url) return '';
    const px = size || 32;
    return `<img src="${window.esc(url)}" alt="" style="width:${px}px; height:${px}px; border-radius:8px; object-fit:cover; margin-right:10px; flex-shrink:0;" onerror="this.style.display='none'"/>`;
};

// ===== Food picker modal =====
// Renders a modal that searches AppState.products and lets user pick qty.
// onPick(item) where item = { productId, qty }
// options.showRecipes: when true, adds a Recetas tab and exposes onPickRecipe({ recipe, qty }).
window.openFoodPicker = function(options) {
    options = options || {};
    const title = options.title || 'Añadir alimento';
    const onPick = options.onPick || function() {};
    const onPickRecipe = options.onPickRecipe || function() {};
    const showRecipes = !!options.showRecipes;

    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    let tab = 'food';
    let q = '';
    let qty = 100;
    let sel = null;
    let selRecipe = null;
    let recipeQty = 1;

    function results() {
        const products = window.AppState.products || [];
        const needle = q.toLowerCase().trim();
        if (needle) {
            return products
                .filter(p => (p.name || '').toLowerCase().includes(needle) || String(p.barcode).includes(needle))
                .slice(0, 25);
        }
        // No query: surface frequent items first
        const frequent = window.AppState.frequentBarcodes || [];
        const rank = new Map(frequent.map((b, i) => [String(b), i]));
        const sorted = [...products].sort((a, b) => {
            const ra = rank.has(String(a.barcode)) ? rank.get(String(a.barcode)) : Infinity;
            const rb = rank.has(String(b.barcode)) ? rank.get(String(b.barcode)) : Infinity;
            if (ra !== rb) return ra - rb;
            return (a.name || '').localeCompare(b.name || '');
        });
        return sorted.slice(0, 25);
    }

    function recipeResults() {
        const recipes = window.AppState.recipes || [];
        const needle = q.toLowerCase().trim();
        const filtered = needle
            ? recipes.filter(r => (r.name || '').toLowerCase().includes(needle))
            : [...recipes];
        return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 25);
    }

    function recipeBaseQty(r) {
        if (!r) return 1;
        return Number(r.output_qty) > 0 ? Number(r.output_qty) : Math.max(1, r.serves || 1);
    }

    function macroPreview() {
        if (!sel) return '';
        const m = window.macrosFor(sel.barcode, Number(qty) || 0);
        return window.macroChipsHTML(m, true);
    }

    function recipeMacroPreview() {
        if (!selRecipe) return '';
        const perServing = window.recipeMacros(selRecipe);
        const baseQty = recipeBaseQty(selRecipe);
        // recipeMacros divides by serves to give per-serving macros; if output_qty drives baseQty,
        // we still want total scaled by (recipeQty / baseQty). For serves-based recipes baseQty == serves,
        // so total = perServing * recipeQty. For output_qty recipes we treat output unit similarly.
        const factor = Number(recipeQty) || 0;
        const m = {
            kcal: perServing.kcal * factor * (Math.max(1, selRecipe.serves || 1) / baseQty),
            p: perServing.p * factor * (Math.max(1, selRecipe.serves || 1) / baseQty),
            c: perServing.c * factor * (Math.max(1, selRecipe.serves || 1) / baseQty),
            fat: perServing.fat * factor * (Math.max(1, selRecipe.serves || 1) / baseQty),
        };
        return window.macroChipsHTML(m, true);
    }

    let shellBuilt = false;

    function buildShell() {
        const tabsHTML = showRecipes ? `
            <div class="row" style="gap:6px; margin-bottom:12px">
                <button class="btn sm ${tab === 'food' ? 'accent' : 'ghost'}" data-tab="food">Alimentos</button>
                <button class="btn sm ${tab === 'recipe' ? 'accent' : 'ghost'}" data-tab="recipe">Recetas</button>
            </div>
        ` : '';

        mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1">
                <div class="spread" style="margin-bottom:4px">
                    <h3>${window.esc(title)}</h3>
                    <button class="btn icon sm ghost" data-action="close" aria-label="Cerrar">${window.icon('close')}</button>
                </div>
                <div class="modal-sub" id="fp-sub">Busca un producto e indica la cantidad.</div>

                <div id="fp-tabs">${tabsHTML}</div>

                <div class="search" id="fp-search-wrap" style="margin-bottom:12px">
                    ${window.icon('search')}
                    <input id="fp-search" placeholder="Pollo, avena, plátano…"/>
                </div>

                <div id="fp-body"></div>
            </div>
        </div>
        `;

        // Wire close handlers (shell-level — never recreated)
        mount.querySelector('[data-close]').addEventListener('click', (e) => {
            if (e.target.dataset.close === '1') close();
        });
        mount.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));

        // Wire search input once — only updates the results list, never re-renders the shell
        const search = mount.querySelector('#fp-search');
        search.addEventListener('input', (e) => {
            q = e.target.value;
            renderBody();
        });

        // Wire tab toggles (one-time — buttons stay in DOM, only class toggles)
        mount.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (tab === btn.dataset.tab) return;
                tab = btn.dataset.tab;
                sel = null;
                selRecipe = null;
                q = '';
                const input = mount.querySelector('#fp-search');
                if (input) input.value = '';
                updateTabButtons();
                updatePlaceholder();
                renderBody();
            });
        });
        updatePlaceholder();

        shellBuilt = true;
    }

    function updateTabButtons() {
        mount.querySelectorAll('[data-tab]').forEach(btn => {
            const isActive = btn.dataset.tab === tab;
            btn.classList.toggle('accent', isActive);
            btn.classList.toggle('ghost', !isActive);
        });
    }

    function updatePlaceholder() {
        const input = mount.querySelector('#fp-search');
        const sub = mount.querySelector('#fp-sub');
        if (tab === 'recipe') {
            if (input) input.placeholder = 'Buscar receta…';
            if (sub) sub.textContent = 'Busca una receta e indica las raciones.';
        } else {
            if (input) input.placeholder = 'Pollo, avena, plátano…';
            if (sub) sub.textContent = 'Busca un producto e indica la cantidad.';
        }
    }

    function renderBody() {
        const body = mount.querySelector('#fp-body');
        const searchWrap = mount.querySelector('#fp-search-wrap');
        const tabsWrap = mount.querySelector('#fp-tabs');
        if (!body) return;

        if (tab === 'recipe') {
            renderRecipeBody(body, searchWrap, tabsWrap);
        } else {
            renderFoodBody(body, searchWrap, tabsWrap);
        }
    }

    function renderFoodBody(body, searchWrap, tabsWrap) {
        if (!sel) {
            if (searchWrap) searchWrap.style.display = '';
            if (tabsWrap) tabsWrap.style.display = '';
            const list = results();
            body.innerHTML = `
                <div style="max-height:55vh; overflow:auto; margin:0 -4px">
                    ${list.map(p => {
                        const m = window.macrosFor(p.barcode, 100);
                        const thumb = window.productThumbHTML(p, 32);
                        return `
                        <button class="food-row fp-pick" data-id="${window.esc(p.barcode)}"
                            style="width:100%; background:transparent; border:none; text-align:left; cursor:pointer; padding:10px 4px;">
                            <div class="row" style="align-items:center;">
                                ${thumb}
                                <div>
                                    <div class="ttl">${window.esc(p.name)}</div>
                                    <div class="sub">${Math.round(m.kcal)} kcal · P${Math.round(m.p)} C${Math.round(m.c)} G${Math.round(m.fat)} <span class="muted">/ 100${(p.unit_type === 'uds' ? ' ud' : (p.unit_type || 'g'))}</span></div>
                                </div>
                            </div>
                            <div></div>
                            <span style="width:16px; height:16px; color:var(--ink-3);">${window.icon('chevron')}</span>
                        </button>
                        `;
                    }).join('')}
                    ${list.length === 0 ? `<div class="empty">${q ? `Sin resultados para "${window.esc(q)}"` : 'Escanea o crea un producto primero.'}</div>` : ''}
                </div>
            `;

            body.querySelectorAll('.fp-pick').forEach(btn => {
                btn.addEventListener('click', () => {
                    sel = window.findProductById(btn.dataset.id);
                    qty = 100;
                    renderBody();
                });
            });
        } else {
            if (searchWrap) searchWrap.style.display = 'none';
            if (tabsWrap) tabsWrap.style.display = 'none';
            const thumb = window.productThumbHTML(sel, 44);
            body.innerHTML = `
                <div>
                    <div class="card sunken" style="margin-bottom:14px">
                        <div class="row" style="align-items:center;">
                            ${thumb}
                            <div style="flex:1">
                                <div style="font-size:15px; font-weight:600;">${window.esc(sel.name)}</div>
                                <div class="tiny">por 100${(sel.unit_type === 'uds' ? ' ud' : (sel.unit_type || 'g'))}: ${Math.round(sel.kcal_100g || 0)} kcal</div>
                            </div>
                            <button class="btn ghost sm" data-action="change">Cambiar</button>
                        </div>
                    </div>
                    <div class="grid cols-2 keep" style="gap:12px; margin-bottom:14px">
                        <div class="field">
                            <label class="field-label">Cantidad (${(sel.unit_type === 'uds' ? 'ud' : (sel.unit_type || 'g'))})</label>
                            <input id="fp-qty" class="input lg num" type="number" value="${qty}" min="0"/>
                        </div>
                        <div class="field">
                            <label class="field-label">Aporta</label>
                            <div class="card tight sunken" id="fp-preview" style="padding:12px; height:56px; display:flex; align-items:center;">
                                ${macroPreview()}
                            </div>
                        </div>
                    </div>
                    <div class="row" style="justify-content:flex-end; gap:8px">
                        <button class="btn ghost" data-action="close">Cancelar</button>
                        <button class="btn accent" data-action="confirm">Añadir</button>
                    </div>
                </div>
            `;

            body.querySelector('[data-action="change"]').addEventListener('click', () => {
                sel = null;
                renderBody();
            });
            const qtyIn = body.querySelector('#fp-qty');
            if (qtyIn) {
                qtyIn.addEventListener('input', (e) => {
                    qty = Number(e.target.value) || 0;
                    const pv = body.querySelector('#fp-preview');
                    if (pv) pv.innerHTML = macroPreview();
                });
            }
            body.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                if (!sel) return;
                onPick({ productId: sel.barcode, qty: Number(qty) || 0 });
                close();
            });
            body.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));
        }
    }

    function renderRecipeBody(body, searchWrap, tabsWrap) {
        if (!selRecipe) {
            if (searchWrap) searchWrap.style.display = '';
            if (tabsWrap) tabsWrap.style.display = '';
            const list = recipeResults();
            body.innerHTML = `
                <div style="max-height:55vh; overflow:auto; margin:0 -4px">
                    ${list.map(r => {
                        const m = window.recipeMacros(r);
                        return `
                        <button class="food-row fp-pick-recipe" data-rid="${window.esc(r.id)}"
                            style="width:100%; background:transparent; border:none; text-align:left; cursor:pointer; padding:10px 4px;">
                            <div class="row" style="align-items:center;">
                                <div>
                                    <div class="ttl">${window.esc(r.name)}</div>
                                    <div class="sub">${Math.round(m.kcal)} kcal · P${Math.round(m.p)} C${Math.round(m.c)} G${Math.round(m.fat)} <span class="muted">/ ración</span></div>
                                </div>
                            </div>
                            <div></div>
                            <span style="width:16px; height:16px; color:var(--ink-3);">${window.icon('chevron')}</span>
                        </button>
                        `;
                    }).join('')}
                    ${list.length === 0 ? `<div class="empty">${q ? `Sin recetas para "${window.esc(q)}"` : 'Crea una receta primero.'}</div>` : ''}
                </div>
            `;

            body.querySelectorAll('.fp-pick-recipe').forEach(btn => {
                btn.addEventListener('click', () => {
                    const r = (window.AppState.recipes || []).find(x => x.id === btn.dataset.rid);
                    if (!r) return;
                    selRecipe = r;
                    recipeQty = recipeBaseQty(r);
                    renderBody();
                });
            });
        } else {
            if (searchWrap) searchWrap.style.display = 'none';
            if (tabsWrap) tabsWrap.style.display = 'none';
            const hasOutput = Number(selRecipe.output_qty) > 0;
            const qtyLabel = hasOutput ? 'Cantidad (uds)' : 'Raciones';
            body.innerHTML = `
                <div>
                    <div class="card sunken" style="margin-bottom:14px">
                        <div class="row" style="align-items:center;">
                            <div style="flex:1">
                                <div style="font-size:15px; font-weight:600;">${window.esc(selRecipe.name)}</div>
                                <div class="tiny">${hasOutput ? `Base: ${selRecipe.output_qty} uds` : `Base: ${Math.max(1, selRecipe.serves || 1)} raciones`} · ${(selRecipe.ingredients || []).length} ingredientes</div>
                            </div>
                            <button class="btn ghost sm" data-action="change-recipe">Cambiar</button>
                        </div>
                    </div>
                    <div class="grid cols-2 keep" style="gap:12px; margin-bottom:14px">
                        <div class="field">
                            <label class="field-label">${qtyLabel}</label>
                            <input id="fp-recipe-qty" class="input lg num" type="number" step="any" value="${recipeQty}" min="0"/>
                        </div>
                        <div class="field">
                            <label class="field-label">Aporta</label>
                            <div class="card tight sunken" id="fp-recipe-preview" style="padding:12px; height:56px; display:flex; align-items:center;">
                                ${recipeMacroPreview()}
                            </div>
                        </div>
                    </div>
                    <div class="row" style="justify-content:flex-end; gap:8px">
                        <button class="btn ghost" data-action="close">Cancelar</button>
                        <button class="btn accent" data-action="confirm-recipe">Añadir</button>
                    </div>
                </div>
            `;

            body.querySelector('[data-action="change-recipe"]').addEventListener('click', () => {
                selRecipe = null;
                renderBody();
            });
            const qtyIn = body.querySelector('#fp-recipe-qty');
            if (qtyIn) {
                qtyIn.addEventListener('input', (e) => {
                    recipeQty = Number(e.target.value) || 0;
                    const pv = body.querySelector('#fp-recipe-preview');
                    if (pv) pv.innerHTML = recipeMacroPreview();
                });
            }
            body.querySelector('[data-action="confirm-recipe"]').addEventListener('click', () => {
                if (!selRecipe) return;
                onPickRecipe({ recipe: selRecipe, qty: Number(recipeQty) || 0 });
                close();
            });
            body.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));
        }
    }

    function close() {
        mount.innerHTML = '';
        shellBuilt = false;
    }

    buildShell();
    renderBody();
};

// ===== Simple confirm dialog =====
window.confirmDialog = function(message) {
    return new Promise(resolve => {
        const mount = document.getElementById('modal-mount');
        if (!mount) { resolve(window.confirm(message)); return; }
        mount.innerHTML = `
            <div class="modal-backdrop" data-close="1">
                <div class="modal" data-stop="1" style="max-width:380px">
                    <h3>Confirmar</h3>
                    <div class="modal-sub">${window.esc(message)}</div>
                    <div class="row" style="justify-content:flex-end; gap:8px">
                        <button class="btn ghost" data-action="no">Cancelar</button>
                        <button class="btn primary" data-action="yes">Sí</button>
                    </div>
                </div>
            </div>`;
        const close = (v) => { mount.innerHTML = ''; resolve(v); };
        mount.querySelector('[data-close]').addEventListener('click', e => { if (e.target.dataset.close === '1') close(false); });
        mount.querySelector('[data-action="no"]').addEventListener('click', () => close(false));
        mount.querySelector('[data-action="yes"]').addEventListener('click', () => close(true));
    });
};

// ===== Make Recipe dialog =====
// Opens a modal to confirm qty + storage before executing _makeRecipe.
// options: { recipe, onConfirm(result) } where result = { qty, storage: 'fridge'|'freezer'|null }
window.openMakeRecipeDialog = function(options) {
    options = options || {};
    const recipe = options.recipe || {};
    const onConfirm = options.onConfirm || function() {};

    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    const hasOutput = Number(recipe.output_qty) > 0;
    const baseQty = hasOutput ? Number(recipe.output_qty) : (recipe.serves || 1);
    let qty = baseQty;
    let storage = 'fridge';

    function expiryHint(st) {
        if (!hasOutput) return '';
        const days = st === 'freezer'
            ? (recipe.freezer_expiry_days != null ? recipe.freezer_expiry_days : (recipe.default_expiry_days != null ? recipe.default_expiry_days : null))
            : (recipe.fridge_expiry_days != null ? recipe.fridge_expiry_days : (recipe.default_expiry_days != null ? recipe.default_expiry_days : null));
        return days != null
            ? `<div class="muted" style="font-size:11px; margin-top:4px">Caducidad: ${days} días</div>`
            : `<div class="muted" style="font-size:11px; margin-top:4px">Sin caducidad fijada</div>`;
    }

    function ingredientList(q) {
        const ratio = q / baseQty;
        const ings = recipe.ingredients || [];
        if (ings.length === 0) return '';
        return ings.map(ing => {
            const p = window.findProductById(ing.productId);
            const name = p ? p.name : `Producto ${ing.productId}`;
            const unit = p ? (p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g')) : 'g';
            const amount = ing.qty * ratio;
            const fmt = amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10;
            return `${window.esc(name)}: ${fmt} ${unit}`;
        }).join('<br>');
    }

    function buildShell() {
        mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1" style="max-width:400px">
                <div class="spread" style="margin-bottom:4px">
                    <h3>Hacer «${window.esc(recipe.name)}»</h3>
                    <button class="btn icon sm ghost" data-action="close" aria-label="Cerrar">${window.icon('close')}</button>
                </div>
                <div class="modal-sub" style="margin-bottom:16px">Vas a hacer esta receta. Calculamos los ingredientes según la cantidad.</div>

                <div class="field" style="margin-bottom:12px">
                    <label class="field-label">${hasOutput ? '¿Cuántas unidades?' : '¿Cuántas raciones?'}</label>
                    <input id="mrd-qty" class="input lg num" type="number" min="0.01" step="any" value="${qty}"/>
                    <div id="mrd-ratio" class="muted" style="font-size:11px; margin-top:4px; line-height:1.5">${ingredientList(qty)}</div>
                </div>

                ${hasOutput ? `
                <div class="field" style="margin-bottom:16px">
                    <label class="field-label">¿Dónde lo guardás?</label>
                    <div class="row" style="gap:8px; margin-top:6px">
                        <button type="button" class="btn sm ${storage === 'fridge' ? 'accent' : 'ghost'}" data-storage="fridge">Nevera</button>
                        <button type="button" class="btn sm ${storage === 'freezer' ? 'accent' : 'ghost'}" data-storage="freezer">Congelador</button>
                    </div>
                    <div id="mrd-expiry-hint">${expiryHint(storage)}</div>
                </div>
                ` : ''}

                <div class="row" style="justify-content:flex-end; gap:8px">
                    <button class="btn ghost" data-action="close">Cancelar</button>
                    <button class="btn accent" data-action="confirm">Hacer</button>
                </div>
            </div>
        </div>`;

        // Close handlers
        mount.querySelector('[data-close]').addEventListener('click', e => {
            if (e.target.dataset.close === '1') close();
        });
        mount.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', close));

        // Qty input — only update ratio text, no full re-render
        const qtyIn = mount.querySelector('#mrd-qty');
        if (qtyIn) {
            qtyIn.addEventListener('input', e => {
                qty = Number(e.target.value) || 0;
                const ratioEl = mount.querySelector('#mrd-ratio');
                if (ratioEl) ratioEl.innerHTML = ingredientList(qty);
            });
            setTimeout(() => { qtyIn.focus(); qtyIn.select(); }, 0);
        }

        // Storage buttons — targeted DOM updates, no full re-render
        mount.querySelectorAll('[data-storage]').forEach(btn => {
            btn.addEventListener('click', () => {
                storage = btn.dataset.storage;
                mount.querySelectorAll('[data-storage]').forEach(b => {
                    b.className = `btn sm ${b.dataset.storage === storage ? 'accent' : 'ghost'}`;
                });
                const hint = mount.querySelector('#mrd-expiry-hint');
                if (hint) hint.innerHTML = expiryHint(storage);
            });
        });

        // Confirm
        mount.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            const finalQty = Number(mount.querySelector('#mrd-qty')?.value) || 0;
            if (finalQty <= 0) {
                window.showToast('La cantidad debe ser mayor a 0', 'error');
                return;
            }
            close();
            onConfirm({ qty: finalQty, storage: hasOutput ? storage : null });
        });
    }

    function close() {
        mount.innerHTML = '';
    }

    buildShell();
};

// ===== Quantity prompt dialog =====
// Returns a Promise<number|null>: resolved number = new quantity, null = cancelled.
window.promptQty = function(currentQty) {
    return new Promise(resolve => {
        const mount = document.getElementById('modal-mount');
        if (!mount) { resolve(null); return; }
        mount.innerHTML = `
            <div class="modal-backdrop" data-close="1">
                <div class="modal" data-stop="1" style="max-width:340px">
                    <h3>Editar cantidad</h3>
                    <div class="modal-sub" style="margin-bottom:14px">Ingresá la nueva cantidad.</div>
                    <input id="pq-input" class="input lg num" type="number" min="0.01" step="any" value="${Number(currentQty) || 0}" style="width:100%; margin-bottom:16px"/>
                    <div class="row" style="justify-content:flex-end; gap:8px">
                        <button class="btn ghost" data-action="cancel">Cancelar</button>
                        <button class="btn accent" data-action="save">Guardar</button>
                    </div>
                </div>
            </div>`;

        const input = mount.querySelector('#pq-input');

        const close = (val) => { mount.innerHTML = ''; resolve(val); };

        mount.querySelector('[data-close]').addEventListener('click', e => { if (e.target.dataset.close === '1') close(null); });
        mount.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
        mount.querySelector('[data-action="save"]').addEventListener('click', () => {
            const v = parseFloat(input.value);
            if (!Number.isFinite(v) || v <= 0) {
                window.showToast('La cantidad debe ser mayor a 0', 'error');
                return;
            }
            close(v);
        });

        // Allow Enter to confirm, Escape to cancel
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') mount.querySelector('[data-action="save"]').click();
            if (e.key === 'Escape') close(null);
        });

        // Autofocus + select all so user can type the new value immediately
        setTimeout(() => { input.focus(); input.select(); }, 0);
    });
};
