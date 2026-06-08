// ============================================================================
// stock-manager — ESP32 Kitchen Scale (guided cook + ad-hoc weighing)
// ============================================================================
// Portable kitchen scale firmware. Same hardware as the fixed cupboard scale
// (HX711 + load cell + KY-004 buttons + SSD1306 OLED) but the role is
// different: instead of weighing one product continuously, this device is
// used during cook sessions. The addon orchestrates the recipe step by step;
// the scale shows the current ingredient + target on the OLED, and the
// physical buttons let the user confirm or skip a step with messy hands.
//
// Differences vs scale-test.ino:
//   - Polls GET /api/scales/{id}/cook-step periodically. When status='active'
//     the OLED switches to cook mode (ingredient name + target weight).
//   - BTN_CONSUMO is repurposed as "Confirmar paso" → POSTs current weight
//     to /api/cook-sessions/{id}/confirm-step.
//   - BTN_NUEVO is repurposed as "Saltar paso" → POSTs to /skip-step.
//   - No NUEVO_LOTE or stock-tracking semantics: the kitchen scale isn't
//     tied to a single product.
//
// What stays the same:
//   - NVS persistence of tare + calibration (see scale-test for the rationale).
//   - Local web UI for calibration (open the scale's IP, once, to calibrate
//     against a known weight — then NVS remembers it forever).
//   - Live weight is POSTed to /api/scales/{id}/weight so the addon's cook
//     session modal can show it in real time without polling the ESP.
//
// ---------------------------------------------------------------------------
// Wiring (ESP32 DevKitC / WROOM-32) — identical to scale-test
// ---------------------------------------------------------------------------
//
//   HX711                ESP32
//   -----                -----
//   VCC      ---->       3.3V
//   GND      ---->       GND
//   DT (DOUT) ---->      GPIO 16
//   SCK      ---->       GPIO 17
//
//   4-wire load cell     HX711
//   ----------------     -----
//   Red    (E+)  ---->   E+
//   Black  (E-)  ---->   E-
//   White  (A-)  ---->   A-
//   Green  (A+)  ---->   A+
//
//   3-pin button modules (KY-004 style, active LOW)
//   -----------------------------------------------
//   TARE        S ---->  GPIO 25
//   CONFIRMAR   S ---->  GPIO 26   (was CONSUMO on the fixed scale)
//   SALTAR      S ---->  GPIO 27   (was NUEVO on the fixed scale)
//
//   SSD1306 OLED 0.96" (I2C, 128x64)    ESP32
//   --------------------------------    -----
//   GND  ---->                          GND
//   VCC  ---->                          3.3V
//   SCL  ---->                          GPIO 22
//   SDA  ---->                          GPIO 21
//
// ---------------------------------------------------------------------------
// Setup (first flash — over USB)
// ---------------------------------------------------------------------------
// 1. Arduino IDE -> Boards Manager -> install "ESP32 by Espressif Systems".
// 2. Library Manager -> install:
//      - "HX711 Arduino Library" by Bogdan Necula
//      - "Adafruit GFX Library" by Adafruit
//      - "Adafruit SSD1306"      by Adafruit
//      - "ArduinoJson"           by Benoit Blanchon  (new vs scale-test!)
// 3. Copy secrets.h.example to secrets.h and fill in WiFi + ADDON_BASE_URL +
//    SCALE_ID (the id assigned to your kitchen-type scale in the addon).
// 4. Flash over USB the first time. Open Serial Monitor @ 115200.
// 5. Open http://<ip>/ → calibrate once with a known weight.
// 6. From now on calibration persists across reboots (NVS).
//
// ---------------------------------------------------------------------------
// OTA flashes (no cable) — same as scale-test
// ---------------------------------------------------------------------------
// Tools -> Port -> "scale-kitchen at <ip>" under Network ports.
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>
#include <Preferences.h>
#include <ArduinoJson.h>

// BLE — stock Arduino-ESP32 Bluedroid stack. Big-ish but zero install.
// If RAM/flash gets tight (e.g. adding more services), migrate to
// NimBLE-Arduino (~half the footprint) by replacing these four headers and
// the BLE API calls — protocol stays identical.
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "secrets.h"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
#define OTA_HOSTNAME   "scale-kitchen"
#define FW_VERSION     "1.0.0-ble"   // firmware semver (independent of addon version)

// BLE GATT contract — mirror with docs/bridge/README.md and docs/bridge/index.html.
// Service prefix c9d5e5XX is shared so all char UUIDs grep together.
#define BLE_SVC_UUID    "c9d5e500-9c5b-4b69-b3e8-92a30f73c7d1"
#define BLE_WEIGHT_UUID "c9d5e501-9c5b-4b69-b3e8-92a30f73c7d1"
#define BLE_TARE_UUID   "c9d5e502-9c5b-4b69-b3e8-92a30f73c7d1"
#define BLE_INFO_UUID   "c9d5e504-9c5b-4b69-b3e8-92a30f73c7d1"

