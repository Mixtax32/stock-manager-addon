/*
   View: Week — weekly planner with drag & drop (desktop) + day picker (mobile)
   v0.7.9
*/

const WEEK_MEALS = [
    { id: 'desayuno', name: 'Desayuno' },
    { id: 'almuerzo', name: 'Almuerzo' },
    { id: 'comida',   name: 'Comida' },
    { id: 'merienda', name: 'Merienda' },
    { id: 'cena',     name: 'Cena' },
    { id: 'snacks',   name: 'Snacks' },
];

let weekDragState = null;
let weekFilter = '';
let weekMobileDay = null;      // selected day index (0-6) for mobile view
let weekMobilePicker = null;   // { dayId, mealId } when recipe picker is open
let weekMobilePickerSearch = '';

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

async function placeRecipe(dayId, mealId, recipeId, source) {
    if (source && source.fromDay === dayId && source.fromMeal === mealId) return;

    if (source) {
        // Remove from source position first
        const planIds = (window.AppState._weekPlanIds || {});
        const srcPlanIds = ((planIds[source.fromDay] || {})[source.fromMeal] || []);
        const planId = srcPlanIds[source.idx];
        if (planId) {
            await window.deleteWeekItem(planId);
        }
    }
    await window.saveWeekItem(dayId, mealId, recipeId);
    window.renderPage();
}

async function removeFromCell(dayId, mealId, idx) {
    const planIds = (window.AppState._weekPlanIds || {});
    const cellPlanIds = ((planIds[dayId] || {})[mealId] || []);
    const planId = cellPlanIds[idx];
    if (planId) {
        await window.deleteWeekItem(planId);
    } else {
        // Fallback: rebuild from week state
        const week = JSON.parse(JSON.stringify(window.AppState.week || {}));
        if (!week[dayId] || !week[dayId][mealId]) return;
        week[dayId][mealId] = week[dayId][mealId].filter((_, i) => i !== idx);
        await window.saveWeek(week);
    }
    window.renderPage();
}

async function clearWeek() {
    const empty = {};
    window.DAY_LABELS.forEach(d => empty[d.id] = {});
    await window.saveWeek(empty);
    window.renderPage();
}

async function generateAuto() {
    const candidates = (window.AppState.recipes || []).slice();
    if (candidates.length === 0) {
        window.showToast('No hay recetas: creá algunas en Recetas primero.', 'info');
        return;
    }

    const MEAL_IDS = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
    const goals = window.AppState.goals;

    // Build pool per meal: strict tag match if >= 3 results, else all recipes
    const pools = {};
    MEAL_IDS.forEach(mealId => {
        const strict = candidates.filter(r => {
            const mts = r.meal_types || [];
            if (mts.length > 0) return mts.includes(mealId);
            // Legacy fallback: use tags if no meal_types defined
            return (r.tags || []).includes(mealId);
        });
        pools[mealId] = strict.length >= 3 ? strict : candidates;
    });

    const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

    // Sum macros for a day configuration { mealId: [recipeId, ...], ... }
    function dayMacros(cfg) {
        const t = { kcal: 0, p: 0, c: 0, fat: 0 };
        Object.values(cfg).forEach(arr => (arr || []).forEach(rid => {
            const r = recipeById(rid);
            if (!r) return;
            const m = window.recipeMacros(r);
            t.kcal += m.kcal; t.p += m.p; t.c += m.c; t.fat += m.fat;
        }));
        return t;
    }

    // Score a day config: lower is better.
    // macroErr: sum of squared relative errors for non-zero goals only.
    // varietyPenalty: heavy if used in last 2 days, mild if earlier in the week.
    function dayScore(cfg, recentlyUsed) {
        const t = dayMacros(cfg);
        const sq = x => x * x;
        let macroErr = 0;
        if (goals.kcal > 0) macroErr += sq((t.kcal - goals.kcal) / goals.kcal);
        if (goals.p   > 0) macroErr += sq((t.p   - goals.p)   / goals.p);
        if (goals.c   > 0) macroErr += sq((t.c   - goals.c)   / goals.c);
        if (goals.fat > 0) macroErr += sq((t.fat - goals.fat) / goals.fat);

        let varietyPenalty = 0;
        Object.values(cfg).forEach(arr => (arr || []).forEach(rid => {
            if (!recentlyUsed.has(rid)) return;
            const daysSince = recentlyUsed.get(rid);
            varietyPenalty += daysSince <= 2 ? 0.5 : 0.1;
        }));

        return macroErr + varietyPenalty;
    }

    // Two-phase search: random sampling (2000 iters) + hill climbing (up to 10 passes)
    function bestConfigForDay(recentlyUsed) {
        // Phase 1: random sampling
        let bestCfg = null;
        let bestScore = Infinity;

        for (let i = 0; i < 2000; i++) {
            const cfg = {};
            MEAL_IDS.forEach(mealId => {
                const pool = pools[mealId];
                if (pool.length === 0) return;
                const r = pickRandom(pool);
                if (r) cfg[mealId] = [r.id];
            });
            const score = dayScore(cfg, recentlyUsed);
            if (score < bestScore) { bestScore = score; bestCfg = cfg; }
        }

        if (!bestCfg) return {};

        // Phase 2: hill climbing
        let improved = true;
        let passes = 0;
        while (improved && passes < 10) {
            improved = false;
            passes++;
            MEAL_IDS.forEach(mealId => {
                const pool = pools[mealId];
                if (pool.length === 0) return;
                const currentScore = dayScore(bestCfg, recentlyUsed);
                pool.forEach(candidate => {
                    const trial = Object.assign({}, bestCfg, { [mealId]: [candidate.id] });
                    const trialScore = dayScore(trial, recentlyUsed);
                    if (trialScore < currentScore) {
                        bestCfg = trial;
                        improved = true;
                    }
                });
            });
        }

        return bestCfg;
    }

    // Process days Monday → Sunday, tracking recipe usage by day index
    // recentlyUsed: Map<recipeId, lastDayIdx> — daysSince = currentDayIdx - lastDayIdx
    const recentlyUsed = new Map();
    const newWeek = {};

    window.DAY_LABELS.forEach((d, dayIdx) => {
        // Reframe map to daysSince for scoring
        const daysSinceMap = new Map();
        recentlyUsed.forEach((lastDayIdx, rid) => {
            daysSinceMap.set(rid, dayIdx - lastDayIdx);
        });

        const cfg = bestConfigForDay(daysSinceMap);
        newWeek[d.id] = cfg;

        // Update recentlyUsed with this day's picks
        Object.values(cfg).forEach(arr => (arr || []).forEach(rid => {
            recentlyUsed.set(rid, dayIdx);
        }));
    });

    await window.saveWeek(newWeek);
    window.showToast('Plan semanal generado', 'success');
    window.renderPage();
}

