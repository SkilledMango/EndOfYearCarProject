/*
 * CarStats OBD-II Scanner Firmware
 * Hardware : Waveshare ESP32-S3-RS485S-CAN (CAN transceiver built-in)
 * Protocol : OBD-II over CAN (ISO 15765-4, 500 kbps)
 *
 * The device runs as a WiFi Access Point — no router needed.
 * Connect your phone to the "CarStats-Scanner" WiFi network,
 * then the app can reach the device at http://192.168.4.1
 *
 * Endpoints:
 *   GET /status      — health check, uptime, simulation mode flag
 *   GET /live-data   — RPM, speed, coolant temp, fuel level, engine load
 *   GET /dtcs        — array of active DTC strings (e.g. ["P0300","P0420"])
 *
 * SIMULATION MODE:
 *   When no real car is connected (no CAN bus response), the firmware
 *   automatically falls back to returning realistic fake data so the app
 *   works perfectly for demos and presentations without a real vehicle.
 *
 *   To customise the demo data, edit the SIM_ constants below.
 */

// ─── Includes ────────────────────────────────────────────────────────────────
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "driver/twai.h"

// ─── WiFi Station config ──────────────────────────────────────────────────────
// ESP32 connects TO the phone's mobile hotspot.
// Phone keeps its internet connection the whole time.
#define HOTSPOT_SSID  "OrWifi"
#define HOTSPOT_PASS  "24681357"

// Static IP on Samsung hotspot subnet — always 192.168.148.100
IPAddress STATIC_IP(192, 168, 148, 100);
IPAddress GATEWAY  (192, 168, 148,   1);
IPAddress SUBNET   (255, 255, 255,   0);


// ─── CAN pin config (Waveshare ESP32-S3-RS485S-CAN) ──────────────────────────
#define CAN_TX_PIN  GPIO_NUM_5
#define CAN_RX_PIN  GPIO_NUM_4

// ─── OBD-II constants ────────────────────────────────────────────────────────
#define OBD_ECU_ID      0x7DF
#define PID_ENGINE_LOAD 0x04
#define PID_COOLANT_TEMP 0x05
#define PID_RPM          0x0C
#define PID_SPEED        0x0D
#define PID_FUEL_LEVEL   0x2F
#define MODE_GET_DTCS    0x03
#define OBD_TIMEOUT_MS   200
#define POLL_INTERVAL_MS 1000

// ─── SIMULATION MODE — edit these for your presentation ──────────────────────
// These values are shown when no real car is connected.
// Change them to whatever makes your demo look best.

#define SIM_RPM         2400        // engine revs (realistic idle-ish)
#define SIM_SPEED       0           // km/h (parked on a table)
#define SIM_COOLANT     92          // °C   (warmed up engine)
#define SIM_FUEL        34          // %    (low-ish, looks interesting)
#define SIM_LOAD        18          // %    (light load at idle)

// DTCs to show in simulation — add or remove codes here
// These must exist in your CarStats API's DiagnosticCodes table
const char* SIM_DTCS[] = { "P0300", "P0420" };
const int   SIM_DTC_COUNT = 2;

// ─── Global state ─────────────────────────────────────────────────────────────
WebServer server(80);
bool simMode = false;   // true when no real CAN response detected

struct LiveData {
  int  rpm            = 0;
  int  speedKmh       = 0;
  int  coolantCelsius = -40;
  int  fuelPercent    = 0;
  int  engineLoadPct  = 0;
  bool valid          = false;
  unsigned long lastUpdated = 0;
};

LiveData liveData;
unsigned long lastPollMs = 0;

