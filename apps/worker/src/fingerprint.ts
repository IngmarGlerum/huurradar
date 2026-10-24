import { createHash } from 'node:crypto';
import type { NormalizedListing } from './types.js';

// Vingerafdruk van wat ertoe doet: welke woningen er zijn, met prijs, termijn en label.
// Gelijk aan de vorige keer → niets naar de database schrijven.
export function fingerprint(items: NormalizedListing[]): string {
  const lines = items
    .map((i) => [i.external_id, i.rent_net, i.deadline_at, i.label].join('|'))
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
