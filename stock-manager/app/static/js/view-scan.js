/*
   View: Scan — barcode scanner + ticket OCR
   v0.8.25 — adds "Leer ticket de compra" path alongside barcode flow
*/

let scanState = {
    phase: 'idle',           // idle | scanning | review | ticket-loading | ticket-review
    barcode: null,
    product: null,           // existing product if found
    barcodeData: null,       // from HA /barcode/{ean} lookup
    qty: 1,
    expiry: '',
    newProduct: {
        name: '',
        category: 'Alimentos',
        unit_type: 'g',
        location: '',
        min_stock: '',
        serving_size: '',
        kcal_100g: '',
        proteins_100g: '',
        carbs_100g: '',
        fat_100g: '',
        weight_g: '',
        image_url: null,
    },
    target: 'pantry',        // pantry | diary
    meal: 'comida',
    ticketLines: [],         // raw OCR lines from server
    ticketItems: [],         // [{ line, name, qty, unit_price?, total_price?, match: product|null, score, checked }]
    ticketSource: 'image',   // 'image' (OCR) or 'pdf' (Mercadona PDF parser)
    ticketMeta: null,        // { date, ticket_id, total } for PDF tickets
};

// ─── Barcode helpers ──────────────────────────────────────────────────────────

async function _scanImageFile(file) {
    if (typeof Html5Qrcode === 'undefined') {
        window.showToast('Librería de escaneo no disponible. Comprueba la conexión a internet.', 'error');
        return;
    }
    scanState.phase = 'scanning';
    window.renderPage();
    try {
        const decoded = await Html5Qrcode.scanFile(file, false);
        await _onScanSuccess(decoded);
    } catch (err) {
        scanState.phase = 'idle';
        window.renderPage();
        window.showToast('No se detectó código de barras. Acercate más e intentá de nuevo.', 'error');
    }
}

function _triggerFileInput() {
    const input = document.getElementById('camera-input');
    if (input) input.click();
}

async function _onScanSuccess(decodedText) {
    scanState.barcode = decodedText;
    scanState.phase = 'review';

    const existing = window.findProductById(decodedText);
    if (existing) {
        scanState.product = existing;
        scanState.qty = 1;
    } else {
        scanState.product = null;
        try {
            const data = await window.apiCall(`/barcode/${decodedText}`, 'GET');
            if (data && data.found) {
                scanState.barcodeData = data;
                scanState.newProduct.name = data.name || '';
                scanState.newProduct.image_url = data.image_url || null;
                scanState.newProduct.kcal_100g = data.kcal_100g || '';
                scanState.newProduct.proteins_100g = data.proteins_100g || '';
                scanState.newProduct.carbs_100g = data.carbs_100g || '';
                scanState.newProduct.fat_100g = data.fat_100g || '';
                scanState.newProduct.weight_g = data.weight_g || '';
                if (['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'].includes(data.category)) {
                    scanState.newProduct.category = data.category;
                }
            }
        } catch (e) {
            // not critical
        }
    }
    window.renderPage();
}

// ─── Ticket OCR helpers ───────────────────────────────────────────────────────

function _normalize(s) {
    return (s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, '').trim();
}

function _similarity(a, b) {
    // Dice coefficient on bigrams
    a = _normalize(a); b = _normalize(b);
    if (!a.length || !b.length) return 0;
    if (a === b) return 1;
    const bigrams = s => {
        const arr = [];
        for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
        return arr;
    };
    const A = bigrams(a), B = bigrams(b);
    const setB = new Map();
    B.forEach(x => setB.set(x, (setB.get(x) || 0) + 1));
    let hits = 0;
    A.forEach(x => { const c = setB.get(x); if (c > 0) { hits++; setB.set(x, c - 1); } });
    return (2 * hits) / (A.length + B.length);
}

