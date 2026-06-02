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

// ===== Food picker modal =====
// Renders a modal that searches AppState.products and lets user pick qty.
// onPick(item) where item = { productId, qty }
window.openFoodPicker = function(options) {
    options = options || {};
    const title = options.title || 'Añadir alimento';
    const onPick = options.onPick || function() {};

    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    let q = '';
    let qty = 100;
    let sel = null;

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

    function getEmoji(p) {
        const cat = (p.category || '').toLowerCase();
        if (cat.includes('bebida')) return '🥤';
        if (cat.includes('limpieza')) return '🧴';
        if (cat.includes('higiene')) return '🧼';
        return '🍽️';
    }

    function macroPreview() {
        if (!sel) return '';
        const m = window.macrosFor(sel.barcode, Number(qty) || 0);
        return window.macroChipsHTML(m, true);
    }

    let shellBuilt = false;

    function buildShell() {
        mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1">
                <div class="spread" style="margin-bottom:4px">
                    <h3>${window.esc(title)}</h3>
                    <button class="btn icon sm ghost" data-action="close" aria-label="Cerrar">${window.icon('close')}</button>
                </div>
                <div class="modal-sub">Busca un producto e indica la cantidad.</div>

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
        shellBuilt = true;
    }

    function renderBody() {
        const body = mount.querySelector('#fp-body');
        const searchWrap = mount.querySelector('#fp-search-wrap');
        if (!body) return;

        if (!sel) {
            // Show search input, render results list
            if (searchWrap) searchWrap.style.display = '';
            const list = results();
            body.innerHTML = `
                <div style="max-height:55vh; overflow:auto; margin:0 -4px">
                    ${list.map(p => {
                        const m = window.macrosFor(p.barcode, 100);
                        return `
                        <button class="food-row fp-pick" data-id="${window.esc(p.barcode)}"
                            style="width:100%; background:transparent; border:none; text-align:left; cursor:pointer; padding:10px 4px;">
                            <div class="row">
                                <span style="font-size:18px; margin-right:8px;">${getEmoji(p)}</span>
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

            // Wire pick buttons (only inside #fp-body)
            body.querySelectorAll('.fp-pick').forEach(btn => {
                btn.addEventListener('click', () => {
                    sel = window.findProductById(btn.dataset.id);
                    qty = 100;
                    renderBody();
                });
            });
        } else {
            // Hide search input in selected-product mode
            if (searchWrap) searchWrap.style.display = 'none';
            body.innerHTML = `
                <div>
                    <div class="card sunken" style="margin-bottom:14px">
                        <div class="row">
                            <span style="font-size:28px; margin-right:8px;">${getEmoji(sel)}</span>
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
                // Restore search input visibility and re-show it with current query
                const searchWrap = mount.querySelector('#fp-search-wrap');
                if (searchWrap) searchWrap.style.display = '';
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
