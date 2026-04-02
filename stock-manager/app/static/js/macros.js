/* 
   Macros & Charts Logic
   v0.6.0
*/

async function updateMacros() {
    try {
        const macros = await window.apiCall('/stats/daily-macros');
        const goals = await window.apiCall('/stats/macro-goals');
        
        const cKcal = Math.round(macros.total_kcal || 0);
        const gKcal = Math.round(goals.kcal || 2000);
        
        const dashKcal = document.getElementById('macro-kcal');
        const dashTarget = document.getElementById('target-kcal');
        if (dashKcal) dashKcal.textContent = cKcal;
        if (dashTarget) dashTarget.textContent = `/ ${gKcal} kcal`;
        
        const fullKcal = document.getElementById('full-macro-kcal');
        const fullTarget = document.getElementById('full-target-kcal');
        if (fullKcal) fullKcal.textContent = cKcal;
        if (fullTarget) fullTarget.textContent = `/ ${gKcal} kcal`;

        updateDoughnutChart('kcalChart', window.kcalChart, cKcal, gKcal, c => window.kcalChart = c);
        updateDoughnutChart('full-kcalChart', window.fullKcalChart, cKcal, gKcal, c => window.fullKcalChart = c);

        ["proteins", "carbs", "fat"].forEach(m => {
            const consumed = Math.round(macros[`total_${m}`] || 0);
            const goal = Math.round(goals[m] || 1);
            const pct = Math.min(100, (consumed / goal) * 100);
            
            const dp = document.getElementById(`macro-${m}`);
            if (dp) dp.textContent = `${consumed}/${goal}g`;
            const df = document.getElementById(`fill-${m}`);
            if (df) df.style.width = pct + '%';

            const fp = document.getElementById(`full-macro-${m}`);
            if (fp) fp.textContent = `${consumed}/${goal}g`;
            const ff = document.getElementById(`full-fill-${m}`);
            if (ff) ff.style.width = pct + '%';
        });
    } catch (e) { console.error('Error updating macros:', e); }
}
window.updateMacros = updateMacros;

async function updateCharts() {
    if (typeof Chart === 'undefined') { console.warn("Chart.js no cargado. Saltando gráficas."); return; }
    try {
        const stats = await window.apiCall('/stats');
        document.getElementById('stat-total-p').textContent = stats.total_products || 0;
        document.getElementById('stat-total-u').textContent = stats.total_units || 0;
        document.getElementById('stat-low-s').textContent = stats.low_stock_count || 0;
        
        const data = await window.apiCall('/stats/consumption?days=30');
        const ctx = document.getElementById('consumptionChart').getContext('2d');
        const labels = data.map(d => {
            const date = new Date(d.day);
            return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });
        const values = data.map(d => d.total);
        if (window.consumptionChart) window.consumptionChart.destroy();
        window.consumptionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Consumo diario',
                    data: values,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#4ade80'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#555', stepSize: 1 }, grid: { color: '#222' } },
                    x: { ticks: { color: '#555', maxRotation: 0 }, grid: { display: false } }
                }
            }
        });
    } catch (e) { console.error('Error updating charts:', e); }
}
window.updateCharts = updateCharts;

function updateDoughnutChart(canvasId, chartObj, val, target, setChart) {
    if (typeof Chart === 'undefined') { console.warn(`Chart.js no disponible para ${canvasId}`); return; }
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!chartObj) {
        const newChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [val, Math.max(0, target - val)],
                    backgroundColor: ['#4ade80', '#111'],
                    borderWidth: 0, cutout: '85%', borderRadius: 10
                }]
            },
            options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: false }
        });
        setChart(newChart);
    } else {
        chartObj.data.datasets[0].data = [val, Math.max(0, target - val)];
        chartObj.update();
    }
}

