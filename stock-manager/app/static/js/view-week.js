/*
   View: Week — weekly planner with drag & drop + auto-generate
   v0.7.0
*/

const WEEK_MEALS = [
    { id: 'desayuno', name: 'Desayuno' },
    { id: 'almuerzo', name: 'Almuerzo' },
    { id: 'comida',   name: 'Comida' },
    { id: 'merienda', name: 'Merienda' },
    { id: 'cena',     name: 'Cena' },
    { id: 'snacks',   name: 'Snacks' },
];

let weekDragState = null;  // { recipeId, source }
let weekFilter = '';

function recipeById(id) {
    return (window.AppState.recipes || []).find(r => r.id === id);
}

function dayTotalsFor(dayId) {
    const day = (window.AppState.week || {})[dayId] || {};
    const totals = { kcal: 0, p: 0, c: 0, fat: 0 };
    Object.values(day).forEach(arr => {
        (arr || []).forEach(rid => {
            const r = recipeById(rid);
            if (r) {
                const m = window.recipeMacros(r);
                totals.kcal += m.kcal; totals.p += m.p; totals.c += m.c; totals.fat += m.fat;
            }
        });
    });
    return totals;
}

function weekTotalsAll() {
    const t = { kcal: 0, p: 0, c: 0, fat: 0 };
    window.DAY_LABELS.forEach(d => {
        const dt = dayTotalsFor(d.id);
        t.kcal += dt.kcal; t.p += dt.p; t.c += dt.c; t.fat += dt.fat;
    });
    return t;
}

function placeRecipe(dayId, mealId, recipeId, source) {
    const week = JSON.parse(JSON.stringify(window.AppState.week || {}));
    if (source && (source.fromDay !== dayId || source.fromMeal !== mealId)) {
        const srcArr = ((week[source.fromDay] || {})[source.fromMeal] || []).filter((_, i) => i !== source.idx);
        week[source.fromDay] = week[source.fromDay] || {};
        week[source.fromDay][source.fromMeal] = srcArr;
    } else if (source && source.fromDay === dayId && source.fromMeal === mealId) {
        return; // no-op
    }
    week[dayId] = week[dayId] || {};
    const arr = (week[dayId][mealId] || []).slice();
    arr.push(recipeId);
    week[dayId][mealId] = arr;
    window.saveWeek(week);
    window.renderPage();
}

function removeFromCell(dayId, mealId, idx) {
    const week = JSON.parse(JSON.stringify(window.AppState.week || {}));
    if (!week[dayId] || !week[dayId][mealId]) return;
    week[dayId][mealId] = week[dayId][mealId].filter((_, i) => i !== idx);
    window.saveWeek(week);
    window.renderPage();
}

function clearWeek() {
    const empty = {};
    window.DAY_LABELS.forEach(d => empty[d.id] = {});
    window.saveWeek(empty);
    window.renderPage();
}

function generateAuto() {
    const candidates = (window.AppState.recipes || []).slice();
    if (candidates.length === 0) {
        window.showToast('No hay recetas: crea algunas en Recetas primero.', 'info');
        return;
    }
    const target = window.AppState.goals.kcal;

    const poolFor = (mealId) => {
        const c = candidates.filter(r => {
            const tags = r.tags || [];
            const time = r.time || 30;
            if (mealId === 'desayuno') return tags.includes('desayuno') || time <= 15;
            if (mealId === 'almuerzo') return tags.includes('snack') || tags.includes('merienda') || time <= 10;
            if (mealId === 'comida')   return tags.includes('comida') || tags.includes('post-entreno') || time >= 20;
            if (mealId === 'merienda') return tags.includes('snack') || tags.includes('merienda') || time <= 15;
            if (mealId === 'cena')     return tags.includes('cena') || time <= 30;
            if (mealId === 'snacks')   return time <= 10;
            return true;
        });
        return c.length ? c : candidates;
    };
    const pools = {
        desayuno: poolFor('desayuno'),
        almuerzo: poolFor('almuerzo'),
        comida:   poolFor('comida'),
        merienda: poolFor('merienda'),
        cena:     poolFor('cena'),
        snacks:   poolFor('snacks'),
    };
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const kcalOf = r => window.recipeMacros(r).kcal;
    const dayKcal = (cfg) => Object.values(cfg).reduce((acc, ids) =>
        acc + (ids || []).reduce((a, id) => a + kcalOf(recipeById(id)), 0), 0);

    function bestForDay(prevPickIds) {
        let best = null, bestErr = Infinity;
        const N = 300;
        for (let i = 0; i < N; i++) {
            const cfg = {};
            const dr = pick(pools.desayuno);
            const co = pick(pools.comida);
            const cn = pick(pools.cena);
            if (dr) cfg.desayuno = [dr.id];
            if (co) cfg.comida   = [co.id];
            if (cn) cfg.cena     = [cn.id];
            if (Math.random() < 0.55) { const r = pick(pools.almuerzo); if (r) cfg.almuerzo = [r.id]; }
            if (Math.random() < 0.70) { const r = pick(pools.merienda); if (r) cfg.merienda = [r.id]; }
            if (Math.random() < 0.25) { const r = pick(pools.snacks);   if (r) cfg.snacks   = [r.id]; }

            const k = dayKcal(cfg);
            const diff = k - target;
            const err = diff < 0 ? Math.abs(diff) * 1.2 : Math.abs(diff);
            const repeat = Object.values(cfg).flat().filter(id => prevPickIds.has(id)).length;
            const score = err + repeat * 25;
            if (score < bestErr) { bestErr = score; best = cfg; }
            if (bestErr < 30) break;
        }
        return best;
    }

    const newWeek = {};
    let prev = new Set();
    window.DAY_LABELS.forEach(d => {
        const cfg = bestForDay(prev) || {};
        newWeek[d.id] = cfg;
        prev = new Set(Object.values(cfg).flat());
    });
    window.saveWeek(newWeek);
    window.showToast('Plan semanal generado', 'success');
    window.renderPage();
}

