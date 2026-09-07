/**
 * השלמה אוטומטית של כתובות, עם השהיה בין הקלדות.
 *
 * הופרד ממתכנן הנסיעה כדי ששדה כתובת הבית בהגדרות ישתמש באותה התנהגות
 * במקום בעותק שני שלה.
 *
 * הבקשות עוברות דרך הפרוקסי בשרת, שמחזיק את מפתח Google אצלו.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

export interface PlaceSuggestion {
  placeId:     string;
  description: string;
}

/** מתחת לאורך הזה Google מחזירה רעש, ולא שווה לבזבז בקשה. */
const MIN_QUERY_LENGTH = 3;
/** הפסקת ההקלדה שאחריה נשלחת בקשה. */
const DEBOUNCE_MS = 350;
const MAX_RESULTS = 5;

export function usePlaceSuggestions() {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [visible, setVisible]         = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // בקשה שכבר בדרך לא צריכה למלא את הרשימה אחרי שהיא נוקתה,
  // אחרת בחירת הצעה גורמת לרשימה להיפתח שוב לרגע.
  const requestId = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    requestId.current += 1;
    setSuggestions([]);
    setVisible(false);
  }, []);

  const search = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);

    if (text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setVisible(false);
      return;
    }

    const id = ++requestId.current;

    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/navigation/autocomplete', {
          params: { input: text.trim() },
        });
        if (id !== requestId.current) return;  // הבקשה כבר לא רלוונטית

        if (data.status === 'OK' && Array.isArray(data.predictions)) {
          setSuggestions(
            data.predictions.slice(0, MAX_RESULTS).map((p: any) => ({
              placeId:     p.place_id,
              description: p.description,
            })),
          );
          setVisible(true);
        } else {
          setSuggestions([]);
          setVisible(false);
        }
      } catch {
        // ההשלמה היא נוחות בלבד; כישלון שלה לא יעצור את ההקלדה
        if (id === requestId.current) {
          setSuggestions([]);
          setVisible(false);
        }
      }
    }, DEBOUNCE_MS);
  }, []);

  // ניקוי הטיימר כשהמסך נסגר
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { suggestions, visible, search, clear };
}
