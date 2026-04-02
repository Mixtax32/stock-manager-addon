/* 
   UI Utils & Shared Helpers
   v0.6.0
*/

function showToast(message, type = 'info', duration = 10000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
window.showToast = showToast;

function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
}
window.normalizeText = normalizeText;

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
window.getExpiryInfo = getExpiryInfo;

function toggleSection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
}
window.toggleSection = toggleSection;

// Junction logic for ticket parsing
function isJunkLine(line) {
    const trimmed = line.trim(); const norm = normalizeText(line); if (norm.length < 3) return true;
    if (/^\d+$/.test(norm) || /^[\d\s\-\/\.\,\*\#\:\;\(\)\[\]]+$/.test(trimmed) || /\d{7,}/.test(trimmed)) return true;
    const letterCount = (trimmed.match(/[a-zA-Záéíóúñ]/g) || []).length; if (letterCount < 2) return true;
    const junk = [/total/i, /iva/i, /base\s*imp/i, /efectivo/i, /tarjeta/i, /nif/i, /cif/i, /ticket/i, /fecha/i, /tel/i, /super/i, /mercadona/i, /carrefour/i];
    return junk.some(p => p.test(trimmed));
}
window.isJunkLine = isJunkLine;

function similarityScore(a, b) {
    if (!a || !b) return 0; if (a.includes(b) || b.includes(a)) return 0.95;
    const d = (s1, s2) => {
        const m = s1.length, n = s2.length; let dp = Array.from({length:m+1}, () => new Uint32Array(n+1));
        for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j;
        for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(s1[i-1]===s2[j-1]?0:1));
        return dp[m][n];
    };
    const lev = 1 - d(a,b)/Math.max(a.length,b.length);
    const wA = a.split(/\s+/).filter(w=>w.length>=3), wB = b.split(/\s+/).filter(w=>w.length>=3);
    let matches = 0; if(wA.length && wB.length) for(const wa of wA) if(wB.some(wb=>wb.includes(wa)||wa.includes(wb))) matches++;
    return (lev*0.7) + ((matches/Math.max(wA.length,wB.length||1))*0.3);
}
window.similarityScore = similarityScore;
