/*
   Navigation & Theme — vanilla
   v0.7.0
*/

window.NAV_ITEMS = [
    { id: 'today',    name: 'Hoy',      ico: 'today' },
    { id: 'week',     name: 'Semana',   ico: 'week' },
    { id: 'recipes',  name: 'Recetas',  ico: 'recipe' },
    { id: 'pantry',   name: 'Despensa', ico: 'pantry' },
    { id: 'shopping', name: 'Compra',   ico: 'shop' },
    { id: 'scan',     name: 'Escanear', ico: 'scan' },
    { id: 'settings', name: 'Ajustes',  ico: 'settings' },
];

window.renderNav = function() {
    const sidebarNav = document.getElementById('nav-items');
    const tabbar = document.getElementById('tabbar');
    const current = window.AppState.page;

    // Counts/badges
    const products = window.AppState.products || [];
    const lowStock = products.filter(p => p.min_stock != null && (p.stock || 0) < p.min_stock).length;
    const expiringSoon = products.reduce((acc, p) => {
        (p.batches || []).forEach(b => {
            if (!b.expiry_date) return;
            const d = window.daysUntil(b.expiry_date);
            if (d <= 3 && d >= -30) acc++;
        });
        return acc;
    }, 0);
    const shopPending = (window.AppState.shopping || []).filter(s => !s.done).length;

    function badgeFor(id) {
        if (id === 'pantry' && expiringSoon > 0) return expiringSoon;
        if (id === 'shopping' && shopPending > 0) return shopPending;
        return null;
    }

    if (sidebarNav) {
        sidebarNav.innerHTML = window.NAV_ITEMS.map(n => {
            const isActive = n.id === current;
            const badge = badgeFor(n.id);
            return `
                <button class="nav-item" ${isActive ? 'aria-current="page"' : ''} data-page="${n.id}">
                    <span class="nav-ico">${window.icon(n.ico)}</span>
                    <span>${n.name}</span>
                    ${badge != null ? `<span class="nav-badge">${badge}</span>` : ''}
                </button>
            `;
        }).join('');
        sidebarNav.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => window.gotoPage(btn.dataset.page));
        });
    }

    if (tabbar) {
        tabbar.innerHTML = window.NAV_ITEMS.map(n => {
            const isActive = n.id === current;
            return `
                <button class="tab" ${isActive ? 'aria-current="page"' : ''} data-page="${n.id}">
                    ${window.icon(n.ico)}
                    <span>${n.name}</span>
                </button>
            `;
        }).join('');
        tabbar.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => window.gotoPage(btn.dataset.page));
        });
    }
};

window.gotoPage = async function(page) {
    if (typeof window.navGuard === 'function') {
        const allowed = await window.navGuard();
        if (!allowed) return;
    }
    window.navGuard = null;
    window.AppState.page = page;
    window.renderPage();
    window.renderNav();
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.renderPage = function() {
    const root = document.getElementById('page-root');
    if (!root) return;
    const page = window.AppState.page;
    const renderers = {
        today:    window.renderToday,
        week:     window.renderWeek,
        recipes:  window.renderRecipes,
        pantry:   window.renderPantry,
        shopping: window.renderShopping,
        settings: window.renderSettings,
        scan:     window.renderScan,
    };
    const inits = {
        today:    window.initToday,
        week:     window.initWeek,
        recipes:  window.initRecipes,
        pantry:   window.initPantry,
        shopping: window.initShopping,
        settings: window.initSettings,
        scan:     window.initScan,
    };
    const fn = renderers[page];
    if (typeof fn === 'function') {
        root.innerHTML = fn();
        const initFn = inits[page];
        if (typeof initFn === 'function') initFn();
    } else {
        root.innerHTML = `<div class="empty"><div class="t">Vista no encontrada</div><div>${window.esc(page)}</div></div>`;
    }
};

window.toggleTheme = function() {
    const next = window.AppState.theme === 'dark' ? 'cream' : 'dark';
    window.saveTheme(next);
};
