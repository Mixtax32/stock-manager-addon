/*
   View: Shopping — auto + manual list
   v0.7.0
*/

const CAT_ORDER = ['Carnicería', 'Pescadería', 'Lácteos', 'Verdulería', 'Frutería', 'Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'];

window.renderShopping = function() {
    const shopping = window.AppState.shopping || [];

    const byCat = shopping.reduce((acc, item) => {
        const key = item.cat || 'Otros';
        (acc[key] = acc[key] || []).push(item);
        return acc;
    }, {});
    const cats = Object.keys(byCat).sort((a, b) => {
        const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const totalItems = shopping.length;
    const doneItems = shopping.filter(x => x.done).length;
    const autoItems = shopping.filter(x => x.auto).length;

    const listHTML = cats.length === 0 ? `<div class="empty"><div class="t">Lista vacía</div><div>Añade productos manualmente o desde Despensa / Semana.</div></div>` : cats.map(c => `
        <div style="margin-top:18px">
            <div class="row" style="margin-bottom:4px; gap:8px">
                <div class="tiny">${window.esc(c)}</div>
                <div style="flex:1; height:1px; background:var(--line)"></div>
                <div class="tiny">${byCat[c].length}</div>
            </div>
            ${byCat[c].map(item => `
                <div class="shop-row ${item.done ? 'done' : ''}">
                    <div class="chk" data-toggle="${window.esc(item.id)}">${item.done ? window.icon('check') : ''}</div>
                    <div>
                        <div class="shop-name name">${window.esc(item.name)}</div>
                        <div class="shop-sub">${item.auto ? '🤖 Auto · stock bajo' : '✋ Añadido a mano'}</div>
                    </div>
                    <span class="chip" style="font-family:var(--mono)">${window.esc(item.qty || '')}</span>
                    <button class="btn icon sm ghost" data-remove="${window.esc(item.id)}">${window.icon('trash')}</button>
                </div>
            `).join('')}
        </div>
    `).join('');

    const progressPct = totalItems > 0 ? (doneItems / totalItems) * 100 : 0;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Lista de la compra</div>
                <h1 class="page-title">Por comprar</h1>
            </div>
            <div class="btn-group row" style="gap:8px">
                <button class="btn" data-action="share">Compartir</button>
                <button class="btn primary" data-action="mark-all">Marcar todo</button>
                <button class="btn ghost" data-action="clear-done">Limpiar hechos</button>
            </div>
        </div>

        <div class="grid cols-2 layout-shopping" style="gap:22px">
            <div class="card" style="padding:6px 22px 22px">
                <form id="shop-form" class="shop-add-form" style="padding:14px 0; border-bottom:1px solid var(--line)">
                    <input id="shop-name" class="input" placeholder="Añadir manualmente…"/>
                    <div class="shop-add-row">
                        <input id="shop-qty" class="input num" placeholder="500 g" style="width:90px"/>
                        <button class="btn accent" type="submit" style="flex:1">${window.icon('plus')} Añadir</button>
                    </div>
                </form>
                ${listHTML}
            </div>

            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">Resumen</div>
                    </div>
                    <div class="grid cols-3" style="gap:12px">
                        <div class="kpi"><div class="l">Total</div><div class="v">${totalItems}</div></div>
                        <div class="kpi"><div class="l">Auto</div><div class="v">${autoItems}</div></div>
                        <div class="kpi"><div class="l">Completos</div><div class="v">${doneItems}<span class="delta">/${totalItems}</span></div></div>
                    </div>
                    <div style="height:10px"></div>
                    <div class="track" style="height:6px; background:var(--bg-sunken); border-radius:999px; overflow:hidden">
                        <div style="width:${progressPct}%; height:100%; background:var(--accent); border-radius:999px; transition:width 280ms"></div>
                    </div>
                </div>

                <div class="card sunken">
                    <div class="card-title" style="margin-bottom:4px">${window.icon('sparkle')} ¿Cómo se generan?</div>
                    <div class="muted" style="font-size:12px; line-height:1.5">
                        La lista detecta los productos con <strong style="color:var(--ink)">stock bajo</strong> en tu inventario y los <strong style="color:var(--ink)">ingredientes que te faltan</strong> para tus recetas planificadas.
                        Puedes añadir manualmente cualquier producto.
                    </div>
                </div>

                ${cats.length > 0 ? `
                <div class="card">
                    <div class="card-title" style="margin-bottom:12px">Categorías</div>
                    <div class="stack" style="gap:8px">
                        ${cats.map(c => `<div class="spread"><span style="font-size:13px">${window.esc(c)}</span><span class="num" style="font-size:12px; color:var(--ink-3)">${byCat[c].length}</span></div>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;
};

window.initShopping = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    const form = root.querySelector('#shop-form');
    if (form) form.addEventListener('submit', e => {
        e.preventDefault();
        const name = root.querySelector('#shop-name').value.trim();
        const qty = root.querySelector('#shop-qty').value.trim();
        if (!name) return;
        const item = {
            id: 's' + Date.now(),
            name,
            qty: qty || '1 ud',
            cat: 'Otros',
            auto: false,
            done: false,
        };
        window.saveShopping([item].concat(window.AppState.shopping || []));
        window.renderPage();
    });

    root.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.toggle;
            const next = (window.AppState.shopping || []).map(x => x.id === id ? Object.assign({}, x, { done: !x.done }) : x);
            window.saveShopping(next);
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.remove;
            window.saveShopping((window.AppState.shopping || []).filter(x => x.id !== id));
            window.renderPage();
        });
    });

    root.querySelector('[data-action="mark-all"]')?.addEventListener('click', () => {
        const next = (window.AppState.shopping || []).map(x => Object.assign({}, x, { done: true }));
        window.saveShopping(next);
        window.renderPage();
    });

    root.querySelector('[data-action="clear-done"]')?.addEventListener('click', () => {
        window.saveShopping((window.AppState.shopping || []).filter(x => !x.done));
        window.renderNav();
        window.renderPage();
    });

    root.querySelector('[data-action="share"]')?.addEventListener('click', () => {
        const list = (window.AppState.shopping || []).map(x => `${x.done ? '✓' : '•'} ${x.name} — ${x.qty || ''}`).join('\n');
        if (navigator.share) {
            navigator.share({ title: 'Lista de la compra', text: list }).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(list).then(() => window.showToast('Lista copiada al portapapeles', 'success'));
        } else {
            window.showToast('Compartir no disponible', 'info');
        }
    });
};