function _parseLine(line) {
    // Extract leading qty "2 x Algo" / "2x Algo"; strip prices, weights, codes
    let qty = 1;
    let name = line;
    const qm = name.match(/^(\d+)\s*[xX×]\s+(.+)/);
    if (qm) { qty = parseInt(qm[1], 10); name = qm[2]; }
    name = name
        .replace(/\d+[,.]\d{2}\s*€?/g, '')
        .replace(/\d+[,.]\d{1,3}\s*(kg|g|l|ml|cl|ud|uds)\b/gi, '')
        .replace(/^\d{3,}\s+/, '')
        .replace(/^[-*.,\s]+/, '')
        .replace(/[-*.,\s]+$/, '')
        .trim();
    return { qty, name };
}

function _matchProducts(lines) {
    const products = window.AppState.products || [];
    const items = [];
    for (const rawLine of lines) {
        const { qty, name } = _parseLine(rawLine);
        if (!name || name.length < 2) continue;
        let best = null, bestScore = 0;
        for (const p of products) {
            const s = _similarity(name, p.name);
            if (s > bestScore && s >= 0.35) { bestScore = s; best = p; }
        }
        // De-dupe: if same product matched twice, sum qty
        const existing = items.find(it => it.match && best && it.match.barcode === best.barcode);
        if (existing) {
            existing.qty += qty;
        } else {
            items.push({ line: rawLine, name, qty, match: best, score: bestScore, checked: !!best });
        }
    }
    return items;
}

async function _processTicketFile(file) {
    scanState.phase = 'ticket-loading';
    scanState.ticketSource = 'image';
    scanState.ticketMeta = null;
    window.renderPage();
    try {
        const form = new FormData();
        form.append('file', file);
        const base = window.API_BASE || '/api';
        const resp = await fetch(`${base}/ocr/ticket`, { method: 'POST', body: form });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        scanState.ticketLines = data.lines || [];
        scanState.ticketItems = _matchProducts(scanState.ticketLines);
        scanState.phase = 'ticket-review';
    } catch (e) {
        window.showToast('Error leyendo ticket: ' + e.message, 'error');
        scanState.phase = 'idle';
    }
    window.renderPage();
}

function _packSize(product) {
    // How many stock-units one ticket pack represents.
    //   g/ml products: weight_g doubles as "grams per package" in this app.
    //   uds products: serving_size is the number of units per package
    //                 (e.g. 4 lonchas/pack, 4 panes/pack). Defaults to 1.
    // Returns null when the product has no known pack size — caller must
    // fall back to raw qty and warn the user to fill the macro fields.
    if (!product) return null;
    if (product.unit_type === 'uds') {
        return product.serving_size && product.serving_size > 0 ? product.serving_size : 1;
    }
    return product.weight_g && product.weight_g > 0 ? product.weight_g : null;
}

function _matchProductsFromStructured(structuredItems) {
    // PDF flow: items arrive already split — name is clean, qty + prices come
    // from the parser. Skip _parseLine and match name directly.
    const products = window.AppState.products || [];
    const items = [];
    for (const it of structuredItems) {
        const cleanName = (it.name || '').trim();
        if (!cleanName || cleanName.length < 2) continue;
        let best = null, bestScore = 0;
        for (const p of products) {
            const s = _similarity(cleanName, p.name);
            if (s > bestScore && s >= 0.35) { bestScore = s; best = p; }
        }
        const packs = it.qty || 1;
        const packSize = _packSize(best);
        const qty = (best && packSize != null) ? packs * packSize : packs;

        const existing = items.find(x => x.match && best && x.match.barcode === best.barcode);
        if (existing) {
            existing.packs += packs;
            existing.qty = (best && packSize != null) ? existing.packs * packSize : existing.packs;
            if (it.total_price != null) {
                existing.total_price = (existing.total_price || 0) + it.total_price;
            }
        } else {
            items.push({
                line: it.line || cleanName,
                name: cleanName,
                packs: packs,
                qty: qty,
                packSize: packSize,
                unit_price: it.unit_price ?? null,
                total_price: it.total_price ?? null,
                match: best,
                score: bestScore,
                checked: !!best,
            });
        }
    }
    return items;
}

