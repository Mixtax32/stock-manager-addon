/*
   View: Settings — macro calculators + goals
   v0.8.26
*/

let settingsDraft = null;
let _advancedOpen = false;
let _touched = false;

function _initDraft() {
    _touched = false;
    const g = window.AppState.goals;
    return {
        kcal: g.kcal || 2200,
        p: g.p || 130,
        c: g.c || 250,
        fat: g.fat || 70,
        factors: Object.assign({ p: 4, c: 4, fat: 9 }, g.factors || {}),
        weight: window.AppState.bodyWeight || 75,
        kPerKg: 22.68,
        pPct: 30,
        cPct: 45,
        fatPct: 25,
    };
}

function _modeCard(id, title, sub, val, isSel) {
    return `
        <button class="card tight" data-mode="${id}"
                style="text-align:left; cursor:pointer;
                       background:${isSel ? 'var(--accent-soft)' : 'var(--bg-sunken)'};
                       border:1px solid ${isSel ? 'var(--accent)' : 'transparent'};">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px">${title}</div>
            <div class="muted" style="font-size:12px; margin-bottom:8px">${sub}</div>
            <div class="num" style="font-size:13px">${val}</div>
        </button>
    `;
}

window.renderSettings = function() {
    if (!settingsDraft) settingsDraft = _initDraft();
    const d = settingsDraft;
    const factors = d.factors;
    const sumPct = +(d.pPct + d.cPct + d.fatPct).toFixed(1);
    const calcByWeight = Math.round(d.weight * d.kPerKg);

    let mode = 'custom';
    if (factors.p === 4 && factors.c === 4 && factors.fat === 9) mode = 'estandar';
    else if (factors.p === 4 && factors.c === 3.75 && factors.fat === 9) mode = 'ue';

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Tu objetivo diario</div>
                <h1 class="page-title">Ajustes</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="discard">Descartar</button>
                <button class="btn accent" data-action="save">Guardar</button>
            </div>
        </div>

        <div class="stack" style="gap:14px">

            <div class="card">
                <div class="card-title" style="margin-bottom:14px">Calcular por peso corporal</div>
                <div class="field" style="margin-bottom:10px">
                    <label class="field-label">Peso (kg)</label>
                    <input id="s-weight" class="input num" type="number" step="0.1" min="0" value="${d.weight}"/>
                </div>
                <div class="field" style="margin-bottom:14px">
                    <label class="field-label">Calorías estimadas</label>
                    <div class="input num" style="display:flex; align-items:center; min-height:40px; padding:8px 12px;">${calcByWeight} <span style="font-size:12px; color:var(--ink-3); margin-left:6px; font-family:var(--mono)">kcal</span></div>
                </div>
                <button class="btn accent" style="width:100%" data-action="apply-weight">Aplicar →</button>
                <div class="muted" style="font-size:12px; margin-top:10px; line-height:1.5">
                    Se guardará tu peso para llevar registro y poder ver gráficos más adelante.
                </div>
            </div>

            <div class="card">
                <div class="card-title" style="margin-bottom:12px">Apariencia</div>
                <div class="row" style="gap:10px">
                    <button class="btn ${window.AppState.theme === 'cream' ? 'primary' : ''}" data-theme="cream">${window.icon('sun')} Crema</button>
                    <button class="btn ${window.AppState.theme === 'dark' ? 'primary' : ''}" data-theme="dark">${window.icon('moon')} Oscuro</button>
                </div>
            </div>

            <div class="card">
                <div class="card-title" style="margin-bottom:12px">Datos</div>
                <div class="row" style="gap:10px; flex-wrap:wrap">
                    <button class="btn" data-action="export-csv" style="flex:1; min-width:140px">Exportar inventario (CSV)</button>
                    <button class="btn ghost" data-action="import-csv" style="flex:1; min-width:140px">Importar CSV…</button>
                </div>
                <div class="muted" style="font-size:12px; margin-top:10px; line-height:1.5">
                    Exportar descarga un CSV con productos, lotes y macros. Importar lee un CSV con esas mismas columnas y mergea (no borra lo existente).
                </div>
            </div>

            <details id="advanced-details" ${_advancedOpen ? 'open' : ''}>
                <summary style="cursor:pointer; font-weight:600; font-size:14px; padding:10px 0; list-style:none; display:flex; align-items:center; gap:8px; color:var(--ink-2);">
                    <span style="font-size:16px">›</span> Ajustes avanzados
                </summary>

                <div class="stack" style="gap:14px; margin-top:12px">

                    <div class="card">
                        <div class="card-title" style="margin-bottom:14px">Constante calórica</div>
                        <div class="field">
                            <label class="field-label">Constante (kcal/kg)</label>
                            <input id="s-kpkg" class="input num" type="number" step="0.01" min="0" value="${d.kPerKg}"/>
                        </div>
                        <div class="muted" style="font-size:12px; margin-top:8px; line-height:1.5">
                            Multiplica tu peso para estimar las calorías diarias. <strong style="color:var(--ink)" class="num">22,68</strong> equivale a la regla de 50 kcal por libra.
                        </div>
                    </div>

                    <div class="card">
                        <div class="muted" style="font-size:12px; margin-bottom:10px">Distribución %</div>
                        <div class="grid cols-3" style="gap:8px; margin-bottom:12px">
                            <div class="field"><label class="field-label">Proteína</label><input id="s-pPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.pPct}"/></div>
                            <div class="field"><label class="field-label">Carbos</label><input id="s-cPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.cPct}"/></div>
                            <div class="field"><label class="field-label">Grasas</label><input id="s-fPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.fatPct}"/></div>
                        </div>
                        <div class="muted" style="font-size:12px; font-family:var(--mono); line-height:1.6">
                            ${d.weight}kg × ${String(d.kPerKg).replace('.', ',')} = <strong style="color:var(--ink)">${calcByWeight} kcal</strong>
                            · P${Math.round((calcByWeight * d.pPct / 100) / factors.p)}g
                            · C${Math.round((calcByWeight * d.cPct / 100) / factors.c)}g
                            · G${Math.round((calcByWeight * d.fatPct / 100) / factors.fat)}g
                            ${sumPct !== 100 ? `<span style="color:var(--warn)"> ⚠ ${String(sumPct).replace('.', ',')}%</span>` : ''}
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-title" style="margin-bottom:16px">Introduce tus macros</div>
                        <div class="grid cols-2" style="gap:12px; margin-bottom:16px">
                            <div class="field"><label class="field-label">Calorías (kcal)</label><input id="s-kcal" class="input lg num" type="number" value="${d.kcal}"/></div>
                            <div class="field"><label class="field-label">Proteína (g)</label><input id="s-p" class="input lg num" type="number" value="${d.p}"/></div>
                            <div class="field"><label class="field-label">Carbohidratos (g)</label><input id="s-c" class="input lg num" type="number" value="${d.c}"/></div>
                            <div class="field"><label class="field-label">Grasas (g)</label><input id="s-fat" class="input lg num" type="number" value="${d.fat}"/></div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="spread" style="margin-bottom:10px">
                            <div class="card-title">Modo de cálculo</div>
                            <span class="card-sub">P×${factors.p} · C×${factors.c} · G×${factors.fat}</span>
                        </div>
                        <div class="stack" style="gap:8px; margin-bottom:${mode === 'custom' ? '12px' : '0'}">
                            ${_modeCard('estandar', 'Estándar Atwater', 'OMS, USDA', '4 · 4 · 9', mode === 'estandar')}
                            ${_modeCard('ue', 'Etiquetado UE', 'Reglamento 1169/2011', '4 · 3,75 · 9', mode === 'ue')}
                            ${_modeCard('custom', 'Personalizado', 'Ajusta cada factor', `${factors.p} · ${factors.c} · ${factors.fat}`, mode === 'custom')}
                        </div>
                        ${mode === 'custom' ? `
                        <div class="grid cols-3" style="gap:10px">
                            <div class="field"><label class="field-label">kcal/g prot</label><input id="s-fp" class="input num" type="number" step="0.05" min="0" value="${factors.p}"/></div>
                            <div class="field"><label class="field-label">kcal/g carbo</label><input id="s-fc" class="input num" type="number" step="0.05" min="0" value="${factors.c}"/></div>
                            <div class="field"><label class="field-label">kcal/g grasa</label><input id="s-ff" class="input num" type="number" step="0.05" min="0" value="${factors.fat}"/></div>
                        </div>` : ''}
                    </div>

                </div>
            </details>

        </div>
    `;
};

function _isDirty() {
    return _touched;
}

function _showUnsavedDialog() {
    return new Promise(resolve => {
        const mount = document.getElementById('modal-mount');
        if (!mount) { resolve('cancel'); return; }
        mount.innerHTML = `
            <div class="modal-backdrop" data-close="1">
                <div class="modal" data-stop="1" style="max-width:380px">
                    <h3 style="margin:0 0 16px">Tienes cambios sin guardar</h3>
                    <div class="row" style="justify-content:flex-end; gap:8px">
                        <button class="btn ghost" data-action="discard">Salir sin guardar</button>
                        <button class="btn accent" data-action="save">Guardar</button>
                    </div>
                </div>
            </div>`;
        const close = (v) => { mount.innerHTML = ''; resolve(v); };
        window.wireBackdropClose(mount.querySelector('[data-close]'), () => close('cancel'));
        mount.querySelector('[data-action="discard"]').addEventListener('click', () => close('discard'));
        mount.querySelector('[data-action="save"]').addEventListener('click', () => close('save'));
    });
}

window.initSettings = function() {
    const root = document.getElementById('page-root');
    if (!root) return;
    const d = settingsDraft;

    window.navGuard = async () => {
        if (!_isDirty()) return true;
        const choice = await _showUnsavedDialog();
        if (choice === 'discard') {
            settingsDraft = null;
            _touched = false;
            return true;
        }
        if (choice === 'save') {
            await window.saveGoals({
                kcal: d.kcal, p: d.p, c: d.c, fat: d.fat,
                factors: Object.assign({}, d.factors),
            });
            _touched = false;
            window.showToast('Objetivos guardados', 'success');
            return true;
        }
        return false;
    };

    const advancedEl = root.querySelector('#advanced-details');
    if (advancedEl) {
        advancedEl.addEventListener('toggle', () => { _advancedOpen = advancedEl.open; });
    }

    // `input` updates the draft silently while typing; `change` (fires on blur or
    // Enter) is what triggers the re-render. Re-rendering on every keystroke
    // destroys the DOM and rips focus out of the field on mobile.
    // The render is deferred to the next tick so that a pending click on a
    // button (e.g. "Aplicar →" while the input still had focus) reaches its
    // handler before the DOM is rebuilt — otherwise mousedown/mouseup land on
    // different nodes and the click is dropped.
    function bind(id, key, parse) {
        const el = root.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', e => {
            const v = parse(e.target.value);
            d[key] = Number.isFinite(v) ? v : 0;
            _touched = true;
        });
        el.addEventListener('change', () => setTimeout(() => window.renderPage(), 0));
    }

    bind('s-weight', 'weight', parseFloat);
    bind('s-kpkg', 'kPerKg', parseFloat);
    bind('s-pPct', 'pPct', parseFloat);
    bind('s-cPct', 'cPct', parseFloat);
    bind('s-fPct', 'fatPct', parseFloat);
    bind('s-kcal', 'kcal', v => Math.max(0, parseFloat(v) || 0));
    bind('s-p', 'p', v => Math.max(0, parseFloat(v) || 0));
    bind('s-c', 'c', v => Math.max(0, parseFloat(v) || 0));
    bind('s-fat', 'fat', v => Math.max(0, parseFloat(v) || 0));

    [['s-fp', 'p'], ['s-fc', 'c'], ['s-ff', 'fat']].forEach(([id, key]) => {
        const el = root.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', e => {
            d.factors[key] = Math.max(0, parseFloat(e.target.value) || 0);
            _touched = true;
        });
        el.addEventListener('change', () => setTimeout(() => window.renderPage(), 0));
    });

    root.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = btn.dataset.mode;
            if (m === 'estandar') d.factors = { p: 4, c: 4, fat: 9 };
            else if (m === 'ue') d.factors = { p: 4, c: 3.75, fat: 9 };
            _touched = true;
            window.renderPage();
        });
    });

    root.querySelector('[data-action="apply-weight"]')?.addEventListener('click', async () => {
        const kcal = Math.round(d.weight * d.kPerKg);
        d.kcal = kcal;
        d.p   = Math.round((kcal * d.pPct / 100)   / d.factors.p);
        d.c   = Math.round((kcal * d.cPct / 100)   / d.factors.c);
        d.fat = Math.round((kcal * d.fatPct / 100) / d.factors.fat);
        await window.saveBodyWeight(d.weight);
        _touched = true;
        window.renderPage();
    });

    root.querySelector('[data-action="discard"]').addEventListener('click', () => {
        settingsDraft = _initDraft();
        window.renderPage();
    });

    root.querySelector('[data-action="save"]').addEventListener('click', async () => {
        await window.saveGoals({
            kcal: d.kcal, p: d.p, c: d.c, fat: d.fat,
            factors: Object.assign({}, d.factors),
        });
        _touched = false;
        window.showToast('Objetivos guardados', 'success');
        window.renderNav();
    });

    root.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.saveTheme(btn.dataset.theme);
            window.renderPage();
        });
    });

    root.querySelector('[data-action="export-csv"]')?.addEventListener('click', async () => {
        try {
            // /export streams CSV — fetch raw, don't try to JSON-parse it via apiCall.
            const resp = await fetch(`${window.API_BASE}/export`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            window.showToast('Inventario exportado', 'success');
        } catch (e) {
            window.showToast('Error exportando: ' + e.message, 'error');
        }
    });

    root.querySelector('[data-action="import-csv"]')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.onchange = async e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            try {
                const resp = await fetch(`${window.API_BASE}/import`, { method: 'POST', body: fd });
                const result = await resp.json().catch(() => ({}));
                if (!resp.ok) throw new Error(result.detail || `HTTP ${resp.status}`);
                window.showToast(`Importados ${result.count} productos`, 'success');
                await window.reloadProducts();
            } catch (err) {
                window.showToast('Error importando: ' + err.message, 'error');
            }
        };
        input.click();
    });
};
