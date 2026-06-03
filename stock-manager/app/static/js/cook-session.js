/*
   Cook Session — guided cooking on a kitchen scale.
   v0.14.0
   Exposes window.openCookSession({ recipe, dietPlanId? }).
*/

(function() {

const WEIGHT_TOLERANCE_G = 5;        // ± grams considered "on target"
const POLL_INTERVAL_MS = 1500;       // live weight refresh cadence

let pollTimer = null;
let session = null;
let kitchenScales = [];
let selectedScaleId = null;
let servings = 1;
let latestWeight = null;

function _stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function _closeModal() {
    _stopPolling();
    const mount = document.getElementById('modal-mount');
    if (mount) mount.innerHTML = '';
    session = null;
    selectedScaleId = null;
    latestWeight = null;
}

async function _loadKitchenScales() {
    try {
        const all = await window.apiCall('/scales', 'GET');
        kitchenScales = (all || []).filter(s => s.scale_type === 'kitchen');
    } catch (e) {
        kitchenScales = [];
    }
}

function _currentStep() {
    if (!session) return null;
    const idx = session.current_step;
    if (idx < 0 || idx >= (session.steps || []).length) return null;
    return session.steps[idx];
}

function _ingredientLabel(step) {
    if (step.custom_name) return step.custom_name;
    if (step.product_barcode && window.findProductById) {
        const p = window.findProductById(step.product_barcode);
        if (p) return p.name;
    }
    return step.product_barcode || '(sin nombre)';
}

function _formatQty(qty, unit) {
    if (qty == null) return '—';
    const fmt = qty >= 10 ? Math.round(qty) : Math.round(qty * 10) / 10;
    return `${fmt} ${unit}`;
}

function _formatWeight(g) {
    if (g == null) return '—';
    if (Math.abs(g) >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    return `${Math.round(g * 10) / 10} g`;
}

// ---- Step 1: pick scale + servings -----------------------------------------

function _renderPicker(recipe) {
    const mount = document.getElementById('modal-mount');
    if (!mount) return;

    if (kitchenScales.length === 0) {
        mount.innerHTML = `
            <div class="modal-backdrop" data-close="1">
                <div class="modal" data-stop="1" style="max-width:420px">
                    <div class="spread" style="margin-bottom:6px">
                        <h3>Sin báscula de cocina</h3>
                        <button class="btn icon sm ghost" data-action="close">${window.icon('close')}</button>
                    </div>
                    <p class="muted" style="font-size:13px; line-height:1.5; margin:8px 0 18px">
                        Para usar "Cocinar con báscula" necesitás registrar al menos una báscula
                        de tipo <strong>cocina</strong> en la pestaña Básculas.
                    </p>
                    <div class="row" style="justify-content:flex-end">
                        <button class="btn accent" data-action="close">Entendido</button>
                    </div>
                </div>
            </div>
        `;
        mount.querySelectorAll('[data-close], [data-action="close"]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (el.dataset.close === '1' && e.target.dataset.close !== '1') return;
                _closeModal();
            });
        });
        return;
    }

    const hasOutput = Number(recipe.output_qty) > 0;
    const baseQty = hasOutput ? Number(recipe.output_qty) : (recipe.serves || 1);
    servings = baseQty;
    selectedScaleId = kitchenScales[0].id;

    const scaleOptions = kitchenScales.map(s =>
        `<option value="${s.id}" ${s.id === selectedScaleId ? 'selected' : ''}>${window.esc(s.name)} (id #${s.id})</option>`
    ).join('');

    mount.innerHTML = `
        <div class="modal-backdrop" data-close="1">
            <div class="modal" data-stop="1" style="max-width:440px">
                <div class="spread" style="margin-bottom:4px">
                    <h3>Cocinar con báscula</h3>
                    <button class="btn icon sm ghost" data-action="close">${window.icon('close')}</button>
                </div>
                <div class="modal-sub" style="margin-bottom:18px">
                    Te voy guiando ingrediente a ingrediente. Pone la báscula en cero entre pesadas.
                </div>

                <div class="field" style="margin-bottom:14px">
                    <label class="field-label">Báscula</label>
                    <select id="cs-scale" class="input">${scaleOptions}</select>
                </div>

                <div class="field" style="margin-bottom:18px">
                    <label class="field-label">${hasOutput ? '¿Cuántas unidades?' : '¿Cuántas raciones?'}</label>
                    <input id="cs-servings" class="input lg num" type="number" min="0.01" step="any" value="${servings}"/>
                    <div class="muted" style="font-size:11px; margin-top:4px">
                        Cada cantidad de ingrediente se multiplicará por esta proporción.
                    </div>
                </div>

                <div class="row" style="justify-content:flex-end; gap:8px">
                    <button class="btn ghost" data-action="close">Cancelar</button>
                    <button class="btn accent" data-action="start">Iniciar</button>
                </div>
            </div>
        </div>
    `;

    mount.querySelector('[data-close]').addEventListener('click', e => {
        if (e.target.dataset.close === '1') _closeModal();
    });
    mount.querySelectorAll('[data-action="close"]').forEach(b =>
        b.addEventListener('click', _closeModal)
    );

    const scaleSel = mount.querySelector('#cs-scale');
    if (scaleSel) scaleSel.addEventListener('change', e => {
        selectedScaleId = parseInt(e.target.value, 10);
    });
    const servingsIn = mount.querySelector('#cs-servings');
    if (servingsIn) {
        servingsIn.addEventListener('input', e => {
            servings = Math.max(0.01, Number(e.target.value) || 1);
        });
        setTimeout(() => { servingsIn.focus(); servingsIn.select(); }, 0);
    }

    mount.querySelector('[data-action="start"]')?.addEventListener('click', () => _startSession(recipe));
}

