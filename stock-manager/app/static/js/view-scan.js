/*
   View: Scan — barcode scanner using html5-qrcode + HA API integration
   v0.7.0
*/

let scanState = {
    phase: 'idle',           // idle | scanning | review
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
};

let qrInstance = null;

async function _stopScanner() {
    if (qrInstance) {
        try { await qrInstance.stop(); } catch (e) {}
        try { qrInstance.clear(); } catch (e) {}
        qrInstance = null;
    }
}

async function _startScanner() {
    const mount = document.getElementById('scanner-mount');
    if (!mount) return;
    if (typeof Html5Qrcode === 'undefined') {
        window.showToast('Librería de escaneo no cargada', 'error');
        return;
    }
    try {
        qrInstance = new Html5Qrcode('scanner-mount');
        await qrInstance.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decoded) => _onScanSuccess(decoded)
        );
        scanState.phase = 'scanning';
    } catch (err) {
        window.showToast('Error cámara: ' + err.message, 'error');
    }
}

async function _onScanSuccess(decodedText) {
    await _stopScanner();
    scanState.barcode = decodedText;
    scanState.phase = 'review';

    // Look up existing product in current inventory
    const existing = window.findProductById(decodedText);
    if (existing) {
        scanState.product = existing;
        scanState.qty = 1;
    } else {
        scanState.product = null;
        // Fetch from Open Food Facts via the HA backend
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

function _renderIdle() {
    return `
        <div class="scan-stage">
            <div class="scan-bg"></div>
            <div class="scan-grain"></div>
            <div class="scan-frame">
                <div class="scan-bars">${Array.from({ length: 24 }).map(() => '<span></span>').join('')}</div>
                <div class="scan-corner tl"></div>
                <div class="scan-corner tr"></div>
                <div class="scan-corner bl"></div>
                <div class="scan-corner br"></div>
            </div>
            <div class="scan-hint">Pulsa "Iniciar cámara" para empezar</div>
        </div>
        <div class="row" style="justify-content:center; gap:10px; margin-top:14px">
            <button class="btn accent" data-action="start">${window.icon('scan')} Iniciar cámara</button>
            <input id="manual-barcode" class="input" placeholder="O introduce un código…" style="width:240px"/>
            <button class="btn" data-action="manual">Buscar</button>
        </div>
    `;
}

function _renderScanning() {
    return `
        <div class="scan-stage">
            <div id="scanner-mount"></div>
            <div class="scan-frame">
                <div class="scan-corner tl"></div>
                <div class="scan-corner tr"></div>
                <div class="scan-corner bl"></div>
                <div class="scan-corner br"></div>
                <div class="scan-line"></div>
            </div>
            <div class="scan-hint">Buscando código…</div>
        </div>
        <div class="row" style="justify-content:center; margin-top:14px">
            <button class="btn" data-action="cancel">Cancelar</button>
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
                    <div class="grid cols-4 keep" style="gap:6px; grid-template-columns:repeat(4, 1fr)">
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

        <div class="row" style="justify-content:space-between">
            <button class="btn ghost" data-action="rescan">${window.icon('scan')} Escanear otro</button>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="cancel">Cancelar</button>
                <button class="btn accent" data-action="confirm">${scanState.target === 'pantry' || isNew ? 'Guardar en despensa' : 'Añadir al diario'}</button>
            </div>
        </div>
    `;
}

window.renderScan = function() {
    let body = '';
    if (scanState.phase === 'idle') body = _renderIdle();
    else if (scanState.phase === 'scanning') body = _renderScanning();
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

window.initScan = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    root.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            _stopScanner();
            window.gotoPage(btn.dataset.page);
        });
    });

    if (scanState.phase === 'idle') {
        root.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
            window.renderPage(); // switch to scanning ui first
            scanState.phase = 'scanning';
            window.renderPage();
            // give DOM time
            setTimeout(_startScanner, 50);
        });
        root.querySelector('[data-action="manual"]')?.addEventListener('click', () => {
            const code = root.querySelector('#manual-barcode').value.trim();
            if (!code) return;
            _onScanSuccess(code);
        });
    } else if (scanState.phase === 'scanning') {
        root.querySelector('[data-action="cancel"]')?.addEventListener('click', async () => {
            await _stopScanner();
            scanState.phase = 'idle';
            window.renderPage();
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
            scanState.phase = 'scanning';
            window.renderPage();
            setTimeout(_startScanner, 50);
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
    };
}

async function _confirmScan() {
    const isNew = !scanState.product;
    try {
        if (isNew) {
            // Create new product
            const np = scanState.newProduct;
            if (!np.name.trim()) { window.showToast('Pon un nombre al producto', 'error'); return; }
            await window.apiCall('/products', 'POST', {
                barcode: scanState.barcode,
                name: np.name,
                category: np.category,
                unit_type: np.unit_type,
                location: np.location || null,
                min_stock: np.min_stock === '' ? null : Number(np.min_stock),
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
            // Add a portion to today's diary (no inventory change)
            window.addToMeal(scanState.meal, { productId: scanState.barcode, qty: scanState.qty });
            window.showToast('Añadido al diario', 'success');
        } else {
            // Existing product, add stock
            await window.apiCall(`/products/${scanState.barcode}/stock`, 'POST', {
                quantity: scanState.qty,
                expiry_date: scanState.expiry || null,
            });
            window.showToast('Stock actualizado', 'success');
        }
        await window.reloadProducts();
        _resetScan();
        window.renderPage();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

// Stop camera on page change
window.addEventListener('beforeunload', _stopScanner);