function generateShoppingFromWeek() {
    // Aggregate ingredients across the week and create shopping items
    const acc = {};
    Object.values(window.AppState.week || {}).forEach(day => {
        Object.values(day || {}).forEach(arr => {
            (arr || []).forEach(rid => {
                const r = recipeById(rid);
                if (!r) return;
                const serves = Math.max(1, r.serves || 1);
                (r.ingredients || []).forEach(ing => {
                    const key = String(ing.productId);
                    acc[key] = (acc[key] || 0) + (ing.qty || 0) / serves;
                });
            });
        });
    });
    if (Object.keys(acc).length === 0) {
        window.showToast('Tu semana está vacía', 'info');
        return;
    }
    const newItems = Object.entries(acc).map(([productId, qty]) => {
        const p = window.findProductById(productId);
        return {
            id: 's' + Date.now() + '-' + productId,
            name: p ? p.name : `Producto ${productId}`,
            qty: `${Math.round(qty)} ${p && p.unit_type === 'uds' ? 'ud' : (p && p.unit_type) || 'g'}`,
            cat: (p && p.category) || 'Otros',
            auto: true,
            done: false,
        };
    });
    const existing = window.AppState.shopping || [];
    window.saveShopping(newItems.concat(existing));
    window.showToast(`${newItems.length} ingredientes añadidos a la lista`, 'success');
    window.gotoPage('shopping');
}

