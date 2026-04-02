/* 
   Barcode & Ticket Scanning Logic
   v0.6.1
*/

window.stopAllCameras = async () => {
    const container = document.getElementById('scanner-container');
    if (container) container.innerHTML = '';
    
    document.getElementById('start-scan')?.classList.remove('hidden');
    document.getElementById('start-ticket')?.classList.remove('hidden');
    document.getElementById('stop-scan')?.classList.add('hidden');
    
    if (window.currentTicketStream) {
        try {
            window.currentTicketStream.getTracks().forEach(track => { track.stop(); track.enabled = false; });
            window.currentTicketStream = null;
        } catch(e) {}
    }
    if (window.html5QrCode) {
        try { await window.html5QrCode.stop(); } catch(e) {}
    }
};

window.startScanner = async () => {
    try {
        if (window.html5QrCode) { try { await window.html5QrCode.stop(); } catch(e){} }
        const container = document.getElementById('scanner-container');
        if (!container) return;
        window.html5QrCode = new Html5Qrcode("scanner-container"); 
        await window.html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, window.onScanSuccess);
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('start-scan')?.classList.add('hidden'); 
        document.getElementById('start-ticket')?.classList.add('hidden'); 
        document.getElementById('stop-scan')?.classList.remove('hidden');
    } catch (err) { window.showToast('Error cámara: ' + err.message, 'error'); }
};

window.startTicketScanner = async () => {
    try {
        window.currentTicketStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
        const video = document.createElement('video'); video.srcObject = window.currentTicketStream; video.setAttribute('playsinline', 'true'); await video.play();
        const container = document.getElementById('scanner-container'); container.innerHTML = ''; video.style.width = '100%'; video.style.borderRadius = '8px'; container.appendChild(video);
        const captureBtn = document.createElement('button'); captureBtn.className = 'btn btn-add'; captureBtn.style.width = '100%'; captureBtn.style.marginTop = '8px'; captureBtn.textContent = 'Capturar ticket'; container.appendChild(captureBtn);
        document.getElementById('start-scan')?.classList.add('hidden'); document.getElementById('start-ticket')?.classList.add('hidden'); document.getElementById('stop-scan')?.classList.remove('hidden'); 
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        captureBtn.onclick = async () => {
            const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); 
            if (window.currentTicketStream) { window.currentTicketStream.getTracks().forEach(t => t.stop()); window.currentTicketStream = null; }
            container.innerHTML = ''; document.getElementById('start-scan')?.classList.remove('hidden'); document.getElementById('start-ticket')?.classList.remove('hidden'); document.getElementById('stop-scan')?.classList.add('hidden');
            await window.processTicketImage(canvas);
        };
    } catch (err) { window.showToast('Error cámara: ' + err.message, 'error'); }
};

