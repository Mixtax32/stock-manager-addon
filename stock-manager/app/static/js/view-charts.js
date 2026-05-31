/*
   View: Charts — weight history + daily kcal consumption
   v0.8.31
*/

let chartsRange = 30; // days; 7 | 30 | 90 | 0 (=todo)
let chartsData = { weights: null, kcal: null, loading: false };

async function _loadChartData() {
    chartsData.loading = true;
    try {
        const [weights, kcal] = await Promise.all([
            window.apiCall('/weight', 'GET'),
            window.apiCall(`/stats/daily-kcal?days=${chartsRange || 365}`, 'GET'),
        ]);
        chartsData.weights = weights || [];
        chartsData.kcal = kcal || [];
    } catch (e) {
        console.error('chart load failed', e);
        chartsData.weights = [];
        chartsData.kcal = [];
    } finally {
        chartsData.loading = false;
    }
}

function _filterByRange(arr, days) {
    if (!days || days <= 0) return arr;
    const cutoff = new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate() - days);
    return arr.filter(d => new Date(d.date + 'T00:00:00') >= cutoff);
}

function _formatDateShort(iso) {
    const d = new Date(iso + 'T00:00:00');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

function _lineChartSVG(data, valueKey, opts) {
    opts = opts || {};
    const color = opts.color || 'var(--ink)';
    const goal = opts.goal;
    const W = 600, H = 220;
    const PAD_L = 44, PAD_R = 14, PAD_T = 14, PAD_B = 30;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    if (!data || data.length === 0) {
        return `<div class="empty" style="padding:30px 0"><div class="t">Sin datos</div><div>Empezá a registrar para ver la curva.</div></div>`;
    }

    const values = data.map(d => Number(d[valueKey]) || 0);
    let maxV = Math.max(...values, goal || 0);
    let minV = opts.zeroBased ? 0 : Math.min(...values, goal || Infinity);
    if (!Number.isFinite(minV)) minV = 0;
    // Pad the range a touch
    const span = Math.max(1, maxV - minV);
    maxV = maxV + span * 0.08;
    minV = Math.max(0, minV - span * 0.08);
    const range = maxV - minV || 1;

    const xStep = data.length > 1 ? plotW / (data.length - 1) : 0;

    const points = data.map((d, i) => {
        const x = PAD_L + i * xStep;
        const y = PAD_T + plotH - ((Number(d[valueKey]) - minV) / range) * plotH;
        return { x, y, d };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dots = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${color}"/>`).join('');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => {
        const v = minV + range * t;
        const y = PAD_T + plotH - t * plotH;
        return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="var(--line)" stroke-width="0.5"/>
                <text x="${PAD_L - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${Math.round(v)}</text>`;
    }).join('');

    const xIdx = points.length >= 3
        ? [0, Math.floor(points.length / 2), points.length - 1]
        : points.map((_, i) => i);
    const xLabels = xIdx.map(i => {
        const p = points[i];
        return `<text x="${p.x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="var(--ink-3)" font-family="var(--mono)">${_formatDateShort(p.d.date)}</text>`;
    }).join('');

    const goalLine = (goal && goal >= minV && goal <= maxV) ? `
        <line x1="${PAD_L}" y1="${(PAD_T + plotH - ((goal - minV) / range) * plotH).toFixed(1)}"
              x2="${W - PAD_R}" y2="${(PAD_T + plotH - ((goal - minV) / range) * plotH).toFixed(1)}"
              stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.85"/>
    ` : '';

    return `
        <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block">
            ${yTicks}
            ${goalLine}
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2"/>
            ${dots}
            ${xLabels}
        </svg>
    `;
}

window.renderCharts = function() {
    // First render: kick off data load
    if (chartsData.weights === null && !chartsData.loading) {
        _loadChartData().then(() => window.renderPage());
    }

    const goal = window.AppState.goals.kcal || 0;
    const wData = chartsData.weights ? _filterByRange(chartsData.weights, chartsRange) : [];
    const kData = chartsData.kcal || [];

    const lastWeight = wData.length > 0 ? wData[wData.length - 1].weight : null;
    const avgKcal = kData.length > 0 ? Math.round(kData.reduce((s, d) => s + (d.kcal || 0), 0) / kData.length) : 0;

    const rangeBtn = (val, label) => `<button aria-pressed="${chartsRange === val}" data-range="${val}">${label}</button>`;

    return `
        <div class="page-head">
            <div>
                <div class="page-eyebrow">Histórico</div>
                <h1 class="page-title">Gráficos</h1>
            </div>
            <div class="seg-scroll">
                <div class="seg">
                    ${rangeBtn(7, '7d')}
                    ${rangeBtn(30, '30d')}
                    ${rangeBtn(90, '90d')}
                    ${rangeBtn(0, 'Todo')}
                </div>
            </div>
        </div>

        <div class="stack" style="gap:18px">
            <div class="card">
                <div class="card-head">
                    <div class="card-title">Peso corporal</div>
                    <span class="card-sub">${lastWeight != null ? `${lastWeight} kg último` : 'sin registros'}</span>
                </div>
                ${chartsData.loading ? `<div class="empty" style="padding:30px 0">Cargando…</div>` : _lineChartSVG(wData, 'weight', { color: 'var(--accent)' })}
            </div>

            <div class="card">
                <div class="card-head">
                    <div class="card-title">Calorías consumidas</div>
                    <span class="card-sub">media ${avgKcal} kcal · objetivo ${goal} kcal</span>
                </div>
                ${chartsData.loading ? `<div class="empty" style="padding:30px 0">Cargando…</div>` : _lineChartSVG(kData, 'kcal', { color: 'var(--protein)', goal, zeroBased: true })}
            </div>
        </div>
    `;
};

window.initCharts = function() {
    const root = document.getElementById('page-root');
    if (!root) return;

    root.querySelectorAll('[data-range]').forEach(btn => {
        btn.addEventListener('click', async () => {
            chartsRange = Number(btn.dataset.range);
            // Reload kcal series (weight is fetched whole, just re-filter)
            chartsData.kcal = null;
            chartsData.loading = true;
            window.renderPage();
            try {
                chartsData.kcal = await window.apiCall(`/stats/daily-kcal?days=${chartsRange || 365}`, 'GET');
            } catch (e) {
                chartsData.kcal = [];
            }
            chartsData.loading = false;
            window.renderPage();
        });
    });
};
