// ============================================================================
// stock-manager — ESP32 Smart Scale (standalone hardware test)
// ============================================================================
// Standalone firmware to validate the load cell, HX711 amplifier, 3 buttons
// and SSD1306 OLED before adding any Home Assistant integration. Hosts a
// local web UI on the ESP32 showing live weight, button press counters, and
// tare/calibration controls. Includes ArduinoOTA so subsequent flashes can
// happen over WiFi without re-attaching the USB cable.
//
// ---------------------------------------------------------------------------
// Wiring (ESP32 DevKitC / WROOM-32)
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
//   3-pin button module (KY-004 style — built-in pullup, active LOW)
//   ----------------------------------------------------------------
//   -   (GND)     ---->  GND
//   +   (VCC)     ---->  3.3V
//   S   (Signal)  ---->  GPIO 25 (TARE) / 26 (CONSUMO) / 27 (NUEVO LOTE)
//
//   With only one physical button, leave - and + connected and move the
//   Signal wire between GPIOs 25/26/27 to test each role. If your module
//   is active-HIGH (signal goes HIGH when pressed), set BUTTON_PRESSED_STATE
//   in config below to HIGH — no other change needed.
//
//   SSD1306 OLED 0.96" (I2C, 128x64)    ESP32
//   --------------------------------    -----
//   GND  ---->                          GND
//   VCC  ---->                          3.3V
//   SCL  ---->                          GPIO 22  (default I2C clock)
//   SDA  ---->                          GPIO 21  (default I2C data)
//
// NOTE: On ESP32-WROVER boards GPIO 16/17 are wired to internal PSRAM and
// unusable. If you have a WROVER, change HX711 DT to GPIO 32 and SCK to 33.
//
// NOTE: Some SSD1306 modules use I2C address 0x3D instead of the default 0x3C.
// If the OLED stays blank, change OLED_ADDR below to 0x3D.
//
// ---------------------------------------------------------------------------
// Setup (first flash — over USB)
// ---------------------------------------------------------------------------
// 1. Arduino IDE -> Boards Manager -> install "ESP32 by Espressif Systems".
// 2. Library Manager -> install:
//      - "HX711 Arduino Library" by Bogdan Necula
//      - "Adafruit GFX Library" by Adafruit
//      - "Adafruit SSD1306"      by Adafruit
//    (ArduinoOTA + Wire ship with the ESP32 board package — no extra install.)
// 3. Copy secrets.h.example to secrets.h and fill in your WiFi credentials.
// 4. Select board "ESP32 Dev Module", flash over USB the first time.
// 5. Open Serial Monitor @ 115200 baud — it prints the assigned IP after WiFi.
// 6. Open http://<ip>/ (or http://scale-test.local/) on any device on the LAN.
// 7. Calibrate: tare empty, place a known weight, type the grams in the input,
//    hit "Calibrar". Done.
//
// ---------------------------------------------------------------------------
// Subsequent flashes (OTA — no cable)
// ---------------------------------------------------------------------------
// In Arduino IDE: Tools -> Port -> "scale-test at <ip>" (under Network ports).
// If it doesn't show up, restart the IDE or wait a few seconds for mDNS.
// Flash normally — the IDE pushes the new binary over WiFi. The OLED shows
// upload progress in real time.
// Set OTA_PASSWORD in secrets.h if you want password-protected updates
// (recommended when leaving the device deployed long-term).
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HX711.h>

#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD, OTA_PASSWORD — gitignored

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
#define OTA_HOSTNAME   "scale-test"

constexpr uint8_t PIN_HX711_DT  = 16;
constexpr uint8_t PIN_HX711_SCK = 17;

constexpr uint8_t PIN_BTN_TARE    = 25;
constexpr uint8_t PIN_BTN_CONSUMO = 26;
constexpr uint8_t PIN_BTN_NUEVO   = 27;

constexpr uint8_t  OLED_W       = 128;
constexpr uint8_t  OLED_H       = 64;
constexpr uint8_t  OLED_ADDR    = 0x3C;   // try 0x3D if blank
constexpr int8_t   OLED_RESET   = -1;     // shared reset line, none

constexpr uint8_t  BUTTON_PRESSED_STATE = LOW;  // KY-004 default; set HIGH for active-high modules