// ─── Forward declarations ──────────────────────────────────────────────────────
bool  twaiInit();
bool  sendObdRequest(uint8_t mode, uint8_t pid);
bool  waitForObdReply(uint8_t mode, uint8_t pid, twai_message_t &out, unsigned long timeoutMs = OBD_TIMEOUT_MS);
int   readPidInt(uint8_t pid);
void  pollLiveData();
void  readDtcs(JsonArray &arr);
void  setCorsHeaders();
void  handleStatus();
void  handleLiveData();
void  handleDtcs();
String dtcBytesToString(uint8_t high, uint8_t low);

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(3000);   // wait for Serial Monitor to connect
  Serial.println("\n[CarStats] Booting...");

  // 1. Connect to phone hotspot in Station mode
  WiFi.mode(WIFI_STA);
  WiFi.config(STATIC_IP, GATEWAY, SUBNET);
  WiFi.begin(HOTSPOT_SSID, HOTSPOT_PASS);
  Serial.printf("[CarStats] Connecting to hotspot: %s\n", HOTSPOT_SSID);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[CarStats] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[CarStats] Could not connect to hotspot — check SSID/password");
  }

  // 2. Initialise TWAI (CAN) driver
  if (twaiInit()) {
    Serial.println("[CarStats] TWAI (CAN) initialised at 500 kbps");
  } else {
    Serial.println("[CarStats] TWAI init failed — simulation mode will activate");
  }

  // 3. Register HTTP routes
  server.on("/status",    HTTP_GET, handleStatus);
  server.on("/live-data", HTTP_GET, handleLiveData);
  server.on("/dtcs",      HTTP_GET, handleDtcs);
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      setCorsHeaders();
      server.send(204);
    } else {
      server.send(404, "application/json", "{\"error\":\"Not found\"}");
    }
  });

  server.begin();
  Serial.println("[CarStats] HTTP server started — ready");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
  server.handleClient();

  // Print WiFi status every 5 seconds
  static unsigned long lastStatusMs = 0;
  if (millis() - lastStatusMs >= 5000) {
    lastStatusMs = millis();
    int wifiStatus = WiFi.status();
    Serial.printf("[WiFi] status=%d  IP=%s  SSID=%s\n",
      wifiStatus,
      WiFi.localIP().toString().c_str(),
      WiFi.SSID().c_str()
    );
    // status codes: 3=CONNECTED, 1=NO_SSID, 4=WRONG_PASSWORD, 6=DISCONNECTED
  }

  // Respond to any message typed in Serial Monitor
  if (Serial.available()) {
    Serial.readStringUntil('\n'); // consume input
    Serial.printf("[STATUS] WiFi=%d  IP=%s  SSID=%s  uptime=%lus\n",
      WiFi.status(),
      WiFi.localIP().toString().c_str(),
      WiFi.SSID().c_str(),
      millis() / 1000
    );
  }

  if (millis() - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = millis();
    pollLiveData();
  }
}

// ─── TWAI initialisation ──────────────────────────────────────────────────────
bool twaiInit() {
  twai_general_config_t gConfig = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  twai_timing_config_t  tConfig = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t  fConfig = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&gConfig, &tConfig, &fConfig) != ESP_OK) return false;
  if (twai_start() != ESP_OK) return false;
  return true;
}

// ─── OBD-II helpers ───────────────────────────────────────────────────────────
bool sendObdRequest(uint8_t mode, uint8_t pid) {
  twai_message_t msg = {};
  msg.identifier       = OBD_ECU_ID;
  msg.data_length_code = 8;
  msg.extd             = 0;

  if (mode == MODE_GET_DTCS) {
    msg.data[0] = 0x01;
    msg.data[1] = mode;
    for (int i = 2; i < 8; i++) msg.data[i] = 0x55;
  } else {
    msg.data[0] = 0x02;
    msg.data[1] = mode;
    msg.data[2] = pid;
    for (int i = 3; i < 8; i++) msg.data[i] = 0x55;
  }
  return (twai_transmit(&msg, pdMS_TO_TICKS(50)) == ESP_OK);
}

bool waitForObdReply(uint8_t mode, uint8_t pid, twai_message_t &out, unsigned long timeoutMs) {
  unsigned long deadline = millis() + timeoutMs;
  while (millis() < deadline) {
    twai_message_t rx = {};
    if (twai_receive(&rx, pdMS_TO_TICKS(10)) != ESP_OK) continue;
    if (rx.identifier < 0x7E8 || rx.identifier > 0x7EF) continue;
    uint8_t responseMode = mode + 0x40;
    if (rx.data[1] != responseMode) continue;
    if (mode != MODE_GET_DTCS && rx.data[2] != pid) continue;
    out = rx;
    return true;
  }
  return false;
}

int readPidInt(uint8_t pid) {
  if (!sendObdRequest(0x01, pid)) return -1;
  twai_message_t reply;
  if (!waitForObdReply(0x01, pid, reply)) return -1;
  uint8_t A = reply.data[3];
  uint8_t B = reply.data[4];
  switch (pid) {
    case PID_RPM:          return ((A * 256) + B) / 4;
    case PID_SPEED:        return A;
    case PID_COOLANT_TEMP: return (int)A - 40;
    case PID_FUEL_LEVEL:   return (A * 100) / 255;
    case PID_ENGINE_LOAD:  return (A * 100) / 255;
    default:               return A;
  }
}

