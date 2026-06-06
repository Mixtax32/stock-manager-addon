# Puente BLE — Modo portátil de la báscula

Una página estática (`index.html`) que hace de puente entre tu báscula ESP32 y tu Home Assistant cuando estás fuera de casa.

URL pública: **https://mixtax32.github.io/stock-manager-addon/bridge/** (una vez que se active GitHub Pages — ver al final).

---

## ¿Qué es esto y por qué existe?

La addon de Stock Manager corre dentro del **iframe de ingress** de Home Assistant. Ese iframe, por la `Permissions-Policy` que setea HA core, **desactiva globalmente la API Web Bluetooth del navegador**. Confirmado vía diagnóstico (ver "Por qué no se puede hacer dentro de la addon" más abajo). Resultado: la UI de la addon no puede hablar BLE jamás mientras viva en ingress, y no hay nada en `config.yaml` que afloje esa policy.

La salida es **mover la pieza Web Bluetooth fuera del iframe**. Esta carpeta `docs/bridge/` es eso: una página HTML+JS+CSS single-file que se publica vía **GitHub Pages** (HTTPS gratis, estático, sin servidor). Como es una página top-level (no iframe), las policies del browser están limpias y Web Bluetooth funciona.

La página no tiene backend. Es código que vive en el navegador del usuario. Cada usuario configura SU URL de Home Assistant y SU token, y todo eso queda en SU `localStorage`. Una sola URL pública sirve a N usuarios sin tocarse entre ellos.

---

## Qué hace exactamente

1. Pide permiso de Bluetooth al usuario y abre el picker de dispositivos del SO.
2. Se conecta a un ESP32 que anuncie el servicio GATT custom (UUIDs abajo).
3. Se suscribe a `notify` del peso. Cada lectura actualiza la UI.
4. Para cada lectura (filtrada al rate configurado, default 2 Hz), hace `POST` a `${HA_URL}/api/events/stock_manager_bridge_weight` con el peso en JSON.
5. En el futuro, el backend de la addon se suscribirá a ese evento por WebSocket y procesará el peso igual que cuando viene por WiFi local.

---

## Setup (usuario final)

### Lo que necesitás

- **Móvil Android con Chrome standalone** (no el Companion App de HA — su WebView a veces restringe Bluetooth aún más). iOS no sirve: Safari no tiene Web Bluetooth y no lo va a tener en el corto plazo.
- **Nabu Casa Remote UI activo** (o cualquier HTTPS público apuntando a tu HA). El HTTP de la LAN no sirve: Web Bluetooth requiere contexto seguro.
- **Una báscula ESP32 con el firmware** que expone el servicio GATT (ver "Estado por fase" — todavía pendiente al momento de escribir esto).

### Pasos

1. **Generá un Long-Lived Access Token en HA**:
   - Entrá a HA → tocá tu nombre arriba a la izquierda → "Perfil" → pestaña "Seguridad" → bajá hasta "Tokens de acceso de larga duración" → "Crear token".
   - Nombralo `stock-manager-bridge` o lo que quieras.
   - **Copialo entero** (no lo vas a poder ver de nuevo).

2. **Abrí el puente en Chrome Android**:
   - URL: `https://mixtax32.github.io/stock-manager-addon/bridge/`
   - "Agregar a pantalla de inicio" desde el menú de Chrome (queda como app).

3. **Configuración**:
   - **URL de Home Assistant**: tu URL de Nabu Casa (ej. `https://xxx.ui.nabu.casa`).
   - **Long-Lived Access Token**: pegá el que acabás de copiar.
   - **Scale ID (fallback)**: el ID numérico de tu báscula en la addon. Si la báscula expone su ID por BLE (info characteristic), este campo es opcional.
   - **Envío de peso (Hz)**: 2 está bien. Subilo si necesitás más resolución temporal; bajalo si querés ahorrar datos móviles.
   - Tocá "Probar conexión HA" — debería loguear "OK". Si falla, revisá URL o token.
   - Tocá "Guardar".

4. **Conectá la báscula**:
   - "Conectar báscula" → el SO te muestra el picker de dispositivos Bluetooth → elegí el que se llame `Stock-Scale-…`.
   - El peso empieza a aparecer en grande.
   - Botón "Tarar" envía la orden de tara a la báscula.

