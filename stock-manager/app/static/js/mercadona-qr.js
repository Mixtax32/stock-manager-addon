/*
   Mercadona meat QR parser — GS1 Digital Link.

   Input: full QR string (e.g.
     https://qrtrack.mercadona.es/01/08436021419262/10/900105150926?17=260614&3103=000484&...)
   Output: { gtin, lote, expiryDate, weightKg, priceEur, pricePerKg, raw } or null.

   Notes:
   - Pure string parsing, no network calls.
   - Parses by GS1 Application Identifier, NOT by position. Order and presence
     of AIs varies between products (e.g. "cerdo a tacos" omits AI 16, lomos
     include it).
   - Accepts AIs in path segments (/AI/value) AND query params (?AI=value).
*/

(function (root) {
    'use strict';

    var MERCADONA_HOST = 'qrtrack.mercadona.es';

    // Some AIs (3103, 3922) end in a digit that encodes the implied decimals.
    // We handle 3103 (3 decimals → /1000) and 3922 (last digit = decimals) explicitly.
    function _toDate(yymmdd) {
        if (!/^\d{6}$/.test(yymmdd)) return null;
        var yy = parseInt(yymmdd.slice(0, 2), 10);
        var mm = parseInt(yymmdd.slice(2, 4), 10);
        var dd = parseInt(yymmdd.slice(4, 6), 10);
        // GS1 doesn't carry century. Mercadona prints near-future dates; pivot
        // at 2000 + yy is safe for the next 70+ years of perishable goods.
        var year = 2000 + yy;
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        // Return ISO yyyy-mm-dd (matches <input type="date"> and SQLite TEXT).
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return year + '-' + pad(mm) + '-' + pad(dd);
    }

    function _extractAIs(qrText) {
        // Collect every (AI, value) pair from path AND query.
        var ais = {};
        var urlPart = qrText, queryPart = '';
        var qIdx = qrText.indexOf('?');
        if (qIdx !== -1) {
            urlPart = qrText.slice(0, qIdx);
            queryPart = qrText.slice(qIdx + 1);
        }

        // Path: walk /AI/value/AI/value/...
        // Strip scheme + host so we only see /01/.../10/...
        var pathStart = urlPart.indexOf('://');
        var path = pathStart !== -1 ? urlPart.slice(pathStart + 3) : urlPart;
        var slash = path.indexOf('/');
        path = slash !== -1 ? path.slice(slash + 1) : '';
        var parts = path.split('/').filter(Boolean);
        for (var i = 0; i + 1 < parts.length; i += 2) {
            // AI must be 2-4 digits to be valid GS1
            if (/^\d{2,4}$/.test(parts[i])) {
                ais[parts[i]] = decodeURIComponent(parts[i + 1]);
            }
        }

        // Query: ?AI=value&AI=value
        if (queryPart) {
            var pairs = queryPart.split('&');
            for (var j = 0; j < pairs.length; j++) {
                var eq = pairs[j].indexOf('=');
                if (eq === -1) continue;
                var ai = pairs[j].slice(0, eq);
                var val = decodeURIComponent(pairs[j].slice(eq + 1));
                if (/^\d{2,4}$/.test(ai)) ais[ai] = val;
            }
        }
        return ais;
    }

    function parseMercadonaQR(qrText) {
        if (typeof qrText !== 'string' || !qrText) return null;
        // Cheap host gate — anything not hosted at qrtrack.mercadona.es is not ours.
        if (qrText.indexOf(MERCADONA_HOST) === -1) return null;

        var ais = _extractAIs(qrText);

        // GTIN is mandatory. Without it we can't link the QR to a product.
        var gtin = ais['01'];
        if (!gtin || !/^\d{14}$/.test(gtin)) return null;

        var result = {
            gtin: gtin,
            lote: ais['10'] || null,
            expiryDate: ais['17'] ? _toDate(ais['17']) : null,
            sellByDate: ais['16'] ? _toDate(ais['16']) : null,
            weightKg: null,
            priceEur: null,
            pricePerKg: null,
            raw: ais,
        };

        // AI 3103 — net weight kg, 3 implied decimals → divide by 1000.
        if (ais['3103'] && /^\d{6}$/.test(ais['3103'])) {
            result.weightKg = parseInt(ais['3103'], 10) / 1000;
        }
        // AI 3922 — PVP in local currency. Last digit of AI = decimals (2) → /100.
        if (ais['3922'] && /^\d+$/.test(ais['3922'])) {
            result.priceEur = parseInt(ais['3922'], 10) / 100;
        }
        // AI 8005 — price per kg, 2 implied decimals → /100.
        if (ais['8005'] && /^\d+$/.test(ais['8005'])) {
            result.pricePerKg = parseInt(ais['8005'], 10) / 100;
        }

        return result;
    }

    // Sanity asserts against fixtures from the spec. Runs once on load; logs
    // a single console.warn if any case drifts. Cheap insurance against future
    // edits breaking the parser silently.
    function _selfCheck() {
        var cases = [
            {
                url: 'https://qrtrack.mercadona.es/01/08421384147679/10/991135131726?17=260613&16=260607&3103=000443&3922=00315&8005=000710&93=L09',
                expect: { gtin: '08421384147679', lote: '991135131726', expiryDate: '2026-06-13', weightKg: 0.443, priceEur: 3.15, pricePerKg: 7.10 },
            },
            {
                url: 'https://qrtrack.mercadona.es/01/08436021419262/10/900105150926?17=260614&16=260608&3103=000484&3922=00344&8005=000710&93=924118637870010181906',
                expect: { gtin: '08436021419262', lote: '900105150926', expiryDate: '2026-06-14', weightKg: 0.484, priceEur: 3.44, pricePerKg: 7.10 },
            },
            {
                url: 'https://qrtrack.mercadona.es/01/08421384095512/10/991135150826?17=260612&91=09&3103=000675&3922=00388&8005=000575&93=L08',
                expect: { gtin: '08421384095512', lote: '991135150826', expiryDate: '2026-06-12', weightKg: 0.675, priceEur: 3.88, pricePerKg: 5.75 },
            },
        ];
        for (var i = 0; i < cases.length; i++) {
            var got = parseMercadonaQR(cases[i].url);
            var want = cases[i].expect;
            if (!got) { console.warn('[mercadona-qr] self-check failed: parser returned null for case', i); return; }
            for (var k in want) {
                if (got[k] !== want[k]) {
                    console.warn('[mercadona-qr] self-check drift on case', i, k, 'expected', want[k], 'got', got[k]);
                    return;
                }
            }
        }
    }

    root.parseMercadonaQR = parseMercadonaQR;
    // Hook for debugging from the console.
    root._mercadonaQRSelfCheck = _selfCheck;
    try { _selfCheck(); } catch (e) { console.warn('[mercadona-qr] self-check threw', e); }
})(typeof window !== 'undefined' ? window : this);
