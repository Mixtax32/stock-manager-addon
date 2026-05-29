/*
   View: Settings — macro calculators + goals
   v0.7.9
*/

let settingsDraft = null;

function _initDraft() {
    const g = window.AppState.goals;
    return {
        kcal: g.kcal || 2200,
        p: g.p || 130,
        c: g.c || 250,
        fat: g.fat || 70,
        factors: Object.assign({ p: 4, c: 4, fat: 9 }, g.factors || {}),
        weight: 75,
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

/* ---- Mobile render ---- */

function _renderSettingsMobile() {
    if (!settingsDraft) settingsDraft = _initDraft();
    const d = settingsDraft;
    const factors = d.factors;
    const sumPct = +(d.pPct + d.cPct + d.fatPct).toFixed(1);
    const calcByWeight = Math.round(d.weight * d.kPerKg);

    let mode = 'custom';
    if (factors.p === 4 && factors.c === 4 && factors.fat === 9) mode = 'estandar';
    else if (factors.p === 4 && factors.c === 3.75 && factors.fat === 9) mode = 'ue';

    const calcKcal = d.p * factors.p + d.c * factors.c + d.fat * factors.fat;
    const delta = Math.round(calcKcal - d.kcal);
    const pctP = d.kcal > 0 ? Math.round(d.p * factors.p / d.kcal * 100) : 0;
    const pctC = d.kcal > 0 ? Math.round(d.c * factors.c / d.kcal * 100) : 0;
    const pctF = d.kcal > 0 ? Math.round(d.fat * factors.fat / d.kcal * 100) : 0;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Tu objetivo diario</div>
                <h1 class="page-title">Macros</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="discard">Descartar</button>
                <button class="btn accent" data-action="save">Guardar</button>
            </div>
        </div>

        <div class="stack" style="gap:14px">

            <div class="card">
                <div class="card-title" style="margin-bottom:14px">Calcular por peso corporal</div>
                <div class="grid cols-2" style="gap:10px; margin-bottom:10px">
                    <div class="field">
                        <label class="field-label">Peso (kg)</label>
                        <input id="s-weight" class="input num" type="number" step="0.1" min="0" value="${d.weight}"/>
                    </div>
                    <div class="field">
                        <label class="field-label">Constante (kcal/kg)</label>
                        <input id="s-kpkg" class="input num" type="number" step="0.01" min="0" value="${d.kPerKg}"/>
                    </div>
                </div>
                <div class="field" style="margin-bottom:14px">
                    <label class="field-label">Calorías estimadas</label>
                    <div class="input num wc-result">${calcByWeight} <span style="font-size:12px; color:var(--ink-3); margin-left:6px; font-family:var(--mono)">kcal</span></div>
                </div>

                <div class="muted" style="font-size:12px; margin-bottom:12px">Distribución %</div>
                <div class="grid cols-3" style="gap:8px; margin-bottom:12px">
                    <div class="field"><label class="field-label">Proteína</label><input id="s-pPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.pPct}"/></div>
                    <div class="field"><label class="field-label">Carbos</label><input id="s-cPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.cPct}"/></div>
                    <div class="field"><label class="field-label">Grasas</label><input id="s-fPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.fatPct}"/></div>
                </div>

                <div class="muted" style="font-size:12px; margin-bottom:14px; font-family:var(--mono); line-height:1.6">
                    ${d.weight}kg × ${String(d.kPerKg).replace('.', ',')} = <strong style="color:var(--ink)">${calcByWeight} kcal</strong>
                    · P${Math.round((calcByWeight * d.pPct / 100) / factors.p)}g
                    · C${Math.round((calcByWeight * d.cPct / 100) / factors.c)}g
                    · G${Math.round((calcByWeight * d.fatPct / 100) / factors.fat)}g
                    ${sumPct !== 100 ? `<span style="color:var(--warn)"> ⚠ ${String(sumPct).replace('.', ',')}%</span>` : ''}
                </div>

                <button class="btn accent" style="width:100%" data-action="apply-weight">Aplicar →</button>
            </div>

            <div class="card">
                <div class="card-title" style="margin-bottom:16px">Introduce tus macros</div>
                <div class="grid cols-2" style="gap:12px; margin-bottom:16px">
                    <div class="field"><label class="field-label">Calorías (kcal)</label><input id="s-kcal" class="input lg num" type="number" value="${d.kcal}"/></div>
                    <div class="field"><label class="field-label">Proteína (g)</label><input id="s-p" class="input lg num" type="number" value="${d.p}"/></div>
                    <div class="field"><label class="field-label">Carbohidratos (g)</label><input id="s-c" class="input lg num" type="number" value="${d.c}"/></div>
                    <div class="field"><label class="field-label">Grasas (g)</label><input id="s-fat" class="input lg num" type="number" value="${d.fat}"/></div>
                </div>

                <div style="height:1px; background:var(--line); margin-bottom:14px"></div>

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

            <div class="card">
                <div class="card-head" style="margin-bottom:12px">
                    <div class="card-title">Visual del objetivo</div>
                    <span class="card-sub">${d.kcal} kcal</span>
                </div>
                <div style="display:flex; justify-content:center; padding:6px 0 14px">
                    ${window.macroRingHTML(d.kcal, d.kcal, d.p, d.c, d.fat, 160, 12)}
                </div>
                <div class="stack" style="gap:8px">
                    <div class="spread"><span class="row" style="gap:6px"><span class="dot p"></span><span style="font-size:13px">Proteína</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctP}% · ${Math.round(d.p * factors.p)} kcal</span></div>
                    <div class="spread"><span class="row" style="gap:6px"><span class="dot c"></span><span style="font-size:13px">Carbos</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctC}% · ${Math.round(d.c * factors.c)} kcal</span></div>
                    <div class="spread"><span class="row" style="gap:6px"><span class="dot f"></span><span style="font-size:13px">Grasas</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctF}% · ${Math.round(d.fat * factors.fat)} kcal</span></div>
                </div>
                ${Math.abs(delta) > Math.max(120, d.kcal * 0.06) ? `
                <div class="alert" style="margin-top:14px">
                    <span class="ico">${window.icon('alert')}</span>
                    <div>
                        <div class="title">Las macros no cuadran con las calorías</div>
                        <div class="sub">Tus macros suman <span class="num">${Math.round(calcKcal)}</span> kcal (${delta > 0 ? '+' : ''}${delta} vs objetivo).</div>
                    </div>
                </div>` : ''}
                <div class="muted" style="font-size:12px; margin-top:12px; font-family:var(--mono); line-height:1.5">
                    P×${factors.p} + C×${factors.c} + G×${factors.fat} = ${Math.round(d.p * factors.p)} + ${Math.round(d.c * factors.c)} + ${Math.round(d.fat * factors.fat)} = <strong style="color:var(--ink)">${Math.round(calcKcal)} kcal</strong>
                </div>
            </div>

            <div class="card">
                <div class="card-title" style="margin-bottom:12px">Apariencia</div>
                <div class="row" style="gap:10px">
                    <button class="btn ${window.AppState.theme === 'cream' ? 'primary' : ''}" data-theme="cream">${window.icon('sun')} Crema</button>
                    <button class="btn ${window.AppState.theme === 'dark' ? 'primary' : ''}" data-theme="dark">${window.icon('moon')} Oscuro</button>
                </div>
            </div>

            <div class="card sunken">
                <div class="card-title" style="margin-bottom:6px">Referencias para atletas</div>
                <div class="muted" style="font-size:12px; line-height:1.5">
                    Proteína: <strong style="color:var(--ink)">1,6–2,2 g/kg</strong> peso · Grasas: <strong style="color:var(--ink)">0,8–1,2 g/kg</strong> · Carbohidratos: el resto.
                </div>
            </div>

        </div>
    `;
}

/* ---- Desktop render ---- */

window.renderSettings = function() {
    if (window.innerWidth <= 880) return _renderSettingsMobile();

    if (!settingsDraft) settingsDraft = _initDraft();
    const d = settingsDraft;
    const factors = d.factors;
    const sumPct = +(d.pPct + d.cPct + d.fatPct).toFixed(1);
    const calcByWeight = Math.round(d.weight * d.kPerKg);

    let mode = 'custom';
    if (factors.p === 4 && factors.c === 4 && factors.fat === 9) mode = 'estandar';
    else if (factors.p === 4 && factors.c === 3.75 && factors.fat === 9) mode = 'ue';

    const calcKcal = d.p * factors.p + d.c * factors.c + d.fat * factors.fat;
    const delta = Math.round(calcKcal - d.kcal);

    const pctP = d.kcal > 0 ? Math.round(d.p * factors.p / d.kcal * 100) : 0;
    const pctC = d.kcal > 0 ? Math.round(d.c * factors.c / d.kcal * 100) : 0;
    const pctF = d.kcal > 0 ? Math.round(d.fat * factors.fat / d.kcal * 100) : 0;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Tu objetivo diario</div>
                <h1 class="page-title">Macros y calorías</h1>
            </div>
            <div class="row" style="gap:8px">
                <button class="btn ghost" data-action="discard">Descartar</button>
                <button class="btn accent" data-action="save">Guardar</button>
            </div>
        </div>

        <div class="grid cols-2 layout-panel-r" style="gap:22px">
            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="spread" style="margin-bottom:10px">
                        <div class="card-title">Calcular por peso corporal</div>
                        <span class="card-sub">kcal = peso × constante</span>
                    </div>
                    <div class="muted" style="font-size:12px; margin-bottom:14px">
                        Estimación rápida para atletas. La constante por defecto <strong style="color:var(--ink)" class="num">22,68 kcal/kg</strong> equivale a la regla de 50 kcal por libra.
                    </div>
                    <div class="weight-calc">
                        <div class="field">
                            <label class="field-label">Peso (kg)</label>
                            <input id="s-weight" class="input lg num" type="number" step="0.1" min="0" value="${d.weight}"/>
                        </div>
                        <div class="field">
                            <label class="field-label">Constante (kcal/kg)</label>
                            <input id="s-kpkg" class="input lg num" type="number" step="0.01" min="0" value="${d.kPerKg}"/>
                        </div>
                        <div class="wc-eq">=</div>
                        <div class="field">
                            <label class="field-label">Calorías estimadas</label>
                            <div class="input lg num wc-result">${calcByWeight} <span style="font-size:12px; color:var(--ink-3); margin-left:6px; font-family:var(--mono)">kcal</span></div>
                        </div>
                        <button class="btn accent wc-apply" data-action="apply-weight">Aplicar →</button>
                    </div>

                    <div class="weight-split">
                        <div class="tiny" style="align-self:center">Distribución %</div>
                        <div class="field"><label class="field-label">Proteína (%)</label><input id="s-pPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.pPct}"/></div>
                        <div class="field"><label class="field-label">Carbos (%)</label><input id="s-cPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.cPct}"/></div>
                        <div class="field"><label class="field-label">Grasas (%)</label><input id="s-fPct" class="input num" type="number" step="0.1" min="0" max="100" value="${d.fatPct}"/></div>
                    </div>

                    <div class="muted" style="font-size:12px; margin-top:10px; font-family:var(--mono); line-height:1.6">
                        ${d.weight} kg × ${String(d.kPerKg).replace('.', ',')} = <strong style="color:var(--ink)">${calcByWeight} kcal</strong>
                        · P ${Math.round((calcByWeight * d.pPct / 100) / factors.p)}g
                        · C ${Math.round((calcByWeight * d.cPct / 100) / factors.c)}g
                        · G ${Math.round((calcByWeight * d.fatPct / 100) / factors.fat)}g
                        ${sumPct !== 100 ? `<span style="color:var(--warn); margin-left:8px">⚠ los porcentajes suman ${String(sumPct).replace('.', ',')}% (deberían sumar 100%)</span>` : ''}
                    </div>
                </div>

                <div class="card">
                    <div class="card-title" style="margin-bottom:16px">Introduce tus macros</div>
                    <div class="grid cols-2 keep" style="gap:16px">
                        <div class="field"><label class="field-label">Calorías (kcal)</label><input id="s-kcal" class="input lg num" type="number" value="${d.kcal}"/></div>
                        <div class="field"><label class="field-label">Proteína (g)</label><input id="s-p" class="input lg num" type="number" value="${d.p}"/></div>
                        <div class="field"><label class="field-label">Carbohidratos (g)</label><input id="s-c" class="input lg num" type="number" value="${d.c}"/></div>
                        <div class="field"><label class="field-label">Grasas (g)</label><input id="s-fat" class="input lg num" type="number" value="${d.fat}"/></div>
                    </div>

                    <div style="height:1px; background:var(--line); margin:22px 0"></div>

                    <div class="spread" style="margin-bottom:10px">
                        <div class="card-title">Modo de cálculo</div>
                        <span class="card-sub">P×${factors.p} · C×${factors.c} · G×${factors.fat}</span>
                    </div>
                    <div class="muted" style="font-size:12px; margin-bottom:12px">
                        Cómo convertimos gramos de macros a kilocalorías. Cambia esto si tu otra app usa factores distintos.
                    </div>

                    <div class="grid cols-3" style="gap:10px">
                        ${_modeCard('estandar', 'Estándar Atwater', 'El más usado · OMS, USDA', '4 · 4 · 9', mode === 'estandar')}
                        ${_modeCard('ue', 'Etiquetado UE', 'Reglamento 1169/2011', '4 · 3,75 · 9', mode === 'ue')}
                        ${_modeCard('custom', 'Personalizado', 'Ajusta cada factor', `${factors.p} · ${factors.c} · ${factors.fat}`, mode === 'custom')}
                    </div>

                    ${mode === 'custom' ? `
                    <div class="grid cols-3 keep-2" style="gap:10px; margin-top:12px">
                        <div class="field"><label class="field-label">kcal / g proteína</label><input id="s-fp" class="input num" type="number" step="0.05" min="0" value="${factors.p}"/></div>
                        <div class="field"><label class="field-label">kcal / g carbo</label><input id="s-fc" class="input num" type="number" step="0.05" min="0" value="${factors.c}"/></div>
                        <div class="field"><label class="field-label">kcal / g grasa</label><input id="s-ff" class="input num" type="number" step="0.05" min="0" value="${factors.fat}"/></div>
                    </div>` : ''}
                </div>

                <div class="card">
                    <div class="card-title" style="margin-bottom:12px">Apariencia</div>
                    <div class="row" style="gap:10px">
                        <button class="btn ${window.AppState.theme === 'cream' ? 'primary' : ''}" data-theme="cream">${window.icon('sun')} Crema</button>
                        <button class="btn ${window.AppState.theme === 'dark' ? 'primary' : ''}" data-theme="dark">${window.icon('moon')} Oscuro</button>
                    </div>
                </div>
            </div>

            <div class="stack" style="gap:16px">
                <div class="card">
                    <div class="card-head">
                        <div class="card-title">Visual del objetivo</div>
                        <span class="card-sub">${d.kcal} kcal</span>
                    </div>
                    <div style="display:flex; justify-content:center; padding:6px 0 14px">
                        ${window.macroRingHTML(d.kcal, d.kcal, d.p, d.c, d.fat, 180, 14)}
                    </div>

                    <div class="stack" style="gap:8px">
                        <div class="spread"><span class="row" style="gap:6px"><span class="dot p"></span><span style="font-size:13px">Proteína</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctP}% · ${Math.round(d.p * factors.p)} kcal</span></div>
                        <div class="spread"><span class="row" style="gap:6px"><span class="dot c"></span><span style="font-size:13px">Carbos</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctC}% · ${Math.round(d.c * factors.c)} kcal</span></div>
                        <div class="spread"><span class="row" style="gap:6px"><span class="dot f"></span><span style="font-size:13px">Grasas</span></span><span class="num" style="font-size:12px; color:var(--ink-2)">${pctF}% · ${Math.round(d.fat * factors.fat)} kcal</span></div>
                    </div>

                    ${Math.abs(delta) > Math.max(120, d.kcal * 0.06) ? `
                    <div class="alert" style="margin-top:14px">
                        <span class="ico">${window.icon('alert')}</span>
                        <div>
                            <div class="title">Las macros no cuadran con las calorías</div>
                            <div class="sub">Tus macros suman <span class="num">${Math.round(calcKcal)}</span> kcal (${delta > 0 ? '+' : ''}${delta} vs objetivo). Una diferencia de hasta ±5% es normal (fibra, redondeos).</div>
                        </div>
                    </div>` : ''}

                    <div class="muted" style="font-size:12px; margin-top:12px; font-family:var(--mono); line-height:1.5">
                        Cálculo · P×${factors.p} + C×${factors.c} + G×${factors.fat} = ${Math.round(d.p * factors.p)} + ${Math.round(d.c * factors.c)} + ${Math.round(d.fat * factors.fat)} = <strong style="color:var(--ink)">${Math.round(calcKcal)} kcal</strong>
                    </div>
                </div>

                <div class="card sunken">
                    <div class="card-title" style="margin-bottom:6px">Referencias para atletas</div>
                    <div class="muted" style="font-size:12px; line-height:1.5">
                        Proteína: <strong style="color:var(--ink)">1,6–2,2 g/kg</strong> peso · Grasas: <strong style="color:var(--ink)">0,8–1,2 g/kg</strong> · Carbohidratos: el resto.
                    </div>
                </div>
            </div>
        </div>
    `;
};