5. **Mientras lo uses**:
   - Mantené esta pestaña visible. La página pide Wake Lock (pantalla no se apaga sola). Si pasás a otra app, BLE se mantiene mientras el SO lo permita.
   - Si la báscula se desconecta (movimiento, batería), el log te avisa y tenés que tocar "Conectar báscula" otra vez.

---

## Estado por fase

Este puente forma parte de un trabajo en tres fases. Importante para saber qué funciona y qué no, en cada momento:

| Fase | Qué | Estado |
|------|-----|--------|
| 1 | Página puente — Web Bluetooth + POST a HA | ✅ **lista** (esta página) |
| 2 | Firmware ESP32 — servicio GATT con UUIDs del contrato | ⏳ pendiente |
| 3 | Backend addon — subscriber WebSocket que escucha el evento y procesa peso | ⏳ pendiente |

Hasta que se complete la fase 3, el peso enviado por el puente **no entra al inventario automáticamente**. Pero **sí podés verlo llegar a HA**: abrí Developer Tools → Events → escribí `stock_manager_bridge_weight` → "Start Listening" → cada lectura del puente aparece ahí en tiempo real.

Eso te permite validar la fase 1 sin esperar a las otras dos.

---

## Contratos técnicos (referencia para implementación futura)

### Servicio BLE GATT que el firmware tiene que exponer

Los UUIDs son custom (no se corresponden con ningún standard del Bluetooth SIG). Comparten prefijo `c9d5e5XX` para ser greppables. **Cualquier cambio acá tiene que mirrorearse en el firmware y en `index.html`** (constantes al principio del bloque `<script>`).

**Service**: `c9d5e500-9c5b-4b69-b3e8-92a30f73c7d1`

| Characteristic | UUID | Props | Payload | Notas |
|---|---|---|---|---|
| Weight | `c9d5e501-9c5b-4b69-b3e8-92a30f73c7d1` | read, notify | UTF-8 con peso en gramos (ej. `"123.4"`) | Notificar a 2-5 Hz |
| Tare | `c9d5e502-9c5b-4b69-b3e8-92a30f73c7d1` | write (sin response) | 1 byte: `0x01` = tarar | |
| Calibrate | `c9d5e503-9c5b-4b69-b3e8-92a30f73c7d1` | write | UTF-8 con peso conocido en gramos | **Reservada**, no implementada todavía |
| Info | `c9d5e504-9c5b-4b69-b3e8-92a30f73c7d1` | read | JSON `{"scale_id","type","fw_version"}` | El puente la lee al conectar; si falla usa el fallback de la config |

**Advertising name**: `Stock-Scale-<scale_id>` (para que el picker del SO sea legible).

**Por qué payloads en UTF-8 y no binarios**: cuesta unos bytes más pero se debugea trivialmente con nRF Connect o cualquier sniffer BLE. Para un kitchen scale a 5 Hz el coste de banda es ridículo.

**Por qué custom y no Standard Weight Scale Service (0x181D)**: el de la BLE SIG está pensado para básculas corporales (composición), no cocina. No encaja.

### Evento que el puente postea a HA

```
POST {ha_url}/api/events/stock_manager_bridge_weight
Headers:
  Authorization: Bearer <long_lived_token>
  Content-Type: application/json
Body:
{
  "scale_id":    "<string del info characteristic, o el fallback configurado>",
  "weight_g":    123.4,
  "ts":          "2026-06-06T17:42:11.123Z",
  "source":      "ble_bridge",
  "battery_pct": null
}
```

Hay también un evento de test, `stock_manager_bridge_test`, que la página dispara desde el botón "Probar conexión HA" para validar que el token + URL funcionan sin necesidad de báscula conectada.

### Subscriber que el backend de la addon tiene que implementar (fase 3)

- Conectarse al WebSocket de HA en `ws://supervisor/core/websocket` (URL interna del addon dentro del contenedor; auth ya resuelta por el Supervisor Token disponible como variable de entorno).
- Subscribirse a eventos con `event_type: "stock_manager_bridge_weight"`.
- Para cada evento, llamar al mismo path de ingestión que ya tiene el endpoint `/api/scales/{id}/weight` que usa el ESP32 vía WiFi en casa — para la UI principal el peso "puente" y el peso "WiFi local" deben ser indistinguibles.

