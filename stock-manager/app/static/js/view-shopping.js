/*
   View: Shopping — auto (derived from low-stock) + manual list
   v0.8.19
*/

const CAT_ORDER = ['Carnicería', 'Pescadería', 'Lácteos', 'Verdulería', 'Frutería', 'Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'];

// Derive auto items from products where stock < min_stock (never stored)
function _autoShoppingItems() {
    const products = window.AppState.products || [];
    return products
        .filter(p => p.min_stock != null && (p.stock || 0) < p.min_stock)
        .map(p => {
            const needed = Math.max(1, (p.min_stock || 1) - (p.stock || 0));
            const unit = p.unit_type === 'uds' ? 'ud' : (p.unit_type || 'g');
            return {
                id: `auto-${p.barcode}`,
                barcode: p.barcode,
                name: p.name,
                qty: needed,
                qtyText: `${needed % 1 === 0 ? needed : needed.toFixed(1)} ${unit}`,
                cat: p.category || 'Otros',
                auto: true,
                done: false,
            };
        });
}

function _groupByCat(items) {
    const byCat = items.reduce((acc, item) => {
        const key = item.cat || 'Otros';
        (acc[key] = acc[key] || []).push(item);
        return acc;
    }, {});
    const cats = Object.keys(byCat).sort((a, b) => {
        const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return { byCat, cats };
}

function _renderAutoRow(item) {
    return `
        <div class="shop-row">
            <div style="width:32px; display:flex; align-items:center; justify-content:center; color:var(--muted)">📦</div>
            <div style="flex:1">
                <div class="shop-name name">${window.esc(item.name)}</div>
                <div class="shop-sub"><span class="chip" style="font-size:10px; padding:1px 6px; background:color-mix(in oklab, var(--carbs-soft) 60%, var(--bg) 40%); color:var(--carbs)">stock bajo</span></div>
            </div>
            <span class="chip" style="font-family:var(--mono)">${window.esc(item.qtyText)}</span>
            <button class="btn sm accent" data-restock="${window.esc(item.id)}" data-barcode="${window.esc(item.barcode)}" data-needed="${item.qty}">Recibido</button>
        </div>
    `;
}

function _renderManualRow(item) {
    return `
        <div class="shop-row ${item.done ? 'done' : ''}">
            <div class="chk" data-toggle="${window.esc(item.id)}">${item.done ? window.icon('check') : ''}</div>
            <div style="flex:1">
                <div class="shop-name name">${window.esc(item.name)}</div>
                <div class="shop-sub">✋ Añadido a mano</div>
            </div>
            <span class="chip" style="font-family:var(--mono)">${window.esc(item.qty || '')}</span>
            <button class="btn icon sm ghost" data-remove="${window.esc(item.id)}">${window.icon('trash')}</button>
        </div>
    `;
}

function _renderSection(items, renderRow) {
    const { byCat, cats } = _groupByCat(items);
    return cats.map(c => `
        <div style="margin-top:18px">
            <div class="row" style="margin-bottom:4px; gap:8px">
                <div class="tiny">${window.esc(c)}</div>
                <div style="flex:1; height:1px; background:var(--line)"></div>
                <div class="tiny">${byCat[c].length}</div>
            </div>
            ${byCat[c].map(renderRow).join('')}
        </div>
    `).join('');
}

window.renderShopping = function() {
    const manual = window.AppState.shopping || [];
    const auto = _autoShoppingItems();

    const totalAuto = auto.length;
    const totalManual = manual.length;
    const doneManual = manual.filter(x => x.done).length;

    const autoSectionHTML = `
        <div style="margin-bottom:10px">
            <div class="row" style="gap:8px; align-items:center; margin-bottom:2px">
                <div class="card-title" style="font-size:13px; text-transform:uppercase; letter-spacing:.05em">Faltan en despensa</div>
                <span class="chip">${totalAuto}</span>
            </div>
            ${totalAuto === 0
                ? `<div style="padding:14px 0; color:var(--muted); font-size:13px">✓ Todo en stock — no falta nada</div>`
                : _renderSection(auto, _renderAutoRow)
            }
        </div>
    `;

    const manualAddBtn = `<button class="btn sm accent" data-action="add-manual">${window.icon('plus')} Añadir</button>`;

    const manualSectionHTML = `
        <div style="margin-top:28px; border-top:1px solid var(--line); padding-top:20px">
            <div class="row" style="gap:8px; align-items:center; margin-bottom:2px">
                ${totalManual > 0 ? `<div class="card-title" style="font-size:13px; text-transform:uppercase; letter-spacing:.05em">Otros</div><span class="chip">${totalManual}</span>` : ''}
                <div style="flex:1"></div>
                ${manualAddBtn}
            </div>
            ${totalManual === 0
                ? `<div style="padding:10px 0; color:var(--muted); font-size:13px">Sin ítems extra. Usá el botón para añadir algo puntual.</div>`
                : _renderSection(manual, _renderManualRow)
            }
        </div>
    `;

    // inline add form (hidden by default, shown on "+ Añadir" click)
    const addFormHTML = `
        <form id="shop-form" class="shop-add-form" style="display:none; padding:14px 0; border-bottom:1px solid var(--line); margin-top:12px">
            <input id="shop-name" class="input" placeholder="Añadir manualmente…"/>
            <div class="shop-add-row">
                <input id="shop-qty" class="input num" placeholder="500 g" style="width:90px"/>
                <button class="btn accent" type="submit" style="flex:1">${window.icon('plus')} Añadir</button>
                <button class="btn ghost" type="button" data-action="cancel-add">Cancelar</button>
            </div>
        </form>
    `;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Lista de la compra</div>
                <h1 class="page-title">Por comprar</h1>
            </div>
            <div class="btn-group row" style="gap:8px">
                <button class="btn" data-action="share">Compartir</button>
                <button class="btn ghost" data-action="clear-done">Limpiar hechos</button>
            </div>
        </div>

        <div class="grid cols-2 layout-shopping" style="gap:22px">
            <div class="card" style="padding:6px 22px 22px">
                ${autoSectionHTML}
                ${manualSectionHTML}
                ${addFormHTML}
            </div>

            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">Resumen</div>
                    </div>
                    <div class="grid cols-3" style="gap:12px">
                        <div class="kpi"><div class="l">Stock bajo</div><div class="v">${totalAuto}</div></div>
                        <div class="kpi"><div class="l">Extra</div><div class="v">${totalManual}</div></div>
                        <div class="kpi"><div class="l">Hechos</div><div class="v">${doneManual}<span class="delta">/${totalManual}</span></div></div>
                    </div>
                </div>

                <div class="card sunken">
                    <div class="card-title" style="margin-bottom:4px">${window.icon('sparkle')} ¿Cómo se genera?</div>
                    <div class="muted" style="font-size:12px; line-height:1.5">
                        <strong style="color:var(--ink)">Faltan en despensa</strong> se actualiza solo: cualquier producto con stock menor al mínimo aparece acá y desaparece cuando reponés.<br><br>
                        <strong style="color:var(--ink)">Otros</strong> son ítems que agregás vos a mano o desde Semana.
                    </div>
                </div>

                ${(totalAuto > 0 || totalManual > 0) ? `
                <div class="card">
                    <div class="card-title" style="margin-bottom:12px">Categorías</div>
                    <div class="stack" style="gap:8px">
                        ${(() => {
                            const all = [...auto, ...manual];
                            const { byCat, cats } = _groupByCat(all);
                            return cats.map(c => `<div class="spread"><span style="font-size:13px">${window.esc(c)}</span><span class="num" style="font-size:12px; color:var(--ink-3)">${byCat[c].length}</span></div>`).join('');
                        })()}
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;
};

window.initShopping = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    // Show inline add form when user clicks "+ Añadir"
    root.querySelector('[data-action="add-manual"]')?.addEventListener('click', () => {
        const form = root.querySelector('#shop-form');
        if (form) { form.style.display = ''; form.querySelector('#shop-name')?.focus(); }
    });

    root.querySelector('[data-action="cancel-add"]')?.addEventListener('click', () => {
        const form = root.querySelector('#shop-form');
        if (form) form.style.display = 'none';
    });

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

    // "Recibido" on auto items: prompt qty and POST to /stock
    root.querySelectorAll('[data-restock]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const barcode = btn.dataset.barcode;
            const needed = Number(btn.dataset.needed) || 1;
            const qty = await window.promptQty(needed);
            if (!qty || qty <= 0) return;
            try {
                await window.apiCall(`/products/${barcode}/stock`, 'POST', { quantity: qty, reason: 'restock' });
                await window.reloadProducts();
                window.renderPage();
            } catch (e) {
                window.showToast('Error: ' + e.message, 'error');
            }
        });
    });

    root.querySelector('[data-action="clear-done"]')?.addEventListener('click', () => {
        window.saveShopping((window.AppState.shopping || []).filter(x => !x.done));
        window.renderNav();
        window.renderPage();
    });

    root.querySelector('[data-action="share"]')?.addEventListener('click', () => {
        const auto = _autoShoppingItems();
        const manual = window.AppState.shopping || [];
        const lines = [
            ...auto.map(x => `• ${x.name} — ${x.qtyText} (stock bajo)`),
            ...manual.map(x => `${x.done ? '✓' : '•'} ${x.name} — ${x.qty || ''}`),
        ].join('\n');
        if (navigator.share) {
            navigator.share({ title: 'Lista de la compra', text: lines }).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(lines).then(() => window.showToast('Lista copiada al portapapeles', 'success'));
        } else {
            window.showToast('Compartir no disponible', 'info');
        }
    });
};