constexpr uint32_t BLE_NOTIFY_INTERVAL_MS = 200;   // 5 Hz — fast enough for cooking, gentle on BLE air-time

constexpr uint8_t PIN_HX711_DT  = 16;
constexpr uint8_t PIN_HX711_SCK = 17;

constexpr uint8_t PIN_BTN_TARE      = 25;
constexpr uint8_t PIN_BTN_CONFIRMAR = 26;
constexpr uint8_t PIN_BTN_SALTAR    = 27;

constexpr uint8_t  OLED_W       = 128;
constexpr uint8_t  OLED_H       = 64;
constexpr uint8_t  OLED_ADDR    = 0x3C;
constexpr int8_t   OLED_RESET   = -1;

constexpr uint8_t  BUTTON_PRESSED_STATE = LOW;

constexpr uint32_t DEBOUNCE_MS             = 50;
constexpr uint32_t DISPLAY_REFRESH_MS      = 100;
constexpr uint32_t WEIGHT_POST_INTERVAL_MS = 1000;   // tighter than fixed scale — addon polls live weight
constexpr float    WEIGHT_POST_DELTA_G     = 1.0f;   // be more sensitive too
constexpr uint32_t COOK_POLL_INTERVAL_MS   = 1500;   // GET /cook-step cadence
constexpr uint16_t ADDON_HTTP_TIMEOUT_MS   = 2500;
constexpr float    INITIAL_CAL_FACTOR      = 1.0f;
constexpr float    WEIGHT_EMA_ALPHA        = 0.1f;
constexpr float    WEIGHT_JUMP_THRESHOLD_G = 10.0f;

constexpr const char* NVS_NAMESPACE       = "scale";
constexpr const char* NVS_KEY_CAL_FACTOR  = "cal_factor";
constexpr const char* NVS_KEY_TARE_OFFSET = "tare_off";
constexpr const char* NVS_KEY_HAS_TARE    = "has_tare";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
HX711 scale;
WebServer server(80);
Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, OLED_RESET);
Preferences prefs;

float currentWeightG    = 0.0f;
float calibrationFactor = INITIAL_CAL_FACTOR;

bool    oledReady    = false;
bool    otaActive    = false;
uint8_t otaPercent   = 0;

float    lastSentWeightG = 0.0f;
uint32_t lastWeightPostMs = 0;
uint32_t lastCookPollMs   = 0;

bool     weightFilterInit = false;

// BLE state — see setupBLE() / bleNotifyWeight() / loop().
BLEServer*         bleServer        = nullptr;
BLECharacteristic* bleWeightChar    = nullptr;
BLECharacteristic* bleInfoChar      = nullptr;
bool               bleConnected     = false;
volatile bool      bleTarePending   = false;   // BLE write callback runs off-loop; defer to main loop for HX711 safety
uint32_t           lastBleNotifyMs  = 0;

// Cook session state, updated by pollCookStep(). status=='active' switches
// the OLED to cook mode and arms the CONFIRMAR/SALTAR buttons.
struct CookState {
  String   status;            // "idle" | "active" | "completed" | ""
  int      sessionId;
  String   recipeName;
  String   ingredientName;
  int      stepOrder;
  int      totalSteps;
  float    targetQty;
  String   unit;
  bool     weighable;
  uint32_t lastUpdatedMs;
};
CookState cook = { "", 0, "", "", 0, 0, 0.0f, "", false, 0 };

struct Button {
  uint8_t  pin;
  bool     lastReading;
  bool     stableState;
  uint32_t lastChangeMs;
  uint32_t pressCount;
  uint32_t lastPressMs;
};

Button btnTare      = { PIN_BTN_TARE,      HIGH, HIGH, 0, 0, 0 };
Button btnConfirmar = { PIN_BTN_CONFIRMAR, HIGH, HIGH, 0, 0, 0 };
Button btnSaltar    = { PIN_BTN_SALTAR,    HIGH, HIGH, 0, 0, 0 };

bool pollButton(Button& b) {
  bool reading = digitalRead(b.pin);
  uint32_t now = millis();
  if (reading != b.lastReading) {
    b.lastChangeMs = now;
    b.lastReading = reading;
  }
  if ((now - b.lastChangeMs) > DEBOUNCE_MS && reading != b.stableState) {
    b.stableState = reading;
    if (b.stableState == BUTTON_PRESSED_STATE) {
      b.pressCount++;
      b.lastPressMs = now;
      return true;
    }
  }
  return false;
}

void resetWeightFilter(float seed) {
  currentWeightG   = seed;
  weightFilterInit = true;
}

bool cookActive() {
  return cook.status == "active" && cook.sessionId > 0;
}

// ---------------------------------------------------------------------------
// OLED rendering
// ---------------------------------------------------------------------------

