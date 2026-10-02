/**
 * איפה לחפש את המתאם על נקודת הגישה של טלפון שאנחנו לא מכירים.
 *
 * הקושחה תופסת על כל נקודת גישה את הכתובת 100. של הרשת, או את האחרונה
 * ברשת קטנה. לכן אין צורך לסרוק 254 כתובות לכל רשת — מספיקה אחת:
 *  - אייפון: הרשת תמיד 172.20.10.0/28, והמתאם יושב על 172.20.10.14
 *  - אנדרואיד: הרשת היא 192.168.X.0/24 עם X משתנה, והמתאם על 192.168.X.100
 */

/** מספרי X שנפוצים בנקודות גישה של אנדרואיד — נבדקים ראשונים. */
const COMMON_ANDROID_SUBNETS = [148, 43, 1, 0, 137, 49, 42, 2];

/** הכתובות לבדיקה, לפי הסדר, בלי כפילויות. */
export function candidateAddresses(saved: string): string[] {
  const list = [saved, 'carstats.local', '172.20.10.14'];

  const thirds = [
    ...COMMON_ANDROID_SUBNETS,
    ...Array.from({ length: 256 }, (_, i) => i).filter(i => !COMMON_ANDROID_SUBNETS.includes(i)),
  ];
  for (const x of thirds) list.push(`192.168.${x}.100`);

  return [...new Set(list.filter(Boolean))];
}

/**
 * מריצה בדיקה על כל הכתובות בקבוצה במקביל, וחוזרת ברגע שאחת מצליחה —
 * בלי לחכות לשאר, שרובן פשוט ממתינות לזמן הקצוב.
 */
export function firstHit(
  addresses: string[],
  probe: (address: string) => Promise<boolean>,
): Promise<string | null> {
  return new Promise(resolve => {
    let pending = addresses.length;
    if (pending === 0) { resolve(null); return; }
    for (const address of addresses) {
      probe(address)
        .then(ok => { if (ok) resolve(address); })
        .catch(() => { /* כתובת שנכשלה היא פשוט לא המתאם */ })
        .finally(() => { if (--pending === 0) resolve(null); });
    }
  });
}
