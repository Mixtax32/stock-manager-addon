/*
   View: Básculas — smart scale management (ESP32 + HX711)
   v0.9.0
*/

const scalesData = {
    scales: null,
    products: null,
    refills: null,
    // Map<scaleId, CookStepView> for kitchen scales. Lets the card render an
    // "active session" banner so the user can cancel zombie sessions that the
    // cook modal left behind. Armario scales are always omitted.
    cookSteps: {},
    loading: false,
    pollTimer: null,
};

async function _loadScales() {
    scalesData.loading = true;
    try {
        const [scales, products, refills] = await Promise.all([
            window.apiCall('/scales', 'GET'),
            window.apiCall('/products', 'GET'),
            window.apiCall('/pending-refills?status=pending', 'GET'),
        ]);
        scalesData.scales = scales || [];
        scalesData.products = products || [];
        scalesData.refills = refills || [];

        // Cook-step probe for every kitchen scale — runs in parallel and
        // individual failures degrade to "idle" so one broken scale doesn't
        // hide the others.
        const kitchen = scalesData.scales.filter(s => s.scale_type === 'kitchen');
        const probes = await Promise.all(kitchen.map(s =>
            window.apiCall(`/scales/${s.id}/cook-step`, 'GET')
                .then(cs => [s.id, cs])
                .catch(() => [s.id, { status: 'idle' }])
        ));
        scalesData.cookSteps = Object.fromEntries(probes);
    } catch (e) {
        console.error('scales load failed', e);
        scalesData.scales = [];
        scalesData.products = [];
        scalesData.refills = [];
        scalesData.cookSteps = {};
    } finally {
        scalesData.loading = false;
    }
}

function _cookSessionBanner(cookStep) {
    // Render only when there's a real session attached (idle = nothing to do,
    // missing session_id = endpoint returned an unexpected shape and we don't
    // want to expose a dead Cancelar button).
    if (!cookStep || cookStep.status === 'idle' || !cookStep.session_id) return '';
    const isCompleted = cookStep.status === 'completed';
    const label = isCompleted ? 'Sesión esperando finalizar' : 'Sesión activa';
    const recipe = cookStep.recipe_name ? ` — ${window.esc(cookStep.recipe_name)}` : '';
    const stepLine = isCompleted
        ? `Todas las etapas confirmadas`
        : `Paso ${(cookStep.step_order || 0) + 1}/${cookStep.total_steps || '?'}${
            cookStep.ingredient_name ? ` · ${window.esc(cookStep.ingredient_name)}` : ''
          }`;
    return `
        <div style="background:rgba(227,160,78,0.12); border:1px solid rgba(227,160,78,0.4); border-radius:8px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="min-width:0;">
                <div style="font-weight:600; font-size:.88rem;">⚠ ${label}${recipe}</div>
                <div style="font-size:.72rem; opacity:.75; margin-top:2px;">${stepLine}</div>
            </div>
            <button class="btn ghost sm" data-action="cancel-cook" data-session-id="${cookStep.session_id}">Cancelar</button>
        </div>
    `;
}

function _findProduct(barcode) {
    if (!barcode || !scalesData.products) return null;
    return scalesData.products.find(p => p.barcode === barcode) || null;
}