window.updateTodayMovements = async () => {
    try {
        const moves = await window.apiCall('/stats/today-movements');
        const listIds = ['today-movements-list', 'full-today-movements-list'];
        
        const html = moves.length ? moves.map(m => `
            <div class="history-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #1a1a1a;">
                <div class="hi-info">
                    <div style="font-weight:600; color:#fff; font-size:14px;">${m.name}</div>
                    <div style="font-size:12px; color:#555;">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} • ${Math.abs(m.quantity_change)} ud${Math.abs(m.quantity_change)>1?'s':''}</div>
                </div>
                <button class="btn-del" onclick="window.deleteMovement(${m.id})" style="color:#ef4444; font-size:16px;">✕</button>
            </div>
        `).join('') : '<div style="color:#555;font-size:13px;text-align:center;padding:20px;">No hay consumos hoy</div>';
        
        listIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
    } catch (e) { console.error('Error fetching history:', e); }
};

window.saveMacroGoals = async () => {
    const kcal = parseFloat(document.getElementById('goal-kcal').value);
    const proteins = parseFloat(document.getElementById('goal-proteins').value);
    const carbs = parseFloat(document.getElementById('goal-carbs').value);
    const fat = parseFloat(document.getElementById('goal-fat').value);
    
    try {
        await window.apiCall('/stats/macro-goals', 'PATCH', { kcal, proteins, carbs, fat });
        window.showToast('Objetivos guardados', 'success');
        updateMacros();
        window.closeMacroGoalsPanel();
    } catch (e) { window.showToast('Error al guardar: ' + e.message, 'error'); }
};

let currentMacroFillResults = [];
window.startMacroFillPreview = async () => {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (!overlay) return;
    
    overlay.classList.remove('hidden');
    loadingText.textContent = "Buscando macros en Open Food Facts...";

    try {
        const results = await window.apiCall('/products/macro-fill-preview');
        overlay.classList.add('hidden');
        
        if (!results || results.length === 0) {
            window.showToast("No se han encontrado productos para actualizar o no hay coincidencias en la API", "info");
            return;
        }

        currentMacroFillResults = results;
        const container = document.getElementById('macro-fill-results');
        container.innerHTML = results.map((res, i) => `
            <div class="macro-fill-item">
                <input type="checkbox" checked id="macro-check-${i}" style="width:20px; height:20px; accent-color: var(--accent);">
                <div class="product-img-mini" style="width:40px; height:40px;">
                    <img src="${res.suggested.image_url || ''}" onerror="this.src='https://placehold.co/40x40/111/444?text=?'">
                </div>
                <div class="mfi-info">
                    <span class="mfi-name">${res.name}</span>
                    <span class="mfi-barcode">${res.barcode}</span>
                    <div class="mfi-suggested">
                        <span>🔥 ${res.suggested.kcal_100g} kcal</span>
                        <span>🥩 P: ${res.suggested.proteins_100g}g</span>
                        <span>🍞 C: ${res.suggested.carbs_100g}g</span>
                        <span>🥑 G: ${res.suggested.fat_100g}g</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        document.getElementById('macro-fill-preview-area').classList.remove('hidden');
        document.getElementById('btn-macro-auto').disabled = true;
    } catch (e) {
        if (overlay) overlay.classList.add('hidden');
        window.showToast("Error al buscar macros: " + e.message, "error");
    }
};

window.confirmMacroFill = async () => {
    const confirmed = [];
    currentMacroFillResults.forEach((res, i) => {
        const check = document.getElementById(`macro-check-${i}`);
        if (check && check.checked) {
            confirmed.push({
                barcode: res.barcode,
                ...res.suggested
            });
        }
    });

    if (confirmed.length === 0) {
        window.showToast("Selecciona al menos un producto", "info");
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    overlay.classList.remove('hidden');
    loadingText.textContent = "Actualizando base de datos...";

    try {
        const resp = await window.apiCall('/products/macro-fill-confirm', 'POST', confirmed);
        overlay.classList.add('hidden');
        window.showToast(resp.message, "success");
        document.getElementById('macro-fill-preview-area').classList.add('hidden');
        document.getElementById('btn-macro-auto').disabled = false;
        await window.loadProducts(); 
    } catch (e) {
        overlay.classList.add('hidden');
        window.showToast("Error al guardar: " + e.message, "error");
    }
};