async function _processTicketPdf(file) {
    scanState.phase = 'ticket-loading';
    scanState.ticketSource = 'pdf';
    window.renderPage();
    try {
        const form = new FormData();
        form.append('file', file);
        const base = window.API_BASE || '/api';
        const resp = await fetch(`${base}/ocr/ticket-pdf`, { method: 'POST', body: form });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const structured = data.items || [];
        scanState.ticketLines = structured.map(it => it.line || it.name);
        scanState.ticketItems = _matchProductsFromStructured(structured);
        scanState.ticketMeta = {
            date: data.date || null,
            ticket_id: data.ticket_id || null,
            total: data.total ?? null,
        };
        scanState.phase = 'ticket-review';
    } catch (e) {
        window.showToast('Error leyendo PDF: ' + e.message, 'error');
        scanState.phase = 'idle';
    }
    window.renderPage();
}

// ─── Render functions ─────────────────────────────────────────────────────────

function _renderIdle() {
    return `
        <div class="scan-stage scan-stage-desktop">
            <div class="scan-bg"></div>
            <div class="scan-grain"></div>
            <div class="scan-frame">
                <div class="scan-bars">${Array.from({ length: 24 }).map(() => '<span></span>').join('')}</div>
                <div class="scan-corner tl"></div>
                <div class="scan-corner tr"></div>
                <div class="scan-corner bl"></div>
                <div class="scan-corner br"></div>
            </div>
            <div class="scan-hint">Tomá una foto del código de barras</div>
        </div>
        <div class="scan-hero">
            <div class="scan-hero-icon">${window.icon('scan')}</div>
            <p class="scan-hero-label">Tomá una foto del código de barras y lo detectamos automáticamente</p>
        </div>
        <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none">
        <input type="file" id="ticket-input" accept="image/*" capture="environment" style="display:none">
        <input type="file" id="ticket-pdf-input" accept="application/pdf,.pdf" style="display:none">
        <div class="stack" style="gap:10px; margin-top:14px">
            <button class="btn accent scan-cta-btn" data-action="start" style="width:100%">${window.icon('scan')} Abrir cámara</button>
            <button class="btn ghost scan-cta-btn" data-action="start-ticket" style="width:100%">${window.icon('scan')} Leer ticket (foto)</button>
            <button class="btn ghost scan-cta-btn" data-action="start-ticket-pdf" style="width:100%">${window.icon('scan')} Leer ticket PDF (Mercadona)</button>
            <div class="row" style="gap:8px">
                <input id="manual-barcode" class="input" placeholder="Introduce el código de barras…" style="flex:1; min-width:0"/>
                <button class="btn" data-action="manual">Buscar</button>
            </div>
        </div>
    `;
}

function _renderScanning() {
    return `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:60px 20px; text-align:center">
            <div class="loader-spin"></div>
            <p style="font-size:14px; color:var(--ink-2); margin:0">Procesando imagen…</p>
        </div>
    `;
}

function _renderTicketLoading() {
    return `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:60px 20px; text-align:center">
            <div class="loader-spin"></div>
            <p style="font-size:14px; color:var(--ink-2); margin:0">Leyendo ticket… esto puede tardar unos segundos</p>
        </div>
    `;
}

