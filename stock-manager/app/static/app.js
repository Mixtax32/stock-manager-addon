const API_BASE = `${window.location.pathname.replace(/\/$/, '')}/api`;
let html5QrCode;
let products = [];
let currentBarcode = null;
let ticketItems = [];
let filteredLocation = null;
let allLocations = [];
let scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
let currentScannedImageUrl = null;
let selectedProducts = new Set();
let isSelectionMode = false;

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Auto-hide
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

window.onload = async function () {
    await loadProducts();
};

function toggleSection(id) {
    document.getElementById(id).classList.toggle('collapsed');
}

// API
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const url = `${API_BASE}${endpoint}`;
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            let msg;
            try { msg = JSON.parse(text).detail || `Error ${response.status}`; }
            catch { msg = `Error ${response.status}: ${text.substring(0, 200) || response.statusText}`; }
            throw new Error(msg);
        }
        if (method === 'DELETE') return true;
        return await response.json().catch(() => { throw new Error('Respuesta inválida'); });
    } catch (error) {
        console.error(`API Error [${method} ${url}]:`, error);
        showToast(error.message, 'error');
        throw error;
    }
}

async function exportInventory() {
    try {
        const response = await fetch(`${API_BASE}/export`);
        if (!response.ok) throw new Error('Error al exportar');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('Inventario exportado correctamente', 'success');
    } catch (error) {
        showToast('Error exportando: ' + error.message, 'error');
    }
}

