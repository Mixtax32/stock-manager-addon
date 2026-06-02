/*
   API wrapper.
   Single export: window.apiCall(endpoint, method = 'GET', body = null, retries = 3)
   - JSON in / JSON out (DELETE returns true on 2xx)
   - Cache-busts GETs to dodge the HA Ingress proxy serving stale 200s
   - Retries 502/503/504 and network errors with a 2s backoff
*/

async function apiCall(endpoint, method = 'GET', body = null, retries = 3) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const url = `${window.API_BASE}${endpoint}${method === 'GET' ? (endpoint.includes('?') ? '&' : '?') + 't=' + Date.now() : ''}`;

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (retries > 0 && [502, 503, 504].includes(response.status)) {
                console.warn(`Servidor despertando (${response.status}). Reintentando en 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                return apiCall(endpoint, method, body, retries - 1);
            }
            const text = await response.text().catch(() => '');
            let msg;
            try { msg = JSON.parse(text).detail || `Error ${response.status}`; }
            catch { msg = `Error ${response.status}: ${text.substring(0, 200) || response.statusText}`; }
            throw new Error(msg);
        }
        if (method === 'DELETE') return true;
        return await response.json().catch(() => { throw new Error('Respuesta inválida'); });
    } catch (error) {
        if (retries > 0) {
            console.warn(`Error de red o servidor. Reintentando (${retries})...`, error.message);
            await new Promise(r => setTimeout(r, 2000));
            return apiCall(endpoint, method, body, retries - 1);
        }
        console.error(`API Error Fatal [${method} ${url}]:`, error);
        throw error;
    }
}
window.apiCall = apiCall;