function _fmtPrice(n) {
    if (n == null || isNaN(n)) return '';
    return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _renderTicketReview() {
    const items = scanState.ticketItems;
    const matched = items.filter(it => it.match).length;
    const checkedCount = items.filter(it => it.checked && it.match).length;
    const meta = scanState.ticketMeta;

    const metaBar = meta ? `
        <div class="row" style="gap:12px; flex-wrap:wrap; font-size:12px; color:var(--ink-2); margin-bottom:8px">
            ${meta.date ? `<span>📅 ${window.esc(meta.date)}</span>` : ''}
            ${meta.ticket_id ? `<span>🧾 ${window.esc(meta.ticket_id)}</span>` : ''}
            ${meta.total != null ? `<span>💶 Total ${_fmtPrice(meta.total)} €</span>` : ''}
        </div>
    ` : '';

    const rows = items.map((it, i) => {
        const priceLine = (it.total_price != null || it.unit_price != null) ? `
            <div class="ticket-row-price" style="font-size:12px; color:var(--ink-2); font-family:var(--mono)">
                ${it.unit_price != null ? `${_fmtPrice(it.unit_price)} €/u` : ''}${(it.unit_price != null && it.total_price != null) ? ' · ' : ''}${it.total_price != null ? `${_fmtPrice(it.total_price)} € total` : ''}
            </div>` : '';
        const unit = it.match ? (it.match.unit_type === 'uds' ? 'uds' : it.match.unit_type) : '';
        // Show "packs × packSize = total" so the user can verify the multiplier.
        // When pack size is unknown (g/ml product missing weight_g), warn explicitly.
        let packHint = '';
        if (it.match) {
            if (it.packSize != null) {
                packHint = `<div class="ticket-row-packs" style="font-size:11px; color:var(--ink-2)">
                    ${it.packs} pack${it.packs !== 1 ? 's' : ''} × ${it.packSize} ${unit}/pack = <strong>${it.qty} ${unit}</strong>
                </div>`;
            } else {
                packHint = `<div class="ticket-row-packs" style="font-size:11px; color:var(--warn, #c47b00)">
                    ⚠ ${it.packs} pack${it.packs !== 1 ? 's' : ''} — falta <em>weight_g</em> en este producto, se añadirá tal cual
                </div>`;
            }
        }
        return `
        <div class="ticket-row">
            <input type="checkbox" class="ticket-check" data-idx="${i}" ${it.checked ? 'checked' : ''}>
            <div class="ticket-row-info">
                <div class="ticket-row-match">${it.match ? window.esc(it.match.name) : '<span class="muted">Sin coincidencia</span>'}</div>
                <div class="ticket-row-line">${window.esc(it.line)}</div>
                ${priceLine}
                ${packHint}
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0">
                <input type="number" class="input num ticket-row-qty" data-idx="${i}" value="${it.qty}" min="0" step="any" style="width:70px">
                ${unit ? `<span class="muted" style="font-size:11px; min-width:24px">${unit}</span>` : ''}
            </div>
            <button class="btn ghost sm ticket-row-change" data-idx="${i}">Cambiar</button>
        </div>
        `;
    }).join('');

    return `
        <div style="margin-bottom:12px">
            <div style="font-size:13px; color:var(--ink-2)">Detecté <strong>${items.length}</strong> líneas, <strong>${matched}</strong> con coincidencia</div>
            ${metaBar}
        </div>
        <div class="ticket-list">
            ${rows || '<div class="empty">No se encontraron productos en el ticket.</div>'}
        </div>
        <div class="scan-actions-sticky row" style="justify-content:space-between; margin-top:12px">
            <button class="btn ghost" data-action="ticket-cancel">Cancelar</button>
            <button class="btn accent" data-action="ticket-confirm" ${checkedCount === 0 ? 'disabled' : ''}>
                Añadir ${checkedCount} item${checkedCount !== 1 ? 's' : ''} al stock
            </button>
        </div>
    `;
}

function _renderReview() {
    const p = scanState.product;
    const np = scanState.newProduct;
    const isNew = !p;

    const productCard = `
        <div class="product-card" style="margin-bottom:14px">
            <div class="pkg">
                ${(p && p.image_url) || np.image_url ? `<img src="${window.esc((p && p.image_url) || np.image_url)}" alt="">` : '📦'}
            </div>
            <div>
                <div class="brand-line">${isNew ? 'Producto nuevo' : 'En inventario'}</div>
                <div class="pname">${window.esc((p && p.name) || np.name || 'Sin nombre')}</div>
                <div class="ean">EAN ${window.esc(scanState.barcode)}</div>
                ${(p ? p.kcal_100g : np.kcal_100g) ? `
                <div class="row" style="gap:4px; margin-top:8px; flex-wrap:wrap">
                    <span class="chip k">${Math.round(Number((p && p.kcal_100g) || np.kcal_100g) || 0)} kcal</span>
                    <span class="chip p">P ${Number((p && p.proteins_100g) || np.proteins_100g) || 0}g</span>
                    <span class="chip c">C ${Number((p && p.carbs_100g) || np.carbs_100g) || 0}g</span>
                    <span class="chip f">G ${Number((p && p.fat_100g) || np.fat_100g) || 0}g</span>
                    <span class="muted" style="font-size:11px; font-family:var(--mono); align-self:center">/ 100${(p && p.unit_type === 'uds') || np.unit_type === 'uds' ? ' ud' : (p && p.unit_type) || np.unit_type}</span>
                </div>` : ''}
            </div>
        </div>
    `;

    const newProductFields = isNew ? `
        <div class="card sunken" style="margin-bottom:14px; padding:14px">
            <div class="card-title" style="margin-bottom:10px">Datos del producto nuevo</div>
            <div class="grid cols-2 keep" style="gap:10px">
                <div class="field" style="grid-column:span 2"><label class="field-label">Nombre</label><input id="np-name" class="input" value="${window.esc(np.name)}"/></div>
                <div class="field"><label class="field-label">Categoría</label>
                    <select id="np-cat" class="input">
                        <option value="Alimentos" ${np.category === 'Alimentos' ? 'selected' : ''}>Alimentos</option>
                        <option value="Bebidas" ${np.category === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                        <option value="Limpieza" ${np.category === 'Limpieza' ? 'selected' : ''}>Limpieza</option>
                        <option value="Higiene" ${np.category === 'Higiene' ? 'selected' : ''}>Higiene</option>
                        <option value="Otros" ${np.category === 'Otros' ? 'selected' : ''}>Otros</option>
                    </select>
                </div>
                <div class="field"><label class="field-label">Unidad</label>
                    <select id="np-unit" class="input">
                        <option value="g" ${np.unit_type === 'g' ? 'selected' : ''}>Gramos</option>
                        <option value="uds" ${np.unit_type === 'uds' ? 'selected' : ''}>Unidades</option>
                        <option value="ml" ${np.unit_type === 'ml' ? 'selected' : ''}>Mililitros</option>
                    </select>
                </div>
                <div class="field"><label class="field-label">Ubicación</label><input id="np-loc" class="input" placeholder="Nevera / Despensa…" value="${window.esc(np.location)}"/></div>
                <div class="field"><label class="field-label">Stock mín.</label><input id="np-min" class="input num" type="number" step="0.1" value="${window.esc(np.min_stock)}"/></div>
                <div class="field" style="grid-column:span 2"><label class="field-label">Macros (por 100g/100ml)</label>
                    <div class="grid cols-4 keep" style="gap:6px">
                        <input id="np-kcal" class="input num" type="number" step="0.1" placeholder="kcal" value="${window.esc(np.kcal_100g)}"/>
                        <input id="np-p" class="input num" type="number" step="0.1" placeholder="P" value="${window.esc(np.proteins_100g)}"/>
                        <input id="np-c" class="input num" type="number" step="0.1" placeholder="C" value="${window.esc(np.carbs_100g)}"/>
                        <input id="np-f" class="input num" type="number" step="0.1" placeholder="G" value="${window.esc(np.fat_100g)}"/>
                    </div>
                </div>
            </div>
        </div>
    ` : '';

    return `
        ${productCard}
        ${newProductFields}

        ${!isNew ? `
        <div class="seg" style="margin-bottom:14px; width:100%">
            <button style="flex:1" aria-pressed="${scanState.target === 'pantry'}" data-target="pantry">Añadir a despensa</button>
            <button style="flex:1" aria-pressed="${scanState.target === 'diary'}" data-target="diary">Añadir al diario</button>
        </div>` : ''}

        <div class="grid cols-2 keep" style="gap:12px; margin-bottom:14px">
            <div class="field">
                <label class="field-label">Cantidad</label>
                <input id="rv-qty" class="input lg num" type="number" step="0.1" value="${scanState.qty}"/>
            </div>
            ${scanState.target === 'diary' && !isNew ? `
            <div class="field">
                <label class="field-label">A qué comida</label>
                <select id="rv-meal" class="input" style="height:56px; font-size:16px">
                    ${window.MEAL_ORDER.map(m => `<option value="${m.id}" ${scanState.meal === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                </select>
            </div>` : `
            <div class="field">
                <label class="field-label">Caducidad</label>
                <input id="rv-exp" class="input lg" type="date" value="${window.esc(scanState.expiry)}"/>
            </div>`}
        </div>

        <div class="scan-actions-sticky row" style="justify-content:space-between">
            <button class="btn ghost" data-action="rescan">${window.icon('scan')} Escanear otro</button>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="cancel">Cancelar</button>
                <button class="btn accent scan-confirm-btn" data-action="confirm">${scanState.target === 'pantry' || isNew ? 'Guardar en despensa' : 'Añadir al diario'}</button>
            </div>
        </div>
    `;
}

// ─── Public render entry point ────────────────────────────────────────────────

window.renderScan = function() {
    let body = '';
    if (scanState.phase === 'idle') body = _renderIdle();
    else if (scanState.phase === 'scanning') body = _renderScanning();
    else if (scanState.phase === 'ticket-loading') body = _renderTicketLoading();
    else if (scanState.phase === 'ticket-review') body = _renderTicketReview();
    else body = _renderReview();

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Lector de códigos</div>
                <h1 class="page-title">Escanear producto</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-page="pantry">Despensa</button>
                <button class="btn ghost" data-page="today">Hoy</button>
            </div>
        </div>

        <div class="card">
            ${body}
        </div>
    `;
};

// ─── Init / event wiring ──────────────────────────────────────────────────────

window.initScan = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    root.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => window.gotoPage(btn.dataset.page));
    });

    if (scanState.phase === 'idle') {
        const fileInput = root.querySelector('#camera-input');
        if (fileInput) {
            fileInput.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) _scanImageFile(file);
                fileInput.value = '';
            });
        }

        const ticketInput = root.querySelector('#ticket-input');
        if (ticketInput) {
            ticketInput.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) _processTicketFile(file);
                ticketInput.value = '';
            });
        }

        const ticketPdfInput = root.querySelector('#ticket-pdf-input');
        if (ticketPdfInput) {
            ticketPdfInput.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) _processTicketPdf(file);
                ticketPdfInput.value = '';
            });
        }

        root.querySelector('[data-action="start"]')?.addEventListener('click', _triggerFileInput);

        root.querySelector('[data-action="start-ticket"]')?.addEventListener('click', () => {
            const ti = document.getElementById('ticket-input');
            if (ti) ti.click();
        });

        root.querySelector('[data-action="start-ticket-pdf"]')?.addEventListener('click', () => {
            const ti = document.getElementById('ticket-pdf-input');
            if (ti) ti.click();
        });

        root.querySelector('[data-action="manual"]')?.addEventListener('click', () => {
            const code = root.querySelector('#manual-barcode').value.trim();
            if (!code) return;
            _onScanSuccess(code);
        });

    } else if (scanState.phase === 'ticket-review') {
        // Checkbox toggles
        root.querySelectorAll('.ticket-check').forEach(cb => {
            cb.addEventListener('change', e => {
                const i = Number(e.target.dataset.idx);
                scanState.ticketItems[i].checked = e.target.checked;
                window.renderPage();
            });
        });

        // Qty inputs — accept decimals so the user can fine-tune grams/ml.
        root.querySelectorAll('.ticket-row-qty').forEach(input => {
            input.addEventListener('input', e => {
                const i = Number(e.target.dataset.idx);
                scanState.ticketItems[i].qty = Math.max(0, parseFloat(e.target.value) || 0);
            });
        });

        // "Cambiar" buttons — open food picker; when the match changes we
        // recompute packSize and qty so the multiplier reflects the new product.
        root.querySelectorAll('.ticket-row-change').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.idx);
                window.openFoodPicker({
                    title: 'Seleccionar producto',
                    onPick: ({ productId }) => {
                        const product = window.findProductById(productId);
                        if (product) {
                            const item = scanState.ticketItems[i];
                            const packSize = _packSize(product);
                            item.match = product;
                            item.packSize = packSize;
                            item.qty = packSize != null ? item.packs * packSize : item.packs;
                            item.checked = true;
                        }
                        window.renderPage();
                    },
                });
            });
        });

        root.querySelector('[data-action="ticket-cancel"]')?.addEventListener('click', () => {
            _resetScan();
            window.renderPage();
        });

        root.querySelector('[data-action="ticket-confirm"]')?.addEventListener('click', async () => {
            await _confirmTicket();
        });

    } else if (scanState.phase === 'review') {
        const np = scanState.newProduct;
        const fields = [
            ['np-name', 'name'], ['np-cat', 'category'], ['np-unit', 'unit_type'],
            ['np-loc', 'location'], ['np-min', 'min_stock'],
            ['np-kcal', 'kcal_100g'], ['np-p', 'proteins_100g'],
            ['np-c', 'carbs_100g'], ['np-f', 'fat_100g'],
        ];
        fields.forEach(([id, key]) => {
            const el = root.querySelector('#' + id);
            if (el) el.addEventListener('input', e => { np[key] = e.target.value; });
        });

        const qtyEl = root.querySelector('#rv-qty');
        if (qtyEl) qtyEl.addEventListener('input', e => { scanState.qty = Number(e.target.value) || 0; });

        const mealEl = root.querySelector('#rv-meal');
        if (mealEl) mealEl.addEventListener('change', e => { scanState.meal = e.target.value; });

        const expEl = root.querySelector('#rv-exp');
        if (expEl) expEl.addEventListener('input', e => { scanState.expiry = e.target.value; });

        root.querySelectorAll('[data-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                scanState.target = btn.dataset.target;
                window.renderPage();
            });
        });

        root.querySelector('[data-action="rescan"]')?.addEventListener('click', () => {
            _resetScan();
            window.renderPage();
            setTimeout(_triggerFileInput, 50);
        });

        root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
            _resetScan();
            window.renderPage();
        });

        root.querySelector('[data-action="confirm"]')?.addEventListener('click', async () => {
            await _confirmScan();
        });
    }
};

