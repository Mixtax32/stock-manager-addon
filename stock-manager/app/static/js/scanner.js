import { apiCall } from './api.js';
import { showToast, similarityScore, normalizeText, isJunkLine } from './utils.js';
import { openDateModal, wrapDateInputsWithPicker } from './datepicker.js';

let html5QrCode;
let currentBarcode = null;
let currentScannedImageUrl = null;
let ticketItems = [];
let scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };

export async function onScanSuccess(decodedText, products, callback) {
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
                
                document.getElementById('new-weight').value = barcodeData.weight_g ?? '';
                document.getElementById('new-kcal').value = barcodeData.kcal_100g ?? '';
                document.getElementById('new-proteins').value = barcodeData.proteins_100g ?? '';
                document.getElementById('new-carbs').value = barcodeData.carbs_100g ?? '';
                document.getElementById('new-fat').value = barcodeData.fat_100g ?? '';
            } else { 
                renderScanImage(null); 
                ['new-weight', 'new-kcal', 'new-proteins', 'new-carbs', 'new-fat'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            }
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
    // Need helper to get expiry info - using local implementation to avoid circular dependency if needed
    // Actually we can import it
    import('./utils.js').then(({ getExpiryInfo }) => {
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
                    <button class="btn-round remove-batch" data-batch-id="${b.id}">-</button>
                    <button class="btn-round add-batch" data-batch-id="${b.id}">+</button>
                </div>
            </div>`;
        }).join('');
    });
}

export function resetScanner() {
    currentBarcode = null;
    scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
    document.getElementById('new-batch-qty').value = 0;
    document.getElementById('new-batch-expiry').value = '';
    const ids = ['scanned-code', 'product-action', 'existing-product-view', 'new-product-fields'];
    ids.forEach(id => document.getElementById(id).classList.add('hidden'));
}

export async function processTicketImage(canvas, products, onComplete) {
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
        const items = parseTicketText(result.data.text, products);
        if (onComplete) onComplete(items, result.data.text);
    } catch (err) {
        progress.classList.add('hidden');
        showToast('Error al leer ticket: ' + err.message, 'error');
    }
}

function parseTicketText(text, products) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const items = [];
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
            const existing = items.find(t => t.match && t.match.barcode === bestMatch.barcode);
            if (existing) {
                existing.qty += qty;
                continue;
            }
        }

        items.push({
            line, name, qty, match: bestMatch, score: bestScore,
            checked: bestMatch !== null, hasPrice
        });
    }
    return items;
}

export function getCurrentBarcode() { return currentBarcode; }
export function getScanSessionChanges() { return scanSessionChanges; }
export function getCurrentScannedImageUrl() { return currentScannedImageUrl; }
export function setHtml5QrCode(obj) { html5QrCode = obj; }
export function getHtml5QrCode() { return html5QrCode; }
