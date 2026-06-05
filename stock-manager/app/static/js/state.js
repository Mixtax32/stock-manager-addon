/*
   App State + localStorage sync
   v0.7.0
*/

// ===== Constants =====
window.MEAL_ORDER = [
    { id: 'desayuno', name: 'Desayuno', time: '08:00' },
    { id: 'almuerzo', name: 'Almuerzo', time: '11:00' },
    { id: 'comida',   name: 'Comida',   time: '14:30' },
    { id: 'merienda', name: 'Merienda', time: '17:30' },
    { id: 'cena',     name: 'Cena',     time: '21:00' },
    { id: 'snacks',   name: 'Snacks',   time: '—' },
];

window.DAY_LABELS = [
    { id: 'lun', short: 'Lun', name: 'Lunes' },
    { id: 'mar', short: 'Mar', name: 'Martes' },
    { id: 'mie', short: 'Mié', name: 'Miércoles' },
    { id: 'jue', short: 'Jue', name: 'Jueves' },
    { id: 'vie', short: 'Vie', name: 'Viernes' },
    { id: 'sab', short: 'Sáb', name: 'Sábado' },
    { id: 'dom', short: 'Dom', name: 'Domingo' },
];

// ===== Defaults =====
const DEFAULT_GOALS = {
    kcal: 2200,
    p: 130,
    c: 250,
    fat: 70,
    factors: { p: 4, c: 4, fat: 9 },
};

function emptyMeals() {
    return { desayuno: [], almuerzo: [], comida: [], merienda: [], cena: [], snacks: [] };
}

function emptyWeek() {
    const w = {};
    window.DAY_LABELS.forEach(d => w[d.id] = {});
    return w;
}

function todayDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ===== Storage =====
const LS_KEYS = {
    shopping: 'sm_shopping',
    theme: 'sm_theme',
};

function lsGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
    } catch (e) { return fallback; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// ===== App State (in-memory mirror) =====
window.AppState = {
    page: 'today',
    theme: lsGet(LS_KEYS.theme, 'cream'),

    // goals: loaded from HA backend via reloadGoals()
    goals: Object.assign({}, DEFAULT_GOALS),

    // today's diary: loaded from HA backend via reloadTodayLog()
    todayLog: { date: todayDateStr(), meals: emptyMeals() },

    // weekly plan: loaded from HA backend via reloadWeek()
    week: emptyWeek(),

    recipes: [], // loaded from HA backend via reloadRecipes()
    shopping: lsGet(LS_KEYS.shopping, []),

    // HA API data — products and barcodes (loaded async)
    products: [],
    frequentBarcodes: [], // loaded async by reloadFrequentProducts()

    bodyWeight: 75, // overwritten by reloadBodyWeight() on boot
};

// ===== Persist helpers =====
window.saveRecipes = function(recipes) {
    // Kept for compatibility — recipes are persisted via the HA API, not localStorage
    window.AppState.recipes = recipes;
};
window.saveShopping = function(shopping) {
    window.AppState.shopping = shopping;
    lsSet(LS_KEYS.shopping, shopping);
};
window.saveTheme = function(theme) {
    window.AppState.theme = theme;
    lsSet(LS_KEYS.theme, theme);
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'cream');
};

// ===== Backend-wired state functions =====

window.reloadBodyWeight = async function() {
    try {
        const data = await window.apiCall('/weight/latest', 'GET');
        if (data && Number.isFinite(data.weight)) {
            window.AppState.bodyWeight = data.weight;
        }
    } catch (e) {
        console.error('reloadBodyWeight failed', e);
    }
};

window.reloadFrequentProducts = async function() {
    try {
        const data = await window.apiCall('/stats/frequent-products', 'GET');
        window.AppState.frequentBarcodes = Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('reloadFrequentProducts failed', e);
    }
};

window.saveBodyWeight = async function(weight) {
    try {
        await window.apiCall('/weight', 'POST', { weight });
        window.AppState.bodyWeight = weight;
    } catch (e) {
        console.error('saveBodyWeight failed', e);
        window.showToast('Error guardando peso: ' + e.message, 'error');
    }
};

