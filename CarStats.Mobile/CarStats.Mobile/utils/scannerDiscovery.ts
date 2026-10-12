// המתאם תופס את הכתובת 100. בכל רשת

const COMMON_ANDROID_SUBNETS = [148, 43, 1, 0, 137, 49, 42, 2];

// איתור: הכתובות שבהן מחפשים את המתאם
export function candidateAddresses(saved: string): string[] {
  const list = [saved, 'carstats.local', '172.20.10.14'];

  const thirds = [
    ...COMMON_ANDROID_SUBNETS,
    ...Array.from({ length: 256 }, (_, i) => i).filter(i => !COMMON_ANDROID_SUBNETS.includes(i)),
  ];
  for (const x of thirds) list.push(`192.168.${x}.100`);

  return [...new Set(list.filter(Boolean))];
}

// בודק קבוצה במקביל וחוזר ברגע שאחת עונה
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
