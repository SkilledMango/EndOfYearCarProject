/**
 * AI explanation for fault codes that are not in our dictionary.
 *
 * The dictionary covers the generic codes a car is most likely to throw, but
 * manufacturer-specific codes (P1xxx and up) differ per make and there are
 * thousands of them. Rather than showing a driver a bare code and "check the
 * manual", this asks Gemini to explain it in the same plain language the
 * dictionary uses.
 *
 * Two deliberate limits:
 *  - No repair price is requested. A wrong number here would be worse than no
 *    number, and a model cannot know Israeli garage rates for a specific car.
 *  - The result is always labelled as AI-generated in the UI, never presented
 *    as a curated entry.
 *
 * Uses the same key and model as the fuel-economy lookup in fueleconomy.ts.
 */

import { fetchWithTimeout } from './http';
import { SeverityLevel } from './api';

const GEMINI_API_KEY: string = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

export interface AiFaultExplanation {
  humanTitle:     string;
  description:    string;
  actionRequired: string;
  severity:       SeverityLevel;
}

/** Maps the model's one-word severity onto our enum, defaulting to caution. */
function parseSeverity(word: string): SeverityLevel {
  const w = word.trim().toLowerCase();
  if (w.startsWith('low'))  return SeverityLevel.Green;
  if (w.startsWith('high')) return SeverityLevel.Red;
  // Anything unrecognised is a warning — never silently "all clear".
  return SeverityLevel.Yellow;
}

/**
 * Explains an OBD-II code, or null when there is no key, no answer, or the
 * response cannot be trusted.
 *
 * Never throws: an explanation is a bonus on top of the dictionary, and a
 * failure here must leave the screen usable.
 */
export async function explainFaultWithAi(
  code: string,
  vehicle?: { make: string; model: string; year: number },
): Promise<AiFaultExplanation | null> {
  if (!code) return null;

  if (!GEMINI_API_KEY) {
    // Worth saying out loud: this also happens when the key IS in .env but
    // Metro served a cached bundle from before it was added, since
    // EXPO_PUBLIC_* values are inlined at transform time. Restart with
    // `npx expo start --clear`.
    console.warn('[dtcLookup] no Gemini key in this bundle — skipping AI explanation');
    return null;
  }

  const carHint = vehicle
    ? ` on a ${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : '';

  const prompt =
    `You are explaining an OBD-II diagnostic trouble code to a car owner who ` +
    `is not a mechanic. Explain code ${code}${carHint}.\n\n` +
    `Reply as strict JSON with exactly these keys and nothing else:\n` +
    `{"title": "...", "description": "...", "action": "...", "severity": "low|medium|high"}\n\n` +
    `title: under 8 words, plain language, no jargon.\n` +
    `description: 2 sentences on what is wrong and what the driver would notice.\n` +
    `action: 1 sentence on what they should do and how urgently.\n` +
    `severity: low if it can wait, medium if it should be booked in, high if ` +
    `driving on could be unsafe or cause damage.\n` +
    `Do not mention prices. If you do not recognise the code, reply exactly: unknown`;

  try {
    const res = await fetchWithTimeout(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, 15000, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          // Asking for JSON directly rather than parsing it out of prose. The
          // model then cannot wrap the object in a ``` fence or add a sentence
          // in front of it, which is what made this succeed only sometimes.
          responseMimeType: 'application/json',
          // Generous on purpose: 2.5 models spend part of this budget on
          // internal reasoning, and running out mid-object truncates the JSON.
          // That produced exactly the intermittent failures seen in testing.
          maxOutputTokens: 800,
        },
      }),
    });

    if (!res.ok) {
      console.warn('[dtcLookup] Gemini returned', res.status);
      return null;
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const text: string = (candidate?.content?.parts?.[0]?.text ?? '').trim();

    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('[dtcLookup] response did not finish cleanly:', candidate.finishReason);
    }
    if (!text || text.toLowerCase() === 'unknown') {
      console.warn('[dtcLookup] no usable answer for', code);
      return null;
    }

    // Still tolerate a fence or stray prose: responseMimeType makes that
    // unlikely rather than impossible, and one bad response should not lose
    // an explanation the model actually produced.
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const jsonText = start >= 0 && end > start ? text.slice(start, end + 1) : text;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn('[dtcLookup] could not parse response:', text.slice(0, 120));
      return null;
    }

    const humanTitle     = String(parsed.title ?? '').trim();
    const description    = String(parsed.description ?? '').trim();
    const actionRequired = String(parsed.action ?? '').trim();

    // A blank title or description means we have nothing worth showing, and
    // half an explanation is worse than none.
    if (!humanTitle || !description) return null;

    return {
      humanTitle,
      description,
      actionRequired,
      severity: parseSeverity(String(parsed.severity ?? '')),
    };
  } catch (err) {
    // No network, a timeout, or an unexpected shape. Logged rather than
    // swallowed: a silent null here is indistinguishable from "the model had
    // nothing to say", which made an intermittent failure impossible to
    // diagnose from the outside.
    console.warn('[dtcLookup] explanation failed for', code, err);
    return null;
  }
}
