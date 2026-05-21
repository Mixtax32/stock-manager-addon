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
    goals: 'sm_goals',
    todayLog: 'sm_today_log',
    week: 'sm_week',
    recipes: 'sm_recipes',
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

    goals: Object.assign({}, DEFAULT_GOALS, lsGet(LS_KEYS.goals, {})),

    // today's diary — auto-resets when date changes
    todayLog: (() => {
        const stored = lsGet(LS_KEYS.todayLog, null);
        const today = todayDateStr();
        if (!stored || stored.date !== today) {
            return { date: today, meals: emptyMeals() };
        }
        // ensure structure
        stored.meals = Object.assign(emptyMeals(), stored.meals || {});
        return stored;
    })(),

    week: (() => {
        const stored = lsGet(LS_KEYS.week, null);
        if (!stored) return emptyWeek();
        const def = emptyWeek();
        Object.keys(def).forEach(k => { if (stored[k]) def[k] = stored[k]; });
        return def;
    })(),

    recipes: lsGet(LS_KEYS.recipes, []),
    shopping: lsGet(LS_KEYS.shopping, []),

    // HA API data — products and barcodes (loaded async)
    products: [],
};

// ===== Persist helpers =====
window.saveGoals = function(goals) {
    window.AppState.goals = goals;
    lsSet(LS_KEYS.goals, goals);
};
window.saveTodayLog = function(log) {
    window.AppState.todayLog = log;
    lsSet(LS_KEYS.todayLog, log);
};
window.saveWeek = function(week) {
    window.AppState.week = week;
    lsSet(LS_KEYS.week, week);
};
window.saveRecipes = function(recipes) {
    window.AppState.recipes = recipes;
    lsSet(LS_KEYS.recipes, recipes);
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

// ===== Macro math (works on HA products + recipe ingredients alike) =====

// Resolve a product by id (barcode) from in-memory store
window.findProductById = function(id) {
    return (window.AppState.products || []).find(p => String(p.barcode) === String(id));
};

// macrosFor: compute macros for an item { productId, qtyG }
// qtyG = quantity in grams (or ml/units depending on product unit type)
window.macrosFor = function(productId, qtyG) {
    const p = window.findProductById(productId);
    if (!p) return { kcal: 0, p: 0, c: 0, fat: 0 };
    const ratio = (Number(qtyG) || 0) / 100;
    return {
        kcal: (p.kcal_100g || 0) * ratio,
        p:    (p.proteins_100g || 0) * ratio,
        c:    (p.carbs_100g || 0) * ratio,
        fat:  (p.fat_100g || 0) * ratio,
    };
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

// ===== Active page mutators (helpers used by views) =====
window.addToMeal = function(mealId, item) {
    const log = window.AppState.todayLog;
    log.meals[mealId] = log.meals[mealId] || [];
    log.meals[mealId].push(item);
    window.saveTodayLog(log);
};
window.removeFromMeal = function(mealId, idx) {
    const log = window.AppState.todayLog;
    if (!log.meals[mealId]) return;
    log.meals[mealId].splice(idx, 1);
    window.saveTodayLog(log);
};

// Apply theme on load
document.body.setAttribute('data-theme', window.AppState.theme === 'dark' ? 'dark' : 'cream');
