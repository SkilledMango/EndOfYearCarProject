/**
 * scanner.ts
 * Communicates with the CarStats ESP32 OBD-II adapter.
 *
 * The adapter broadcasts itself on the local WiFi network as:
 *   http://carstats-scanner.local
 *
 * Endpoints:
 *   GET /status     → ScannerStatus
 *   GET /live-data  → LiveData
 *   GET /dtcs       → { codes: string[] }
 */

import { fetchWithTimeout } from './http';

// Fixed IP of the ESP32 scanner — static IP assigned in firmware.
// The ESP32 connects to the phone's hotspot, so no WiFi switching needed.
const SCANNER_BASE_URL = 'http://192.168.148.100';

/** How long (ms) before a fetch is considered failed */
const FETCH_TIMEOUT_MS = 3000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveData {
  rpm: number;
  speedKmh: number;
  coolantCelsius: number;
  /** null when the car doesn't support PID 0x2F (fuel level not reported) */
  fuelPercent: number | null;
  engineLoadPct: number;
  /** true when the adapter is receiving real CAN frames */
  valid: boolean;
  /** how old the reading is in milliseconds */
  ageMs: number;
}

export interface ScannerStatus {
  device: string;
  ssid: string;
  ip: string;
  uptimeSeconds: number;
  /** true when no real car CAN bus is detected — using simulated data */
  simMode: boolean;
  connectedClients: number;
}

export interface DtcScanResult {
  codes: string[];
}

export interface VinResult {
  /** 17-char VIN, or null if not supported / car not connected */
  vin: string | null;
  simMode: boolean;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Ping the adapter and return basic health info.
 * Throws if the adapter is unreachable.
 */
export async function getScannerStatus(): Promise<ScannerStatus> {
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/status`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /status returned ${res.status}`);
  return res.json() as Promise<ScannerStatus>;
}

/**
 * Returns the most recently read live sensor values from the car.
 * The ESP32 refreshes these every ~1 second on its own polling loop.
 * Throws if the adapter is unreachable.
 */
export async function getLiveData(): Promise<LiveData> {
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/live-data`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /live-data returned ${res.status}`);
  return res.json() as Promise<LiveData>;
}

/**
 * Triggers a fresh Mode 03 OBD-II scan and returns the raw DTC codes.
 * Example result: { codes: ["P0300", "P0420"] }
 * Throws if the adapter is unreachable.
 */
export async function scanDtcs(): Promise<DtcScanResult> {
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/dtcs`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /dtcs returned ${res.status}`);
  return res.json() as Promise<DtcScanResult>;
}

/**
 * Fetches the VIN from the OBD adapter (cached — read once per car connection).
 * Returns null vin when the car doesn't support Service 09 PID 02, or in sim mode.
 * Never throws — VIN detection is best-effort.
 */
export async function getVehicleVin(): Promise<VinResult> {
  const res = await fetchWithTimeout(`${SCANNER_BASE_URL}/vin`, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Scanner /vin returned ${res.status}`);
  return res.json() as Promise<VinResult>;
}

/**
 * Quick reachability check — returns true if the adapter responds within
 * FETCH_TIMEOUT_MS, false otherwise. Never throws.
 */
export async function isScannerReachable(): Promise<boolean> {
  try {
    const status = await getScannerStatus();
    return !!status.device;
  } catch {
    return false;
  }
}