Archivo propuesto: `stock-manager/app/ha_websocket.py`, montado en el lifespan startup de FastAPI en `app/main.py`.

---

## Modelo de seguridad

### Lo que la página hace con el token

- Lo guarda en `localStorage` del navegador del usuario.
- Lo manda en el header `Authorization` de cada `POST` a la URL de HA configurada por el usuario.
- **Nunca** lo logguea, ni a consola ni al panel de Actividad.
- **Nunca** lo envía a ningún tercero. Las únicas URLs que el JS llama son:
  - `${HA_URL}/api/events/stock_manager_bridge_weight`
  - `${HA_URL}/api/events/stock_manager_bridge_test`

Esto es auditable: el código está en `docs/bridge/index.html` en este repo. Cualquiera puede leerlo.

### Pero confiar en GitHub Pages tiene límites

GitHub Pages sirve estáticamente lo que está en el repo. Si el repo es comprometido, el HTML servido también lo sería. Mitigaciones:

- **Activá 2FA en tu cuenta de GitHub**.
- **Auditá los pushes** que cambian este archivo. Cualquier PR a `docs/bridge/index.html` debería ser revisado con lupa.
- Para usuarios paranoicos: en vez de usar `mixtax32.github.io/stock-manager-addon/bridge/`, forkean el repo y activan Pages en su propio fork. Tienen control total de su versión del HTML.

### Lo que el token tuyo te expone si se filtra

Un long-lived token de HA tiene los mismos permisos que tu usuario. Si se filtra, alguien puede leer/escribir tu HA completo. Mitigaciones:

- **Token por uso**: crea un token específico para el puente, no reutilices. Si lo perdés, lo revocás y generás otro.
- **Token revocable**: HA → Perfil → Seguridad → Tokens → Eliminar.
- **No pegues el token en navegadores compartidos**.

---

## Por qué no se puede hacer dentro de la addon (la historia)

Esto es un registro para que el "por qué" no se pierda con el tiempo.

El plan original era: la UI de Stock Manager (vista de Básculas) tendría un botón "Conectar por Bluetooth", y desde ahí se hablaba con el ESP32 vía Web Bluetooth. La página vive dentro del iframe de ingress de HA, accesible desde Nabu Casa con HTTPS. Todo limpio en un solo lugar.

Antes de tirar firmware se hizo una prueba mínima — un botón de diagnóstico en la vista de Básculas que solo llama `navigator.bluetooth.requestDevice` y reporta el resultado. El test en Chrome 148 Android sobre la URL de Nabu Casa devolvió:

```
isSecureContext: true
en iframe: true
navigator.bluetooth: object
getAvailability(): false
requestDevice throw: NotFoundError — Web Bluetooth API globally disabled.
```

Diagnóstico: HA core setea una `Permissions-Policy` en el iframe que envuelve la addon, y esa policy **no incluye `bluetooth`** en la lista de features permitidas. Chrome respeta esa policy y desactiva la API entera dentro de ese iframe — por eso `navigator.bluetooth` existe (la implementación del browser está) pero `getAvailability()` devuelve `false` y `requestDevice` muere instantáneo. El error name `NotFoundError` es engañoso (suele significar "no encontré dispositivo"), pero el mensaje "Web Bluetooth API globally disabled" deja claro qué pasa.

No hay opción en `config.yaml` del addon que afloje esa policy. Está hardcodeada río arriba en HA. Si en algún momento HA añade `bluetooth` a su allowlist de iframe, este puente externo se vuelve innecesario y podemos integrar todo dentro de la addon. Hasta entonces, externo.

---

## Cómo activar GitHub Pages (mantenedor)

Solo se hace una vez por repo:

1. En GitHub: **Settings** del repo → **Pages** (sidebar izquierda).
2. **Source**: "Deploy from a branch".
3. **Branch**: `main`, folder: `/docs`.
4. "Save".
5. A los pocos minutos, la página queda viva en `https://<owner>.github.io/<repo>/bridge/` (en nuestro caso `https://mixtax32.github.io/stock-manager-addon/bridge/`).

Cada push a `main` que toque `docs/` redespliega automáticamente. No hay nada más que mantener.

Si alguien forkea el repo y quiere su propia URL: mismo proceso en su fork → su URL `https://<su-user>.github.io/stock-manager-addon/bridge/` sirve la misma página adaptada al fork.