// ---- Step 2: actually run the session --------------------------------------

async function _startSession(recipe) {
    try {
        session = await window.apiCall('/cook-sessions', 'POST', {
            scale_id: selectedScaleId,
            recipe_id: recipe.id,
            servings,
            diet_plan_id: window._cookDietPlanId || null,
        });
        _renderSession();
        _startPolling();
    } catch (e) {
        window.showToast('No pude iniciar la sesión: ' + e.message, 'error');
    }
}

function _startPolling() {
    _stopPolling();
    pollTimer = setInterval(_pollWeight, POLL_INTERVAL_MS);
    _pollWeight();
}

async function _pollWeight() {
    if (!selectedScaleId) return;
    try {
        const scale = await window.apiCall(`/scales/${selectedScaleId}`, 'GET');
        latestWeight = scale ? scale.last_stable_weight_g : null;
        _updateWeightDisplay();
    } catch (e) {
        // silent — keep last value
    }
}

function _updateWeightDisplay() {
    const el = document.getElementById('cs-live-weight');
    if (el) el.textContent = _formatWeight(latestWeight);

    const step = _currentStep();
    const fillEl = document.getElementById('cs-fill');
    const hintEl = document.getElementById('cs-hint');
    if (step && step.weighable && latestWeight != null && step.target_qty > 0) {
        const ratio = Math.min(1.2, latestWeight / step.target_qty);
        if (fillEl) fillEl.style.width = `${Math.min(100, ratio * 100)}%`;
        const delta = latestWeight - step.target_qty;
        const onTarget = Math.abs(delta) <= WEIGHT_TOLERANCE_G;
        if (fillEl) {
            fillEl.style.background = onTarget
                ? 'var(--good, #4ade80)'
                : (delta < 0 ? 'var(--accent, #5b8def)' : 'var(--warn, #facc15)');
        }
        if (hintEl) {
            hintEl.textContent = onTarget
                ? `✓ En objetivo (${_formatWeight(latestWeight)})`
                : (delta < 0
                    ? `Faltan ${_formatWeight(-delta)}`
                    : `Te pasaste ${_formatWeight(delta)}`);
            hintEl.style.color = onTarget ? 'var(--good, #4ade80)' : '';
        }
    } else {
        if (fillEl) fillEl.style.width = '0%';
        if (hintEl) hintEl.textContent = '';
    }
}