window.onScanSuccess = async (decodedText) => {
    if (window.html5QrCode && window.html5QrCode.isScanning) {
        await window.html5QrCode.stop();
        document.getElementById('start-scan')?.classList.remove('hidden');
        document.getElementById('start-ticket')?.classList.remove('hidden');
        document.getElementById('stop-scan')?.classList.add('hidden');
    }
    window.currentBarcode = decodedText;
    window.scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
    const fields = ['new-batch-qty', 'new-batch-expiry', 'product-name', 'product-location', 'min-stock', 'expiry-date', 'quantity', 'serving-size'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = (f === 'new-batch-qty' || f === 'quantity') ? 1 : (f === 'min-stock' ? 2 : ''); });
    const bqty = document.getElementById('new-batch-qty'); if (bqty) bqty.value = 0;
    const codeSpan = document.getElementById('scanned-code'); if (codeSpan) codeSpan.textContent = 'Código: ' + decodedText;
    document.getElementById('product-action')?.classList.remove('hidden');
    const p = window.products.find(prod => prod.barcode === window.currentBarcode);
    window.currentScannedImageUrl = p ? p.image_url : null;
    if (p) {
        document.getElementById('existing-product-view')?.classList.remove('hidden');
        document.getElementById('new-product-fields')?.classList.add('hidden');
        const epn = document.getElementById('existing-product-name'); if (epn) epn.textContent = p.name;
        const eps = document.getElementById('serving-size'); if (eps) eps.value = p.serving_size || '';
        const epst = document.getElementById('existing-product-stock'); if (epst) epst.textContent = `(${p.stock} ${p.unit_type || 'uds'})`;
        window.renderScanImage(p.image_url); window.renderExistingBatches(p);
    } else {
        document.getElementById('existing-product-view')?.classList.add('hidden');
        document.getElementById('new-product-fields')?.classList.remove('hidden');
        try {
            const barcodeData = await window.apiCall(`/barcode/${window.currentBarcode}`, 'GET');
            if (barcodeData && barcodeData.found) {
                window.currentScannedImageUrl = barcodeData.image_url; window.renderScanImage(barcodeData.image_url);
                const pni = document.getElementById('product-name'); if (pni) pni.value = barcodeData.name || '';
                const pcat = document.getElementById('product-category'); if (pcat) pcat.value = ['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Otros'].includes(barcodeData.category) ? barcodeData.category : 'Otros';
                const punit = document.getElementById('product-unit'); if (punit) punit.value = pcat.value === 'Alimentos' ? 'g' : (pcat.value === 'Bebidas' ? 'ml' : 'uds');
                ['weight', 'kcal', 'proteins', 'carbs', 'fat'].forEach(m => { const el = document.getElementById(`new-${m}`); if (el) el.value = barcodeData[`${m}_100g`] ?? (m==='weight' ? barcodeData.weight_g : ''); });
            } else window.renderScanImage(null);
        } catch (e) { window.renderScanImage(null); }
    }
    if (window.wrapDateInputsWithPicker) window.wrapDateInputsWithPicker();
};

window.renderScanImage = (url) => {
    const parent = document.getElementById('product-action'); if (!parent) return;
    const oldImg = parent.querySelector('.scan-product-img'); if (oldImg) oldImg.remove();
    if (url) { const img = document.createElement('img'); img.src = url; img.className = 'scan-product-img'; img.style.float = 'left'; parent.insertBefore(img, parent.firstChild); }
};

window.renderExistingBatches = (product) => {
    const container = document.getElementById('existing-batches'); if (!container) return;
    if (!product.batches || product.batches.length === 0) { container.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0;">Sin stock actualmente</div>'; return; }
    container.innerHTML = product.batches.map(b => {
        const delta = window.scanSessionChanges.batches[b.id] || 0;
        const finalQty = b.quantity + delta;
        const exp = window.getExpiryInfo(b.expiry_date);
        return `<div class="existing-batch-row" style="border-bottom: 1px solid #222; padding: 8px 0; display: flex; justify-content: space-between; align-items: center;">
            <div class="eb-info"><span class="eb-qty" style="color:#fff; font-weight:600;">${finalQty} ud${finalQty !== 1 ? 's' : ''}${delta !== 0 ? `<small style="color:${delta > 0 ? '#4ade80' : '#ef4444'}; margin-left:4px;">(${delta > 0 ? '+' : ''}${delta})</small>` : ''}</span><span class="eb-expiry">${exp ? `<span class="${exp.cls}">${exp.text}</span>` : '<span style="color:#555">Sin caducidad</span>'}</span></div>
            <div style="display:flex; gap:6px;"><button class="btn-round" onclick="window.updateBatchDelta(${b.id}, -1)">-</button><button class="btn-round" onclick="window.updateBatchDelta(${b.id}, 1)">+</button></div>
        </div>`;
    }).join('');
};

window.updateBatchDelta = (id, delta) => {
    window.scanSessionChanges.batches[id] = (window.scanSessionChanges.batches[id] || 0) + delta;
    window.renderExistingBatches(window.products.find(p => p.barcode === window.currentBarcode));
};

window.processTicketImage = async (canvas) => {
    if (typeof Tesseract === 'undefined') { window.showToast('Tesseract.js no cargado.', 'error'); return; }
    const progress = document.getElementById('ticket-progress'), statusEl = document.getElementById('ticket-status'), fillEl = document.getElementById('ticket-fill');
    if (progress) progress.classList.remove('hidden'); if (statusEl) statusEl.textContent = 'Preparando imagen...'; if (fillEl) fillEl.style.width = '5%';
    const ctx = canvas.getContext('2d'); const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) { const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; const bw = ((((gray / 255 - 0.5) * 1.8 + 0.5) * 255) > 140) ? 255 : 0; data[i] = data[i + 1] = data[i + 2] = bw; }
    ctx.putImageData(imgData, 0, 0); if (statusEl) statusEl.textContent = 'Leyendo ticket...'; if (fillEl) fillEl.style.width = '10%';
    try {
        const result = await Tesseract.recognize(canvas, 'spa', { logger: m => { if (m.status === 'recognizing text') { const pct = Math.round(m.progress * 100); if (fillEl) fillEl.style.width = pct + '%'; if (statusEl) statusEl.textContent = `Leyendo ticket... ${pct}%`; } } });
        if (progress) progress.classList.add('hidden'); window.currentTicketItems = window.parseTicketText(result.data.text, window.products); window.showTicketResults(window.currentTicketItems);
    } catch (err) { if (progress) progress.classList.add('hidden'); window.showToast('Error lector: ' + err.message, 'error'); }
};

