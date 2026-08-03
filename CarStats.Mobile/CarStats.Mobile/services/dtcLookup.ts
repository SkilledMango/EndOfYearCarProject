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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './http';
import { SeverityLevel } from './api';

const GEMINI_API_KEY: string = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/**
 * Models tried in order. The free tier's daily cap is counted per model, so a
 * second model is a genuinely separate allowance rather than a retry of the
 * same exhausted one — a code still gets explained after the first runs out.
 */
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const modelUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Cached explanations, so a code is only ever paid for once. */
const CACHE_PREFIX = '@carstats_dtc_ai_';

/** True when the response means "out of quota" rather than a real failure. */
const isRateLimited = (status: number) => status === 429;

export interface AiFaultExplanation {
  humanTitle:     string;
  description:    string;
  actionRequired: string;
  severity:       SeverityLevel;
}

/** Why no explanation came back — so the screen can say something true. */
export type AiFailureReason = 'no-key' | 'rate-limited' | 'unavailable';

export type AiLookupResult =
  | { ok: true;  explanation: AiFaultExplanation; cached: boolean }
  | { ok: false; reason: AiFailureReason };

async function readCache(code: string): Promise<AiFaultExplanation | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + code.toUpperCase());
    return raw ? (JSON.parse(raw) as AiFaultExplanation) : null;
  } catch {
    return null;
  }
}

async function writeCache(code: string, value: AiFaultExplanation): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + code.toUpperCase(), JSON.stringify(value));
  } catch { /* storage full — the explanation just costs a request next time */ }
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
 * Asks one model for an explanation.
 *
 * Returns the explanation, or a reason. Separated from the caller so the
 * retry-on-another-model logic stays readable.
 */
async function askModel(
  model: string,
  code: string,
  prompt: string,
): Promise<AiLookupResult> {
  try {
    const res = await fetchWithTimeout(`${modelUrl(model)}?key=${GEMINI_API_KEY}`, 15000, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          // Asking for JSON directly rather than parsing it out of prose. The
          // model then cannot wrap the object in a ``` fence or add a sentence
          // in front of it, which made this succeed only sometimes.
          responseMimeType: 'application/json',
          // Generous on purpose: 2.5 models spend part of this budget on
          // internal reasoning, and running out truncates the JSON mid-object.
          maxOutputTokens: 800,
        },
      }),
    });

    if (isRateLimited(res.status)) {
      console.warn(`[dtcLookup] ${model} is out of quota`);
      return { ok: false, reason: 'rate-limited' };
    }
    if (!res.ok) {
      console.warn(`[dtcLookup] ${model} returned`, res.status);
      return { ok: false, reason: 'unavailable' };
    }

    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const text: string = (candidate?.content?.parts?.[0]?.text ?? '').trim();

    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.warn('[dtcLookup] response did not finish cleanly:', candidate.finishReason);
    }
    if (!text || text.toLowerCase() === 'unknown') {
      console.warn('[dtcLookup] no usable answer for', code);
      return { ok: false, reason: 'unavailable' };
    }

    // Tolerate a fence or stray prose anyway: responseMimeType makes that
    // unlikely rather than impossible, and one odd response should not lose
    // an explanation the model actually produced.
    const open  = text.indexOf('{');
    const close = text.lastIndexOf('}');
    const jsonText = open >= 0 && close > open ? text.slice(open, close + 1) : text;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn('[dtcLookup] could not parse response:', text.slice(0, 120));
      return { ok: false, reason: 'unavailable' };
    }

    const humanTitle     = String(parsed.title ?? '').trim();
    const description    = String(parsed.description ?? '').trim();
    const actionRequired = String(parsed.action ?? '').trim();

    // Half an explanation is worse than none.
    if (!humanTitle || !description) return { ok: false, reason: 'unavailable' };

    return {
      ok: true,
      cached: false,
      explanation: {
        humanTitle,
        description,
        actionRequired,
        severity: parseSeverity(String(parsed.severity ?? '')),
      },
    };
  } catch (err) {
    console.warn(`[dtcLookup] ${model} failed for ${code}:`, err);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Explains an OBD-II code in plain language.
 *
 * Answers are cached permanently per code, so a given fault costs one request
 * ever. That matters more than it sounds: the free tier caps requests per day
 * per model, and without caching simply reopening the same fault burns through
 * the allowance until explanations stop working.
 *
 * Never throws — an explanation is a bonus on top of the dictionary, and a
 * failure here must leave the screen usable.
 */
export async function explainFaultWithAi(
  code: string,
  vehicle?: { make: string; model: string; year: number },
): Promise<AiLookupResult> {
  if (!code) return { ok: false, reason: 'unavailable' };

  const cached = await readCache(code);
  if (cached) return { ok: true, explanation: cached, cached: true };

  if (!GEMINI_API_KEY) {
    // Also happens when the key IS in .env but Metro served a bundle cached
    // from before it was added, since EXPO_PUBLIC_* values are inlined at
    // transform time. Restart with `npx expo start --clear`.
    console.warn('[dtcLookup] no Gemini key in this bundle');
    return { ok: false, reason: 'no-key' };
  }

  const carHint = vehicle
    ? ` on a ${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : '';

  const prompt =
    `You are explaining an OBD-II diagnostic trouble code to a car owner who ` +
    `is not a mechanic. Explain code ${code}${carHint}.

` +
    `Reply as strict JSON with exactly these keys and nothing else:
` +
    `{"title": "...", "description": "...", "action": "...", "severity": "low|medium|high"}

` +
    `title: under 8 words, plain language, no jargon.
` +
    `description: 2 sentences on what is wrong and what the driver would notice.
` +
    `action: 1 sentence on what they should do and how urgently.
` +
    `severity: low if it can wait, medium if it should be booked in, high if ` +
    `driving on could be unsafe or cause damage.
` +
    `Do not mention prices. If you do not recognise the code, reply exactly: unknown`;

  let lastReason: AiFailureReason = 'unavailable';

  for (const model of GEMINI_MODELS) {
    const result = await askModel(model, code, prompt);
    if (result.ok) {
      await writeCache(code, result.explanation);
      return result;
    }
    lastReason = result.reason;
    // Only a quota failure is worth trying another model for — its daily cap
    // is counted separately. Anything else would fail the same way twice.
    if (result.reason !== 'rate-limited') break;
  }

  return { ok: false, reason: lastReason };
}