window.reloadGoals = async function() {
    try {
        const data = await window.apiCall('/stats/macro-goals', 'GET');
        window.AppState.goals = {
            kcal: data.kcal,
            p: data.proteins,
            c: data.carbs,
            fat: data.fat,
            factors: Object.assign({}, DEFAULT_GOALS.factors, window.AppState.goals.factors),
        };
    } catch (e) {
        console.error('reloadGoals failed', e);
    }
};

window.saveGoals = async function(goals) {
    try {
        await window.apiCall('/stats/macro-goals', 'PATCH', {
            kcal: goals.kcal,
            proteins: goals.p,
            carbs: goals.c,
            fat: goals.fat,
        });
        window.AppState.goals = goals;
    } catch (e) {
        console.error('saveGoals failed', e);
        window.showToast('Error guardando objetivos: ' + e.message, 'error');
    }
};

window.reloadTodayLog = async function() {
    try {
        const movements = await window.apiCall('/stats/today-movements', 'GET');
        const meals = emptyMeals();
        (movements || []).forEach(m => {
            const mealKey = m.meal_type || 'snacks';
            if (!meals[mealKey]) meals[mealKey] = [];
            meals[mealKey].push({
                productId: m.barcode,
                qty: Math.abs(m.quantity_change),
                movementId: m.id,
            });
        });
        window.AppState.todayLog = { date: todayDateStr(), meals };
    } catch (e) {
        console.error('reloadTodayLog failed', e);
    }
};

window.addToMeal = async function(mealId, item) {
    const product = window.findProductById(item.productId);
    if (!product) {
        window.showToast('Producto no encontrado', 'error');
        return;
    }
    try {
        await window.apiCall(`/products/${item.productId}/stock`, 'POST', {
            quantity: -item.qty,
            reason: 'consumed',
            meal_type: mealId,
        });
        // Optimistic local update before full reload
        const log = window.AppState.todayLog;
        log.meals[mealId] = log.meals[mealId] || [];
        log.meals[mealId].push(item);
        await window.reloadProducts();
        await window.reloadTodayLog();
    } catch (e) {
        console.error('addToMeal failed', e);
        window.showToast('Error añadiendo al diario: ' + e.message, 'error');
    }
};

window.removeFromMeal = async function(mealId, movementId) {
    try {
        await window.apiCall(`/movements/${movementId}?restore_stock=true`, 'DELETE');
        await window.reloadProducts();
        await window.reloadTodayLog();
    } catch (e) {
        console.error('removeFromMeal failed', e);
        window.showToast('Error eliminando del diario: ' + e.message, 'error');
    }
};

window.editMeal = async function(movementId, newQty) {
    if (!Number.isFinite(newQty) || newQty <= 0) {
        window.showToast('La cantidad debe ser mayor a 0', 'error');
        return;
    }
    try {
        await window.apiCall(`/movements/${movementId}`, 'PATCH', { quantity: newQty });
        await window.reloadProducts();
        await window.reloadTodayLog();
    } catch (e) {
        console.error('editMeal failed', e);
        window.showToast('Error editando cantidad: ' + e.message, 'error');
    }
};

// ===== Week helpers =====

