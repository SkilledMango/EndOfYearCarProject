/**
 * vehiclelookup.ts
 *
 * Looks up Israeli vehicle registration details by license plate number.
 * Uses the Israeli Government Open Data portal (data.gov.il) — free, no API key.
 *
 * Endpoint:
 *   GET https://data.gov.il/api/3/action/datastore_search
 *       ?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3
 *       &q={plate}
 *
 * Key response fields:
 *   mispar_rechev   — plate number (digits only)
 *   tozeret_nm      — manufacturer name (Hebrew)
 *   kinuy_mishari   — commercial model name (usually English: "SPORTAGE", "COROLLA"…)
 *   shnat_yitzur    — year of manufacture
 *   degem_nm        — model code
 *   sug_delek_nm    — fuel type ("בנזין", "דיזל", "חשמל"…)
 */

const IL_API   = 'https://data.gov.il/api/3/action/datastore_search';
const IL_RES   = '053cea08-09bc-40ec-8f7a-156f0677aff3';

async function timedFetch(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Country suffixes the Israeli registry appends to make names ──────────────
// e.g. "מרצדס בנץ גרמניה" → strip "גרמניה" → "מרצדס בנץ" → "Mercedes-Benz"
const COUNTRY_SUFFIXES = [
  'גרמניה', 'יפן', 'קוריאה', 'צרפת', 'איטליה', 'ארהב', 'ארה"ב',
  'אנגליה', 'בריטניה', 'שבדיה', "צ'כיה", 'ספרד', 'רומניה', 'הולנד',
  'בלגיה', 'אוסטריה', 'יוון', 'הונגריה', 'סלובקיה', 'פולין', 'סין',
];

function stripCountrySuffix(name: string): string {
  for (const suffix of COUNTRY_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim();
  }
  return name;
}

// ─── Hebrew → English make mapping ───────────────────────────────────────────
// Common Israeli-market car brands.  Add more as needed.
//
// IMPORTANT: The government registry truncates tozeret_nm to ~14 characters.
// "מרצדס בנץ גרמניה" (17 chars) becomes "מרצדס בנץ גרמנ" (14 chars).
// translateMake() handles this via prefix matching — always add the SHORTEST
// recognisable prefix of the Hebrew name, not the full string with country.
const MAKE_MAP: Record<string, string> = {
  'טויוטה':          'Toyota',
  'קיה':             'Kia',
  'יונדאי':          'Hyundai',
  'מזדה':            'Mazda',
  'פורד':            'Ford',
  'שברולט':          'Chevrolet',
  'ניסן':            'Nissan',
  'מיצובישי':        'Mitsubishi',
  'רנו':             'Renault',
  'פיאט':            'Fiat',
  'אאודי':           'Audi',
  'ב.מ.ו':           'BMW',
  'ב.מ.וו':          'BMW',
  'מרצדס בנץ':       'Mercedes-Benz',   // must be before 'מרצדס' (longer prefix wins)
  'מרצדס':           'Mercedes-Benz',
  'דימלרקריזלר':     'Mercedes-Benz',   // pre-2007 DaimlerChrysler-era registry entries
  'פולקסוואגן':      'Volkswagen',
  'פולקסווגן':       'Volkswagen',
  'הונדה':           'Honda',
  'סובארו':          'Subaru',
  'סקודה':           'Skoda',
  'סיאט':            'Seat',
  'אופל':            'Opel',
  "פוג'ו":           'Peugeot',
  'סיטרואן':         'Citroen',
  'לנד רובר':        'Land Rover',
  'וולוו':           'Volvo',
  "ג'יפ":            'Jeep',
  "דאצ'יה":          'Dacia',
  'סוזוקי':          'Suzuki',
  'לקסוס':           'Lexus',
  'אינפיניטי':       'Infiniti',
  'קאדילק':          'Cadillac',
  'אלפא רומיאו':     'Alfa Romeo',
  'איסוזו':          'Isuzu',
  'קרייזלר':         'Chrysler',
  "דודג'":           'Dodge',
  'מיני':            'MINI',
  'פורשה':           'Porsche',
  'בנטלי':           'Bentley',
  'מאזראטי':         'Maserati',
  'פרארי':           'Ferrari',
  'למבורגיני':       'Lamborghini',
  'רולס רויס':       'Rolls-Royce',
  "ג'אגואר":         'Jaguar',
  'וולט':            'Bolt',   // Chevrolet Bolt EV
  'טסלה':            'Tesla',
  'ביאר':            'BYD',
  "ב.יי.די":         'BYD',
  'גרייט וול':       'Great Wall',
  "ג'ילי":           'Geely',
  'MG':              'MG',
  'מ.ג':             'MG',
};

// ─── Make translation (handles truncated registry values) ─────────────────────
//
// The registry caps tozeret_nm at ~14 characters, so country names get cut off.
// Example: "מרצדס בנץ גרמניה" → stored as "מרצדס בנץ גרמנ"
// Strategy: try exact match, then prefix match (longest key first).
function translateMake(hebrewMake: string): string {
  // 1. Exact match
  if (MAKE_MAP[hebrewMake]) return MAKE_MAP[hebrewMake];

  // 2. Strip country suffix and try exact match
  const stripped = stripCountrySuffix(hebrewMake);
  if (stripped !== hebrewMake && MAKE_MAP[stripped]) return MAKE_MAP[stripped];

  // 3. Prefix match — sort longest key first so "מרצדס בנץ" wins over "מרצדס"
  const keys = Object.keys(MAKE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    // Match "מרצדס בנץ גרמנ".startsWith("מרצדס בנץ ")  →  true
    if (hebrewMake.startsWith(key + ' ') || hebrewMake.startsWith(key + '-')) {
      return MAKE_MAP[key];
    }
  }

  // 4. Fallback — return the stripped version (at least drops the country fragment)
  return stripped;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VehicleLookupResult {
  make: string;        // English make (translated)
  model: string;       // commercial name, usually English
  year: number;
  fuelType: string;    // "בנזין" / "דיזל" / "חשמל" / etc.
  originalMake: string; // raw Hebrew value (for display / debugging)
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Looks up a vehicle by Israeli license plate.
 * Accepts formats: "12-345-67", "1234567", "123-45-678", etc.
 * Returns null when no record is found (not an error — just not registered).
 * Throws on network / API errors.
 */
export async function lookupByPlate(plate: string): Promise<VehicleLookupResult | null> {
  // Strip dashes / spaces to get the raw digit string
  const normalized = plate.replace(/[\-\s]/g, '');
  if (!normalized || normalized.length < 5) return null;

  // The government DB stores mispar_rechev as an integer — use the numeric value
  // in the filter, and also pass q= as a fallback full-text search.
  const plateNum = parseInt(normalized, 10);
  const filters  = encodeURIComponent(JSON.stringify({ mispar_rechev: plateNum }));
  const url      = `${IL_API}?resource_id=${IL_RES}&filters=${filters}&limit=1`;

  let res: Response;
  try {
    res = await timedFetch(url, 8000);
  } catch (networkErr) {
    const isTimeout = networkErr instanceof Error && networkErr.name === 'AbortError';
    throw new Error(isTimeout ? 'Request timed out — government API is slow, try again' : `Network error: ${String(networkErr)}`);
  }

  if (!res.ok) throw new Error(`Government API returned HTTP ${res.status}`);

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new Error('Government API returned a non-JSON response');
  }

  // CKAN wraps results in json.success + json.result
  if (!json.success) {
    const errMsg = (json as any)?.error?.message ?? 'Unknown CKAN error';
    throw new Error(`CKAN error: ${errMsg}`);
  }

  const records: Record<string, unknown>[] =
    (json as any)?.result?.records ?? [];

  // If exact filter returned nothing, try a broader text search as fallback
  if (records.length === 0) {
    const fallbackUrl = `${IL_API}?resource_id=${IL_RES}&q=${encodeURIComponent(normalized)}&limit=5`;
    let fb: Response;
    try {
      fb = await timedFetch(fallbackUrl, 8000);
      const fbJson = await fb.json();
      const fbRecords: Record<string, unknown>[] = fbJson?.result?.records ?? [];
      // Find a record whose plate number matches
      const match = fbRecords.find(
        r => String(r.mispar_rechev).replace(/\D/g, '') === normalized
      );
      if (!match) return null;
      records.push(match);
    } catch {
      return null;
    }
  }

  const r = records[0];

  const hebrewMake   = String(r.tozeret_nm  ?? '').trim();
  const commercialModel = String(r.kinuy_mishari ?? r.degem_nm ?? '').trim();
  const year         = parseInt(String(r.shnat_yitzur ?? '0'), 10);
  const fuelType     = String(r.sug_delek_nm ?? '').trim();

  if (!year) return null;

  // Translate Hebrew make to English (handles truncated registry values)
  const englishMake = translateMake(hebrewMake);

  // Convert model to title-case so "SPORTAGE" → "Sportage" for EPA lookup
  const titleModel = commercialModel.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    make:         englishMake,
    model:        titleModel,
    year,
    fuelType,
    originalMake: hebrewMake,
  };
}
