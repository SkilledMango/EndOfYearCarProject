/**
 * Demo connection — stands in for the ESP32 OBD-II adapter.
 *
 * The adapter lives on the phone's hotspot at a fixed local IP, so anything
 * not on that network (an emulator, a laptop, a phone away from the car)
 * cannot reach it and the whole diagnostics screen sits dead. This produces
 * plausible readings instead, so the gauges, the scan flow, the severity
 * cards and the repair estimates can all be shown without hardware.
 *
 * It is switched on deliberately from the Garage screen and labelled as a
 * demo everywhere it appears — it is a presentation aid, never a silent
 * fallback that could be mistaken for a real car.
 */

import { DtcScanResult, LiveData, ScannerStatus, VinResult } from './scanner';

/** Codes that exist in the seeded dictionary, so translations and costs resolve. */
const DEMO_CODES = ['P0300', 'P0420'];

const START = Date.now();

/** Smooth 0..1 oscillation, so the gauges move like a running engine. */
function wave(periodMs: number, offset = 0): number {
  const t = (Date.now() - START + offset) / periodMs;
  return (Math.sin(t * Math.PI * 2) + 1) / 2;
}

function between(lo: number, hi: number, w: number): number {
  return Math.round(lo + (hi - lo) * w);
}

export function demoStatus(): ScannerStatus {
  return {
    device: 'CarStats Demo Adapter',
    ssid: 'demo',
    ip: '0.0.0.0',
    uptimeSeconds: Math.floor((Date.now() - START) / 1000),
    // Flagged as simulated for the same reason the firmware does: nothing
    // downstream should record these as readings from a real car.
    simMode: true,
    connectedClients: 1,
  };
}

export function demoLiveData(): LiveData {
  // Idle-to-cruise range on a slow cycle, with speed and RPM roughly in step
  // so the numbers look like one engine rather than four random dials.
  const engine = wave(14_000);

  return {
    rpm:            between(750, 3200, engine),
    speedKmh:       between(0, 90, engine),
    coolantCelsius: between(78, 94, wave(40_000, 3_000)),
    // Drifts down slowly, and stays low enough to demo the refuel warning.
    fuelPercent:    Math.max(8, 18 - Math.floor((Date.now() - START) / 120_000)),
    engineLoadPct:  between(12, 68, engine),
    valid:          true,
    ageMs:          0,
  };
}

export function demoDtcs(): DtcScanResult {
  return { codes: [...DEMO_CODES] };
}

export function demoVin(): VinResult {
  // No VIN: a decoded VIN would prompt "add this car to your garage", which is
  // a confusing thing to offer for a car that does not exist.
  return { vin: null, simMode: true };
}
