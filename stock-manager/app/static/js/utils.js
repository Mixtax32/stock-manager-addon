export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

export function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

export function getExpiryInfo(expiryDate) {
    if (!expiryDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    const daysLeft = Math.ceil((expiry - today) / 86400000);
    if (daysLeft < 0) return { text: 'CADUCADO', cls: 'expiry-expired' };
    if (daysLeft === 0) return { text: 'Caduca HOY', cls: 'expiry-expired' };
    if (daysLeft <= 7) return { text: `Caduca en ${daysLeft}d`, cls: 'expiry-soon' };
    return { text: `Cad: ${expiry.toLocaleDateString('es-ES')}`, cls: 'expiry-ok' };
}

export function similarityScore(a, b) {
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

export function isJunkLine(line) {
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
