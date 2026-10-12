import { fetchWithTimeout } from './http';

const IL_API   = 'https://data.gov.il/api/3/action/datastore_search';
const IL_RES   = '053cea08-09bc-40ec-8f7a-156f0677aff3';

// שמות המדינות שהמרשם מוסיף לשם היצרן
const COUNTRY_SUFFIXES = [
  'גרמניה', 'יפן', 'קוריאה', 'ד.קור', 'צרפת', 'איטליה', 'ארהב"', 'ארהב', 'ארה"ב',
  'אנגליה', 'בריטניה', 'שבדיה', "צ'כיה", 'ספרד', 'רומניה', 'הולנד',
  'בלגיה', 'אוסטריה', 'יוון', 'הונגריה', 'סלובקיה', 'סלובניה', 'פולין', 'סין',
];

function stripCountrySuffix(name: string): string {
  for (const suffix of COUNTRY_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim();
  }
  return name;
}

// מפתח = תחילית קצרה של השם בעברית (המרשם חותך שמות ארוכים)
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
  'מרצדס בנץ':       'Mercedes-Benz',   // חייב לבוא לפני 'מרצדס': תחילית ארוכה יותר גוברת
  'מרצדס':           'Mercedes-Benz',
  'דימלרקריזלר':     'Mercedes-Benz',
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
  'וולט':            'Bolt',
  'טסלה':            'Tesla',
  'ביאר':            'BYD',
  "ב.יי.די":         'BYD',
  'בי ווי די':       'BYD',             // כך כותב המרשם: "בי ווי די סין"
  'גרייט וול':       'Great Wall',
  "ג'ילי":           'Geely',
  'גילי':            'Geely',           // המרשם כותב בלי גרש: "גילי סין"
  'MG':              'MG',
  'מ.ג':             'MG',
  "צ'רי":            'Chery',
  'אומודה':          'Omoda',
  'אורה':            'ORA',
  'אקספנג':          'XPeng',
  'דונגפנג':         'Dongfeng',
  'זיקר':            'Zeekr',
  'ליפמוטור':        'Leapmotor',
  'פולסטאר':         'Polestar',
  'לינק אנד קו':     'Lynk & Co',
  'איווייס':         'Aiways',
  'וויה':            'Voyah',
  'מקסוס':           'Maxus',
  'ניאו רכב':        'NIO',
  'סקיוול':          'Skywell',
  'סרס':             'Seres',
  'פורתינג':         'Forthing',
  'סמארט':           'smart',
  'קופרה':           'Cupra',
  'די אס':           'DS',
  'אלפין':           'Alpine',
  'לוטוס':           'Lotus',
  "לנצ'יה":          'Lancia',
  'ביואיק':          'Buick',
  'לינקולן':         'Lincoln',
  'סאנגיונג':        'SsangYong',
};

export function hebrewMakeName(englishMake: string): string | null {
  const wanted = englishMake.trim().toLowerCase();
  const entry = Object.entries(MAKE_MAP).find(([he, en]) => en.toLowerCase() === wanted && /[א-ת]/.test(he));
  return entry ? entry[0] : null;
}

// איתור: תרגום שם יצרן מעברית לאנגלית
// המרשם חותך את שם היצרן ל-14 תווים: התאמה מדויקת, ואז לפי תחילית
export function translateMake(hebrewMake: string): string {
  // 1. התאמה מדויקת
  if (MAKE_MAP[hebrewMake]) return MAKE_MAP[hebrewMake];

  // 2. הסרת שם המדינה וניסיון נוסף
  const stripped = stripCountrySuffix(hebrewMake);
  if (stripped !== hebrewMake && MAKE_MAP[stripped]) return MAKE_MAP[stripped];

  // 3. התאמה לפי תחילית, מהמפתח הארוך לקצר
  const keys = Object.keys(MAKE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    // כך "מרצדס בנץ גרמנ" מזוהה לפי התחילית "מרצדס בנץ"
    if (hebrewMake.startsWith(key + ' ') || hebrewMake.startsWith(key + '-')) {
      return MAKE_MAP[key];
    }
  }

  // 4. גיבוי: מחזירים לפחות את השם בלי שארית שם המדינה
  return stripped;
}

export interface VehicleLookupResult {
  make: string;
  model: string;
  year: number;
  fuelType: string;
  originalMake: string;
}

// איתור: חיפוש רכב במאגר משרד התחבורה
export async function lookupByPlate(plate: string): Promise<VehicleLookupResult | null> {
  const normalized = plate.replace(/[\-\s]/g, '');
  if (!normalized || normalized.length < 5) return null;

  // המאגר שומר את המספר כמספר שלם: מסננים לפי ערך, וחיפוש טקסט כגיבוי
  const plateNum = parseInt(normalized, 10);
  const filters  = encodeURIComponent(JSON.stringify({ mispar_rechev: plateNum }));
  const url      = `${IL_API}?resource_id=${IL_RES}&filters=${filters}&limit=1`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, 8000);
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

  if (!json.success) {
    const errMsg = (json as any)?.error?.message ?? 'Unknown CKAN error';
    throw new Error(`CKAN error: ${errMsg}`);
  }

  const records: Record<string, unknown>[] =
    (json as any)?.result?.records ?? [];

  if (records.length === 0) {
    const fallbackUrl = `${IL_API}?resource_id=${IL_RES}&q=${encodeURIComponent(normalized)}&limit=5`;
    let fb: Response;
    try {
      fb = await fetchWithTimeout(fallbackUrl, 8000);
      const fbJson = await fb.json();
      const fbRecords: Record<string, unknown>[] = fbJson?.result?.records ?? [];
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

  const englishMake = translateMake(hebrewMake);

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