window.renderWeek = function() {
    const week = window.AppState.week || {};
    const goals = window.AppState.goals;
    const recipes = window.AppState.recipes || [];
    const todayId = window.todayDowId();
    const filtered = recipes.filter(r => !weekFilter || r.name.toLowerCase().includes(weekFilter.toLowerCase()));
    const wt = weekTotalsAll();

    // Header day cells — compute day-of-month for current week
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now); monday.setDate(now.getDate() - dow);
    const headRow = window.DAY_LABELS.map((d, i) => {
        const dayDate = new Date(monday); dayDate.setDate(monday.getDate() + i);
        return `
        <div class="week-cell head ${d.id === todayId ? 'today' : ''}">
            <span>${d.short}</span>
            <span class="dnum">${dayDate.getDate()}</span>
        </div>
        `;
    }).join('');

    const mealRows = WEEK_MEALS.map(meal => {
        const cells = window.DAY_LABELS.map(d => {
            const items = ((week[d.id] || {})[meal.id] || []);
            const slots = items.map((rid, idx) => {
                const r = recipeById(rid);
                if (!r) return '';
                const m = window.recipeMacros(r);
                return `
                    <div class="week-slot" draggable="true" data-day="${d.id}" data-meal="${meal.id}" data-idx="${idx}" data-rid="${window.esc(rid)}" title="Click para quitar">
                        <div class="ttl">${window.esc(r.name)}</div>
                        <div class="sub">${Math.round(m.kcal)} kcal · P${Math.round(m.p)}</div>
                    </div>
                `;
            }).join('');
            return `
                <div class="week-cell" data-cell="${d.id}:${meal.id}">
                    ${slots}
                    ${items.length === 0 ? `<div class="week-slot is-empty">arrastra aquí</div>` : ''}
                </div>
            `;
        }).join('');
        return `<div class="week-cell row-head">${meal.name}</div>${cells}`;
    }).join('');

    const dayTotalsRow = window.DAY_LABELS.map(d => {
        const t = dayTotalsFor(d.id);
        const onGoal = t.kcal >= goals.kcal * 0.92 && t.kcal <= goals.kcal * 1.08;
        return `
            <div class="day-total">
                <span class="n" style="color:${onGoal ? 'var(--accent)' : 'var(--ink)'}">${Math.round(t.kcal)}</span>
                <span>${Math.round(t.p)}g P</span>
            </div>
        `;
    }).join('');

    const recipesHTML = filtered.map(r => {
        const m = window.recipeMacros(r);
        return `
            <div class="recipe-pill" draggable="true" data-rid="${window.esc(r.id)}">
                <span class="emoji">🍽️</span>
                <div class="info">
                    <div class="ttl">${window.esc(r.name)}</div>
                    <div class="sub">${Math.round(m.kcal)} kcal · P${Math.round(m.p)} · ${r.time || '?'} min</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">${window.formatWeekRange()}</div>
                <h1 class="page-title">Planificador semanal</h1>
            </div>
            <div class="btn-group row" style="gap:8px">
                <button class="btn ghost" data-action="clear">Vaciar</button>
                <button class="btn" data-action="auto">${window.icon('sparkle')} Generar automáticamente</button>
                <button class="btn accent" data-action="shopping">Generar lista de compra</button>
            </div>
        </div>

        <div class="grid cols-2 layout-week" style="gap:22px">
            <div>
                <div class="week-scroll">
                    <div class="week-grid">
                        <div class="week-cell head"></div>
                        ${headRow}
                        ${mealRows}
                    </div>
                </div>

                <div class="day-totals">
                    <div class="day-total" style="text-align:left">kcal · proteína</div>
                    ${dayTotalsRow}
                </div>

                <div class="grid cols-4 keep" style="gap:14px; margin-top:22px">
                    <div class="card tight"><div class="tiny">Calorías / semana</div><div class="num" style="font-size:22px; margin-top:4px">${Math.round(wt.kcal)}</div><div class="muted" style="font-size:11px; font-family:var(--mono)">media ${Math.round(wt.kcal/7)} / día</div></div>
                    <div class="card tight"><div class="tiny">Proteína / semana</div><div class="num" style="font-size:22px; margin-top:4px">${Math.round(wt.p)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">media ${Math.round(wt.p/7)}g / día</div></div>
                    <div class="card tight"><div class="tiny">Carbos / semana</div><div class="num" style="font-size:22px; margin-top:4px">${Math.round(wt.c)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">media ${Math.round(wt.c/7)}g / día</div></div>
                    <div class="card tight"><div class="tiny">Grasas / semana</div><div class="num" style="font-size:22px; margin-top:4px">${Math.round(wt.fat)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">media ${Math.round(wt.fat/7)}g / día</div></div>
                </div>
            </div>

            <div class="card" style="position:sticky; top:24px; align-self:start; max-height:calc(100vh - 60px); overflow:auto">
                <div class="card-head">
                    <div class="card-title">Recetas</div>
                    <span class="card-sub">arrastra</span>
                </div>
                <div class="search" style="margin-bottom:12px">
                    ${window.icon('search')}
                    <input id="week-filter" placeholder="Buscar…" value="${window.esc(weekFilter)}"/>
                </div>
                <div class="stack" style="gap:8px">
                    ${recipesHTML || `<div class="empty"><div class="t">Sin recetas</div><div>Crea una primero en Recetas.</div></div>`}
                </div>
            </div>
        </div>
    `;
};

window.initWeek = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    const filterInput = root.querySelector('#week-filter');
    if (filterInput) filterInput.addEventListener('input', e => {
        weekFilter = e.target.value;
        window.renderPage();
    });

    root.querySelector('[data-action="clear"]').addEventListener('click', async () => {
        if (await window.confirmDialog('¿Vaciar todo el plan semanal?')) clearWeek();
    });
    root.querySelector('[data-action="auto"]').addEventListener('click', generateAuto);
    root.querySelector('[data-action="shopping"]').addEventListener('click', generateShoppingFromWeek);

    // Drag from recipe pills
    root.querySelectorAll('.recipe-pill[draggable="true"]').forEach(pill => {
        pill.addEventListener('dragstart', (e) => {
            weekDragState = { recipeId: pill.dataset.rid, source: null };
            e.dataTransfer.effectAllowed = 'copy';
            pill.classList.add('dragging');
        });
        pill.addEventListener('dragend', () => { weekDragState = null; pill.classList.remove('dragging'); });
    });

    // Drag from existing slots
    root.querySelectorAll('.week-slot[draggable="true"]').forEach(slot => {
        slot.addEventListener('dragstart', (e) => {
            weekDragState = {
                recipeId: slot.dataset.rid,
                source: { fromDay: slot.dataset.day, fromMeal: slot.dataset.meal, idx: Number(slot.dataset.idx) },
            };
            e.dataTransfer.effectAllowed = 'move';
        });
        slot.addEventListener('dragend', () => { weekDragState = null; });
        slot.addEventListener('click', () => {
            removeFromCell(slot.dataset.day, slot.dataset.meal, Number(slot.dataset.idx));
        });
    });

    // Drop targets
    root.querySelectorAll('[data-cell]').forEach(cell => {
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('dragover'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('dragover');
            if (!weekDragState) return;
            const [day, meal] = cell.dataset.cell.split(':');
            placeRecipe(day, meal, weekDragState.recipeId, weekDragState.source);
            weekDragState = null;
        });
    });
};
