/*
   View: Scan — barcode scanner using html5-qrcode file API + HA API integration
   v0.8.0 — uses file/photo capture instead of live stream (no HTTPS required)
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
        <div class="stack" style="gap:10px; margin-top:14px">
            <button class="btn accent scan-cta-btn" data-action="start" style="width:100%">${window.icon('scan')} Abrir cámara</button>
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

        root.querySelector('[data-action="start"]')?.addEventListener('click', _triggerFileInput);

        root.querySelector('[data-action="manual"]')?.addEventListener('click', () => {
            const code = root.querySelector('#manual-barcode').value.trim();
            if (!code) return;
            _onScanSuccess(code);
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