// ─── Reset ────────────────────────────────────────────────────────────────────

function _resetScan() {
    scanState = {
        phase: 'idle',
        barcode: null,
        product: null,
        barcodeData: null,
        qty: 1,
        expiry: '',
        newProduct: {
            name: '', category: 'Alimentos', unit_type: 'g',
            location: '', min_stock: '', serving_size: '',
            kcal_100g: '', proteins_100g: '', carbs_100g: '', fat_100g: '', weight_g: '',
            image_url: null,
        },
        target: 'pantry',
        meal: 'comida',
        ticketLines: [],
        ticketItems: [],
        ticketSource: 'image',
        ticketMeta: null,
    };
}

// ─── Confirm actions ──────────────────────────────────────────────────────────

// Gate for scale-mode products: instead of adding stock directly, create a
// pending_refill and ask the user whether to materialize it now (with the
// estimated qty) or wait for the physical NUEVO LOTE button on the scale.
// Returns true if the product was gated (caller should NOT add stock normally).
async function _gateScaleProduct(barcode, qty, sourceLabel) {
    const product = (window.AppState.products || []).find(p => p.barcode === barcode);
    if (!product || product.tracking_mode !== 'scale') return false;

    const unit = product.unit_type || 'g';
    const addNow = window.confirm(
        `"${product.name}" está en modo báscula.\n\n` +
        `OK = Agregarlo como lote ahora con ${qty} ${unit} (estimado).\n` +
        `Cancelar = Esperar al botón NUEVO LOTE de la báscula.`
    );

    try {
        const refill = await window.apiCall('/pending-refills', 'POST', {
            product_barcode: barcode,
            qty_estimated: qty,
            source: sourceLabel,
        });
        if (addNow) {
            await window.apiCall(`/pending-refills/${refill.id}/resolve`, 'POST', { actual_qty: qty });
            window.showToast(`"${product.name}" agregado como lote (se ajustará al peso real)`, 'success');
        } else {
            window.showToast(`"${product.name}" pendiente — apretá NUEVO LOTE en la báscula`, 'info');
        }
    } catch (e) {
        window.showToast('Error gestionando refill: ' + e.message, 'error');
    }
    return true;
}