async function importInventory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE}/import`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                showToast(`Importación completada: ${result.count} productos`, 'success');
                loadProducts();
            } else {
                throw new Error(result.detail || 'Error en la importación');
            }
        } catch (error) {
            showToast('Error importando: ' + error.message, 'error');
        }
    };
    input.click();
}

async function loadProducts() {
    try {
        products = await apiCall('/products');
        updateUI();
        updateCharts();
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

let consumptionChart = null;

async function updateCharts() {
    try {
        const stats = await apiCall('/stats');
        document.getElementById('stat-total-p').textContent = stats.total_products || 0;
        document.getElementById('stat-total-u').textContent = stats.total_units || 0;
        document.getElementById('stat-low-s').textContent = stats.low_stock_count || 0;

        const data = await apiCall('/stats/consumption?days=30');
        const ctx = document.getElementById('consumptionChart').getContext('2d');

        const labels = data.map(d => {
            const date = new Date(d.day);
            return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });
        const values = data.map(d => d.total);

        if (consumptionChart) {
            consumptionChart.destroy();
        }

        consumptionChart = new Chart(ctx, {
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
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#555', stepSize: 1 },
                        grid: { color: '#222' }
                    },
                    x: {
                        ticks: { color: '#555', maxRotation: 0 },
                        grid: { display: false }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error updating charts:', e);
    }
}

async function loadStats() {
    try { return await apiCall('/stats'); }
    catch { return { total_products: 0, total_units: 0, low_stock_count: 0 }; }
}

// Scanner
document.getElementById('start-scan').onclick = async function () {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Cámara no disponible. Se requiere HTTPS.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        stream.getTracks().forEach(track => track.stop());
        html5QrCode = new Html5Qrcode("scanner-container");
        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess
        );

        // Centrar pantalla en el escáner
        document.getElementById('scanner-container').scrollIntoView({ behavior: 'smooth', block: 'center' });

        document.getElementById('start-scan').classList.add('hidden');
        document.getElementById('start-ticket').classList.add('hidden');
        document.getElementById('stop-scan').classList.remove('hidden');
    } catch (err) {
        showToast('Error cámara: ' + err.message);
    }
};

document.getElementById('stop-scan').onclick = function () {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('start-scan').classList.remove('hidden');
            document.getElementById('start-ticket').classList.remove('hidden');
            document.getElementById('stop-scan').classList.add('hidden');
        });
    }
};

// Ticket scanner
document.getElementById('start-ticket').onclick = async function () {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Cámara no disponible. Se requiere HTTPS.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const container = document.getElementById('scanner-container');
        container.innerHTML = '';
        video.style.width = '100%';
        video.style.borderRadius = '8px';
        container.appendChild(video);

        const captureBtn = document.createElement('button');
        captureBtn.className = 'btn btn-add';
        captureBtn.style.cssText = 'width:100%;margin-top:8px;';
        captureBtn.textContent = 'Capturar ticket';
        container.appendChild(captureBtn);

        document.getElementById('start-scan').classList.add('hidden');
        document.getElementById('start-ticket').classList.add('hidden');
        document.getElementById('stop-scan').classList.remove('hidden');

        container.scrollIntoView({ behavior: 'smooth', block: 'center' });

        captureBtn.onclick = async function () {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);

            stream.getTracks().forEach(t => t.stop());
            container.innerHTML = '';
            document.getElementById('start-scan').classList.remove('hidden');
            document.getElementById('start-ticket').classList.remove('hidden');
            document.getElementById('stop-scan').classList.add('hidden');

            await processTicketImage(canvas);
        };

        const origStop = document.getElementById('stop-scan').onclick;
        document.getElementById('stop-scan').onclick = function () {
            stream.getTracks().forEach(t => t.stop());
            container.innerHTML = '';
            document.getElementById('start-scan').classList.remove('hidden');
            document.getElementById('start-ticket').classList.remove('hidden');
            document.getElementById('stop-scan').classList.add('hidden');
            document.getElementById('stop-scan').onclick = origStop;
        };
    } catch (err) {
        showToast('Error cámara: ' + err.message);
    }
};

async function processTicketImage(canvas) {
    const progress = document.getElementById('ticket-progress');
    const statusEl = document.getElementById('ticket-status');
    const fillEl = document.getElementById('ticket-fill');
    progress.classList.remove('hidden');
    statusEl.textContent = 'Preparando imagen...';
    fillEl.style.width = '5%';

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contrast = ((gray / 255 - 0.5) * 1.8 + 0.5) * 255;
        const bw = contrast > 140 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);

    statusEl.textContent = 'Leyendo ticket...';
    fillEl.style.width = '10%';

    try {
        const result = await Tesseract.recognize(canvas, 'spa', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    fillEl.style.width = pct + '%';
                    statusEl.textContent = `Leyendo ticket... ${pct}%`;
                }
            }
        });

        progress.classList.add('hidden');
        parseTicketText(result.data.text);
    } catch (err) {
        progress.classList.add('hidden');
        showToast('Error al leer ticket: ' + err.message, 'error');
    }
}

function normalizeText(text) {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function isJunkLine(line) {
    const trimmed = line.trim();
    const norm = normalizeText(line);
    if (norm.length < 3) return true;
    if (/^\d+$/.test(norm)) return true;
    if (/^[\d\s\-\/\.\,\*\#\:\;\(\)\[\]]+$/.test(trimmed)) return true;
    if (/\d{7,}/.test(trimmed)) return true;

    const digitCount = (trimmed.match(/\d/g) || []).length;
    const letterCount = (trimmed.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/g) || []).length;
    if (letterCount < 2) return true;
    if (digitCount > 0 && letterCount > 0 && digitCount / (digitCount + letterCount) > 0.6) return true;

    const junkAnywhere = [
        /\btotal\b/i, /\bsubtotal\b/i, /\biva\b/i, /\bbase\s*imp/i,
        /\bcambio\b/i, /\befectivo\b/i, /\btarjeta\b/i, /\bvisa\b/i, /\bmastercard\b/i,
        /\bnif\b/i, /\bcif\b/i, /\bn\.i\.f/i, /\bc\.i\.f/i,
        /\bgracias\b/i, /\bticket\b/i, /\bfactura\b/i, /\brecibo\b/i,
        /\bdescuento\b/i, /\bahorro\b/i, /\bdto\b/i,
        /\bredondeo\b/i, /\bsaldo\b/i, /\bpuntos\b/i, /\bcup[oó]n\b/i,
        /\bdevoluci[oó]n\b/i, /\bpago\b/i, /\bimporte\b/i,
        /\bcliente\b/i, /\bsocio\b/i,
        /\btpv\b/i, /\boperaci[oó]n\b/i
    ];

    const junkStart = [
        /^fecha/i, /^hora/i,
        /^\d{1,2}[\/:]\d{2}/, /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/,
        /^tel[eé]?f/i, /^fax/i, /^www\./i, /^http/i, /^@/,
        /^le\s+atien/i, /^caja\b/i, /^op[\.\s]/i,
        /^precio/i, /^p\.?v\.?p/i,
        /^avd?a?[\.\s]/i, /^c\//i, /^calle\s/i, /^plaza\s/i, /^pol[ií]gono/i,
        /^cp\s*\d/i, /^\d{5}\s+\w/,
        /^reg[\.\s]/i, /^inscri/i,
        /^aut[\.\s]*\d/i, /^ref[\.\s]*\d/i,
        /^art[ií]culos?\b/i, /^unidades\b/i,
        /^super\b/i, /^mercadona/i, /^carrefour/i, /^lidl/i, /^aldi/i,
        /^dia\s/i, /^eroski/i, /^alcampo/i, /^hipercor/i, /^el\s*corte/i,
        /^bonpreu/i, /^consum\b/i, /^caprabo/i, /^ahorram/i, /^hacendado/i,
        /^delaviuda/i, /^s[\.\s]*?[al]\b/i
    ];

    for (const pat of junkAnywhere) { if (pat.test(trimmed)) return true; }
    for (const pat of junkStart) { if (pat.test(trimmed)) return true; }
    return false;
}

function parseTicketText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    ticketItems = [];
    const priceRegex = /\d+[,.]\d{2}/;

    for (const line of lines) {
        const norm = normalizeText(line);
        if (norm.length < 2) continue;
        if (/^[\d\s\-\/\.\,\*\#\:\;\(\)\[\]]+$/.test(line.trim())) continue;
        const letterCount = (line.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/g) || []).length;
        if (letterCount < 2) continue;
        const hasPrice = priceRegex.test(line);
        if (isJunkLine(line)) continue;

        let qty = 1;
        let name = line;
        const qtyMatch = name.match(/^(\d+)\s*[xX×]\s+(.+)/);
        if (qtyMatch) {
            qty = parseInt(qtyMatch[1]);
            name = qtyMatch[2];
        }
        name = name.replace(/\d+[,.]\d{2}\s*€?/g, '').trim();
        name = name.replace(/\d+[,.]\d{1,3}\s*(kg|g|l|ml|cl|ud|uds)\b/gi, '').trim();
        name = name.replace(/^\d{3,}\s+/, '').trim();
        name = name.replace(/^[\-\*\.\,\s]+/, '').replace(/[\-\*\.\,\s]+$/, '').trim();
        if (name.length < 2) continue;

        let bestMatch = null;
        let bestScore = 0;
        for (const p of products) {
            const score = similarityScore(normalizeText(name), normalizeText(p.name));
            if (score > bestScore && score >= 0.35) {
                bestScore = score;
                bestMatch = p;
            }
        }

        if (bestMatch) {
            const existing = ticketItems.find(t => t.match && t.match.barcode === bestMatch.barcode);
            if (existing) {
                existing.qty += qty;
                continue;
            }
        }

        ticketItems.push({
            line, name, qty, match: bestMatch, score: bestScore,
            checked: bestMatch !== null, hasPrice
        });
    }
    showTicketResults(text);
}

function similarityScore(a, b) {
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return 0.95;

    const dist = (s1, s2) => {
        const m = s1.length, n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    };

    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;
    const levScore = 1 - dist(a, b) / maxLength;

    const wordsA = a.split(/\s+/).filter(w => w.length >= 3);
    const wordsB = b.split(/\s+/).filter(w => w.length >= 3);
    let wordMatches = 0;
    if (wordsA.length > 0 && wordsB.length > 0) {
        for (const wa of wordsA) {
            if (wordsB.some(wb => wb.includes(wa) || wa.includes(wb))) wordMatches++;
        }
    }
    const overlapScore = wordMatches / Math.max(wordsA.length, wordsB.length || 1);
    return (levScore * 0.7) + (overlapScore * 0.3);
}

function showTicketResults(rawText) {
    const matched = ticketItems.filter(t => t.match);
    const unmatched = ticketItems.filter(t => !t.match);
    let html = '';

    if (matched.length > 0) {
        html += '<div class="ticket-section-title">Coinciden con tu inventario</div>';
        matched.forEach(item => {
            const idx = ticketItems.indexOf(item);
            html += `<div class="ticket-item">
                <input type="checkbox" id="ti-check-${idx}" checked onchange="ticketItems[${idx}].checked = this.checked">
                <div class="ti-info">
                    <div class="ti-match">${item.match.name}</div>
                    <div class="ti-line">Ticket: ${item.name}</div>
                </div>
                <div class="ti-qty">
                    <label>Uds</label>
                    <input type="number" value="${item.qty}" min="1" onchange="ticketItems[${idx}].qty = parseInt(this.value)">
                </div>
            </div>`;
        });
    }

    if (unmatched.length > 0) {
        html += '<div class="ticket-section-title unmatched">Detectados en ticket (sin coincidencia)</div>';
        unmatched.forEach(item => {
            const idx = ticketItems.indexOf(item);
            const productOptions = products.map(p => `<option value="${p.barcode}">${p.name}</option>`).join('');
            html += `<div class="ticket-item">
                <input type="checkbox" id="ti-check-${idx}" onchange="ticketItems[${idx}].checked = this.checked">
                <div class="ti-info">
                    <div class="ti-match" style="color:#f59e0b">${item.name}</div>
                    <div style="margin-top:4px;">
                        <select style="width:100%;background:#111;color:#aaa;border:1px solid #333;font-size:12px;padding:4px;border-radius:4px;"
                            onchange="assignManualMatch(${idx}, this.value)">
                            <option value="">¿Asignar a producto inventario?</option>
                            ${productOptions}
                        </select>
                    </div>
                </div>
                <div class="ti-qty">
                    <label>Uds</label>
                    <input type="number" value="${item.qty}" min="1" onchange="ticketItems[${idx}].qty = parseInt(this.value)">
                </div>
            </div>`;
        });
    }

    if (ticketItems.length === 0) {
        html = '<div style="color:#555;text-align:center;padding:20px;">No se han detectado líneas de producto</div>';
    }

    html += `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #222;">
        <div class="ticket-section-title" style="color:#555;cursor:pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
            Texto OCR (toca para ver)
        </div>
        <pre class="hidden" style="color:#555;font-size:11px;white-space:pre-wrap;word-break:break-all;background:#111;padding:10px;border-radius:6px;margin-top:6px;max-height:300px;overflow-y:auto">${rawText || 'Sin texto'}</pre>
    </div>`;

    document.getElementById('ticket-matched').innerHTML = html;
    document.getElementById('ticket-panel').classList.add('active');
}

function assignManualMatch(itemIdx, barcode) {
    if (!barcode) {
        ticketItems[itemIdx].match = null;
        ticketItems[itemIdx].checked = false;
    } else {
        const product = products.find(p => p.barcode === barcode);
        ticketItems[itemIdx].match = product;
        ticketItems[itemIdx].checked = true;
    }
    const cb = document.getElementById(`ti-check-${itemIdx}`);
    if (cb) cb.checked = ticketItems[itemIdx].checked;
}

function closeTicketPanel() {
    document.getElementById('ticket-panel').classList.remove('active');
    ticketItems = [];
}

async function confirmTicketItems() {
    const selected = ticketItems.filter(t => t.checked);
    if (selected.length === 0) { showToast('No hay productos seleccionados', 'info'); return; }

    let added = 0, errors = 0;
    for (const item of selected) {
        try {
            if (item.match) {
                const p = item.match;
                if (p.batches && p.batches.length > 0) {
                    await apiCall(`/batches/${p.batches[0].id}/stock`, 'POST', { quantity: item.qty });
                } else {
                    await apiCall(`/products/${p.barcode}/stock`, 'POST', { quantity: item.qty });
                }
                added++;
            }
        } catch (e) {
            console.error('Error adding item from ticket:', e);
            errors++;
        }
    }
    await loadProducts();
    closeTicketPanel();
    showToast(`${added} productos añadidos. ${errors > 0 ? errors + ' errores.' : ''}`, errors > 0 ? 'error' : 'success');
}

function useManualBarcode() {
    const input = document.getElementById('manual-barcode').value.trim();
    if (!input) { showToast('Introduce un código o nombre', 'info'); return; }

    const byBarcode = products.find(p => p.barcode === input);
    if (byBarcode) {
        hideSearchResults();
        onScanSuccess(input);
        document.getElementById('manual-barcode').value = '';
        return;
    }

    const query = input.toLowerCase();
    const matches = products.filter(p => p.name.toLowerCase().includes(query));

    if (matches.length === 1) {
        hideSearchResults();
        onScanSuccess(matches[0].barcode);
        document.getElementById('manual-barcode').value = '';
    } else if (matches.length > 1) {
        showSearchResults(matches);
    } else {
        hideSearchResults();
        onScanSuccess(input);
        document.getElementById('manual-barcode').value = '';
    }
}

function showSearchResults(matches) {
    const container = document.getElementById('search-results');
    container.innerHTML = matches.map(p =>
        `<div class="search-result-item" onclick="pickSearchResult('${p.barcode}')">
            <span class="sr-name">${p.name}</span>
            <span class="sr-meta">${p.stock} uds · ${p.category}</span>
        </div>`
    ).join('');
    container.classList.remove('hidden');
}

function hideSearchResults() { document.getElementById('search-results').classList.add('hidden'); }
function pickSearchResult(barcode) {
    hideSearchResults();
    onScanSuccess(barcode);
    document.getElementById('manual-barcode').value = '';
}

async function onScanSuccess(decodedText) {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        document.getElementById('start-scan').classList.remove('hidden');
        document.getElementById('start-ticket').classList.remove('hidden');
        document.getElementById('stop-scan').classList.add('hidden');
    }

    currentBarcode = decodedText;
    scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };

    const fields = ['new-batch-qty', 'new-batch-expiry', 'product-name', 'product-location', 'min-stock', 'expiry-date', 'quantity'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = (f === 'new-batch-qty' || f === 'quantity') ? 1 : (f === 'min-stock' ? 2 : '');
    });
    // Correction: new-batch-qty should be 0 by default if it's for adding to existing or just placeholder
    document.getElementById('new-batch-qty').value = 0;

    document.getElementById('scanned-code').textContent = 'Código: ' + decodedText;
    document.getElementById('scanned-code').classList.remove('hidden');
    document.getElementById('product-action').classList.remove('hidden');

    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'barcode-loading';
    loadingMsg.style.cssText = 'color:#888;text-align:center;padding:12px 0;font-size:13px;';
    loadingMsg.textContent = 'Cargando información del producto...';
    document.getElementById('product-action').insertBefore(loadingMsg, document.getElementById('product-action').firstChild);

    const product = products.find(p => p.barcode === currentBarcode);
    currentScannedImageUrl = product ? product.image_url : null;

    if (product) {
        document.getElementById('existing-product-view').classList.remove('hidden');
        document.getElementById('new-product-fields').classList.add('hidden');
        document.getElementById('existing-product-name').textContent = product.name;
        document.getElementById('existing-product-stock').textContent = `(${product.stock} uds)`;
        renderScanImage(product.image_url);
        renderExistingBatches(product);
        const loading = document.getElementById('barcode-loading');
        if (loading) loading.remove();
    } else {
        document.getElementById('existing-product-view').classList.add('hidden');
        document.getElementById('new-product-fields').classList.remove('hidden');
        try {
            const barcodeData = await apiCall(`/barcode/${currentBarcode}`, 'GET');
            if (barcodeData && barcodeData.found) {
                currentScannedImageUrl = barcodeData.image_url;
                renderScanImage(barcodeData.image_url);
                document.getElementById('product-name').value = barcodeData.name || '';
                const apiCategory = barcodeData.category || '';
                const categorySelect = document.getElementById('product-category');
                const valid = ['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'];
                categorySelect.value = valid.includes(apiCategory) ? apiCategory : 'Otros';
            } else { renderScanImage(null); }
        } catch (e) { console.error(e); renderScanImage(null); }
        const loading = document.getElementById('barcode-loading');
        if (loading) loading.remove();
    }
    wrapDateInputsWithPicker();
}

function renderScanImage(url) {
    const parent = document.getElementById('product-action');
    const oldImg = parent.querySelector('.scan-product-img');
    if (oldImg) oldImg.remove();
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'scan-product-img';
        img.style.float = 'left';
        parent.insertBefore(img, parent.firstChild);
    }
}

function renderExistingBatches(product) {
    const container = document.getElementById('existing-batches');
    if (!product.batches || product.batches.length === 0) {
        container.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0;">Sin stock actualmente</div>';
        return;
    }
    container.innerHTML = product.batches.map(b => {
        const delta = scanSessionChanges.batches[b.id] || 0;
        const finalQty = b.quantity + delta;
        const exp = getExpiryInfo(b.expiry_date);
        const expText = exp ? `<span class="${exp.cls}">${exp.text}</span>` : '<span style="color:#555">Sin caducidad</span>';
        return `<div class="existing-batch-row" style="border-bottom: 1px solid #222; padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
            <div class="eb-info">
                <span class="eb-qty" style="color: #fff; font-weight: 600;">
                    ${finalQty} ud${finalQty !== 1 ? 's' : ''}
                    ${delta !== 0 ? `<small style="color:${delta > 0 ? '#4ade80' : '#ef4444'}; margin-left:4px;">(${delta > 0 ? '+' : ''}${delta})</small>` : ''}
                </span>
                <span class="eb-expiry">${expText}</span>
            </div>
            <div style="display: flex; gap: 6px;">
                <button class="btn-round remove" onclick="batchRemove(${b.id})">-</button>
                <button class="btn-round add" onclick="batchAdd(${b.id})">+</button>
            </div>
        </div>`;
    }).join('');
}

let dateModalCallback = null;
function openDateModal(callback) {
    dateModalCallback = callback;
    const today = new Date();
    pickerState.year = today.getFullYear();
    pickerState.month = today.getMonth() + 1;
    pickerState.day = today.getDate();
    pickerState.inputId = '__modal__';
    updateWheelPosition('day', pickerState.day);
    updateWheelPosition('month', pickerState.month);
    updateWheelPosition('year', pickerState.year);
    updateDatePreview();
    document.getElementById('date-picker-modal').classList.add('show');
}

function closeDateModal() {
    if (pickerState.inputId === '__modal__') {
        document.getElementById('date-picker-modal').classList.remove('show');
        pickerState.inputId = null;
    }
    dateModalCallback = null;
}

function batchAdd(batchId) {
    scanSessionChanges.batches[batchId] = (scanSessionChanges.batches[batchId] || 0) + 1;
    const product = products.find(p => p.barcode === currentBarcode);
    renderExistingBatches(product);
}

function batchRemove(batchId) {
    const product = products.find(p => p.barcode === currentBarcode);
    const batch = product.batches.find(b => b.id === batchId);
    const currentDelta = scanSessionChanges.batches[batchId] || 0;
    if (batch.quantity + currentDelta > 0) {
        scanSessionChanges.batches[batchId] = currentDelta - 1;
        renderExistingBatches(product);
    }
}

async function addNewBatch() {
    if (!currentBarcode) return;
    const expiryDate = document.getElementById('new-batch-expiry').value || null;
    const quantity = parseInt(document.getElementById('new-batch-qty').value) || 0;
    try {
        for (const [batchId, delta] of Object.entries(scanSessionChanges.batches)) {
            if (delta !== 0) await apiCall(`/batches/${batchId}/stock`, 'POST', { quantity: delta });
        }
        if (quantity > 0) {
            await apiCall(`/products/${currentBarcode}/stock`, 'POST', { quantity, expiry_date: expiryDate });
        }
        await loadProducts();
        resetScanner();
    } catch (e) {
        showToast('No se pudieron guardar los cambios.', 'error');
    }
}

async function addStock() {
    if (!currentBarcode) return;
    const name = document.getElementById('product-name').value.trim();
    const category = document.getElementById('product-category').value;
    const location = document.getElementById('product-location').value.trim() || null;
    const minStock = parseInt(document.getElementById('min-stock').value);
    const expiryDate = document.getElementById('expiry-date').value || null;
    const quantity = parseInt(document.getElementById('quantity').value);
    if (!name) { showToast('Introduce el nombre del producto', 'info'); return; }
    try {
        const product = products.find(p => p.barcode === currentBarcode);
        if (!product) {
            await apiCall('/products', 'POST', { barcode: currentBarcode, name, category, min_stock: minStock, location, image_url: currentScannedImageUrl });
        }
        await apiCall(`/products/${currentBarcode}/stock`, 'POST', { quantity, expiry_date: expiryDate });
        await loadProducts();
        resetScanner();
    } catch (error) { console.error(error); }
}

function resetScanner() {
    currentBarcode = null;
    scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
    document.getElementById('new-batch-qty').value = 0;
    document.getElementById('new-batch-expiry').value = '';
    const ids = ['scanned-code', 'product-action', 'existing-product-view', 'new-product-fields'];
    ids.forEach(id => document.getElementById(id).classList.add('hidden'));
}

async function deleteProduct(barcode) {
    if (confirm('¿Eliminar este producto?')) {
        try { await apiCall(`/products/${barcode}`, 'DELETE'); await loadProducts(); }
        catch (error) { console.error(error); }
    }
}

async function quickAdd(barcode) {
    const product = products.find(p => p.barcode === barcode);
    if (product && product.batches && product.batches.length > 0) {
        await apiCall(`/batches/${product.batches[0].id}/stock`, 'POST', { quantity: 1 });
        await loadProducts();
    } else {
        openDateModal(async (expiryDate) => {
            try {
                await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: 1, expiry_date: expiryDate });
                await loadProducts();
            } catch (error) { console.error(error); }
        });
    }
}

async function quickRemove(barcode) {
    const product = products.find(p => p.barcode === barcode);
    if (product && product.stock > 0 && product.batches && product.batches.length > 0) {
        try {
            await apiCall(`/batches/${product.batches[0].id}/stock`, 'POST', { quantity: -1 });
            await loadProducts();
        } catch (error) { console.error(error); }
    }
}

async function quickLost(barcode) {
    const product = products.find(p => p.barcode === barcode);
    if (product && product.stock > 0) {
        try {
            await apiCall(`/products/${barcode}/stock`, 'POST', { quantity: -1, reason: 'lost' });
            await loadProducts();
        } catch (error) { console.error(error); }
    }
}

async function updateUI() {
    await loadLocations();
    updateShoppingList();
    updateProductList();
}

function getExpiryInfo(expiryDate) {
    if (!expiryDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    const daysLeft = Math.ceil((expiry - today) / 86400000);
    if (daysLeft < 0) return { text: 'CADUCADO', cls: 'expiry-expired' };
    if (daysLeft === 0) return { text: 'Caduca HOY', cls: 'expiry-expired' };
    if (daysLeft <= 7) return { text: `Caduca en ${daysLeft}d`, cls: 'expiry-soon' };
    return { text: `Cad: ${expiry.toLocaleDateString('es-ES')}`, cls: 'expiry-ok' };
}

function updateShoppingList() {
    const lowStock = products.filter(p => p.min_stock !== null && p.stock < p.min_stock);
    const shoppingListEl = document.getElementById('shopping-list');
    shoppingListEl.innerHTML = lowStock.length ? lowStock.map(p => `<div class="shopping-item"><span class="name">${p.name}</span><span class="qty">${p.min_stock - p.stock} uds</span></div>`).join('') : '<div class="shopping-empty">Todo en orden</div>';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const expiringSoon = [];
    products.forEach(p => p.batches?.forEach(b => {
        if (b.expiry_date) {
            const exp = new Date(b.expiry_date + 'T00:00:00');
            if (exp >= today && exp <= nextWeek) expiringSoon.push({ name: p.name, expiry_date: b.expiry_date, quantity: b.quantity });
        }
    }));
    const expiringListEl = document.getElementById('expiring-soon-list');
    if (!expiringSoon.length) { expiringListEl.innerHTML = '<div class="shopping-empty">Nada caduca pronto</div>'; }
    else {
        expiringSoon.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
        expiringListEl.innerHTML = expiringSoon.map(item => {
            const exp = getExpiryInfo(item.expiry_date);
            return `<div class="shopping-item"><span class="name">${item.name} (${item.quantity} ud)</span><span class="${exp.cls}">${exp.text}</span></div>`;
        }).join('');
    }
}

function updateProductList() {
    const list = document.getElementById('product-list');
    let filtered = filteredLocation ? products.filter(p => p.location === filteredLocation) : products;
    if (!filtered.length) { list.innerHTML = `<div class="empty-state">Sin productos${filteredLocation ? ' en ' + filteredLocation : ''}.</div>`; return; }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = filtered.map(p => {
        const isLow = p.stock < p.min_stock;
        const isSelected = selectedProducts.has(p.barcode);
        let batches = p.batches?.map(b => {
            const exp = getExpiryInfo(b.expiry_date);
            return `<div class="batch-row"><span class="batch-qty">${b.quantity} ud</span>${exp ? `<span class="${exp.cls}">${exp.text}</span>` : '<span class="expiry-ok">Sin caducidad</span>'}</div>`;
        }).join('') || '';
        return `<div class="product-row ${isSelected ? 'selected' : ''}" onclick="${isSelectionMode ? `toggleSelect('${p.barcode}')` : ''}">
            <div class="product-top">
                ${isSelectionMode ? `<div class="product-checkbox-wrapper"><input type="checkbox" class="product-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelect('${p.barcode}')"></div>` : ''}
                <div class="product-main">
                    ${p.image_url ? `<img src="${p.image_url}" class="product-img">` : `<div class="product-img-placeholder">📦</div>`}
                    <div class="product-info-wrapper"><div class="name">${p.name}</div><div class="meta">${p.category}${p.location ? ' • ' + p.location : ''}</div></div>
                </div>
                <div class="product-stock">
                    <button class="btn-round remove" onclick="event.stopPropagation(); quickRemove('${p.barcode}')">-</button>
                    <button class="btn-round lost" onclick="event.stopPropagation(); quickLost('${p.barcode}')">?</button>
                    <span class="stock-num ${isLow ? 'low' : ''}">${p.stock}</span>
                    <button class="btn-round add" onclick="event.stopPropagation(); quickAdd('${p.barcode}')">+</button>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <button class="btn-del" onclick="event.stopPropagation(); deleteProduct('${p.barcode}')">&#x2715;</button>
                        <button class="btn-del" onclick="event.stopPropagation(); openManagePanelForProduct('${p.name}')" style="font-size:12px;padding:2px 4px;">⚙</button>
                    </div>
                </div>
            </div>
            ${batches ? `<div class="batch-list">${batches}</div>` : ''}
        </div>`;
    }).join('');
}

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    document.getElementById('select-mode-btn').textContent = isSelectionMode ? 'Cancelar' : 'Seleccionar';
    if (!isSelectionMode) clearSelection();
    updateProductList();
    updateSelectionBar();
}

function toggleSelect(barcode) {
    if (selectedProducts.has(barcode)) selectedProducts.delete(barcode); else selectedProducts.add(barcode);
    updateSelectionBar(); updateProductList();
}

function updateSelectionBar() {
    const bar = document.getElementById('selection-bar');
    if (selectedProducts.size > 0 && isSelectionMode) {
        bar.classList.remove('hidden');
        document.getElementById('selection-count').textContent = `${selectedProducts.size} seleccionados`;
    } else bar.classList.add('hidden');
}

function clearSelection() { selectedProducts.clear(); updateSelectionBar(); if (isSelectionMode) updateProductList(); }

async function bulkAction(action) {
    const barcodes = Array.from(selectedProducts);
    if (!barcodes.length) return;
    if (action === 'delete') {
        if (confirm(`¿Eliminar ${barcodes.length} productos?`)) {
            for (const bc of barcodes) try { await apiCall(`/products/${bc}`, 'DELETE'); } catch (e) { }
            await loadProducts(); toggleSelectionMode();
        }
    } else {
        const val = action === 'location' ? prompt('Nueva ubicación:') : prompt('Nueva categoría (Alimentos, Bebidas, Limpieza, Higiene, Otros):');
        if (val) {
            for (const bc of barcodes) try { await apiCall(`/products/${bc}`, 'PATCH', { [action]: val }); } catch (e) { }
            await loadProducts(); toggleSelectionMode();
        }
    }
}

async function loadLocations() { allLocations = await apiCall('/locations').catch(() => []); updateLocationFilter(); }

function updateLocationFilter() {
    const container = document.getElementById('location-filter');
    if (!allLocations.length) { container.innerHTML = ''; return; }
    let html = `<div class="location-filter-container"><span class="location-filter-label">Filtrar por ubicación:</span><select class="location-filter-select" onchange="setLocationFilter(this.value)"><option value="">Todas</option>`;
    allLocations.forEach(loc => { html += `<option value="${loc}" ${filteredLocation === loc ? 'selected' : ''}>${loc}</option>`; });
    container.innerHTML = html + `</select></div>`;
}

function setLocationFilter(loc) { filteredLocation = loc || null; updateProductList(); }

async function manageBatchStock(id, bc, qty) {
    await apiCall(`/batches/${id}/stock`, 'POST', { quantity: qty }).catch(() => { });
    await loadProducts(); renderManageList();
}

async function addBatchInManage(bc) {
    const d = document.getElementById(`new-batch-date-${bc}`).value || null;
    const q = parseInt(document.getElementById(`new-batch-qty-${bc}`).value) || 1;
    await apiCall(`/products/${bc}/stock`, 'POST', { quantity: q, expiry_date: d }).catch(() => { });
    await loadProducts(); renderManageList();
}

let pendingChanges = {}, pendingBatchChanges = {}, originalData = {}, originalBatchData = {}, manageFilter = { name: '', location: '', category: '' };

function openManagePanel() {
    pendingChanges = {}; pendingBatchChanges = {};
    products.forEach(p => {
        originalData[p.barcode] = { name: p.name, category: p.category, min_stock: p.min_stock, location: p.location || '' };
        p.batches?.forEach(b => originalBatchData[b.id] = b.expiry_date || '');
    });
    const locSelect = document.getElementById('manage-filter-location');
    const locs = [...new Set(products.map(p => p.location).filter(l => l))];
    locSelect.innerHTML = '<option value="">Todas</option>' + locs.map(l => `<option value="${l}">${l}</option>`).join('');
    document.getElementById('manage-panel').classList.add('active');
    renderManageList(); updateChangesUI();
}

function openManagePanelForProduct(name) { openManagePanel(); document.getElementById('manage-filter-name').value = name; updateManageFilter(); }

function tryClosePanel() {
    if (Object.keys(pendingChanges).length + Object.keys(pendingBatchChanges).length > 0 && !confirm('¿Salir sin guardar cambios?')) return;
    document.getElementById('manage-panel').classList.remove('active'); loadProducts();
}

function checkBatchChange(id, bc) {
    const val = document.getElementById(`edit-batch-${id}`).value || '', orig = originalBatchData[id] || '';
    if (val !== orig) pendingBatchChanges[id] = { barcode: bc, newExpiry: val, productName: products.find(p => p.barcode === bc)?.name || bc };
    else delete pendingBatchChanges[id];
    updateChangesUI();
}

function checkProductChanges(bc) {
    const orig = originalData[bc]; if (!orig || pendingChanges[bc]?.type === 'delete') return;
    const n = document.getElementById(`edit-name-${bc}`).value.trim(), c = document.getElementById(`edit-cat-${bc}`).value, l = document.getElementById(`edit-location-${bc}`).value.trim(), m = parseInt(document.getElementById(`edit-min-${bc}`).value);
    if (n !== orig.name || c !== orig.category || l !== orig.location || m !== orig.min_stock) {
        pendingChanges[bc] = { type: 'edit', name: n, data: { name: n, category: c, location: l || null, min_stock: m } };
    } else delete pendingChanges[bc];
    updateChangesUI();
}

function markForDelete(bc) { pendingChanges[bc] = { type: 'delete', name: originalData[bc].name }; updateChangesUI(); renderManageList(); }
function undoDelete(bc) { delete pendingChanges[bc]; updateChangesUI(); renderManageList(); }

function updateChangesUI() {
    const total = Object.keys(pendingChanges).length + Object.keys(pendingBatchChanges).length;
    const btn = document.getElementById('btn-save-all');
    btn.disabled = total === 0;
    const container = document.getElementById('changes-container');
    if (total === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    container.innerHTML = `<div class="changes-summary">${total} cambios pendientes</div>`;
}

async function saveAllChanges() {
    for (const [bc, c] of Object.entries(pendingChanges)) {
        if (c.type === 'delete') await apiCall(`/products/${bc}`, 'DELETE');
        else await apiCall(`/products/${bc}`, 'PATCH', c.data);
    }
    for (const [id, c] of Object.entries(pendingBatchChanges)) await apiCall(`/batches/${id}`, 'PATCH', { expiry_date: c.newExpiry || null });
    pendingChanges = {}; pendingBatchChanges = {}; await loadProducts(); tryClosePanel();
}

function updateManageFilter() {
    manageFilter = { name: document.getElementById('manage-filter-name').value.toLowerCase(), location: document.getElementById('manage-filter-location').value, category: document.getElementById('manage-filter-category').value };
    renderManageList();
}

function renderManageList() {
    const list = document.getElementById('manage-list');
    let filtered = products.filter(p => (!manageFilter.name || p.name.toLowerCase().includes(manageFilter.name)) && (!manageFilter.location || p.location === manageFilter.location) && (!manageFilter.category || p.category === manageFilter.category));
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = filtered.map(p => {
        const isDel = pendingChanges[p.barcode]?.type === 'delete';
        return `<div class="edit-card ${isDel ? 'to-delete' : ''}" id="edit-${p.barcode}">
            <div class="edit-card-header"><div><span class="name">${p.name}</span><br><span class="barcode">${p.barcode}</span></div></div>
            <div class="edit-grid">
                <div class="form-group"><label>Nombre</label><input type="text" id="edit-name-${p.barcode}" value="${p.name}" oninput="checkProductChanges('${p.barcode}')" ${isDel ? 'disabled' : ''}></div>
                <div class="form-group"><label>Ubicación</label><input type="text" id="edit-location-${p.barcode}" value="${p.location || ''}" oninput="checkProductChanges('${p.barcode}')" ${isDel ? 'disabled' : ''}></div>
                <div class="form-group"><label>Categoría</label><select id="edit-cat-${p.barcode}" onchange="checkProductChanges('${p.barcode}')" ${isDel ? 'disabled' : ''}>
                    <option value="Alimentos" ${p.category === 'Alimentos' ? 'selected' : ''}>Alimentos</option>
                    <option value="Bebidas" ${p.category === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                    <option value="Limpieza" ${p.category === 'Limpieza' ? 'selected' : ''}>Limpieza</option>
                    <option value="Higiene" ${p.category === 'Higiene' ? 'selected' : ''}>Higiene</option>
                    <option value="Otros" ${p.category === 'Otros' ? 'selected' : ''}>Otros</option>
                </select></div>
                <div class="form-group"><label>Stock Mín</label><input type="number" id="edit-min-${p.barcode}" value="${p.min_stock}" oninput="checkProductChanges('${p.barcode}')" ${isDel ? 'disabled' : ''}></div>
            </div>
            <div class="edit-batch-list">
                ${p.batches?.map(b => `<div class="edit-batch-row"><span class="batch-qty-label">${b.quantity} ud</span><input type="date" id="edit-batch-${b.id}" value="${b.expiry_date || ''}" onchange="checkBatchChange(${b.id},'${p.barcode}')" ${isDel ? 'disabled' : ''}></div>`).join('')}
            </div>
            <div class="edit-actions">${isDel ? `<button class="btn-undo-sm" onclick="undoDelete('${p.barcode}')">Deshacer</button>` : `<button class="btn-delete-sm" onclick="markForDelete('${p.barcode}')">Eliminar</button>`}</div>
        </div>`;
    }).join('');
    setTimeout(wrapDateInputsWithPicker, 0);
}

// ===== Date Picker Wheel Implementation =====
let pickerState = { inputId: null, year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), scrollOffset: {} };

function initializeDatePicker() {
    initializeWheel('day', 1, getDaysInMonth(pickerState.month, pickerState.year));
    initializeWheel('month', 1, 12);
    initializeWheel('year', new Date().getFullYear() - 5, 2099);
}

function getDaysInMonth(m, y) { return new Date(y, m, 0).getDate(); }

function initializeWheel(type, min, max) {
    const container = document.getElementById(`${type}-items`);
    container.innerHTML = '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>';
    for (let i = min; i <= max; i++) {
        const item = document.createElement('div');
        item.className = 'wheel-item'; item.textContent = String(i).padStart(2, '0'); item.dataset.value = i;
        item.onclick = () => { updateWheelPosition(type, i); updateDatePreview(); };
        container.appendChild(item);
    }
    container.innerHTML += '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>';
    setupWheelScroller(type);
}

function setupWheelScroller(type) {
    const scroller = document.getElementById(`${type}-wheel`), items = document.getElementById(`${type}-items`);
    let startY = 0, currentOffset = 0;
    scroller.addEventListener('touchstart', e => { startY = e.touches[0].clientY; currentOffset = pickerState.scrollOffset[type] || 0; items.classList.remove('snapping'); });
    scroller.addEventListener('touchmove', e => { e.preventDefault(); const move = e.touches[0].clientY - startY; updateWheelScroll(type, currentOffset + move); });
    scroller.addEventListener('touchend', () => { items.classList.add('snapping'); snapToNearestValue(type); });
    scroller.addEventListener('mousedown', e => {
        startY = e.clientY; currentOffset = pickerState.scrollOffset[type] || 0; items.classList.remove('snapping');
        const move = me => updateWheelScroll(type, currentOffset + (me.clientY - startY));
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); items.classList.add('snapping'); snapToNearestValue(type); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    scroller.addEventListener('wheel', e => { e.preventDefault(); const dir = e.deltaY > 0 ? -1 : 1; const val = pickerState[type] - dir; updateWheelPosition(type, val); }, { passive: false });
}

function updateWheelScroll(type, offset) {
    const items = document.getElementById(`${type}-items`);
    pickerState.scrollOffset[type] = offset;
    items.style.transform = `translateY(${offset}px)`;
}

function snapToNearestValue(type) {
    const items = document.getElementById(`${type}-items`), children = items.querySelectorAll('.wheel-item:not(.spacer)');
    let bestChild = children[0], bestDist = Infinity;
    children.forEach(child => {
        const dist = Math.abs(pickerState.scrollOffset[type] - (64 - Array.from(items.children).indexOf(child) * 32));
        if (dist < bestDist) { bestDist = dist; bestChild = child; }
    });
    updateWheelPosition(type, parseInt(bestChild.dataset.value));
}

function updateWheelPosition(type, val) {
    const items = document.getElementById(`${type}-items`), children = Array.from(items.children);
    const idx = children.findIndex(c => c.dataset.value == val);
    if (idx === -1) return;
    const offset = 64 - idx * 32; updateWheelScroll(type, offset);
    children.forEach((c, i) => c.classList.toggle('active', i === idx));
    pickerState[type] = val;
    if (type !== 'day') {
        const max = getDaysInMonth(pickerState.month, pickerState.year);
        if (document.getElementById('day-items').querySelectorAll('.wheel-item:not(.spacer)').length !== max) {
            initializeWheel('day', 1, max); if (pickerState.day > max) pickerState.day = max; updateWheelPosition('day', pickerState.day);
        }
    }
    updateDatePreview();
}

function updateDatePreview() { document.getElementById('date-preview').textContent = `${String(pickerState.day).padStart(2, '0')} / ${String(pickerState.month).padStart(2, '0')} / ${pickerState.year}`; }

function openDatePicker(id) {
    const input = document.getElementById(id); pickerState.inputId = id;
    if (input.value) { const [y, m, d] = input.value.split('-').map(Number); pickerState.year = y; pickerState.month = m; pickerState.day = d; }
    updateWheelPosition('day', pickerState.day); updateWheelPosition('month', pickerState.month); updateWheelPosition('year', pickerState.year);
    document.getElementById('date-picker-modal').classList.add('show');
}

function closeDatePicker() { document.getElementById('date-picker-modal').classList.remove('show'); pickerState.inputId = null; }

function confirmDatePicker() {
    const date = `${pickerState.year}-${String(pickerState.month).padStart(2, '0')}-${String(pickerState.day).padStart(2, '0')}`;
    if (pickerState.inputId === '__modal__') { const cb = dateModalCallback; closeDatePicker(); if (cb) cb(date); }
    else {
        const input = document.getElementById(pickerState.inputId);
        if (input) { input.value = date; input.dispatchEvent(new Event('change', { bubbles: true })); }
        closeDatePicker();
    }
}

function wrapDateInputsWithPicker() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (input.parentElement.classList.contains('date-input-wrapper')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'date-input-wrapper';
        const btn = document.createElement('button'); btn.className = 'date-display-btn'; btn.type = 'button';
        btn.textContent = input.value || 'Hoy'; btn.onclick = () => openDatePicker(input.id);
        input.style.display = 'none'; if (!input.id) input.id = 'date-' + Math.random().toString(36).substr(2, 9);
        input.addEventListener('change', () => btn.textContent = input.value || 'Hoy');
        input.parentElement.insertBefore(wrapper, input); wrapper.appendChild(btn); wrapper.appendChild(input);
    });
}

document.addEventListener('DOMContentLoaded', () => setTimeout(initializeDatePicker, 100));
window.addEventListener('load', wrapDateInputsWithPicker);