// The recipe/ingredient strings travel as UTF-8 from the addon. Adafruit_GFX's
// built-in font is single-byte CP437, so the two-byte ñ/á/é/í/ó/ú sequences
// render as random glyphs (the "Champ-li-ñones" bug). Translating UTF-8 →
// CP437 for the common Spanish set keeps the firmware tiny — much cheaper than
// shipping a Latin-1 GFX font.
String toCP437(const String& src) {
  String out;
  out.reserve(src.length());
  int n = src.length();
  for (int i = 0; i < n; i++) {
    uint8_t c = (uint8_t)src[i];
    if (c < 0x80) { out += (char)c; continue; }
    if (c == 0xC3 && i + 1 < n) {
      uint8_t c2 = (uint8_t)src[i + 1];
      char m = 0;
      switch (c2) {
        case 0xA0: m = (char)0x85; break;  // à
        case 0xA1: m = (char)0xA0; break;  // á
        case 0xA2: m = (char)0x83; break;  // â
        case 0xA8: m = (char)0x8A; break;  // è
        case 0xA9: m = (char)0x82; break;  // é
        case 0xAD: m = (char)0xA1; break;  // í
        case 0xB1: m = (char)0xA4; break;  // ñ
        case 0xB3: m = (char)0xA2; break;  // ó
        case 0xBA: m = (char)0xA3; break;  // ú
        case 0xBC: m = (char)0x81; break;  // ü
        case 0x81: m = 'A';        break;  // Á (no glyph in CP437 built-in)
        case 0x89: m = (char)0x90; break;  // É
        case 0x8D: m = 'I';        break;  // Í
        case 0x91: m = (char)0xA5; break;  // Ñ
        case 0x93: m = 'O';        break;  // Ó
        case 0x9A: m = 'U';        break;  // Ú
        case 0x9C: m = (char)0x9A; break;  // Ü
        default: break;
      }
      if (m) { out += m; i++; continue; }
      i++; out += '?'; continue;
    }
    if (c == 0xC2 && i + 1 < n) {
      uint8_t c2 = (uint8_t)src[i + 1];
      char m = 0;
      switch (c2) {
        case 0xA1: m = (char)0xAD; break;  // ¡
        case 0xB0: m = (char)0xF8; break;  // °
        case 0xBF: m = (char)0xA8; break;  // ¿
        default: break;
      }
      if (m) { out += m; i++; continue; }
      i++; out += '?'; continue;
    }
    out += '?';
  }
  return out;
}

void setupDisplay() {
  Wire.begin();
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.printf("OLED not found at 0x%02X — display disabled\n", OLED_ADDR);
    return;
  }
  oledReady = true;
  oled.cp437(true);
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println("scale-kitchen");
  oled.println("booting...");
  oled.display();
  Serial.println("OLED ready");
}

void drawStatusLine(const char* status) {
  if (!oledReady) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println("scale-kitchen");
  oled.setTextSize(2);
  oled.setCursor(0, 22);
  oled.println(status);
  oled.display();
}

// Pick the largest text size whose rendered width fits the screen with a bit
// of room for the unit suffix. Same helper as scale-test's chooseFitSize.
int chooseFitSize(int textLen) {
  for (int s = 4; s >= 2; --s) {
    int charW = 6 * s;
    int needed = textLen * charW + (s * 8);
    if (needed <= OLED_W) return s;
  }
  return 2;
}

// Centered single-line text helper. Picks the biggest size that fits.
void drawCenteredText(const String& text, int y, int maxSize) {
  int len = text.length();
  if (len == 0) return;
  int size = maxSize;
  while (size > 1 && len * 6 * size > OLED_W) size--;
  oled.setTextSize(size);
  int w = len * 6 * size;
  int x = (OLED_W - w) / 2;
  if (x < 0) x = 0;
  oled.setCursor(x, y);
  oled.print(text);
}