constexpr uint32_t DEBOUNCE_MS             = 50;
constexpr uint32_t DISPLAY_REFRESH_MS      = 100;
constexpr uint32_t WEIGHT_POST_INTERVAL_MS = 3000;   // min interval between addon weight POSTs
constexpr float    WEIGHT_POST_DELTA_G     = 3.0f;   // only POST if change >= 3g vs last sent
constexpr uint16_t ADDON_HTTP_TIMEOUT_MS   = 2000;
constexpr float    INITIAL_CAL_FACTOR      = 1.0f;   // uncalibrated — set via web UI
constexpr float    WEIGHT_EMA_ALPHA        = 0.1f;   // EMA weight: smaller = smoother but more lag (0.05 very smooth, 0.2 snappy)
constexpr float    WEIGHT_JUMP_THRESHOLD_G = 10.0f;  // bypass filter on real load placement / removal

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
HX711 scale;
WebServer server(80);
Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, OLED_RESET);

float currentWeightG    = 0.0f;
float calibrationFactor = INITIAL_CAL_FACTOR;

bool    oledReady    = false;
bool    otaActive    = false;
uint8_t otaPercent   = 0;

float    lastSentWeightG = 0.0f;
uint32_t lastWeightPostMs = 0;

bool     weightFilterInit = false;

struct Button {
  uint8_t  pin;
  bool     lastReading;
  bool     stableState;
  uint32_t lastChangeMs;
  uint32_t pressCount;
  uint32_t lastPressMs;
};

Button btnTare    = { PIN_BTN_TARE,    HIGH, HIGH, 0, 0, 0 };
Button btnConsumo = { PIN_BTN_CONSUMO, HIGH, HIGH, 0, 0, 0 };
Button btnNuevo   = { PIN_BTN_NUEVO,   HIGH, HIGH, 0, 0, 0 };

// Debounced edge detector — returns true once per press (HIGH -> LOW transition).
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

// ---------------------------------------------------------------------------
// Weight sampling — non-blocking EMA filter with big-jump bypass
// ---------------------------------------------------------------------------
// Each fresh sample is blended into currentWeightG via an exponential moving
// average. Tiny per-sample noise gets washed out. When the new reading
// differs from the filtered value by more than WEIGHT_JUMP_THRESHOLD_G we
// assume a real load was placed/removed and snap to the raw value so the
// scale stays responsive.
void resetWeightFilter(float seed) {
  currentWeightG   = seed;
  weightFilterInit = true;
}

// ---------------------------------------------------------------------------
// OLED rendering
// ---------------------------------------------------------------------------
void setupDisplay() {
  Wire.begin();  // ESP32 defaults: SDA=21, SCL=22
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.printf("OLED not found at 0x%02X — display disabled\n", OLED_ADDR);
    return;
  }
  oledReady = true;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println("scale-test");
  oled.println("booting...");
  oled.display();
  Serial.println("OLED ready");
}

void drawStatusLine(const char* status) {
  if (!oledReady) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println("scale-test");
  oled.setTextSize(2);
  oled.setCursor(0, 22);
  oled.println(status);
  oled.display();
}