function _renderSession() {
    const mount = document.getElementById('modal-mount');
    if (!mount || !session) return;

    const total = (session.steps || []).length;
    const idx = session.current_step;
    const done = idx >= total;

    if (done) {
        _renderSummary();
        return;
    }

    const step = session.steps[idx];
    const name = _ingredientLabel(step);
    const target = _formatQty(step.target_qty, step.unit);

    mount.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal" style="max-width:480px">
                <div class="spread" style="margin-bottom:4px">
                    <div>
                        <h3>${window.esc(session.recipe_id ? '' : '')}${window.esc(name)}</h3>
                        <div class="muted" style="font-size:12px">Paso ${idx + 1} de ${total}</div>
                    </div>
                    <button class="btn icon sm ghost" data-action="cancel" title="Cancelar sesión">${window.icon('close')}</button>
                </div>

                <div class="card sunken" style="padding:14px; margin:14px 0;">
                    <div class="muted" style="font-size:12px; margin-bottom:6px">Objetivo</div>
                    <div style="font-size:1.6rem; font-weight:700;">${target}</div>
                </div>

                ${step.weighable ? `
                    <div style="margin-bottom:8px">
                        <div class="muted" style="font-size:12px">Peso actual</div>
                        <div id="cs-live-weight" style="font-size:2.2rem; font-weight:700; font-variant-numeric:tabular-nums;">${_formatWeight(latestWeight)}</div>
                    </div>
                    <div style="height:10px; background:var(--bg-2,#1c1c1c); border-radius:6px; overflow:hidden; margin-bottom:6px;">
                        <div id="cs-fill" style="height:100%; width:0%; background:var(--accent,#5b8def); transition:width .15s ease;"></div>
                    </div>
                    <div id="cs-hint" class="muted" style="font-size:12px; min-height:18px;"></div>
                ` : `
                    <div class="muted" style="font-size:13px; margin-bottom:18px;">
                        Este ingrediente no se pesa en gramos. Añadílo y confirmá cuando esté listo.
                    </div>
                `}

                <div class="row" style="justify-content:space-between; gap:8px; margin-top:18px;">
                    <button class="btn ghost" data-action="skip">Saltar</button>
                    <div class="row" style="gap:8px">
                        <button class="btn ghost" data-action="cancel">Cancelar</button>
                        <button class="btn accent" data-action="confirm">
                            ${step.weighable ? 'Confirmar peso' : 'Añadido'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    mount.querySelectorAll('[data-action="cancel"]').forEach(b => b.addEventListener('click', _onCancel));
    mount.querySelectorAll('[data-action="skip"]').forEach(b => b.addEventListener('click', _onSkip));
    mount.querySelectorAll('[data-action="confirm"]').forEach(b => b.addEventListener('click', _onConfirm));

    _updateWeightDisplay();
}

async function _onConfirm() {
    const step = _currentStep();
    if (!step || !session) return;
    let actual;
    if (step.weighable) {
        if (latestWeight == null) {
            window.showToast('Esperando lectura de la báscula…', 'warn');
            return;
        }
        actual = latestWeight;
    } else {
        actual = step.target_qty;
    }
    try {
        session = await window.apiCall(`/cook-sessions/${session.id}/confirm-step`, 'POST', {
            actual_qty: actual,
        });
        _renderSession();
    } catch (e) {
        window.showToast('Error confirmando paso: ' + e.message, 'error');
    }
}

async function _onSkip() {
    if (!session) return;
    try {
        session = await window.apiCall(`/cook-sessions/${session.id}/skip-step`, 'POST', {});
        _renderSession();
    } catch (e) {
        window.showToast('Error saltando paso: ' + e.message, 'error');
    }
}

async function _onCancel() {
    if (!session) {
        _closeModal();
        return;
    }
    // Pause polling while the confirm dialog is up so we don't keep poking the
    // DOM that just got replaced by it.
    _stopPolling();
    const proceed = window.confirmDialog
        ? await window.confirmDialog('¿Cancelar la sesión? No se descontará nada del stock.')
        : window.confirm('¿Cancelar la sesión? No se descontará nada del stock.');
    if (!proceed) {
        // User backed out — confirmDialog wiped #modal-mount, restore our view.
        const total = (session.steps || []).length;
        if (session.current_step >= total) _renderSummary();
        else { _renderSession(); _startPolling(); }
        return;
    }
    try {
        await window.apiCall(`/cook-sessions/${session.id}/cancel`, 'POST', {});
    } catch (e) {
        // best-effort cancel; close anyway
    }
    _closeModal();
}

// ---- Step 3: summary -------------------------------------------------------

function _renderSummary() {
    _stopPolling();
    const mount = document.getElementById('modal-mount');
    if (!mount || !session) return;

    const rows = (session.steps || []).map(s => {
        const name = _ingredientLabel(s);
        const targetLabel = _formatQty(s.target_qty, s.unit);
        let right;
        if (s.status === 'skipped') {
            right = `<span class="muted">saltado</span>`;
        } else {
            const actualLabel = s.actual_qty != null ? _formatQty(s.actual_qty, s.unit) : '—';
            const onTarget = s.weighable && s.actual_qty != null
                ? Math.abs(s.actual_qty - s.target_qty) <= WEIGHT_TOLERANCE_G
                : true;
            right = `<span style="color:${onTarget ? 'var(--good,#4ade80)' : 'var(--warn,#facc15)'}">${actualLabel}</span>`;
        }
        return `
            <div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border,#333)">
                <div>
                    <div>${window.esc(name)}</div>
                    <div class="muted" style="font-size:11px">objetivo ${targetLabel}</div>
                </div>
                <div style="font-variant-numeric:tabular-nums;">${right}</div>
            </div>
        `;
    }).join('');

    mount.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal" style="max-width:480px">
                <div class="spread" style="margin-bottom:8px">
                    <h3>Receta lista — revisá los pesos</h3>
                    <button class="btn icon sm ghost" data-action="cancel">${window.icon('close')}</button>
                </div>
                <div class="modal-sub" style="margin-bottom:12px">
                    Si confirmás, se descuentan estos pesos reales del stock.
                </div>
                <div class="stack" style="gap:0; margin-bottom:18px">${rows}</div>
                <div class="row" style="justify-content:flex-end; gap:8px">
                    <button class="btn ghost" data-action="cancel">Cancelar sesión</button>
                    <button class="btn accent" data-action="complete">Finalizar y registrar</button>
                </div>
            </div>
        </div>
    `;

    mount.querySelectorAll('[data-action="cancel"]').forEach(b => b.addEventListener('click', _onCancel));
    mount.querySelectorAll('[data-action="complete"]').forEach(b => b.addEventListener('click', _onComplete));
}

async function _onComplete() {
    if (!session) return;
    try {
        await window.apiCall(`/cook-sessions/${session.id}/complete`, 'POST', {});
        window.showToast('Receta registrada y stock descontado', 'success');
        _closeModal();
        if (window.reloadProducts) await window.reloadProducts();
        if (window.reloadWeek) await window.reloadWeek();
        if (window.reloadTodayLog) await window.reloadTodayLog();
        if (window.renderPage) window.renderPage();
    } catch (e) {
        window.showToast('Error finalizando: ' + e.message, 'error');
    }
}

// ---- Public entrypoint -----------------------------------------------------

window.openCookSession = async function(options) {
    options = options || {};
    const recipe = options.recipe;
    if (!recipe) return;
    window._cookDietPlanId = options.dietPlanId || null;

    const mount = document.getElementById('modal-mount');
    if (!mount) return;
    // Show a brief loading state while we fetch kitchen scales.
    mount.innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:380px"><div class="muted" style="padding:18px; text-align:center;">Cargando básculas…</div></div></div>`;

    await _loadKitchenScales();
    _renderPicker(recipe);
};

window.hasKitchenScales = function() {
    return kitchenScales.length > 0;
};

window.refreshKitchenScales = _loadKitchenScales;

})();