// Render in cook mode — minimalist layout:
//
//   1/2                             ← step counter only (no recipe name)
//   ───────────────────────         ← divider at y=10
//
//        Champiñones                ← ingredient, size 2 if short, size 1 wrap if long
//
//     █████░░░░░░░░░                ← thin progress bar (5px high)
//
//        363 / 656 g                ← current / target, size 1
//         falta 293g                ← delta hint, size 1, own line (no overlap)
//
// Recipe name is dropped: the cook already knows what they're cooking, and the
// space goes to the only thing that matters at this instant — the ingredient.
void renderCookMode() {
  oled.clearDisplay();

  // ---- Header: just the step counter ----
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.printf("%d/%d", cook.stepOrder + 1, cook.totalSteps);
  oled.drawFastHLine(0, 10, OLED_W, SSD1306_WHITE);

  // ---- Ingredient name (dominant) ----
  String name = toCP437(cook.ingredientName);
  if (name.length() == 0) name = "(sin nombre)";
  if (name.length() <= 10) {
    drawCenteredText(name, 16, 2);
  } else if (name.length() <= 21) {
    drawCenteredText(name, 20, 1);
  } else {
    // Try to break at the last space within the first 21 chars
    int cut = 21;
    for (int i = 20; i >= 10; --i) {
      if (name.charAt(i) == ' ') { cut = i; break; }
    }
    String first = name.substring(0, cut);
    String rest  = name.substring(name.charAt(cut) == ' ' ? cut + 1 : cut);
    if (rest.length() > 21) rest = rest.substring(0, 18) + "...";
    oled.setTextSize(1);
    int w1 = first.length() * 6;
    int w2 = rest.length() * 6;
    oled.setCursor((OLED_W - w1) / 2, 16);
    oled.print(first);
    oled.setCursor((OLED_W - w2) / 2, 24);
    oled.print(rest);
  }

  // ---- Thin progress bar ----
  const int barTop = 36;
  const int barH   = 5;
  const int barL   = 8;
  const int barR   = OLED_W - 8;

  if (cook.weighable && cook.targetQty > 0) {
    oled.drawRect(barL, barTop, barR - barL, barH, SSD1306_WHITE);
    float ratio = currentWeightG / cook.targetQty;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    int fillW = (int)((barR - barL - 2) * ratio);
    if (fillW > 0) oled.fillRect(barL + 1, barTop + 1, fillW, barH - 2, SSD1306_WHITE);
  }

  // ---- Bottom: current / target on row 1, delta hint on row 2 ----
  String unit = toCP437(cook.unit);
  oled.setTextSize(1);
  if (cook.weighable && cook.targetQty > 0) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%.0f / %.0f %s",
             currentWeightG, cook.targetQty, unit.c_str());
    drawCenteredText(String(buf), 46, 1);

    char hint[24];
    float delta = currentWeightG - cook.targetQty;
    if (fabsf(delta) <= 5.0f) {
      snprintf(hint, sizeof(hint), "OK");
    } else if (delta < 0) {
      snprintf(hint, sizeof(hint), "falta %.0f%s", -delta, unit.c_str());
    } else {
      snprintf(hint, sizeof(hint), "sobra %.0f%s", delta, unit.c_str());
    }
    drawCenteredText(String(hint), 56, 1);
  } else {
    char buf[24];
    snprintf(buf, sizeof(buf), "objetivo: %.0f %s",
             cook.targetQty, unit.c_str());
    drawCenteredText(toCP437("(añadir manualmente)"), 38, 1);
    drawCenteredText(String(buf), 52, 1);
  }

  oled.display();
}

void renderDisplay() {
  if (!oledReady) return;
  oled.clearDisplay();

  if (otaActive) {
    oled.setTextSize(2);
    oled.setCursor(0, 8);
    oled.printf("OTA %u%%", otaPercent);
    oled.drawRect(0, 44, OLED_W, 14, SSD1306_WHITE);
    oled.fillRect(2, 46, (OLED_W - 4) * otaPercent / 100, 10, SSD1306_WHITE);
    oled.display();
    return;
  }

  if (cookActive()) {
    renderCookMode();
    return;
  }

  // ---- Idle: IP top, dominant centered weight, no clutter ----
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  if (WiFi.status() == WL_CONNECTED) {
    oled.print(WiFi.localIP().toString());
  } else {
    oled.print("WiFi: down");
  }
  oled.drawFastHLine(0, 10, OLED_W, SSD1306_WHITE);

  char buf[16];
  snprintf(buf, sizeof(buf), "%.1f", currentWeightG);
  int len    = (int)strlen(buf);
  int size   = chooseFitSize(len);
  int charW  = 6 * size;
  int charH  = 8 * size;
  int totalW = len * charW + charW;
  int x      = (OLED_W - totalW) / 2;
  if (x < 0) x = 0;
  int y      = 10 + ((64 - 10) - charH) / 2;
  oled.setTextSize(size);
  oled.setCursor(x, y);
  oled.print(buf);
  oled.setCursor(x + len * charW + 2, y + charH - 8);
  oled.setTextSize(size > 1 ? size - 1 : 1);
  oled.print("g");

  oled.display();
}