void renderDisplay() {
  if (!oledReady) return;

  oled.clearDisplay();

  // ---- OTA mode: progress bar fills the screen ----
  if (otaActive) {
    oled.setTextSize(2);
    oled.setCursor(0, 8);
    oled.printf("OTA %u%%", otaPercent);
    oled.drawRect(0, 44, OLED_W, 14, SSD1306_WHITE);
    oled.fillRect(2, 46, (OLED_W - 4) * otaPercent / 100, 10, SSD1306_WHITE);
    oled.display();
    return;
  }

  // ---- Top bar: IP or wifi status ----
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  if (WiFi.status() == WL_CONNECTED) {
    oled.print(WiFi.localIP().toString());
  } else {
    oled.print("WiFi: down");
  }
  oled.drawFastHLine(0, 10, OLED_W, SSD1306_WHITE);

  // ---- Middle: big weight number, centered ----
  char buf[12];
  snprintf(buf, sizeof(buf), "%.1f", currentWeightG);
  int textWidth = (int)strlen(buf) * 18;          // size 3 = 18 px / char
  int x = (OLED_W - textWidth - 12) / 2;          // leave 12 px for " g"
  if (x < 0) x = 0;
  oled.setTextSize(3);
  oled.setCursor(x, 18);
  oled.print(buf);
  oled.setTextSize(1);
  oled.setCursor(x + textWidth + 2, 34);
  oled.print("g");

  // ---- Bottom: button counters ----
  oled.setTextSize(1);
  oled.setCursor(0, 56);
  oled.printf("T:%lu C:%lu N:%lu",
              (unsigned long)btnTare.pressCount,
              (unsigned long)btnConsumo.pressCount,
              (unsigned long)btnNuevo.pressCount);

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
<title>ESP32 Scale Test</title>
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
  .grid { display:grid; grid-template-columns:repeat(3,1fr);
          gap:.5rem; margin:1rem 0; }
  .btn-card { background:#1c1c1c; border-radius:10px; padding:.75rem;
              text-align:center; transition:background .3s; }
  .btn-card .name { font-size:.7rem; opacity:.55; text-transform:uppercase;
                    letter-spacing:.05em; }
  .btn-card .count { font-size:1.5rem; font-weight:700; margin-top:.25rem;
                     font-variant-numeric:tabular-nums; }
  .btn-card.hit { background:#2a4d2a; }
  .actions { display:grid; gap:.5rem; }
  button { background:#2c5282; color:#fff; border:0; padding:.85rem;
           border-radius:10px; font-size:1rem; cursor:pointer; }
  button.secondary { background:#444; }
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
  <h1>ESP32 Scale — Test Console</h1>

  <div class="weight"><span id="weight">--</span><small>g</small></div>

  <div class="grid">
    <div class="btn-card" id="bt-tare">
      <div class="name">Tare</div>
      <div class="count" id="c-tare">0</div>
    </div>
    <div class="btn-card" id="bt-consumo">
      <div class="name">Consumo</div>
      <div class="count" id="c-consumo">0</div>
    </div>
    <div class="btn-card" id="bt-nuevo">
      <div class="name">Nuevo lote</div>
      <div class="count" id="c-nuevo">0</div>
    </div>
  </div>

  <div class="actions">
    <button onclick="doTare()">Tare (zero)</button>
    <div class="row">
      <input type="number" id="known" placeholder="Peso conocido (g)" step="0.1">
      <button class="secondary" onclick="doCalibrate()">Calibrar</button>
    </div>
  </div>

  <div class="meta">
    raw: <span id="raw">--</span> &middot; factor: <span id="factor">--</span>
  </div>

<script>
const prev = { tare:0, consumo:0, nuevo:0 };

async function poll() {
  try {
    const r = await fetch('/api/state');
    const s = await r.json();
    document.getElementById('weight').textContent = s.weight_g.toFixed(1);
    document.getElementById('raw').textContent = s.raw;
    document.getElementById('factor').textContent = s.factor.toFixed(2);
    flash('tare', s.tare_count);
    flash('consumo', s.consumo_count);
    flash('nuevo', s.nuevo_count);
  } catch (e) {}
}

function flash(name, count) {
  document.getElementById('c-' + name).textContent = count;
  if (count !== prev[name]) {
    const card = document.getElementById('bt-' + name);
    card.classList.add('hit');
    setTimeout(() => card.classList.remove('hit'), 300);
    prev[name] = count;
  }
}

async function doTare() {
  await fetch('/api/tare', { method: 'POST' });
}

async function doCalibrate() {
  const g = parseFloat(document.getElementById('known').value);
  if (!g || g <= 0) { alert('Peso inválido'); return; }
  const r = await fetch('/api/calibrate?known_g=' + g, { method: 'POST' });
  const s = await r.json();
  alert(s.ok ? ('Calibrado. Factor: ' + s.factor.toFixed(2)) : ('Error: ' + s.error));
}

setInterval(poll, 250);
poll();
</script>
</body>
</html>
)HTML";

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------
void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleState() {
  long raw = scale.is_ready() ? scale.read_average(1) : 0;
  String json = "{";
  json += "\"weight_g\":" + String(currentWeightG, 1);
  json += ",\"raw\":" + String(raw);
  json += ",\"factor\":" + String(calibrationFactor, 2);
  json += ",\"tare_count\":" + String(btnTare.pressCount);
  json += ",\"consumo_count\":" + String(btnConsumo.pressCount);
  json += ",\"nuevo_count\":" + String(btnNuevo.pressCount);
  json += "}";
  server.send(200, "application/json", json);
}

void handleTare() {
  scale.tare(10);
  resetWeightFilter(scale.is_ready() ? scale.get_units(3) : 0.0f);
  lastSentWeightG = currentWeightG;
  Serial.println("Tare via web");
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
  Serial.printf("Calibrated: factor=%.4f (raw=%ld, known=%.1fg)\n",
                calibrationFactor, reading, knownG);
  String resp = "{\"ok\":true,\"factor\":" + String(calibrationFactor, 4) + "}";
  server.send(200, "application/json", resp);
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
    Serial.println("\nOTA: update finished");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    uint8_t pct = (uint8_t)(progress * 100UL / total);
    if (pct != otaPercent) {
      otaPercent = pct;
      renderDisplay();
    }
    Serial.printf("OTA: %u%%\r", pct);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    otaActive = false;
    Serial.printf("OTA error[%u]: ", error);
    if      (error == OTA_AUTH_ERROR)    Serial.println("auth failed");
    else if (error == OTA_BEGIN_ERROR)   Serial.println("begin failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("connect failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("receive failed");
    else if (error == OTA_END_ERROR)     Serial.println("end failed");
  });

  ArduinoOTA.begin();
  Serial.printf("OTA ready — hostname: %s.local\n", OTA_HOSTNAME);
}

// ---------------------------------------------------------------------------
// Stock Manager addon integration — HTTP webhooks
// ---------------------------------------------------------------------------
// The addon's API listens on port 8099 directly (NOT through HA's ingress).
// ADDON_BASE_URL + SCALE_ID come from secrets.h. Leave ADDON_BASE_URL empty
// to run fully standalone (web UI only, no posts).

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

void postScaleEvent(const char* type, float weight_g) {
  if (!addonEnabled()) return;
  String url  = String(ADDON_BASE_URL) + "/api/scales/" + String(SCALE_ID) + "/event";
  String body = "{\"type\":\"" + String(type) + "\",\"weight_g\":" + String(weight_g, 1) + "}";
  bool ok = postJson(url, body);
  Serial.printf("POST event %s (%.1fg) -> %s\n", type, weight_g, ok ? "ok" : "FAIL");
}

void postScaleWeight(float weight_g) {
  if (!addonEnabled()) return;
  String url  = String(ADDON_BASE_URL) + "/api/scales/" + String(SCALE_ID) + "/weight";
  String body = "{\"weight_g\":" + String(weight_g, 1) + "}";
  postJson(url, body);
}

// ---------------------------------------------------------------------------
// Setup / Loop
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== ESP32 Scale Test — starting ===");

  setupDisplay();

  pinMode(PIN_BTN_TARE,    INPUT_PULLUP);
  pinMode(PIN_BTN_CONSUMO, INPUT_PULLUP);
  pinMode(PIN_BTN_NUEVO,   INPUT_PULLUP);
  // Capture each pin's resting state so polarity doesn't matter for the debouncer.
  btnTare.lastReading    = btnTare.stableState    = digitalRead(PIN_BTN_TARE);
  btnConsumo.lastReading = btnConsumo.stableState = digitalRead(PIN_BTN_CONSUMO);
  btnNuevo.lastReading   = btnNuevo.stableState   = digitalRead(PIN_BTN_NUEVO);

  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.set_scale(calibrationFactor);
  scale.tare(10);
  Serial.println("HX711 ready");

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

  server.on("/", handleRoot);
  server.on("/api/state", handleState);
  server.on("/api/tare", HTTP_POST, handleTare);
  server.on("/api/calibrate", HTTP_POST, handleCalibrate);
  server.begin();
  Serial.println("HTTP server up on :80");
}