window.parseTicketText = (text, products) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const items = [];
    for (const line of lines) {
        if (window.isJunkLine(line)) continue;
        let qty = 1, name = line; const qtyMatch = name.match(/^(\d+)\s*[xX×]\s+(.+)/); if (qtyMatch) { qty = parseInt(qtyMatch[1]); name = qtyMatch[2]; }
        name = name.replace(/\d+[,.]\d{2}\s*€?/g, '').replace(/\d+[,.]\d{1,3}\s*(kg|g|l|ml|cl|ud|uds)\b/gi, '').replace(/^\d{3,}\s+/, '').replace(/^[\-\*\.\,\s]+/, '').replace(/[\-\*\.\,\s]+$/, '').trim();
        if (name.length < 2) continue;
        let bestMatch = null, bestScore = 0;
        for (const p of products) { const score = window.similarityScore(window.normalizeText(name), window.normalizeText(p.name)); if (score > bestScore && score >= 0.35) { bestScore = score; bestMatch = p; } }
        const existing = items.find(t => t.match && t.match.barcode === (bestMatch?.barcode));
        if (existing) { existing.qty += qty; } else items.push({ line, name, qty, match: bestMatch, score: bestScore, checked: bestMatch !== null });
    }
    return items;
};

window.showTicketResults = (items) => {
    const matched = items.filter(t => t.match), unmatched = items.filter(t => !t.match);
    const container = document.getElementById('ticket-matched'); if (!container) return;
    let html = matched.length ? '<div class="ticket-section-title">Coinciden</div>' + matched.map((it, i) => `<div class="ticket-item"><input type="checkbox" onchange="window.updateTicketCheck(${items.indexOf(it)}, this.checked)" ${it.checked ? 'checked' : ''}><div class="ti-info"><div class="ti-match">${it.match.name}</div><div class="ti-line">${it.name}</div></div><div class="ti-qty"><input type="number" value="${it.qty}" onchange="window.updateTicketQty(${items.indexOf(it)}, this.value)"></div></div>`).join('') : '';
    html += unmatched.length ? '<div class="ticket-section-title">Nuevos</div>' + unmatched.map((it, i) => `<div class="ticket-item"><input type="checkbox" onchange="window.updateTicketCheck(${items.indexOf(it)}, this.checked)" ${it.checked ? 'checked' : ''}><div class="ti-info"><div class="ti-match">${it.name}</div><select onchange="window.assignTicketMatch(${items.indexOf(it)}, this.value)"><option value="">¿Asignar?</option>${window.products.map(p=>`<option value="${p.barcode}">${p.name}</option>`).join('')}</select></div><div class="ti-qty"><input type="number" value="${it.qty}" onchange="window.updateTicketQty(${items.indexOf(it)}, this.value)"></div></div>`).join('') : '';
    container.innerHTML = html; document.getElementById('ticket-panel')?.classList.add('active');
};
