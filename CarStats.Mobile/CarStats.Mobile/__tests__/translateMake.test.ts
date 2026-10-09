import { hebrewMakeName, translateMake } from '@/services/vehiclelookup';

// Exact tozeret_nm values from the Israeli registry (data.gov.il), October 2026
describe('translateMake — names as the registry writes them', () => {
  it.each([
    ['גילי סין',        'Geely'],     // no geresh, unlike the old "ג'ילי" key
    ['בי ווי די סין',   'BYD'],
    ["צ'רי סין",        'Chery'],
    ['אומודה סין',      'Omoda'],
    ['אורה סין',        'ORA'],
    ['אקספנג סין',      'XPeng'],
    ['דונגפנג סין',     'Dongfeng'],
    ['זיקר',            'Zeekr'],
    ['ליפמוטור סין',    'Leapmotor'],
    ['פולסטאר סין',     'Polestar'],
    ['לינק אנד קו',     'Lynk & Co'],
    ['איווייס סין',     'Aiways'],
    ['וויה סין',        'Voyah'],
    ['מקסוס סין',       'Maxus'],
    ['ניאו רכב סין',    'NIO'],
    ['סקיוול סין',      'Skywell'],
    ['סרס סין',         'Seres'],
    ['פורתינג סין',     'Forthing'],
    ['סמארט סלובניה',   'smart'],
    ['קופרה הונגריה',   'Cupra'],
    ['די אס גרמניה',    'DS'],
    ['אלפין צרפת',      'Alpine'],
    ['לוטוס אנגליה',    'Lotus'],
    ["לנצ'יה איטליה",   'Lancia'],
    ['ביואיק ארהב"',    'Buick'],     // country with the quote at the end
    ['לינקולן ארהב"',   'Lincoln'],
    ['סאנגיונג ד.קור',  'SsangYong'], // "ד.קור" = South Korea
    ['מ.ג סין',         'MG'],
  ])('%s → %s', (hebrew, english) => {
    expect(translateMake(hebrew)).toBe(english);
  });

  it('still handles the registry cutting names at ~14 characters', () => {
    expect(translateMake('מרצדס בנץ גרמנ')).toBe('Mercedes-Benz');
    expect(translateMake('מרצדס בנץ ארהב')).toBe('Mercedes-Benz');
  });

  it('keeps the brands that already worked', () => {
    expect(translateMake('טויוטה יפן')).toBe('Toyota');
    expect(translateMake('קיה קוריאה')).toBe('Kia');
    expect(translateMake('טסלה ארהב')).toBe('Tesla');
  });

  it('falls back to the name without the country for an unknown brand', () => {
    expect(translateMake('מותג חדש סין')).toBe('מותג חדש');
  });
});

describe('hebrewMakeName — for finding the brand garage by its sign', () => {
  it.each([
    ['Kia', 'קיה'],
    ['Toyota', 'טויוטה'],
    ['Hyundai', 'יונדאי'],
    ['Mercedes-Benz', 'מרצדס בנץ'],
    ['Geely', "ג'ילי"],
    ['kia', 'קיה'],            // case doesn't matter
  ])('%s → %s', (english, hebrew) => {
    expect(hebrewMakeName(english)).toBe(hebrew);
  });

  it('skips Latin-letter keys and returns null for unknown brands', () => {
    expect(hebrewMakeName('MG')).toBe('מ.ג');
    expect(hebrewMakeName('Batmobile')).toBeNull();
  });
});