window.initSettings = function() {
    const root = document.getElementById('page-root');
    if (!root) return;
    const d = settingsDraft;

    function bind(id, key, parse) {
        const el = root.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', e => {
            const v = parse(e.target.value);
            d[key] = Number.isFinite(v) ? v : 0;
            window.renderPage();
        });
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
            window.renderPage();
        });
    });

    root.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = btn.dataset.mode;
            if (m === 'estandar') d.factors = { p: 4, c: 4, fat: 9 };
            else if (m === 'ue') d.factors = { p: 4, c: 3.75, fat: 9 };
            window.renderPage();
        });
    });

    root.querySelector('[data-action="apply-weight"]')?.addEventListener('click', () => {
        const kcal = Math.round(d.weight * d.kPerKg);
        d.kcal = kcal;
        d.p   = Math.round((kcal * d.pPct / 100)   / d.factors.p);
        d.c   = Math.round((kcal * d.cPct / 100)   / d.factors.c);
        d.fat = Math.round((kcal * d.fatPct / 100) / d.factors.fat);
        window.renderPage();
    });

    root.querySelector('[data-action="discard"]').addEventListener('click', () => {
        settingsDraft = _initDraft();
        window.renderPage();
    });

    root.querySelector('[data-action="save"]').addEventListener('click', () => {
        window.saveGoals({
            kcal: d.kcal, p: d.p, c: d.c, fat: d.fat,
            factors: Object.assign({}, d.factors),
        });
        window.showToast('Objetivos guardados', 'success');
        window.renderNav();
    });

    root.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.saveTheme(btn.dataset.theme);
            window.renderPage();
        });
    });
};