function _mondayOfCurrentWeek() {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function _isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _dateForDayId(dayId) {
    const idx = window.DAY_LABELS.findIndex(d => d.id === dayId);
    if (idx < 0) return null;
    const monday = _mondayOfCurrentWeek();
    const target = new Date(monday);
    target.setDate(monday.getDate() + idx);
    return _isoDate(target);
}

window.reloadWeek = async function() {
    try {
        const monday = _mondayOfCurrentWeek();
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const start = _isoDate(monday);
        const end = _isoDate(sunday);
        const plans = await window.apiCall(`/diet-plan?start_date=${start}&end_date=${end}`, 'GET');

        const week = emptyWeek();
        // Store planId mapping: week[dayId][mealId] is array of recipeIds for rendering
        // We also maintain a planId lookup: weekPlanIds[dayId][mealId] = [planId, ...]
        const planIds = {};
        window.DAY_LABELS.forEach(d => { planIds[d.id] = {}; });

        (plans || []).forEach(plan => {
            // Find dayId from plan.date
            const planDate = new Date(plan.date + 'T00:00:00');
            const dow = (planDate.getDay() + 6) % 7; // Monday = 0
            const dayId = window.DAY_LABELS[dow] ? window.DAY_LABELS[dow].id : null;
            if (!dayId) return;
            const mealId = plan.meal_type;
            if (!week[dayId][mealId]) week[dayId][mealId] = [];
            if (!planIds[dayId][mealId]) planIds[dayId][mealId] = [];
            // Use recipe_id for the week grid (existing render logic expects recipe IDs)
            if (plan.recipe_id) {
                week[dayId][mealId].push(plan.recipe_id);
                planIds[dayId][mealId].push(plan.id);
            }
        });

        window.AppState.week = week;
        window.AppState._weekPlanIds = planIds;
    } catch (e) {
        console.error('reloadWeek failed', e);
    }
};

window.saveWeekItem = async function(dayId, mealType, recipeId) {
    try {
        const date = _dateForDayId(dayId);
        if (!date) return;
        await window.apiCall('/diet-plan', 'POST', {
            date,
            meal_type: mealType,
            recipe_id: recipeId,
            quantity: 1,
        });
        await window.reloadWeek();
    } catch (e) {
        console.error('saveWeekItem failed', e);
        window.showToast('Error guardando plan: ' + e.message, 'error');
    }
};

window.deleteWeekItem = async function(planId) {
    try {
        await window.apiCall(`/diet-plan/${planId}`, 'DELETE');
        await window.reloadWeek();
    } catch (e) {
        console.error('deleteWeekItem failed', e);
        window.showToast('Error eliminando del plan: ' + e.message, 'error');
    }
};

// saveWeek: kept for compatibility with view-week.js generateAuto / clearWeek.
// Replaces the full week in the backend by deleting existing plans and re-inserting.
window.saveWeek = async function(week) {
    // Optimistic local update first
    window.AppState.week = week;
    try {
        // Delete all existing plans for current week
        const monday = _mondayOfCurrentWeek();
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const existing = await window.apiCall(`/diet-plan?start_date=${_isoDate(monday)}&end_date=${_isoDate(sunday)}`, 'GET');
        for (const plan of (existing || [])) {
            await window.apiCall(`/diet-plan/${plan.id}`, 'DELETE');
        }
        // Insert new plans
        for (const [dayId, meals] of Object.entries(week)) {
            const date = _dateForDayId(dayId);
            if (!date) continue;
            for (const [mealId, items] of Object.entries(meals || {})) {
                for (const recipeId of (items || [])) {
                    await window.apiCall('/diet-plan', 'POST', {
                        date,
                        meal_type: mealId,
                        recipe_id: recipeId,
                        quantity: 1,
                    });
                }
            }
        }
        await window.reloadWeek();
    } catch (e) {
        console.error('saveWeek failed', e);
        window.showToast('Error guardando semana: ' + e.message, 'error');
    }
};

// ===== Macro math (works on HA products + recipe ingredients alike) =====

// Resolve a product by id (barcode) from in-memory store
window.findProductById = function(id) {
    return (window.AppState.products || []).find(p => String(p.barcode) === String(id));
};

// Stock units one ticket pack represents for a product:
//   g/ml: weight_g doubles as "amount per package" in this app
//   uds : serving_size = units per package (e.g. 4 lonchas), defaults to 1
// Returns null when the product has no known pack size (g/ml without weight_g)
// so callers can fall back to raw qty and warn the user.
window.packSize = function(product) {
    if (!product) return null;
    if (product.unit_type === 'uds') {
        return product.serving_size && product.serving_size > 0 ? product.serving_size : 1;
    }
    return product.weight_g && product.weight_g > 0 ? product.weight_g : null;
};

// macrosFor: compute macros for an item { productId, qty }
// qty is interpreted in the product's native unit:
//   - 'g' / 'ml' (or anything not 'uds'): qty is grams/ml → ratio = qty / 100
//   - 'uds': qty is number of units → convert to grams via weight_g, then divide by 100
// Mirrors the backend formula in database.py:get_daily_macros.
window.macrosFor = function(productId, qty) {
    const p = window.findProductById(productId);
    if (!p) return { kcal: 0, p: 0, c: 0, fat: 0 };
    const q = Number(qty) || 0;
    const gramsEquivalent = p.unit_type === 'uds' ? q * (p.weight_g || 100) : q;
    const ratio = gramsEquivalent / 100;
    return {
        kcal: (p.kcal_100g || 0) * ratio,
        p:    (p.proteins_100g || 0) * ratio,
        c:    (p.carbs_100g || 0) * ratio,
        fat:  (p.fat_100g || 0) * ratio,
    };
};

// fmtMacro: format a macro gram value showing at least the first decimal.
// (e.g. 12 -> "12.0", 12.34 -> "12.3"). Used so macros never look like bare ints.
window.fmtMacro = function(n) {
    return (Number(n) || 0).toFixed(1);
};

// macroSanity: sanity-check a product's stated kcal_100g against its macros
// using Atwater factors (protein 4, carbs 4, fat 9 kcal/g).
// Returns { computed, stated, diff, ratio, ok } or null when there isn't enough data.
// `ok` is false when the stated kcal can't be reconciled with the macros, which
// usually means the product's nutrition data was entered/scanned wrong.
window.macroSanity = function(product) {
    if (!product) return null;
    const stated = Number(product.kcal_100g) || 0;
    const p = Number(product.proteins_100g) || 0;
    const c = Number(product.carbs_100g) || 0;
    const f = Number(product.fat_100g) || 0;
    // Nothing to check if we have no nutrition data at all.
    if (stated <= 0 && p === 0 && c === 0 && f === 0) return null;
    const computed = p * 4 + c * 4 + f * 9;
    const diff = stated - computed;
    const ratio = computed > 0 ? stated / computed : (stated > 0 ? Infinity : 1);
    // Only meaningful when there are macros to reconcile against. A product with
    // kcal but no macros is incomplete, not inconsistent → don't flag it.
    if (computed <= 0) return { computed, stated, diff, ratio, ok: true };
    // Tolerance: allow up to 12 kcal/100g absolute slack (rounding of macros),
    // or 15% relative deviation. Beyond that the numbers don't add up.
    const ok = Math.abs(diff) <= 12 || Math.abs(diff) / computed <= 0.15;
    return { computed, stated, diff, ratio, ok };
};

window.sumMacros = function(items) {
    return (items || []).reduce((acc, it) => {
        const m = window.macrosFor(it.productId, it.qty);
        acc.kcal += m.kcal; acc.p += m.p; acc.c += m.c; acc.fat += m.fat;
        return acc;
    }, { kcal: 0, p: 0, c: 0, fat: 0 });
};

window.recipeMacros = function(recipe) {
    if (!recipe) return { kcal: 0, p: 0, c: 0, fat: 0 };
    const tot = window.sumMacros(recipe.ingredients || []);
    const s = Math.max(1, recipe.serves || 1);
    return { kcal: tot.kcal / s, p: tot.p / s, c: tot.c / s, fat: tot.fat / s };
};

window.daysUntil = function(dateStr) {
    if (!dateStr) return Infinity;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return Math.round((d - today) / (1000 * 60 * 60 * 24));
};

// ===== Toast (used across views) =====
window.showToast = function(message, kind = 'info', ms = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) { console.log('[toast]', kind, message); return; }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        el.style.transition = 'opacity 200ms, transform 200ms';
        setTimeout(() => el.remove(), 220);
    }, ms);
};

// ===== Format helpers =====
window.formatTodayDate = function() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const d = new Date();
    return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]}`;
};

window.formatWeekRange = function() {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // make Monday=0
    const monday = new Date(d); monday.setDate(d.getDate() - dow);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const wnum = (() => {
        const start = new Date(monday.getFullYear(), 0, 1);
        const days = Math.floor((monday - start) / 86400000);
        return Math.ceil((days + start.getDay() + 1) / 7);
    })();
    return `Semana ${wnum} · ${monday.getDate()}–${sunday.getDate()} ${months[sunday.getMonth()]}`;
};

window.todayDowId = function() {
    const idx = (new Date().getDay() + 6) % 7;
    return window.DAY_LABELS[idx].id;
};

// Apply theme on load
document.body.setAttribute('data-theme', window.AppState.theme === 'dark' ? 'dark' : 'cream');