function generateShoppingFromWeek() {
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
            done: false,
        };
    });
    const existing = window.AppState.shopping || [];
    window.saveShopping(newItems.concat(existing));
    window.showToast(`${newItems.length} ingredientes añadidos a la lista`, 'success');
    window.gotoPage('shopping');
}

/* ---- Mobile render ---- */

function _defaultMobileDay() {
    const todayId = window.todayDowId();
    const idx = window.DAY_LABELS.findIndex(d => d.id === todayId);
    return idx >= 0 ? idx : 0;
}

function _renderMobilePickerRecipeList() {
    const recipes = window.AppState.recipes || [];
    const fp = recipes.filter(r =>
        !weekMobilePickerSearch ||
        r.name.toLowerCase().includes(weekMobilePickerSearch.toLowerCase())
    );

    const recipeListHTML = fp.map(r => {
        const m = window.recipeMacros(r);
        return `
            <div class="recipe-pill" data-pick-recipe="${window.esc(r.id)}">
                <span class="emoji">🍽️</span>
                <div class="info">
                    <div class="ttl">${window.esc(r.name)}</div>
                    <div class="sub">${Math.round(m.kcal)} kcal · P${Math.round(m.p)} · ${r.time || '?'} min</div>
                </div>
            </div>
        `;
    }).join('');

    return recipeListHTML || `<div class="card empty"><div class="t">Sin recetas</div><div>Crea una en Recetas primero.</div></div>`;
}

function _wireMobilePickerHandlers(container) {
    container.querySelectorAll('[data-pick-recipe]').forEach(pill => {
        pill.addEventListener('click', async () => {
            if (!weekMobilePicker) return;
            const { dayId, mealId } = weekMobilePicker;
            weekMobilePicker = null;
            await placeRecipe(dayId, mealId, pill.dataset.pickRecipe, null);
        });
    });
}

