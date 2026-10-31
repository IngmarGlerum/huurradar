import { amsterdamMinuteOfDay, jitter } from '../time.js';

export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const HEADERS = { 'User-Agent': USER_AGENT, 'Accept-Language': 'nl-NL,nl;q=0.9' };

// Particuliere verhuurders publiceren overdag. Van 07:00 tot 23:00 elke 3 minuten, 's nachts elk kwartier.
export function daytimeNextDelay(now: Date): number {
  const m = amsterdamMinuteOfDay(now);
  return m >= 7 * 60 && m < 23 * 60 ? jitter(3 * 60_000, 0.15) : jitter(15 * 60_000, 0.1);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "Batteryparkstraat 3-H" → { street: "Batteryparkstraat", houseNumber: "3-H" }
export function splitAddress(address: string): { street: string | null; houseNumber: string | null } {
  const a = address.trim().replace(/\s+/g, ' ');
  const m = a.match(/^(.*?)\s+(\d+.*)$/);
  return m ? { street: m[1]!, houseNumber: m[2]! } : { street: a || null, houseNumber: null };
}
