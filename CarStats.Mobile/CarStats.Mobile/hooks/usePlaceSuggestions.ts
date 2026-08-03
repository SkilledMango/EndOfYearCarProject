/**
 * Debounced Google Places autocomplete.
 *
 * Extracted from the trip planner so the home-address field in Settings can
 * use the same behaviour rather than a second copy of it — same debounce,
 * same result limit, same silent-failure rule.
 *
 * Requests go through the API's /navigation proxy, which keeps the Google key
 * server-side.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

export interface PlaceSuggestion {
  placeId:     string;
  description: string;
}

/** Below this many characters Google returns noise, so don't spend a request. */
const MIN_QUERY_LENGTH = 3;
/** Typing pause before a request goes out. */
const DEBOUNCE_MS = 350;
const MAX_RESULTS = 5;

export function usePlaceSuggestions() {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [visible, setVisible]         = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending request must not repopulate the list after the caller cleared
  // it — otherwise picking a suggestion makes the dropdown flash back open.
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
        if (id !== requestId.current) return;  // superseded or cleared

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
        // Autocomplete is a convenience — a failure must never block typing.
        if (id === requestId.current) {
          setSuggestions([]);
          setVisible(false);
        }
      }
    }, DEBOUNCE_MS);
  }, []);

  // Don't leave a timer running after the screen goes away.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { suggestions, visible, search, clear };
}
