/**
 * איתור פרטי רכב לפי מספר רישוי ישראלי.
 *
 * מבוסס על מאגר הנתונים הפתוח של הממשלה — חינמי ובלי מפתח.
 *
 * השדות החשובים בתשובה:
 *   mispar_rechev   — מספר הרישוי
 *   tozeret_nm      — שם היצרן בעברית
 *   kinuy_mishari   — השם המסחרי של הדגם, לרוב באנגלית
 *   shnat_yitzur    — שנת הייצור
 *   sug_delek_nm    — סוג הדלק
 */

import { fetchWithTimeout } from './http';

const IL_API   = 'https://data.gov.il/api/3/action/datastore_search';
const IL_RES   = '053cea08-09bc-40ec-8f7a-156f0677aff3';

// ─── שמות המדינות שהמרשם מוסיף לשם היצרן ─────────────────────────────────────
// לדוגמה "מרצדס בנץ גרמניה", שממנו מסירים את "גרמניה"
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

// ─── מיפוי שמות יצרנים מעברית לאנגלית ────────────────────────────────────────
// המותגים הנפוצים בשוק הישראלי. אפשר להוסיף לפי הצורך.
//
// IMPORTANT: The government registry truncates tozeret_nm to ~14 characters.
// "מרצדס בנץ גרמניה" (17 chars) becomes "מרצדס בנץ גרמנ" (14 chars).
// translateMake() handles this via prefix matching — always add the SHORTEST
// המפתח הוא תחילית מזוהה של השם בעברית, ולא המחרוזת המלאה עם המדינה.
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
  'דימלרקריזלר':     'Mercedes-Benz',   // רשומות ישנות מתקופת דיימלר-קרייזלר
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
  'וולט':            'Bolt',   // שברולט בולט החשמלית
  'טסלה':            'Tesla',
  'ביאר':            'BYD',
  "ב.יי.די":         'BYD',
  'גרייט וול':       'Great Wall',
  "ג'ילי":           'Geely',
  'MG':              'MG',
  'מ.ג':             'MG',
};

// ─── תרגום שם היצרן, כולל טיפול בשמות חתוכים ─────────────────────────────────
//
// המרשם חותך את שם היצרן סביב 14 תווים, ולכן שם המדינה נקטע באמצע.
// לדוגמה "מרצדס בנץ גרמניה" נשמר כ-"מרצדס בנץ גרמנ".
// הפתרון: קודם התאמה מדויקת, ואז התאמה לפי תחילית, מהארוכה לקצרה.
function translateMake(hebrewMake: string): string {
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

// ─── טיפוסים ─────────────────────────────────────────────────────────────────

export interface VehicleLookupResult {
  make: string;        // שם היצרן באנגלית, אחרי תרגום
  model: string;       // השם המסחרי, לרוב באנגלית
  year: number;
  fuelType: string;    // סוג הדלק כפי שהוא במרשם
  originalMake: string; // הערך המקורי בעברית, לתצוגה ולבדיקות
}

// ─── הפונקציה הראשית ─────────────────────────────────────────────────────────

/**
 * מאתרת רכב לפי מספר רישוי, בכל פורמט של מקפים או בלעדיהם.
 * מחזירה null כשאין רשומה — זו לא שגיאה, פשוט רכב שאינו רשום.
 * זורקת שגיאה רק בתקלת רשת.
 */
export async function lookupByPlate(plate: string): Promise<VehicleLookupResult | null> {
  // הסרת מקפים ורווחים כדי לקבל ספרות בלבד
  const normalized = plate.replace(/[\-\s]/g, '');
  if (!normalized || normalized.length < 5) return null;

  // המאגר שומר את מספר הרישוי כמספר שלם, ולכן הסינון נעשה לפי ערך מספרי,
  // ובמקביל נשלח גם חיפוש טקסט חופשי כגיבוי.
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

  // התשובה עטופה בשדות success ו-result
  if (!json.success) {
    const errMsg = (json as any)?.error?.message ?? 'Unknown CKAN error';
    throw new Error(`CKAN error: ${errMsg}`);
  }

  const records: Record<string, unknown>[] =
    (json as any)?.result?.records ?? [];

  // אם הסינון המדויק לא החזיר כלום, מנסים חיפוש רחב יותר
  if (records.length === 0) {
    const fallbackUrl = `${IL_API}?resource_id=${IL_RES}&q=${encodeURIComponent(normalized)}&limit=5`;
    let fb: Response;
    try {
      fb = await fetchWithTimeout(fallbackUrl, 8000);
      const fbJson = await fb.json();
      const fbRecords: Record<string, unknown>[] = fbJson?.result?.records ?? [];
      // איתור רשומה שמספר הרישוי בה תואם
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

  // תרגום שם היצרן לאנגלית, כולל טיפול בשמות חתוכים
  const englishMake = translateMake(hebrewMake);

  // המרת הדגם לאותיות רישיות בתחילת מילה, לצורך החיפוש במאגר האמריקאי
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