async function _confirmTicket() {
    const toAdd = scanState.ticketItems.filter(it => it.checked && it.match);
    if (!toAdd.length) return;

    const sourceLabel = scanState.ticketSource === 'pdf' ? 'ticket_pdf' : 'ticket_ocr';
    const meta = scanState.ticketMeta || {};
    let successCount = 0;
    let priceCount = 0;

    for (const item of toAdd) {
        try {
            const gated = await _gateScaleProduct(item.match.barcode, item.qty, sourceLabel);
            if (!gated) {
                // Bundle price with the stock add so the backend can tag the
                // resulting batch with this purchase price atomically.
                const payload = { quantity: item.qty, reason: 'restock' };
                if (item.unit_price != null) {
                    payload.unit_price = item.unit_price;
                    payload.pack_count = item.packs;
                    payload.total_price = item.total_price;
                    payload.price_source = sourceLabel;
                    payload.price_source_ref = meta.ticket_id || null;
                    payload.price_observed_at = meta.date || null;
                    priceCount++;
                }
                await window.apiCall(`/products/${item.match.barcode}/stock`, 'POST', payload);
            }
            successCount++;
        } catch (e) {
            window.showToast(`Error al actualizar ${item.match.name}: ${e.message}`, 'error');
        }
    }

    if (successCount > 0) {
        const priceNote = priceCount > 0 ? ` (${priceCount} con precio)` : '';
        window.showToast(`${successCount} producto${successCount !== 1 ? 's' : ''} añadido${successCount !== 1 ? 's' : ''} al stock${priceNote}`, 'success');
        await window.reloadProducts();
    }
    _resetScan();
    window.renderPage();
}