function _renderWeekPickerMobile() {
    const mealName = WEEK_MEALS.find(m => m.id === weekMobilePicker.mealId)?.name || '';

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Añadir a ${mealName}</div>
                <h1 class="page-title">Elegir receta</h1>
            </div>
            <button class="btn ghost" data-action="close-picker">Cancelar</button>
        </div>

        <div class="search" style="margin-bottom:14px">
            ${window.icon('search')}
            <input id="week-m-search" placeholder="Buscar receta…" value="${window.esc(weekMobilePickerSearch)}"/>
        </div>

        <div class="stack" id="week-mpicker-list" style="gap:8px">
            ${_renderMobilePickerRecipeList()}
        </div>
    `;
}

function _renderWeekMobile() {
    if (weekMobileDay === null) weekMobileDay = _defaultMobileDay();
    if (weekMobilePicker) return _renderWeekPickerMobile();

    const week = window.AppState.week || {};
    const day = window.DAY_LABELS[weekMobileDay];
    const dayData = week[day.id] || {};
    const dt = dayTotalsFor(day.id);
    const wt = weekTotalsAll();
    const todayId = window.todayDowId();
    const goals = window.AppState.goals;

    const dayChips = window.DAY_LABELS.map((d, i) => {
        const isSel = i === weekMobileDay;
        const isToday = d.id === todayId;
        return `<button class="day-chip${isSel ? ' selected' : ''}${isToday ? ' today' : ''}" data-day-idx="${i}">${d.short}</button>`;
    }).join('');

    const mealsHTML = WEEK_MEALS.map(meal => {
        const items = (dayData[meal.id] || []);
        const itemsHTML = items.map((rid, idx) => {
            const r = recipeById(rid);
            if (!r) return '';
            const m = window.recipeMacros(r);
            return `
                <div class="week-mobile-item">
                    <div class="week-mobile-item-info">
                        <div class="ttl">${window.esc(r.name)}</div>
                        <div class="sub muted">${Math.round(m.kcal)} kcal · P${Math.round(m.p)}</div>
                    </div>
                    <button class="btn icon sm ghost" data-rm-day="${day.id}" data-rm-meal="${meal.id}" data-rm-idx="${idx}">${window.icon('trash')}</button>
                </div>
            `;
        }).join('');

        return `
            <div class="week-mobile-meal">
                <div class="week-mobile-meal-head">
                    <span class="week-mobile-meal-name">${meal.name}</span>
                    <button class="btn icon sm ghost" data-add-day="${day.id}" data-add-meal="${meal.id}">${window.icon('plus')}</button>
                </div>
                ${items.length > 0 ? itemsHTML : `<div class="week-mobile-empty">Sin recetas</div>`}
            </div>
        `;
    }).join('');

    const onGoal = dt.kcal >= goals.kcal * 0.92 && dt.kcal <= goals.kcal * 1.08;
    const kcalColor = dt.kcal > 0 ? (onGoal ? 'var(--accent)' : 'var(--ink)') : 'var(--ink-3)';

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">${window.formatWeekRange()}</div>
                <h1 class="page-title">Semana</h1>
            </div>
            <div class="row" style="gap:6px; flex-wrap:wrap">
                <button class="btn ghost sm" data-action="clear">Vaciar</button>
                <button class="btn sm" data-action="auto">${window.icon('sparkle')} Generar</button>
                <button class="btn accent sm" data-action="shopping">Lista</button>
            </div>
        </div>

        <div class="day-chip-strip">
            ${dayChips}
        </div>

        <div class="week-mobile-day-header">
            <div style="font-size:15px; font-weight:600">${day.short}</div>
            <div>
                <span class="num" style="font-size:16px; color:${kcalColor}">${Math.round(dt.kcal)} kcal</span>
                <span class="muted" style="font-size:12px"> · P${Math.round(dt.p)}g · C${Math.round(dt.c)}g · G${Math.round(dt.fat)}g</span>
            </div>
        </div>

        <div class="stack" style="gap:8px; margin-bottom:20px">
            ${mealsHTML}
        </div>

        <div class="grid cols-2" style="gap:10px; margin-bottom:24px">
            <div class="card tight"><div class="tiny">kcal / semana</div><div class="num" style="font-size:18px; margin-top:4px">${Math.round(wt.kcal)}</div><div class="muted" style="font-size:11px; font-family:var(--mono)">${Math.round(wt.kcal/7)} / día</div></div>
            <div class="card tight"><div class="tiny">Proteína / sem.</div><div class="num" style="font-size:18px; margin-top:4px">${Math.round(wt.p)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">${Math.round(wt.p/7)}g / día</div></div>
            <div class="card tight"><div class="tiny">Carbos / sem.</div><div class="num" style="font-size:18px; margin-top:4px">${Math.round(wt.c)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">${Math.round(wt.c/7)}g / día</div></div>
            <div class="card tight"><div class="tiny">Grasas / sem.</div><div class="num" style="font-size:18px; margin-top:4px">${Math.round(wt.fat)}g</div><div class="muted" style="font-size:11px; font-family:var(--mono)">${Math.round(wt.fat/7)}g / día</div></div>
        </div>
    `;
}

/* ---- Desktop render ---- */

function _renderDesktopRecipeList() {
    const recipes = window.AppState.recipes || [];
    const filtered = recipes.filter(r => !weekFilter || r.name.toLowerCase().includes(weekFilter.toLowerCase()));
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
    return recipesHTML || `<div class="empty"><div class="t">Sin recetas</div><div>Crea una primero en Recetas.</div></div>`;
}

