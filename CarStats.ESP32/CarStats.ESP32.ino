/*
 * CarStats OBD-II Scanner Firmware
 * Hardware : Waveshare ESP32-S3-RS485S-CAN (CAN transceiver built-in)
 * Protocol : OBD-II over CAN (ISO 15765-4, 500 kbps)
 *
 * The device joins a phone's mobile hotspot, so the phone keeps its internet.
 * Which hotspot is saved in flash, not in this file — so it works with any
 * phone without reflashing:
 *   - At boot it tries the saved hotspot for 20 seconds.
 *   - If it can't find it — or loses it for 45 seconds later on — it opens its
 *     own open WiFi network "CarStats-Setup" (the scanner is 192.168.4.1 there).
 *     The app's "Connect scanner" wizard joins it and sends the new hotspot's
 *     name and password; a phone without the app gets a setup page instead.
 *     Either way the scanner restarts and joins that hotspot.
 *   - On any hotspot it takes the same spot: address .100 of that network
 *     (or the last address on small networks, like an iPhone's 172.20.10.14),
 *     so the app's "Find scanner" button only has to check one address per network.
 *
 * Endpoints:
 *   GET  /status      — health check, uptime, simulation mode flag (also in setup mode)
 *   GET  /live-data   — RPM, speed, coolant temp, fuel level, engine load
 *   GET  /dtcs        — array of active DTC strings (e.g. ["P0300","P0420"])
 *   POST /hotspot     — {"ssid","pass"}: save a new hotspot and restart onto it (also in setup mode)
 *   POST /forget-wifi — forget the saved hotspot and reopen the setup network
 *
 * Once a minute on a hotspot it also tells the CarStats server its local address
 * (POST api/scanner/announce), so the app finds it with nothing to type.
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
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "driver/twai.h"

// ─── WiFi config ──────────────────────────────────────────────────────────────
// First-boot defaults only — used until a hotspot is saved from the setup page.
#define DEFAULT_HOTSPOT_SSID  "OrWifi"
#define DEFAULT_HOTSPOT_PASS  "24681357"

#define SETUP_AP_SSID       "CarStats-Setup"   // open network the setup page lives on
#define HOTSPOT_CONNECT_MS  20000              // how long boot waits for the saved hotspot
#define SETUP_RETRY_MS      30000              // setup mode re-tries the saved hotspot this often
#define HOTSPOT_LOST_MS     45000              // hotspot gone this long → restart, which opens setup mode
#define SCANNER_HOST_OCTET  100                // the .100 spot taken on every hotspot

// The scanner tells the CarStats server where it is on the hotspot, so the app
// finds it with no address to type (hotspot networks change between phones).
#define ANNOUNCE_URL        "https://carproject.somee.com/api/scanner/announce"
#define ANNOUNCE_EVERY_MS   60000


// ─── CAN pin config (Waveshare ESP32-S3-RS485S-CAN) ──────────────────────────
// Verified from Waveshare schematic: CAN transceiver (SN65HVD230) is wired
// to GPIO15 (TX) and GPIO16 (RX) on this board.
#define CAN_TX_PIN  GPIO_NUM_15
#define CAN_RX_PIN  GPIO_NUM_16

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

// ─── WiFi / setup state ───────────────────────────────────────────────────────
Preferences   prefs;                  // flash storage for the saved hotspot
DNSServer     dnsServer;              // setup mode: answers every name with our own address
String        hotspotSsid;
String        hotspotPass;
bool          setupMode        = false;
unsigned long lastSetupRetryMs = 0;
unsigned long restartAtMs      = 0;   // non-zero = restart then (lets the HTTP reply go out first)
unsigned long wifiLostSinceMs  = 0;   // non-zero = the hotspot dropped at this time
unsigned long lastAnnounceMs   = 0;   // last time the server was told our address
String        setupNetworksHtml;      // nearby networks, listed as buttons on the setup page

// ─── VIN cache ────────────────────────────────────────────────────────────────
// VIN is read once per real-car session and cached.  Cleared when car disconnects.
String  cachedVin       = "";
bool    vinAttempted    = false;

// ─── CAN diagnostics (readable via GET /debug) ────────────────────────────────
struct CanDiag {
  int  lastTxErr        = 0;   // esp_err_t from last twai_transmit
  int  twaiState        = -1;  // TWAI_STATE_* from last status check
  int  txErrCounter     = 0;   // hardware TX error counter
  int  rxErrCounter     = 0;   // hardware RX error counter
  int  framesLastPoll   = 0;   // raw CAN frames received in last poll
  int  obdFramesTotal   = 0;   // total frames that matched OBD-II filter
  unsigned long lastRxMs = 0;  // millis() when last frame arrived
  char lastRxFrame[48]  = "none"; // hex dump of last received frame
} canDiag;

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
bool   twaiInit();
bool   sendObdRequest(uint8_t mode, uint8_t pid);
bool   waitForObdReply(uint8_t mode, uint8_t pid, twai_message_t &out, unsigned long timeoutMs = OBD_TIMEOUT_MS);
int    readPidInt(uint8_t pid);
String readVin();
void   pollLiveData();
void   readDtcs(JsonArray &arr);
void   setCorsHeaders();
void   handleStatus();
void   handleLiveData();
void   handleDtcs();
void   handleDebug();
void   handleVin();
void   handleForgetWifi();
void   handleHotspot();
void   handleSetupStatus();
String hotspotError(const String &ssid, const String &pass);
void   applyHotspot(const String &ssid, const String &pass);
void   announceToServer();
String dtcBytesToString(uint8_t high, uint8_t low);

void      loadHotspotCreds();
void      saveHotspotCreds(const String &ssid, const String &pass);
bool      connectToHotspot(unsigned long timeoutMs);
IPAddress scannerAddressFor(IPAddress ip, IPAddress mask);
void      startNormalMode();
void      startSetupMode();
void      handleSetupPage();
void      handleSetupSave();
String    htmlEscape(const String &s);

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(3000);   // wait for Serial Monitor to connect
  Serial.println("\n[CarStats] Booting...");

  // 1. Join the saved hotspot — or open the setup network if it isn't around
  loadHotspotCreds();
  WiFi.mode(WIFI_STA);
  if (!connectToHotspot(HOTSPOT_CONNECT_MS)) {
    Serial.println("[CarStats] Saved hotspot not found — opening the setup network");
    startSetupMode();
    return;   // no OBD in setup mode; the scanner restarts once a hotspot is saved
  }

  // 2. Initialise TWAI (CAN) driver
  if (twaiInit()) {
    Serial.println("[CarStats] TWAI (CAN) initialised at 500 kbps");
  } else {
    Serial.println("[CarStats] TWAI init failed — simulation mode will activate");
  }

  // 3. Register HTTP routes
  startNormalMode();
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
  server.handleClient();

  // A handler asked for a restart (hotspot saved or forgotten) — the reply has gone out
  if (restartAtMs != 0 && millis() >= restartAtMs) {
    Serial.println("[CarStats] Restarting...");
    delay(100);
    ESP.restart();
  }

  if (setupMode) {
    dnsServer.processNextRequest();

    // Keep trying the saved hotspot in the background, so turning the hotspot on
    // later is enough. Only while nobody is on the setup page: a connection
    // attempt makes the setup network drop for a moment.
    if (!hotspotSsid.isEmpty()
        && WiFi.softAPgetStationNum() == 0
        && millis() - lastSetupRetryMs >= SETUP_RETRY_MS) {
      lastSetupRetryMs = millis();
      WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);   // DHCP
      WiFi.begin(hotspotSsid.c_str(), hotspotPass.c_str());
    }
    if (WiFi.status() == WL_CONNECTED) {
      // Found it — restart into normal mode, which also claims the .100 address
      Serial.println("[Setup] Saved hotspot is back — restarting into normal mode");
      delay(200);
      ESP.restart();
    }
    return;
  }

  // Hotspot gone for a while (phone switched it off, or the scanner moved to a
  // new car/phone) — restart. If the hotspot is still missing after the restart,
  // the scanner opens the setup network, so a new phone can take it over
  // without anyone unplugging it.
  if (WiFi.status() == WL_CONNECTED) {
    wifiLostSinceMs = 0;
  } else if (wifiLostSinceMs == 0) {
    wifiLostSinceMs = millis();
  } else if (millis() - wifiLostSinceMs >= HOTSPOT_LOST_MS) {
    Serial.println("[WiFi] Hotspot lost — restarting");
    delay(100);
    ESP.restart();
  }

  // Tell the server where we are — right after joining, then once a minute
  if (WiFi.status() == WL_CONNECTED
      && (lastAnnounceMs == 0 || millis() - lastAnnounceMs >= ANNOUNCE_EVERY_MS)) {
    lastAnnounceMs = millis();
    announceToServer();
  }

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

  esp_err_t txResult = twai_transmit(&msg, pdMS_TO_TICKS(50));
  canDiag.lastTxErr = (int)txResult;

  if (txResult != ESP_OK) {
    twai_status_info_t info;
    if (twai_get_status_info(&info) == ESP_OK) {
      canDiag.twaiState    = (int)info.state;
      canDiag.txErrCounter = info.tx_error_counter;
      canDiag.rxErrCounter = info.rx_error_counter;
      Serial.printf("[CAN] TX FAILED err=%d  state=%d  TXerr=%d  RXerr=%d\n",
        (int)txResult, (int)info.state,
        info.tx_error_counter, info.rx_error_counter);
      if (info.state == TWAI_STATE_BUS_OFF) {
        Serial.println("[CAN] BUS-OFF — recovering (check wiring + GPIO pins)");
        twai_initiate_recovery();
      }
    }
    return false;
  }
  return true;
}

bool waitForObdReply(uint8_t mode, uint8_t pid, twai_message_t &out, unsigned long timeoutMs) {
  unsigned long deadline = millis() + timeoutMs;
  int framesReceived = 0;

  while (millis() < deadline) {
    twai_message_t rx = {};
    if (twai_receive(&rx, pdMS_TO_TICKS(10)) != ESP_OK) continue;

    framesReceived++;
    // Save the last received frame for /debug endpoint
    canDiag.lastRxMs = millis();
    snprintf(canDiag.lastRxFrame, sizeof(canDiag.lastRxFrame),
      "0x%03lX: %02X %02X %02X %02X %02X %02X %02X %02X",
      (unsigned long)rx.identifier,
      rx.data[0], rx.data[1], rx.data[2], rx.data[3],
      rx.data[4], rx.data[5], rx.data[6], rx.data[7]);
    // Log the first 4 frames received each call so we can see what the car is sending
    if (framesReceived <= 4) {
      Serial.printf("[CAN] RX %s\n", canDiag.lastRxFrame);
    }

    if (rx.identifier < 0x7E8 || rx.identifier > 0x7EF) continue;
    uint8_t responseMode = mode + 0x40;
    if (rx.data[1] != responseMode) continue;
    if (mode != MODE_GET_DTCS && rx.data[2] != pid) continue;
    out = rx;
    canDiag.obdFramesTotal++;
    canDiag.framesLastPoll = framesReceived;
    return true;
  }

  canDiag.framesLastPoll = framesReceived;

  // Help diagnose: did we get *any* frames from the car?
  static unsigned long lastDiagMs = 0;
  if (millis() - lastDiagMs >= 5000) {
    lastDiagMs = millis();
    if (framesReceived == 0) {
      Serial.println("[CAN] No frames received — check: OBD plugged in? Engine on? CAN wires?");
    } else {
      Serial.printf("[CAN] Got %d frame(s) but none matched OBD-II filter (0x7E8-0x7EF)\n", framesReceived);
    }
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

// ─── Fuel level — longer timeout + retries because some ECUs respond slowly ───
int readFuelPercent() {
  for (int attempt = 0; attempt < 3; attempt++) {
    if (!sendObdRequest(0x01, PID_FUEL_LEVEL)) continue;
    twai_message_t reply;
    if (waitForObdReply(0x01, PID_FUEL_LEVEL, reply, 500)) {
      uint8_t A = reply.data[3];
      return (A * 100) / 255;
    }
    delay(30); // brief pause before retry
  }
  return -1; // car doesn't support this PID
}

// ─── Live data polling ────────────────────────────────────────────────────────
void pollLiveData() {
  int rpm = readPidInt(PID_RPM);

  if (rpm >= 0) {
    // ── Real car responding ──
    // If we just left sim mode, clear out any stuck simulation values
    if (simMode) {
      liveData.fuelPercent    = -1;  // -1 = "not yet read from car"
      liveData.speedKmh       = 0;
      liveData.coolantCelsius = -40;
      liveData.engineLoadPct  = 0;
    }
    simMode = false;
    liveData.rpm            = rpm;
    int speed   = readPidInt(PID_SPEED);
    int coolant = readPidInt(PID_COOLANT_TEMP);
    int fuel    = readFuelPercent();  // uses longer timeout + retries
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
    if (!simMode) {
      // Car just disconnected — clear VIN cache so we re-read on next connection
      cachedVin    = "";
      vinAttempted = false;
    }
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

// ─── VIN reading — Service 09 PID 02, ISO-TP multi-frame ─────────────────────
//
// OBD VIN request uses multi-frame ISO 15765-2 transport:
//   TX  →  02 09 02 [padding]       (broadcast to 0x7DF)
//   RX  ←  First Frame  10 14 49 02 01 V0 V1 V2    (3 VIN bytes)
//   TX  →  Flow Control 30 00 00 [padding]          (to 0x7E0)
//   RX  ←  Consec. 1    21 V3..V9                   (7 VIN bytes)
//   RX  ←  Consec. 2    22 V10..V16                 (7 VIN bytes)
//                                             total: 3+7+7 = 17 bytes
//
// Returns the 17-char VIN string, or "" if unsupported / timed out.

String readVin() {
  if (simMode) return "";

  // Send Service 09 PID 02 request
  twai_message_t req = {};
  req.identifier       = OBD_ECU_ID;   // 0x7DF
  req.data_length_code = 8;
  req.extd             = 0;
  req.data[0] = 0x02;  // 2 bytes follow
  req.data[1] = 0x09;  // Service 09
  req.data[2] = 0x02;  // PID: VIN
  for (int i = 3; i < 8; i++) req.data[i] = 0x55;

  if (twai_transmit(&req, pdMS_TO_TICKS(100)) != ESP_OK) return "";

  uint8_t vinBuf[17];
  int     vinLen      = 0;
  bool    gotFF       = false;
  unsigned long deadline = millis() + 2000;   // 2 s total timeout

  while (millis() < deadline) {
    twai_message_t rx = {};
    if (twai_receive(&rx, pdMS_TO_TICKS(50)) != ESP_OK) continue;

    // Only accept ECU response range 0x7E8..0x7EF
    if (rx.identifier < 0x7E8 || rx.identifier > 0x7EF) continue;

    uint8_t frameType = (rx.data[0] & 0xF0) >> 4;

    if (!gotFF && frameType == 0x1) {
      // ── First Frame ──
      // Byte layout: [10][14][49][02][01][V0][V1][V2]
      if (rx.data[2] != 0x49 || rx.data[3] != 0x02) continue;  // not VIN response
      for (int i = 0; i < 3 && vinLen < 17; i++) vinBuf[vinLen++] = rx.data[5 + i];
      gotFF = true;

      // Send Flow Control: ContinueToSend, no block limit, 0 ms separation
      twai_message_t fc = {};
      fc.identifier       = 0x7E0;   // direct to ECU 1
      fc.data_length_code = 8;
      fc.extd             = 0;
      fc.data[0] = 0x30;
      fc.data[1] = 0x00;
      fc.data[2] = 0x00;
      for (int i = 3; i < 8; i++) fc.data[i] = 0x00;
      twai_transmit(&fc, pdMS_TO_TICKS(50));

    } else if (gotFF && frameType == 0x2) {
      // ── Consecutive Frame ──
      for (int i = 1; i < 8 && vinLen < 17; i++) vinBuf[vinLen++] = rx.data[i];
      if (vinLen >= 17) break;
    }
  }

  if (vinLen < 17) return "";

  // Validate: 17 printable ASCII alphanumeric chars (VIN standard)
  String vin = "";
  for (int i = 0; i < 17; i++) {
    char c = (char)vinBuf[i];
    if (!isAlphaNumeric(c)) return "";
    vin += c;
  }

  Serial.printf("[VIN] Read successfully: %s\n", vin.c_str());
  return vin;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
void setCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── HTTP handlers ─────────────────────────────────────────────────────────────

void handleStatus() {
  setCorsHeaders();
  StaticJsonDocument<256> doc;
  doc["device"]        = "carstats-scanner";
  doc["ssid"]          = WiFi.SSID();
  doc["ip"]            = WiFi.localIP().toString();
  doc["uptimeSeconds"] = millis() / 1000;
  doc["simMode"]       = simMode;
  doc["connected"]     = (WiFi.status() == WL_CONNECTED);
  doc["setupMode"]     = false;
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
  // fuelPercent = -1 means the car doesn't support PID 0x2F — send null
  if (liveData.fuelPercent >= 0) {
    doc["fuelPercent"]  = liveData.fuelPercent;
  } else {
    doc["fuelPercent"]  = nullptr;
  }
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

void handleVin() {
  setCorsHeaders();

  // Try to read VIN once per real-car session; cache the result
  if (!simMode && !vinAttempted) {
    vinAttempted = true;
    cachedVin    = readVin();
  }

  StaticJsonDocument<128> doc;
  doc["simMode"] = simMode;
  doc["vin"]     = cachedVin.isEmpty() ? (const char*)nullptr : cachedVin.c_str();
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

void handleDebug() {
  setCorsHeaders();
  // Grab live TWAI state
  twai_status_info_t info;
  bool gotInfo = (twai_get_status_info(&info) == ESP_OK);

  StaticJsonDocument<512> doc;
  doc["simMode"]          = simMode;
  doc["lastTxErr"]        = canDiag.lastTxErr;
  // TWAI states: 0=STOPPED, 1=RUNNING, 2=BUS_OFF, 3=RECOVERING
  doc["twaiState"]        = gotInfo ? (int)info.state        : canDiag.twaiState;
  doc["txErrCounter"]     = gotInfo ? (int)info.tx_error_counter : canDiag.txErrCounter;
  doc["rxErrCounter"]     = gotInfo ? (int)info.rx_error_counter : canDiag.rxErrCounter;
  doc["framesLastPoll"]   = canDiag.framesLastPoll;
  doc["obdFramesTotal"]   = canDiag.obdFramesTotal;
  doc["lastRxFrame"]      = canDiag.lastRxFrame;
  doc["lastRxAgoMs"]      = canDiag.lastRxMs > 0 ? (long)(millis() - canDiag.lastRxMs) : -1;
  doc["uptimeSeconds"]    = millis() / 1000;
  // Plain-English diagnosis
  const char* diag = "unknown";
  if (canDiag.lastTxErr != 0) {
    int st = gotInfo ? (int)info.state : canDiag.twaiState;
    diag = (st == 2) ? "BUS-OFF: CAN TX gets no ACK — check wiring/pins"
                     : "TX error: TWAI driver issue";
  } else if (canDiag.framesLastPoll == 0) {
    diag = "TX ok but no frames received — OBD not plugged in or engine off?";
  } else if (canDiag.obdFramesTotal == 0) {
    diag = "CAN frames arriving but none match OBD-II (0x7E8-0x7EF) — check baud/protocol";
  } else {
    diag = "OBD-II frames matched — should be in REAL mode";
  }
  doc["diagnosis"] = diag;

  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

// ─── Saved hotspot (flash) ────────────────────────────────────────────────────
// "configured" separates "nothing saved yet" (use the defaults above) from
// "hotspot deliberately forgotten" (empty name — go straight to setup mode).

void loadHotspotCreds() {
  prefs.begin("carstats", true);   // read-only
  bool configured = prefs.getBool("configured", false);
  hotspotSsid = configured ? prefs.getString("ssid", "") : String(DEFAULT_HOTSPOT_SSID);
  hotspotPass = configured ? prefs.getString("pass", "") : String(DEFAULT_HOTSPOT_PASS);
  prefs.end();
}

void saveHotspotCreds(const String &ssid, const String &pass) {
  prefs.begin("carstats", false);
  prefs.putBool("configured", true);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}

// ─── Joining a hotspot ────────────────────────────────────────────────────────

bool waitForWifi(unsigned long timeoutMs) {
  unsigned long deadline = millis() + timeoutMs;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

// The address this scanner takes on a network: host .100 on normal networks
// (Android hotspots are /24), or the last usable address on small ones —
// an iPhone hotspot is 172.20.10.0/28, which gives 172.20.10.14.
IPAddress scannerAddressFor(IPAddress ip, IPAddress mask) {
  if (mask[3] == 0) {
    return IPAddress(ip[0], ip[1], ip[2], SCANNER_HOST_OCTET);
  }
  uint8_t broadcastLast = (ip[3] & mask[3]) | (uint8_t)(~mask[3]);
  return IPAddress(ip[0], ip[1], ip[2], broadcastLast - 1);
}

// Joins the saved hotspot, then moves to the fixed scanner address on it.
// Returns false if the hotspot can't be reached in time.
bool connectToHotspot(unsigned long timeoutMs) {
  if (hotspotSsid.isEmpty()) return false;

  // DHCP first, only to learn which network this hotspot uses
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
  WiFi.begin(hotspotSsid.c_str(), hotspotPass.c_str());
  Serial.printf("[WiFi] Connecting to hotspot: %s\n", hotspotSsid.c_str());
  if (!waitForWifi(timeoutMs)) return false;

  IPAddress target = scannerAddressFor(WiFi.localIP(), WiFi.subnetMask());
  if (WiFi.localIP() != target) {
    IPAddress gateway = WiFi.gatewayIP();
    IPAddress mask    = WiFi.subnetMask();
    IPAddress dns     = WiFi.dnsIP();
    WiFi.disconnect();
    WiFi.config(target, gateway, mask, dns);
    WiFi.begin(hotspotSsid.c_str(), hotspotPass.c_str());

    if (!waitForWifi(10000)) {
      // The hotspot refused the fixed address — keep whatever DHCP hands out.
      // "Find scanner" won't see it, but the address can still be typed in the app.
      Serial.println("[WiFi] Fixed address refused — falling back to DHCP");
      WiFi.disconnect();
      WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
      WiFi.begin(hotspotSsid.c_str(), hotspotPass.c_str());
      if (!waitForWifi(10000)) return false;
    }
  }

  Serial.printf("[WiFi] Connected to %s — scanner address: %s\n",
                hotspotSsid.c_str(), WiFi.localIP().toString().c_str());
  return true;
}

// ─── Normal mode: the OBD-II API ──────────────────────────────────────────────

// POST {deviceId, localIp} to the server. The server sees the phone's public
// address on this request and on the app's — that is how it pairs them.
// Best effort: no internet just means the app falls back to searching.
void announceToServer() {
  WiFiClientSecure client;
  client.setInsecure();   // only our own local address is sent; nothing secret
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, ANNOUNCE_URL)) return;
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["deviceId"] = WiFi.macAddress();
  doc["localIp"]  = WiFi.localIP().toString();
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("[Announce] %s -> HTTP %d\n", WiFi.localIP().toString().c_str(), code);
  http.end();
}

void startNormalMode() {
  // carstats.local — iPhones can find the scanner by name with no searching at all
  if (MDNS.begin("carstats")) MDNS.addService("http", "tcp", 80);

  server.on("/status",      HTTP_GET,  handleStatus);
  server.on("/live-data",   HTTP_GET,  handleLiveData);
  server.on("/dtcs",        HTTP_GET,  handleDtcs);
  server.on("/debug",       HTTP_GET,  handleDebug);
  server.on("/vin",         HTTP_GET,  handleVin);
  server.on("/forget-wifi", HTTP_POST, handleForgetWifi);
  server.on("/hotspot",     HTTP_POST, handleHotspot);
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

// The app's "Change hotspot" button: forget the saved hotspot and restart,
// which lands in setup mode because there is nothing left to join.
void handleForgetWifi() {
  setCorsHeaders();
  saveHotspotCreds("", "");
  server.send(200, "application/json", "{\"ok\":true}");
  restartAtMs = millis() + 1000;
}

// ─── New hotspot from the app (normal and setup mode) ─────────────────────────

// "" when the name and password are usable, otherwise what is wrong with them.
// The limits are WiFi's own: a network name is at most 32 bytes, a WPA2
// password 8–63 characters (empty = an open hotspot).
String hotspotError(const String &ssid, const String &pass) {
  if (ssid.isEmpty())                       return "Hotspot name is required.";
  if (ssid.length() > 32)                   return "Hotspot name is too long (max 32).";
  if (pass.length() > 0 && pass.length() < 8) return "Password must be at least 8 characters.";
  if (pass.length() > 63)                   return "Password is too long (max 63).";
  return "";
}

// Saves the hotspot and restarts onto it once the reply has gone out
void applyHotspot(const String &ssid, const String &pass) {
  saveHotspotCreds(ssid, pass);
  hotspotSsid = ssid;
  hotspotPass = pass;
  restartAtMs = millis() + 1500;
  Serial.printf("[WiFi] New hotspot saved: %s — restarting onto it\n", ssid.c_str());
}

// POST /hotspot  {"ssid":"...","pass":"..."}
void handleHotspot() {
  setCorsHeaders();

  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Expected JSON with ssid and pass.\"}");
    return;
  }
  String ssid = doc["ssid"] | "";
  String pass = doc["pass"] | "";
  ssid.trim();

  String error = hotspotError(ssid, pass);
  JsonDocument reply;
  reply["ok"] = error.isEmpty();
  if (!error.isEmpty()) reply["error"] = error;
  String body;
  serializeJson(reply, body);
  server.send(error.isEmpty() ? 200 : 400, "application/json", body);

  if (error.isEmpty()) applyHotspot(ssid, pass);
}

// GET /status in setup mode — same "device" field as normal mode, so the app
// knows it found the scanner, plus setupMode so it knows to send a hotspot
void handleSetupStatus() {
  setCorsHeaders();
  JsonDocument doc;
  doc["device"]        = "carstats-scanner";
  doc["setupMode"]     = true;
  doc["savedHotspot"]  = hotspotSsid;
  doc["uptimeSeconds"] = millis() / 1000;
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

// ─── Setup mode: the "CarStats-Setup" network and its page ────────────────────

void startSetupMode() {
  setupMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP_STA);   // AP for the setup page; STA keeps retrying the saved hotspot

  // Scan once now, before anyone joins — the page lists these as tap-to-fill buttons
  int found = WiFi.scanNetworks();
  setupNetworksHtml = "";
  for (int i = 0; i < found && i < 15; i++) {
    String name = htmlEscape(WiFi.SSID(i));
    if (name.isEmpty() || setupNetworksHtml.indexOf("data-s=\"" + name + "\"") >= 0) continue;
    setupNetworksHtml += "<button type=button class=net data-s=\"" + name + "\">" + name + "</button>";
  }
  WiFi.scanDelete();

  // Open network on purpose: any phone should be able to join it with no password
  WiFi.softAP(SETUP_AP_SSID);

  // Every DNS name points at us, so the phone shows the page as a "sign in to network" popup
  dnsServer.start(53, "*", WiFi.softAPIP());

  server.on("/",        HTTP_GET,  handleSetupPage);
  server.on("/save",    HTTP_POST, handleSetupSave);     // the page's form
  server.on("/status",  HTTP_GET,  handleSetupStatus);   // the app: "is this the scanner?"
  server.on("/hotspot", HTTP_POST, handleHotspot);       // the app's wizard sends the hotspot here
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      setCorsHeaders();
      server.send(204);
    } else {
      handleSetupPage();   // the phone's captive-portal checks land on the page too
    }
  });
  server.begin();

  Serial.printf("[Setup] Join WiFi \"%s\" and open http://%s\n",
                SETUP_AP_SSID, WiFi.softAPIP().toString().c_str());
}

static const char SETUP_PAGE_TOP[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>CarStats scanner setup</title>
<style>
body{font-family:system-ui,sans-serif;background:#F1F1F9;color:#191B23;margin:0;padding:20px}
.card{background:#fff;border:1px solid #E2E1ED;border-radius:14px;padding:20px;max-width:420px;margin:0 auto}
h1{font-size:20px;margin:0 0 6px}p{color:#5B5F70;font-size:14px;line-height:1.45;margin:0 0 14px}
label{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;color:#5B5F70;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #E2E1ED;border-radius:10px}
.net{display:inline-block;margin:0 6px 6px 0;padding:8px 12px;border:1px solid #DBE1FF;background:#F5F7FF;
border-radius:999px;font-size:14px;color:#003FB1}
.go{width:100%;margin-top:18px;padding:14px;font-size:16px;font-weight:700;color:#fff;background:#1353D8;border:0;border-radius:12px}
</style></head><body><div class=card>
<h1>CarStats scanner setup</h1>
<p>Choose the phone hotspot the scanner should join. On the phone, the hotspot can be off for now.</p>
<form method=post action=/save>
<label>NEARBY NETWORKS</label><div>)HTML";

static const char SETUP_PAGE_BOTTOM[] PROGMEM = R"HTML(</div>
<label for=ssid>HOTSPOT NAME</label><input id=ssid name=ssid required autocomplete=off autocapitalize=off>
<label for=pass>HOTSPOT PASSWORD</label><input id=pass name=pass type=password autocomplete=off>
<button class=go type=submit>Save &amp; connect</button>
</form></div>
<script>document.querySelectorAll('.net').forEach(function(b){b.onclick=function(){document.getElementById('ssid').value=b.dataset.s}})</script>
</body></html>)HTML";

void handleSetupPage() {
  String page = FPSTR(SETUP_PAGE_TOP);
  page += setupNetworksHtml.isEmpty() ? String("<p>No networks found — type the name below.</p>") : setupNetworksHtml;
  page += FPSTR(SETUP_PAGE_BOTTOM);
  server.send(200, "text/html", page);
}

void handleSetupSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  ssid.trim();

  String error = hotspotError(ssid, pass);
  if (!error.isEmpty()) {
    server.send(400, "text/html", "<p>" + htmlEscape(error) + " <a href=/>Back</a></p>");
    return;
  }

  String page =
    "<!doctype html><html><head><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'></head>"
    "<body style='font-family:system-ui,sans-serif;background:#F1F1F9;padding:20px'>"
    "<div style='background:#fff;border:1px solid #E2E1ED;border-radius:14px;padding:20px;max-width:420px;margin:0 auto'>"
    "<h1 style='font-size:20px;margin:0 0 8px'>Saved &#10003;</h1>"
    "<p style='color:#5B5F70;line-height:1.5'>Now turn on the hotspot <b>" + htmlEscape(ssid) + "</b> on the phone. "
    "The scanner restarts and joins it by itself within about 30 seconds.</p>"
    "<p style='color:#5B5F70;line-height:1.5'>Then in the CarStats app: <b>Settings &rarr; OBD scanner &rarr; Find scanner</b>.</p>"
    "</div></body></html>";
  server.send(200, "text/html", page);
  applyHotspot(ssid, pass);
}

String htmlEscape(const String &s) {
  String out;
  out.reserve(s.length());
  for (unsigned int i = 0; i < s.length(); i++) {
    char ch = s[i];
    if      (ch == '&')  out += "&amp;";
    else if (ch == '<')  out += "&lt;";
    else if (ch == '>')  out += "&gt;";
    else if (ch == '"')  out += "&quot;";
    else if (ch == '\'') out += "&#39;";
    else                 out += ch;
  }
  return out;
}