function _formatWeight(g) {
    if (g == null) return '—';
    if (Math.abs(g) >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    return `${g.toFixed(1)} g`;
}

function _formatRelativeTime(iso) {
    if (!iso) return 'nunca';
    const then = new Date(iso);
    const diffMs = Date.now() - then.getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return 'hace segundos';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
}

const SCALE_HOST_OVERRIDE_KEY = 'scaleAddonHost';

function _webhookHost() {
    // Manual override (per-device, in localStorage) wins. Useful when the
    // browser is hitting the addon via Nabu Casa / a reverse proxy / a domain
    // that doesn't resolve to the addon's LAN IP — the ESP needs the raw
    // local IP, which the browser can't infer.
    const manual = (localStorage.getItem(SCALE_HOST_OVERRIDE_KEY) || '').trim();
    return manual || window.location.hostname;
}

function _webhookBase() {
    // The browser may be hitting the addon via HA ingress
    // (https://<ha>:8123/api/hassio_ingress/<token>/...), which uses a per-session
    // token the ESP32 can't replicate. The ESP needs the addon's direct LAN port
    // (8099 by default, exposed via `ports:` in config.yaml). Same hostname/IP,
    // but http and port 8099 and no ingress prefix.
    return `http://${_webhookHost()}:8099`;
}

function _scaleCard(scale) {
    const isKitchen = scale.scale_type === 'kitchen';
    const weight = _formatWeight(scale.last_stable_weight_g);
    const lastEvent = _formatRelativeTime(scale.last_event_at);
    const webhook = `${_webhookBase()}/api/scales/${scale.id}/event`;
    const weightUrl = `${_webhookBase()}/api/scales/${scale.id}/weight`;
    const cookStepUrl = `${_webhookBase()}/api/scales/${scale.id}/cook-step`;

    const productOptions = [
        `<option value="">— sin asignar —</option>`,
        ...((scalesData.products || []).map(p =>
            `<option value="${window.esc(p.barcode)}" ${p.barcode === scale.product_barcode ? 'selected' : ''}>${window.esc(p.name)}</option>`
        )),
    ].join('');

    const typeBadge = isKitchen
        ? `<span class="pill" style="background:#3a2a52; color:#d4b5ff;">cocina</span>`
        : `<span class="pill" style="background:#2a3a52; color:#a5d0ff;">armario</span>`;

    const sessionBanner = isKitchen ? _cookSessionBanner(scalesData.cookSteps[scale.id]) : '';

    return `
        <div class="card" data-scale-id="${scale.id}" data-scale-type="${scale.scale_type}">
            <div class="card-head">
                <div>
                    <div class="card-title">${window.esc(scale.name)} ${typeBadge}</div>
                    <span class="card-sub">id #${scale.id} · último evento ${lastEvent}</span>
                </div>
                <div style="font-size:1.8rem; font-weight:700; font-variant-numeric:tabular-nums;">
                    ${weight}
                </div>
            </div>

            <div class="stack" style="gap:10px; margin-top:12px;">
                ${sessionBanner}
                ${isKitchen ? `
                    <div class="tiny" style="opacity:.7;">
                        Báscula de cocina — se usa en sesiones de "Cocinar con báscula" desde una receta.
                        No tiene producto fijo asignado.
                    </div>
                ` : `
                    <label class="field">
                        <span class="field-label">Producto asignado</span>
                        <select data-action="change-product">${productOptions}</select>
                    </label>
                `}

                <details>
                    <summary style="cursor:pointer; font-size:.85rem; opacity:.7;">Webhook URLs para el ESP32</summary>
                    <div class="stack" style="gap:6px; margin-top:8px; font-family:var(--mono); font-size:.75rem; opacity:.8;">
                        <div><strong>Weight:</strong> <span style="user-select:all">${window.esc(weightUrl)}</span></div>
                        ${isKitchen
                            ? `<div><strong>Cook step (GET):</strong> <span style="user-select:all">${window.esc(cookStepUrl)}</span></div>`
                            : `<div><strong>Event:</strong> <span style="user-select:all">${window.esc(webhook)}</span></div>`
                        }
                    </div>
                </details>

                <div class="row" style="gap:8px; justify-content:flex-end;">
                    <button class="btn ghost" data-action="delete">Eliminar</button>
                </div>
            </div>
        </div>
    `;
}

function _addScaleForm() {
    const productOptions = [
        `<option value="">— sin asignar (configurar después) —</option>`,
        ...((scalesData.products || []).map(p =>
            `<option value="${window.esc(p.barcode)}">${window.esc(p.name)}${p.tracking_mode === 'scale' ? ' (ya en modo báscula)' : ''}</option>`
        )),
    ].join('');

    return `
        <div class="card" id="add-scale-form" hidden>
            <div class="card-head">
                <div class="card-title">Nueva báscula</div>
            </div>
            <div class="stack" style="gap:10px;">
                <label class="field">
                    <span class="field-label">Tipo</span>
                    <select id="new-scale-type">
                        <option value="fixed" selected>Armario — fija, pesa un único producto en continuo</option>
                        <option value="kitchen">Cocina — portátil, guía recetas paso a paso</option>
                    </select>
                </label>
                <label class="field">
                    <span class="field-label">Nombre (ej. "Arroz", "Báscula cocina")</span>
                    <input type="text" id="new-scale-name" placeholder="Nombre identificativo">
                </label>
                <label class="field" id="new-scale-product-field">
                    <span class="field-label">Producto asignado</span>
                    <select id="new-scale-product">${productOptions}</select>
                </label>
                <div class="row" style="gap:8px; justify-content:flex-end;">
                    <button class="btn ghost" id="cancel-add-scale">Cancelar</button>
                    <button class="btn accent" id="confirm-add-scale">Crear</button>
                </div>
            </div>
        </div>
    `;
}

function _refillCard(refill) {
    const product = _findProduct(refill.product_barcode);
    const productLabel = product ? product.name : refill.product_barcode;
    const unit = product ? (product.unit_type || 'g') : 'g';
    const created = _formatRelativeTime(refill.created_at);
    return `
        <div class="row" data-refill-id="${refill.id}" style="align-items:center; gap:10px; padding:10px 12px; background:var(--bg-2, #1c1c1c); border-radius:8px;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600;">${window.esc(productLabel)}</div>
                <div style="font-size:.75rem; opacity:.6;">~${refill.qty_estimated} ${unit} · ${refill.source} · ${created}</div>
            </div>
            <button class="btn sm accent" data-action="resolve-refill" data-qty="${refill.qty_estimated}">Resolver</button>
            <button class="btn sm ghost" data-action="cancel-refill">Cancelar</button>
        </div>
    `;
}

window.renderScales = function() {
    if (scalesData.scales === null && !scalesData.loading) {
        _loadScales().then(() => window.renderPage());
    }

    const scales = scalesData.scales || [];
    const refills = scalesData.refills || [];

    const hostOverride = (localStorage.getItem(SCALE_HOST_OVERRIDE_KEY) || '').trim();
    const hostLabel = hostOverride
        ? `IP addon: ${window.esc(hostOverride)} (manual)`
        : `IP addon: ${window.esc(window.location.hostname)} (auto)`;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Hardware · ${hostLabel}</div>
                <h1 class="page-title">Básculas</h1>
            </div>
            <div class="row" style="gap:8px;">
                <button id="edit-scale-host" class="btn ghost" title="Editar IP del addon usada en los webhook URLs">Editar IP</button>
                <button id="open-add-scale" class="btn accent">+ Nueva</button>
            </div>
        </div>

        ${_addScaleForm()}

        ${refills.length > 0 ? `
            <div class="card" style="margin-bottom:14px;">
                <div class="card-head">
                    <div class="card-title">Refills pendientes</div>
                    <span class="card-sub">${refills.length} esperando NUEVO LOTE</span>
                </div>
                <div class="stack" style="gap:6px; margin-top:10px;">
                    ${refills.map(_refillCard).join('')}
                </div>
            </div>
        ` : ''}

        ${scalesData.loading
            ? `<div class="empty" style="padding:30px 0">Cargando…</div>`
            : (scales.length === 0
                ? `<div class="empty"><div class="t">Sin básculas configuradas</div><div>Tocá "+ Nueva" para registrar tu primera báscula ESP32.</div></div>`
                : `<div class="stack" style="gap:14px;">${scales.map(_scaleCard).join('')}</div>`)
        }

        ${_bleDiagnosticCard()}
    `;
};

// Diagnostic gate for the planned BLE/portable mode: validates that Web
// Bluetooth is actually reachable from inside HA's ingress iframe before we
// invest in firmware + bridge UI. Remove once portable mode is wired up.
function _bleDiagnosticCard() {
    return `
        <div class="card" style="margin-top:14px;">
            <div class="card-head">
                <div class="card-title">Diagnóstico · Web Bluetooth</div>
                <span class="card-sub">Validación previa al modo portátil</span>
            </div>
            <p style="font-size:13px; color:var(--ink-2); margin:10px 0 0">
                Comprobamos si la ingress de HA permite Web Bluetooth en el iframe.
                Tocá el botón: si todo está bien, el sistema operativo abre su
                picker de dispositivos Bluetooth. Si sale un error, copialo entero.
            </p>
            <div class="row" style="gap:8px; margin-top:10px">
                <button id="ble-test-btn" class="btn accent">Probar Bluetooth</button>
            </div>
            <pre id="ble-test-output" style="margin-top:12px; padding:10px; background:rgba(0,0,0,0.18); color:var(--ink); border-radius:6px; font-family:var(--mono,monospace); font-size:11px; line-height:1.4; white-space:pre-wrap; word-break:break-word; max-height:300px; overflow:auto">Sin pruebas todavía.</pre>
        </div>
    `;
}

async function _bleTest() {
    const out = document.getElementById('ble-test-output');
    if (!out) return;
    out.textContent = '[Web Bluetooth test]';
    const log = (msg) => { out.textContent += '\n' + msg; out.scrollTop = out.scrollHeight; };

    log('UA: ' + navigator.userAgent);
    log('isSecureContext: ' + window.isSecureContext);
    log('en iframe: ' + (window.self !== window.top));
    log('navigator.bluetooth: ' + (typeof navigator.bluetooth));

    if (!navigator.bluetooth) {
        log('FAIL — navigator.bluetooth no existe. Navegador sin soporte, o ');
        log('       Permissions Policy bloqueó la API entera en este iframe.');
        return;
    }

    try {
        const available = await navigator.bluetooth.getAvailability();
        log('getAvailability(): ' + available);
    } catch (e) {
        log('getAvailability() throw: ' + e.name + ' — ' + e.message);
    }

    log('Llamando requestDevice({ acceptAllDevices: true })…');
    try {
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        log('OK — picker abrió. Elegiste: ' + (device.name || '(sin nombre)') + ' / id=' + device.id);
    } catch (e) {
        log('requestDevice throw: ' + e.name + ' — ' + e.message);
        log('NOTA: NotFoundError = abriste el picker y lo cerraste vos. Eso CUENTA como OK.');
        log('      SecurityError o "permissions policy" = ingress de HA bloquea la API.');
    }
}

window.initScales = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    const addBtn = root.querySelector('#open-add-scale');
    const form = root.querySelector('#add-scale-form');
    const cancelBtn = root.querySelector('#cancel-add-scale');
    const confirmBtn = root.querySelector('#confirm-add-scale');
    const editHostBtn = root.querySelector('#edit-scale-host');

    const bleTestBtn = root.querySelector('#ble-test-btn');
    if (bleTestBtn) bleTestBtn.addEventListener('click', _bleTest);

    if (editHostBtn) {
        editHostBtn.addEventListener('click', () => {
            const current = (localStorage.getItem(SCALE_HOST_OVERRIDE_KEY) || '').trim();
            const next = window.prompt(
                'IP o hostname del addon (puerto 8099 fijo).\n' +
                'Dejá vacío para volver al automático (' + window.location.hostname + ').',
                current
            );
            if (next === null) return; // user cancelled
            const cleaned = next.trim();
            if (cleaned) {
                localStorage.setItem(SCALE_HOST_OVERRIDE_KEY, cleaned);
                window.showToast('IP guardada: ' + cleaned, 'success');
            } else {
                localStorage.removeItem(SCALE_HOST_OVERRIDE_KEY);
                window.showToast('IP restablecida al automático', 'success');
            }
            window.renderPage();
        });
    }

    const typeSelect = root.querySelector('#new-scale-type');
    const productField = root.querySelector('#new-scale-product-field');
    const _syncTypeUI = () => {
        if (!typeSelect || !productField) return;
        productField.style.display = typeSelect.value === 'kitchen' ? 'none' : '';
    };
    if (typeSelect) {
        typeSelect.addEventListener('change', _syncTypeUI);
        _syncTypeUI();
    }

    if (addBtn && form) {
        addBtn.addEventListener('click', () => {
            form.hidden = false;
            const nameInput = root.querySelector('#new-scale-name');
            if (nameInput) nameInput.focus();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            form.hidden = true;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const name = root.querySelector('#new-scale-name').value.trim();
            const scaleType = (typeSelect && typeSelect.value) || 'fixed';
            const productBarcode = scaleType === 'kitchen'
                ? null
                : (root.querySelector('#new-scale-product').value || null);
            if (!name) {
                window.showToast('Poné un nombre para la báscula', 'error');
                return;
            }
            try {
                const created = await window.apiCall('/scales', 'POST', {
                    name,
                    scale_type: scaleType,
                    product_barcode: productBarcode,
                });
                // Only flip product tracking_mode for fixed scales — kitchen scales
                // don't own a product.
                if (scaleType !== 'kitchen' && productBarcode) {
                    try {
                        await window.apiCall(`/products/${productBarcode}`, 'PATCH', { tracking_mode: 'scale' });
                    } catch (e) {
                        console.warn('Could not flip product to scale mode:', e);
                    }
                }
                window.showToast(`Báscula "${created.name}" creada (id #${created.id})`, 'success');
                scalesData.scales = null;  // force reload
                await _loadScales();
                if (window.reloadProducts) await window.reloadProducts();
                window.renderPage();
            } catch (e) {
                window.showToast('Error creando báscula: ' + e.message, 'error');
            }
        });
    }

    // Per-scale handlers
    root.querySelectorAll('[data-scale-id]').forEach(card => {
        const scaleId = parseInt(card.dataset.scaleId, 10);

        const productSel = card.querySelector('[data-action="change-product"]');
        if (productSel) {
            productSel.addEventListener('change', async () => {
                const newBarcode = productSel.value || null;
                try {
                    await window.apiCall(`/scales/${scaleId}`, 'PATCH', { product_barcode: newBarcode });
                    if (newBarcode) {
                        await window.apiCall(`/products/${newBarcode}`, 'PATCH', { tracking_mode: 'scale' });
                    }
                    window.showToast('Producto actualizado', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }

        const cancelCookBtn = card.querySelector('[data-action="cancel-cook"]');
        if (cancelCookBtn) {
            cancelCookBtn.addEventListener('click', async () => {
                const sessionId = parseInt(cancelCookBtn.dataset.sessionId, 10);
                if (!confirm('¿Cancelar la sesión activa? Las etapas ya confirmadas no se deshacen, pero la sesión deja de pintarse en el OLED de la báscula.')) return;
                try {
                    await window.apiCall(`/cook-sessions/${sessionId}/cancel`, 'POST', {});
                    window.showToast('Sesión cancelada', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }

        const delBtn = card.querySelector('[data-action="delete"]');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta báscula? El producto asignado vuelve a modo manual.')) return;
                try {
                    const scale = (scalesData.scales || []).find(s => s.id === scaleId);
                    await window.apiCall(`/scales/${scaleId}`, 'DELETE');
                    if (scale && scale.product_barcode) {
                        await window.apiCall(`/products/${scale.product_barcode}`, 'PATCH', { tracking_mode: 'manual' });
                    }
                    window.showToast('Báscula eliminada', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
    });

    // Pending refill handlers
    root.querySelectorAll('[data-refill-id]').forEach(row => {
        const refillId = parseInt(row.dataset.refillId, 10);
        const resolveBtn = row.querySelector('[data-action="resolve-refill"]');
        const cancelBtn = row.querySelector('[data-action="cancel-refill"]');

        if (resolveBtn) {
            resolveBtn.addEventListener('click', async () => {
                const defaultQty = parseFloat(resolveBtn.dataset.qty) || 0;
                const input = window.prompt(`Cantidad real del lote (g):`, defaultQty);
                if (input == null) return;
                const qty = parseFloat(input);
                if (!qty || qty <= 0) {
                    window.showToast('Cantidad inválida', 'error');
                    return;
                }
                try {
                    await window.apiCall(`/pending-refills/${refillId}/resolve`, 'POST', { actual_qty: qty });
                    window.showToast('Refill resuelto', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    if (window.reloadProducts) await window.reloadProducts();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', async () => {
                if (!confirm('¿Cancelar este refill pendiente?')) return;
                try {
                    await window.apiCall(`/pending-refills/${refillId}`, 'DELETE');
                    window.showToast('Refill cancelado', 'success');
                    scalesData.scales = null;
                    await _loadScales();
                    window.renderPage();
                } catch (e) {
                    window.showToast('Error: ' + e.message, 'error');
                }
            });
        }
    });

    // Live polling: refresh weight every 3s while this tab is active.
    if (scalesData.pollTimer) clearInterval(scalesData.pollTimer);
    scalesData.pollTimer = setInterval(async () => {
        if (window.AppState.page !== 'scales') {
            clearInterval(scalesData.pollTimer);
            scalesData.pollTimer = null;
            return;
        }
        try {
            const fresh = await window.apiCall('/scales', 'GET');
            scalesData.scales = fresh || [];
            // Inline update of weight numbers only, avoid full re-render flicker.
            root.querySelectorAll('[data-scale-id]').forEach(card => {
                const sid = parseInt(card.dataset.scaleId, 10);
                const s = scalesData.scales.find(x => x.id === sid);
                if (!s) return;
                const weightEl = card.querySelector('.card-head > div:last-child');
                if (weightEl) weightEl.textContent = _formatWeight(s.last_stable_weight_g);
            });
        } catch (e) {
            // Silent fail — next tick may succeed.
        }
    }, 3000);
};