void loop() {
  ArduinoOTA.handle();

  if (pollButton(btnTare)) {
    scale.tare(10);
    resetWeightFilter(scale.is_ready() ? scale.get_units(3) : 0.0f);
    postScaleEvent("tare", currentWeightG);
    lastSentWeightG = currentWeightG;  // resync so the weight POST doesn't immediately fire
    Serial.println("BTN: TARE");
  }
  if (pollButton(btnConsumo)) {
    postScaleEvent("consumo", currentWeightG);
    lastSentWeightG = currentWeightG;
    Serial.println("BTN: CONSUMO");
  }
  if (pollButton(btnNuevo)) {
    postScaleEvent("nuevo_lote", currentWeightG);
    lastSentWeightG = currentWeightG;
    Serial.println("BTN: NUEVO_LOTE");
  }

  uint32_t now = millis();

  // Consume every fresh HX711 sample (is_ready() throttles naturally at the
  // chip's SPS rate). Big jumps bypass the EMA so real load changes show up
  // immediately; small per-sample noise gets smoothed away.
  if (scale.is_ready()) {
    float raw = scale.get_units(1);
    if (!weightFilterInit || fabsf(raw - currentWeightG) > WEIGHT_JUMP_THRESHOLD_G) {
      currentWeightG    = raw;
      weightFilterInit = true;
    } else {
      currentWeightG = WEIGHT_EMA_ALPHA * raw + (1.0f - WEIGHT_EMA_ALPHA) * currentWeightG;
    }
  }

  if (addonEnabled() && now - lastWeightPostMs > WEIGHT_POST_INTERVAL_MS) {
    if (abs(currentWeightG - lastSentWeightG) > WEIGHT_POST_DELTA_G) {
      postScaleWeight(currentWeightG);
      lastSentWeightG = currentWeightG;
    }
    lastWeightPostMs = now;
  }

  static uint32_t lastDisplayMs = 0;
  if (!otaActive && now - lastDisplayMs > DISPLAY_REFRESH_MS) {
    renderDisplay();
    lastDisplayMs = now;
  }

  server.handleClient();
}