// ---------------------------------------------------------------------------
// Embedded web UI
// ---------------------------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 Kitchen Scale</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#111; color:#eee;
         margin:0; padding:1rem; max-width:480px; margin-inline:auto; }
  h1 { margin:.25rem 0 1rem; font-size:.9rem; opacity:.6; letter-spacing:.05em;
       text-transform:uppercase; }
  .weight { font-size:4rem; font-weight:700; text-align:center;
            padding:1.5rem 1rem; background:#1c1c1c; border-radius:14px;
            font-variant-numeric:tabular-nums; }
  .weight small { font-size:1rem; opacity:.5; margin-left:.25rem; }
  .cook { margin-top:1rem; padding:1rem; background:#1c1c1c; border-radius:10px; }
  .cook .label { font-size:.7rem; opacity:.55; text-transform:uppercase;
                  letter-spacing:.05em; }
  .cook .val { font-size:1.1rem; font-weight:600; margin-top:.25rem; }
  .actions { display:grid; gap:.5rem; margin-top:1rem; }
  button { background:#2c5282; color:#fff; border:0; padding:.85rem;
           border-radius:10px; font-size:1rem; cursor:pointer; }
  button.secondary { background:#444; }
  button.danger    { background:#7c2d2d; }
  input { background:#1c1c1c; color:#fff; border:1px solid #333;
          padding:.85rem; border-radius:10px; font-size:1rem; width:100%;
          box-sizing:border-box; }
  .row { display:flex; gap:.5rem; }
  .row > * { flex:1; }
  .meta { margin-top:1rem; font-size:.7rem; opacity:.45;
          font-variant-numeric:tabular-nums; }
</style>
</head>
<body>
  <h1>ESP32 Kitchen Scale</h1>

  <div class="weight"><span id="weight">--</span><small>g</small></div>

  <div class="cook" id="cook" hidden>
    <div class="label">Cocinando</div>
    <div class="val" id="cook-recipe">—</div>
    <div class="val" id="cook-ingredient" style="margin-top:.5rem">—</div>
  </div>

  <div class="actions">
    <button onclick="doTare()">Tarar (cero)</button>
    <div class="row">
      <input type="number" id="known" placeholder="Peso conocido (g)" step="0.1">
      <button class="secondary" onclick="doCalibrate()">Calibrar</button>
    </div>
    <button class="danger" onclick="doReset()">Borrar calibración guardada</button>
  </div>

  <div class="meta">
    raw: <span id="raw">--</span> &middot; factor: <span id="factor">--</span>
  </div>

<script>
async function poll() {
  try {
    const r = await fetch('/api/state');
    const s = await r.json();
    document.getElementById('weight').textContent = s.weight_g.toFixed(1);
    document.getElementById('raw').textContent = s.raw;
    document.getElementById('factor').textContent = (+s.factor).toFixed(2);
    const cook = document.getElementById('cook');
    if (s.cook_status === 'active') {
      cook.hidden = false;
      document.getElementById('cook-recipe').textContent =
        s.cook_recipe + ' (paso ' + (s.cook_step+1) + '/' + s.cook_total + ')';
      document.getElementById('cook-ingredient').textContent =
        s.cook_ingredient + ' → ' + s.cook_target + ' ' + s.cook_unit;
    } else {
      cook.hidden = true;
    }
  } catch (e) {}
}
setInterval(poll, 500);
poll();

async function doTare() {
  await fetch('/api/tare', { method: 'POST' });
}
async function doCalibrate() {
  const v = document.getElementById('known').value;
  if (!v || +v <= 0) { alert('Pone un peso > 0'); return; }
  const r = await fetch('/api/calibrate?known_g=' + v, { method: 'POST' });
  const j = await r.json();
  if (j.ok) alert('Calibrado. Factor: ' + j.factor); else alert('Error: ' + (j.error || ''));
}
async function doReset() {
  if (!confirm('Borrar calibracion guardada y volver a fabrica?')) return;
  await fetch('/api/reset-calibration', { method: 'POST' });
  alert('Listo. Tara desde cero y volve a calibrar.');
}
</script>
</body>
</html>
)HTML";

void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleState() {
  long raw = scale.is_ready() ? scale.read_average(1) : 0;
  String json = "{";
  json += "\"weight_g\":" + String(currentWeightG, 1);
  json += ",\"raw\":" + String(raw);
  json += ",\"factor\":" + String(calibrationFactor, 2);
  json += ",\"cook_status\":\"" + cook.status + "\"";
  json += ",\"cook_recipe\":\"" + cook.recipeName + "\"";
  json += ",\"cook_ingredient\":\"" + cook.ingredientName + "\"";
  json += ",\"cook_step\":" + String(cook.stepOrder);
  json += ",\"cook_total\":" + String(cook.totalSteps);
  json += ",\"cook_target\":" + String(cook.targetQty, 1);
  json += ",\"cook_unit\":\"" + cook.unit + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

// ---------------------------------------------------------------------------
// Addon HTTP — POST/PATCH helpers and event/weight pushes
// ---------------------------------------------------------------------------
bool addonEnabled() {
  return WiFi.status() == WL_CONNECTED && strlen(ADDON_BASE_URL) > 0;
}

bool postJson(const String& url, const String& body) {
  HTTPClient http;
  http.setTimeout(ADDON_HTTP_TIMEOUT_MS);
  http.setReuse(false);
  if (!http.begin(url)) {
    Serial.printf("HTTP begin failed: %s\n", url.c_str());
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  bool ok = (code >= 200 && code < 300);
  if (!ok) Serial.printf("HTTP %d <- %s\n", code, url.c_str());
  http.end();
  return ok;
}

bool patchJson(const String& url, const String& body) {
  HTTPClient http;
  http.setTimeout(ADDON_HTTP_TIMEOUT_MS);
  http.setReuse(false);
  if (!http.begin(url)) {
    Serial.printf("HTTP begin failed: %s\n", url.c_str());
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest("PATCH", body);
  bool ok = (code >= 200 && code < 300);
  if (!ok) Serial.printf("HTTP %d <- PATCH %s\n", code, url.c_str());
  http.end();
  return ok;
}

void postScaleWeight(float weight_g) {
  if (!addonEnabled()) return;
  String url  = String(ADDON_BASE_URL) + "/api/scales/" + String(SCALE_ID) + "/weight";
  String body = "{\"weight_g\":" + String(weight_g, 1) + "}";
  postJson(url, body);
}

void postConfirmStep() {
  if (!addonEnabled() || !cookActive()) return;
  String url  = String(ADDON_BASE_URL) + "/api/cook-sessions/" + String(cook.sessionId) + "/confirm-step";
  String body = "{\"actual_qty\":" + String(currentWeightG, 1) + "}";
  postJson(url, body);
}

void postSkipStep() {
  if (!addonEnabled() || !cookActive()) return;
  String url = String(ADDON_BASE_URL) + "/api/cook-sessions/" + String(cook.sessionId) + "/skip-step";
  postJson(url, "{}");
}

void syncCalibrationToAddon() {
  if (!addonEnabled()) return;
  String url  = String(ADDON_BASE_URL) + "/api/scales/" + String(SCALE_ID);
  String body = "{\"calibration_factor\":" + String(calibrationFactor, 4) + "}";
  patchJson(url, body);
}

// Poll the addon to learn what (if anything) the user is currently cooking.
// Updates the global `cook` struct. Best-effort; failure leaves the last
// known state in place, which is fine — next tick we try again.
void pollCookStep() {
  if (!addonEnabled()) return;
  HTTPClient http;
  http.setTimeout(ADDON_HTTP_TIMEOUT_MS);
  http.setReuse(false);
  String url = String(ADDON_BASE_URL) + "/api/scales/" + String(SCALE_ID) + "/cook-step";
  if (!http.begin(url)) return;
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("cook-step parse error: %s\n", err.c_str());
    return;
  }
  const char* st = doc["status"] | "idle";
  cook.status         = String(st);
  cook.sessionId      = doc["session_id"] | 0;
  cook.recipeName     = String((const char*)(doc["recipe_name"] | ""));
  cook.ingredientName = String((const char*)(doc["ingredient_name"] | ""));
  cook.stepOrder      = doc["step_order"] | 0;
  cook.totalSteps     = doc["total_steps"] | 0;
  cook.targetQty      = doc["target_qty"] | 0.0f;
  cook.unit           = String((const char*)(doc["unit"] | "g"));
  cook.weighable      = doc["weighable"] | false;
  cook.lastUpdatedMs  = millis();
}

// ---------------------------------------------------------------------------
// Tare + calibrate handlers + NVS
// ---------------------------------------------------------------------------
void saveCalibrationToNVS() {
  prefs.putFloat(NVS_KEY_CAL_FACTOR, calibrationFactor);
}

void saveTareToNVS() {
  prefs.putLong(NVS_KEY_TARE_OFFSET, scale.get_offset());
  prefs.putBool(NVS_KEY_HAS_TARE, true);
}

// Shared tare path. Called by: physical TARE button, web /api/tare,
// and the BLE tare characteristic (via the bleTarePending flag in loop()).
// Side effects: zeros HX711 with a 10-sample tare, persists offset to NVS,
// reseeds the EMA filter, and resets the "last sent" tracker so the next
// addon POST reflects the new zero.
void doTare() {
  scale.tare(10);
  saveTareToNVS();
  resetWeightFilter(scale.is_ready() ? scale.get_units(3) : 0.0f);
  lastSentWeightG = currentWeightG;
}

void handleTare() {
  doTare();
  Serial.println("Tare via web (saved to NVS)");
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleCalibrate() {
  if (!server.hasArg("known_g")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing known_g\"}");
    return;
  }
  float knownG = server.arg("known_g").toFloat();
  if (knownG <= 0) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid known_g\"}");
    return;
  }
  long reading = scale.get_value(10);
  if (reading == 0) {
    server.send(500, "application/json", "{\"ok\":false,\"error\":\"no reading\"}");
    return;
  }
  calibrationFactor = (float)reading / knownG;
  scale.set_scale(calibrationFactor);
  saveCalibrationToNVS();
  syncCalibrationToAddon();
  Serial.printf("Calibrated: factor=%.4f (raw=%ld, known=%.1fg) — saved to NVS\n",
                calibrationFactor, reading, knownG);
  String resp = "{\"ok\":true,\"factor\":" + String(calibrationFactor, 4) + "}";
  server.send(200, "application/json", resp);
}

void handleResetCalibration() {
  prefs.remove(NVS_KEY_CAL_FACTOR);
  prefs.remove(NVS_KEY_TARE_OFFSET);
  prefs.remove(NVS_KEY_HAS_TARE);
  calibrationFactor = INITIAL_CAL_FACTOR;
  scale.set_scale(calibrationFactor);
  scale.tare(10);
  resetWeightFilter(0.0f);
  Serial.println("Calibration wiped from NVS — back to factory defaults");
  server.send(200, "application/json", "{\"ok\":true}");
}

// ---------------------------------------------------------------------------
// BLE GATT — portable mode bridge (see docs/bridge/README.md)
// ---------------------------------------------------------------------------
// The phone-side puente reads BLE_WEIGHT_UUID notifications and POSTs them
// to HA as `stock_manager_bridge_weight` events. The addon's HA WebSocket
// subscriber (app/ha_websocket.py) routes those into the same DB function
// the WiFi flow uses, so BLE weights are indistinguishable from WiFi weights
// in the addon UI.
//
// BLE coexists with WiFi on the single radio of the WROOM-32 — time-sliced
// by the IDF. For our throughput (5 Hz notify + occasional HTTP) the slice
// hit is invisible. BLE keeps working even if WiFi never associates, which
// is exactly the portable-mode use case.

class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*s*/) override {
    bleConnected = true;
    Serial.println("[BLE] client connected");
  }
  void onDisconnect(BLEServer* /*s*/) override {
    bleConnected = false;
    Serial.println("[BLE] client disconnected; restarting advertising");
    // Without this the stack stops advertising after a disconnect and the
    // next "Conectar báscula" tap in the puente can't find us.
    BLEDevice::startAdvertising();
  }
};

class BleTareCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    std::string v = c->getValue();
    // Contract: write of a single byte 0x01 triggers tare. Any other payload ignored.
    if (!v.empty() && (uint8_t)v[0] == 0x01) {
      // Don't touch the HX711 from this callback — it runs in the BLE task and
      // a 10-sample tare can block for >100ms. Flip a flag, main loop handles it.
      bleTarePending = true;
      Serial.println("[BLE] tare requested");
    }
  }
};

void setupBLE() {
  String name = String("Stock-Scale-") + String(SCALE_ID);
  BLEDevice::init(name.c_str());

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new BleServerCallbacks());

  BLEService* svc = bleServer->createService(BLE_SVC_UUID);

  // Weight: read + notify. Payload is UTF-8 decimal grams (e.g. "123.4").
  bleWeightChar = svc->createCharacteristic(
    BLE_WEIGHT_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  bleWeightChar->addDescriptor(new BLE2902());
  bleWeightChar->setValue("0.0");

  // Tare: write (no response).
  BLECharacteristic* tareChar = svc->createCharacteristic(
    BLE_TARE_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  tareChar->setCallbacks(new BleTareCallbacks());

  // Info: read. JSON so the puente can identify the scale without the user
  // typing the scale_id by hand in the bridge config.
  bleInfoChar = svc->createCharacteristic(
    BLE_INFO_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  String info = String("{\"scale_id\":\"") + String(SCALE_ID) +
                "\",\"type\":\"kitchen\",\"fw_version\":\"" + FW_VERSION + "\"}";
  bleInfoChar->setValue(std::string(info.c_str()));

  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SVC_UUID);
  adv->setScanResponse(true);
  // Hint min/max preferred connection intervals — keeps phones from
  // negotiating an overly slow conn that would tank notify latency.
  adv->setMinPreferred(0x06);
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] advertising as %s (svc %s)\n", name.c_str(), BLE_SVC_UUID);
}