function _wireDesktopRecipePillHandlers(container) {
    container.querySelectorAll('.recipe-pill[draggable="true"]').forEach(pill => {
        pill.addEventListener('dragstart', (e) => {
            weekDragState = { recipeId: pill.dataset.rid, source: null };
            e.dataTransfer.effectAllowed = 'copy';
            pill.classList.add('dragging');
        });
        pill.addEventListener('dragend', () => { weekDragState = null; pill.classList.remove('dragging'); });
    });
}

window.renderWeek = function() {
    if (window.innerWidth < 1024) return _renderWeekMobile();

    const week = window.AppState.week || {};
    const goals = window.AppState.goals;
    const todayId = window.todayDowId();
    const wt = weekTotalsAll();

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

                <div class="grid cols-4" style="gap:14px; margin-top:22px">
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
                <div class="stack" id="week-recipes-list" style="gap:8px">
                    ${_renderDesktopRecipeList()}
                </div>
            </div>
        </div>
    `;
};

/* ---- Mobile init ---- */

function _initWeekMobile(root) {
    root.querySelectorAll('[data-day-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            weekMobileDay = Number(btn.dataset.dayIdx);
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-add-day]').forEach(btn => {
        btn.addEventListener('click', () => {
            weekMobilePicker = { dayId: btn.dataset.addDay, mealId: btn.dataset.addMeal };
            weekMobilePickerSearch = '';
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-rm-day]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await removeFromCell(btn.dataset.rmDay, btn.dataset.rmMeal, Number(btn.dataset.rmIdx));
        });
    });

    root.querySelector('[data-action="close-picker"]')?.addEventListener('click', () => {
        weekMobilePicker = null;
        window.renderPage();
    });

    const searchInput = root.querySelector('#week-m-search');
    if (searchInput) searchInput.addEventListener('input', e => {
        weekMobilePickerSearch = e.target.value;
        const list = document.getElementById('week-mpicker-list');
        if (list) {
            list.innerHTML = _renderMobilePickerRecipeList();
            _wireMobilePickerHandlers(list);
        }
    });

    const initialPickerList = root.querySelector('#week-mpicker-list');
    if (initialPickerList) _wireMobilePickerHandlers(initialPickerList);

    root.querySelector('[data-action="clear"]')?.addEventListener('click', async () => {
        if (await window.confirmDialog('¿Vaciar todo el plan semanal?')) await clearWeek();
    });
    root.querySelector('[data-action="auto"]')?.addEventListener('click', async () => generateAuto());
    root.querySelector('[data-action="shopping"]')?.addEventListener('click', generateShoppingFromWeek);
}

/* ---- Desktop init ---- */

window.initWeek = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    if (window.innerWidth < 1024) {
        _initWeekMobile(root);
        return;
    }

    const filterInput = root.querySelector('#week-filter');
    if (filterInput) filterInput.addEventListener('input', e => {
        weekFilter = e.target.value;
        const list = document.getElementById('week-recipes-list');
        if (list) {
            list.innerHTML = _renderDesktopRecipeList();
            _wireDesktopRecipePillHandlers(list);
        }
    });

    root.querySelector('[data-action="clear"]').addEventListener('click', async () => {
        if (await window.confirmDialog('¿Vaciar todo el plan semanal?')) await clearWeek();
    });
    root.querySelector('[data-action="auto"]').addEventListener('click', async () => generateAuto());
    root.querySelector('[data-action="shopping"]').addEventListener('click', generateShoppingFromWeek);

    const initialList = root.querySelector('#week-recipes-list');
    if (initialList) _wireDesktopRecipePillHandlers(initialList);

    root.querySelectorAll('.week-slot[draggable="true"]').forEach(slot => {
        slot.addEventListener('dragstart', (e) => {
            weekDragState = {
                recipeId: slot.dataset.rid,
                source: { fromDay: slot.dataset.day, fromMeal: slot.dataset.meal, idx: Number(slot.dataset.idx) },
            };
            e.dataTransfer.effectAllowed = 'move';
        });
        slot.addEventListener('dragend', () => { weekDragState = null; });
        slot.addEventListener('click', async () => {
            await removeFromCell(slot.dataset.day, slot.dataset.meal, Number(slot.dataset.idx));
        });
    });

    root.querySelectorAll('[data-cell]').forEach(cell => {
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('dragover'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
        cell.addEventListener('drop', async (e) => {
            e.preventDefault();
            cell.classList.remove('dragover');
            if (!weekDragState) return;
            const [day, meal] = cell.dataset.cell.split(':');
            const dragState = weekDragState;
            weekDragState = null;
            await placeRecipe(day, meal, dragState.recipeId, dragState.source);
        });
    });
};
