/*
   View: Today — macro diary
   v0.7.0
*/

function _calcDayTotals() {
    const meals = window.AppState.todayLog.meals || {};
    const all = window.MEAL_ORDER.flatMap(m => meals[m.id] || []);
    return window.sumMacros(all);
}

window.renderToday = function() {
    const goals = window.AppState.goals;
    const meals = window.AppState.todayLog.meals || {};
    const totals = _calcDayTotals();

    const remaining = {
        kcal: Math.max(0, goals.kcal - totals.kcal),
        p:    Math.max(0, goals.p    - totals.p),
        c:    Math.max(0, goals.c    - totals.c),
        fat:  Math.max(0, goals.fat  - totals.fat),
    };

    // Suggestions: recipes that get us closest to remaining
    const recipes = window.AppState.recipes || [];
    const suggestions = recipes.map(r => {
        const m = window.recipeMacros(r);
        const diffK = Math.abs(m.kcal - remaining.kcal);
        const diffP = Math.abs(m.p - remaining.p) * 4;
        return { recipe: r, macros: m, score: diffK + diffP };
    }).sort((a, b) => a.score - b.score).slice(0, 4);

    const mealsHTML = window.MEAL_ORDER.map(meal => {
        const items = meals[meal.id] || [];
        const m = window.sumMacros(items);
        const itemsHTML = items.map((it, i) => {
            const p = window.findProductById(it.productId);
            const name = p ? p.name : `Producto desconocido (${it.productId})`;
            const unit = p ? (p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g')) : 'g';
            const im = window.macrosFor(it.productId, it.qty);
            return `
                <div class="food-row">
                    <div class="row">
                        <span style="font-size:20px; margin-right:10px;">🍽️</span>
                        <div>
                            <div class="ttl">${window.esc(name)}</div>
                            <div class="sub"><span class="num">${it.qty}</span> ${unit}<span class="muted"> · ${Math.round(im.kcal)} kcal</span></div>
                        </div>
                    </div>
                    <div class="macros">
                        <span class="chip p" title="Proteína">P ${Math.round(im.p)}</span>
                        <span class="chip c" title="Carbos">C ${Math.round(im.c)}</span>
                        <span class="chip f" title="Grasas">G ${Math.round(im.fat)}</span>
                    </div>
                    <div class="actions">
                        <button class="btn icon sm ghost" data-remove="${meal.id}:${it.movementId || i}" title="Eliminar">${window.icon('trash')}</button>
                    </div>
                </div>
            `;
        }).join('');
        return `
            <div class="meal">
                <div class="meal-head" data-add-meal="${meal.id}" role="button" tabindex="0" style="cursor:pointer">
                    <div class="meal-name"><span>${meal.name}</span></div>
                    <div class="row" style="gap:10px">
                        ${items.length > 0 ? window.macroChipsHTML(m, true) : ''}
                        <span style="color:var(--ink-3); width:16px; height:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0">${window.icon('plus')}</span>
                    </div>
                </div>
                ${itemsHTML}
            </div>
        `;
    }).join('');

    const suggestHTML = suggestions.map((s, i) => `
        <div class="suggest">
            <div class="suggest-thumb">🍽️</div>
            <div>
                <div class="suggest-title">${window.esc(s.recipe.name)}</div>
                <div class="suggest-sub">
                    <span class="num">${Math.round(s.macros.kcal)}</span> kcal · <span class="num">${Math.round(s.macros.p)}g</span> proteína · ${s.recipe.time || '?'} min
                </div>
            </div>
            <div class="stack" style="align-items:flex-end; gap:6px">
                <span class="suggest-fit">${i === 0 ? '↑ Mejor encaje' : `${Math.max(60, 100 - Math.round(s.score / 5))}%`}</span>
                <button class="btn sm" data-add-recipe="${window.esc(s.recipe.id)}">Añadir a cena</button>
            </div>
        </div>
    `).join('');

    const splitHTML = window.MEAL_ORDER.filter(m => (meals[m.id] || []).length > 0).map(meal => {
        const m = window.sumMacros(meals[meal.id]);
        const pct = goals.kcal > 0 ? (m.kcal / goals.kcal) * 100 : 0;
        return `
            <div>
                <div class="spread" style="margin-bottom:4px">
                    <span style="font-size:13px">${meal.name}</span>
                    <span class="num" style="font-size:12px; color:var(--ink-3)">${Math.round(m.kcal)} kcal · ${Math.round(pct)}%</span>
                </div>
                <div class="macro-bar" style="grid-template-columns:1fr">
                    <div class="track" style="height:6px"><div class="fill" style="width:${pct}%; background:var(--accent)"></div></div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">${window.formatTodayDate()}</div>
                <h1 class="page-title">Tu día</h1>
            </div>
        </div>

        <div class="card" style="margin-bottom:22px; display:flex; flex-direction:column; align-items:center; gap:0; padding:26px 26px 20px">
            <div style="display:flex; flex-direction:column; align-items:center; gap:18px; width:100%">
                ${window.macroRingHTML(totals.kcal, goals.kcal, totals.p, totals.c, totals.fat, 220, 18)}
                <div class="row" style="gap:14px; flex-wrap:wrap; justify-content:center">
                    <span class="row" style="gap:6px"><span class="dot p"></span><span class="tiny">Proteína</span></span>
                    <span class="row" style="gap:6px"><span class="dot c"></span><span class="tiny">Carbos</span></span>
                    <span class="row" style="gap:6px"><span class="dot f"></span><span class="tiny">Grasas</span></span>
                </div>
            </div>
            <div style="height:1px; background:var(--line); margin:20px 0 16px; width:100%"></div>
            <div style="width:100%">
                <div class="card-head" style="padding:0 0 12px">
                    <div class="card-title">Objetivo de macros</div>
                    <span class="card-sub">${Math.round(totals.kcal)} / ${Math.round(goals.kcal)} kcal</span>
                </div>
                ${window.macroBarsHTML(totals, goals)}
            </div>
        </div>

        <div class="grid cols-2 layout-panel-r">
            <div class="card">
                <div class="card-head">
                    <div class="card-title">Diario de comidas</div>
                    <div class="row" style="gap:6px">
                        <button class="btn sm ghost" data-page="scan">${window.icon('scan')} Escanear</button>
                    </div>
                </div>
                ${mealsHTML}
            </div>

            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">${window.icon('sparkle')} Sugerencias para cerrar el día</div>
                    </div>
                    <div class="muted" style="font-size:12px; margin-bottom:8px">
                        Encajan con tus <strong style="color:var(--ink)" class="num">${Math.round(remaining.kcal)}</strong> kcal y <strong style="color:var(--ink)" class="num">${Math.round(remaining.p)}g</strong> de proteína restantes.
                    </div>
                    ${suggestions.length === 0 ? `<div class="empty"><div class="t">Sin recetas todavía</div><div>Crea recetas para ver sugerencias.</div></div>` : suggestHTML}
                </div>

                ${splitHTML ? `
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">Reparto del día</div>
                        <span class="card-sub">por comida</span>
                    </div>
                    <div class="stack" style="gap:10px">${splitHTML}</div>
                </div>` : ''}
            </div>
        </div>
    `;
};

window.initToday = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    root.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => window.gotoPage(btn.dataset.page));
    });

    root.querySelectorAll('[data-add-meal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mealId = btn.dataset.addMeal;
            const meal = window.MEAL_ORDER.find(m => m.id === mealId);
            window.openFoodPicker({
                title: meal ? `Añadir a ${meal.name}` : 'Añadir alimento',
                onPick: async (item) => {
                    await window.addToMeal(mealId, item);
                    window.renderPage();
                },
            });
        });
    });

    root.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const [mealId, rawId] = btn.dataset.remove.split(':');
            const movementId = Number(rawId);
            await window.removeFromMeal(mealId, movementId);
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-add-recipe]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const recipeId = btn.dataset.addRecipe;
            const r = (window.AppState.recipes || []).find(x => x.id === recipeId);
            if (!r) return;
            const serves = Math.max(1, r.serves || 1);
            for (const ing of (r.ingredients || [])) {
                await window.addToMeal('cena', { productId: ing.productId, qty: (ing.qty || 0) / serves });
            }
            window.showToast(`Receta "${r.name}" añadida a cena`, 'success');
            window.renderPage();
        });
    });
};