async function _confirmScan() {
    const isNew = !scanState.product;
    try {
        if (isNew) {
            const np = scanState.newProduct;
            if (!np.name.trim()) { window.showToast('Pon un nombre al producto', 'error'); return; }
            await window.apiCall('/products', 'POST', {
                barcode: scanState.barcode,
                name: np.name,
                category: np.category,
                unit_type: np.unit_type,
                location: np.location || null,
                min_stock: np.min_stock === '' ? 2 : Number(np.min_stock),
                serving_size: np.serving_size === '' ? null : Number(np.serving_size),
                kcal_100g: np.kcal_100g === '' ? null : Number(np.kcal_100g),
                proteins_100g: np.proteins_100g === '' ? null : Number(np.proteins_100g),
                carbs_100g: np.carbs_100g === '' ? null : Number(np.carbs_100g),
                fat_100g: np.fat_100g === '' ? null : Number(np.fat_100g),
                weight_g: np.weight_g === '' ? null : Number(np.weight_g),
                image_url: np.image_url,
            });
            await window.apiCall(`/products/${scanState.barcode}/stock`, 'POST', {
                quantity: scanState.qty,
                expiry_date: scanState.expiry || null,
            });
            window.showToast('Producto añadido al inventario', 'success');
        } else if (scanState.target === 'diary') {
            await window.addToMeal(scanState.meal, { productId: scanState.barcode, qty: scanState.qty });
            window.showToast('Añadido al diario', 'success');
        } else {
            // Restock to pantry — apply scale-mode gate if applicable.
            const gated = await _gateScaleProduct(scanState.barcode, scanState.qty, 'barcode_scan');
            if (!gated) {
                await window.apiCall(`/products/${scanState.barcode}/stock`, 'POST', {
                    quantity: scanState.qty,
                    expiry_date: scanState.expiry || null,
                });
                window.showToast('Stock actualizado', 'success');
            }
        }
        await window.reloadProducts();
        _resetScan();
        window.renderPage();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}