// ─── Live data polling ────────────────────────────────────────────────────────
void pollLiveData() {
  int rpm = readPidInt(PID_RPM);

  if (rpm >= 0) {
    // ── Real car responding ──
    simMode = false;
    liveData.rpm            = rpm;
    int speed   = readPidInt(PID_SPEED);
    int coolant = readPidInt(PID_COOLANT_TEMP);
    int fuel    = readPidInt(PID_FUEL_LEVEL);
    int load    = readPidInt(PID_ENGINE_LOAD);
    liveData.speedKmh       = (speed   >= 0) ? speed   : liveData.speedKmh;
    liveData.coolantCelsius = (coolant >= 0) ? coolant : liveData.coolantCelsius;
    liveData.fuelPercent    = (fuel    >= 0) ? fuel    : liveData.fuelPercent;
    liveData.engineLoadPct  = (load    >= 0) ? load    : liveData.engineLoadPct;
    liveData.valid          = true;
    liveData.lastUpdated    = millis();
    Serial.printf("[OBD] REAL  RPM=%d  Speed=%d  Coolant=%d°C  Fuel=%d%%  Load=%d%%\n",
                  liveData.rpm, liveData.speedKmh, liveData.coolantCelsius,
                  liveData.fuelPercent, liveData.engineLoadPct);
  } else {
    // ── No car — use simulation values ──
    simMode = true;
    liveData.rpm            = SIM_RPM;
    liveData.speedKmh       = SIM_SPEED;
    liveData.coolantCelsius = SIM_COOLANT;
    liveData.fuelPercent    = SIM_FUEL;
    liveData.engineLoadPct  = SIM_LOAD;
    liveData.valid          = true;
    liveData.lastUpdated    = millis();
    Serial.println("[OBD] SIM   No CAN response — returning simulated data");
  }
}

// ─── DTC reading ──────────────────────────────────────────────────────────────
void readDtcs(JsonArray &arr) {
  if (simMode) {
    // Return the pre-defined simulation DTCs
    for (int i = 0; i < SIM_DTC_COUNT; i++) {
      arr.add(SIM_DTCS[i]);
    }
    return;
  }

  // Real car — Mode 03 request
  if (!sendObdRequest(MODE_GET_DTCS, 0x00)) return;
  twai_message_t reply;
  if (!waitForObdReply(MODE_GET_DTCS, 0x00, reply, 500)) return;

  uint8_t numDtcs = reply.data[2];
  for (int i = 0; i < numDtcs && i < 2; i++) {
    uint8_t high = reply.data[3 + i * 2];
    uint8_t low  = reply.data[4 + i * 2];
    if (high == 0 && low == 0) continue;
    arr.add(dtcBytesToString(high, low));
  }
}

String dtcBytesToString(uint8_t high, uint8_t low) {
  char type;
  switch ((high >> 6) & 0x03) {
    case 0:  type = 'P'; break;
    case 1:  type = 'C'; break;
    case 2:  type = 'B'; break;
    default: type = 'U'; break;
  }
  char buf[8];
  snprintf(buf, sizeof(buf), "%c%X%X%02X", type, (high >> 4) & 0x03, high & 0x0F, low);
  return String(buf);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
void setCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── HTTP handlers ─────────────────────────────────────────────────────────────

void handleStatus() {
  setCorsHeaders();
  StaticJsonDocument<256> doc;
  doc["device"]        = "carstats-scanner";
  doc["ssid"]          = HOTSPOT_SSID;
  doc["ip"]            = WiFi.localIP().toString();
  doc["uptimeSeconds"] = millis() / 1000;
  doc["simMode"]       = simMode;
  doc["connected"]     = (WiFi.status() == WL_CONNECTED);
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

void handleLiveData() {
  setCorsHeaders();
  StaticJsonDocument<256> doc;
  doc["rpm"]            = liveData.rpm;
  doc["speedKmh"]       = liveData.speedKmh;
  doc["coolantCelsius"] = liveData.coolantCelsius;
  doc["fuelPercent"]    = liveData.fuelPercent;
  doc["engineLoadPct"]  = liveData.engineLoadPct;
  doc["valid"]          = liveData.valid;
  doc["simMode"]        = simMode;
  doc["ageMs"]          = (long)(millis() - liveData.lastUpdated);
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

void handleDtcs() {
  setCorsHeaders();
  StaticJsonDocument<512> doc;
  JsonArray codes = doc.createNestedArray("codes");
  readDtcs(codes);
  doc["simMode"] = simMode;
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}