void bleNotifyWeight(float weight_g) {
  if (!bleConnected || bleWeightChar == nullptr) return;
  uint32_t now = millis();
  if (now - lastBleNotifyMs < BLE_NOTIFY_INTERVAL_MS) return;
  lastBleNotifyMs = now;
  char buf[16];
  int n = snprintf(buf, sizeof(buf), "%.1f", weight_g);
  if (n <= 0) return;
  bleWeightChar->setValue((uint8_t*)buf, n);
  bleWeightChar->notify();
}

// ---------------------------------------------------------------------------
// OTA
// ---------------------------------------------------------------------------
void setupOTA() {
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  if (strlen(OTA_PASSWORD) > 0) {
    ArduinoOTA.setPassword(OTA_PASSWORD);
  }
  ArduinoOTA.onStart([]() {
    otaActive  = true;
    otaPercent = 0;
    renderDisplay();
    Serial.println("OTA: update starting");
  });
  ArduinoOTA.onEnd([]() {
    otaActive = false;
    Serial.println("OTA: update finished");
  });
  ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {
    otaPercent = (uint8_t)((p * 100) / t);
    renderDisplay();
  });
  ArduinoOTA.onError([](ota_error_t err) {
    otaActive = false;
    Serial.printf("OTA error: %u\n", err);
  });
  ArduinoOTA.begin();
  Serial.printf("OTA ready as %s.local\n", OTA_HOSTNAME);
}

// ---------------------------------------------------------------------------
// Setup + loop
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== scale-kitchen booting ===");

  setupDisplay();

  pinMode(PIN_BTN_TARE,      INPUT_PULLUP);
  pinMode(PIN_BTN_CONFIRMAR, INPUT_PULLUP);
  pinMode(PIN_BTN_SALTAR,    INPUT_PULLUP);
  btnTare.lastReading      = btnTare.stableState      = digitalRead(PIN_BTN_TARE);
  btnConfirmar.lastReading = btnConfirmar.stableState = digitalRead(PIN_BTN_CONFIRMAR);
  btnSaltar.lastReading    = btnSaltar.stableState    = digitalRead(PIN_BTN_SALTAR);

  prefs.begin(NVS_NAMESPACE, false);
  calibrationFactor = prefs.getFloat(NVS_KEY_CAL_FACTOR, INITIAL_CAL_FACTOR);
  bool hasSavedTare = prefs.getBool(NVS_KEY_HAS_TARE, false);
  long savedTareOffset = prefs.getLong(NVS_KEY_TARE_OFFSET, 0);

  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.set_scale(calibrationFactor);
  if (hasSavedTare) {
    scale.set_offset(savedTareOffset);
    Serial.printf("HX711 ready (NVS: factor=%.4f, tare_offset=%ld)\n",
                  calibrationFactor, savedTareOffset);
  } else {
    scale.tare(10);
    saveTareToNVS();
    Serial.printf("HX711 ready (first boot — tared and saved, factor=%.4f)\n",
                  calibrationFactor);
  }

  drawStatusLine("WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s ", WIFI_SSID);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi OK. IP: %s\n", WiFi.localIP().toString().c_str());
    setupOTA();
  } else {
    Serial.println("WiFi failed — buttons + serial still work, OTA and web UI down");
    drawStatusLine("NO WIFI");
  }

  // BLE comes up unconditionally — portable mode must work without WiFi.
  setupBLE();

  server.on("/", handleRoot);
  server.on("/api/state", handleState);
  server.on("/api/tare", HTTP_POST, handleTare);
  server.on("/api/calibrate", HTTP_POST, handleCalibrate);
  server.on("/api/reset-calibration", HTTP_POST, handleResetCalibration);
  server.begin();
  Serial.println("HTTP server up on :80");
}

void loop() {
  ArduinoOTA.handle();

  // BLE tare callback runs in the BLE task and can't touch HX711 directly;
  // it flips this flag and we do the actual tare here on the main loop.
  if (bleTarePending) {
    bleTarePending = false;
    doTare();
    Serial.println("[BLE] TARE applied");
  }

  if (pollButton(btnTare)) {
    doTare();
    Serial.println("BTN: TARE (saved to NVS)");
  }
  if (pollButton(btnConfirmar)) {
    if (cookActive()) {
      postConfirmStep();
      Serial.printf("BTN: CONFIRMAR (session=%d, weight=%.1f)\n",
                    cook.sessionId, currentWeightG);
      // Force an immediate poll so the OLED jumps to the next ingredient ASAP.
      pollCookStep();
    } else {
      Serial.println("BTN: CONFIRMAR (ignored — no active session)");
    }
  }
  if (pollButton(btnSaltar)) {
    if (cookActive()) {
      postSkipStep();
      Serial.printf("BTN: SALTAR (session=%d)\n", cook.sessionId);
      pollCookStep();
    } else {
      Serial.println("BTN: SALTAR (ignored — no active session)");
    }
  }

  uint32_t now = millis();

  if (scale.is_ready()) {
    float raw = scale.get_units(1);
    if (!weightFilterInit || fabsf(raw - currentWeightG) > WEIGHT_JUMP_THRESHOLD_G) {
      currentWeightG    = raw;
      weightFilterInit = true;
    } else {
      currentWeightG = WEIGHT_EMA_ALPHA * raw + (1.0f - WEIGHT_EMA_ALPHA) * currentWeightG;
    }
  }

  // BLE notify is independent of addon HTTP — fires whenever a phone is
  // connected, even with WiFi offline. Throttled to 5 Hz inside the helper.
  bleNotifyWeight(currentWeightG);

  if (addonEnabled() && now - lastWeightPostMs > WEIGHT_POST_INTERVAL_MS) {
    if (fabsf(currentWeightG - lastSentWeightG) > WEIGHT_POST_DELTA_G) {
      postScaleWeight(currentWeightG);
      lastSentWeightG = currentWeightG;
    }
    lastWeightPostMs = now;
  }

  if (addonEnabled() && now - lastCookPollMs > COOK_POLL_INTERVAL_MS) {
    pollCookStep();
    lastCookPollMs = now;
  }

  static uint32_t lastDisplayMs = 0;
  if (!otaActive && now - lastDisplayMs > DISPLAY_REFRESH_MS) {
    renderDisplay();
    lastDisplayMs = now;
  }

  server.handleClient();
}
