import { formatAmsterdam } from '../time.js';
import type { NormalizedListing } from '../types.js';

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatListing(l: NormalizedListing): string {
  const address = [l.street, l.house_number].filter(Boolean).join(' ');
  const place = [l.city, l.district !== l.city ? l.district : null].filter(Boolean).join(' · ');
  const facts = [
    l.rent_net != null ? `${euro.format(l.rent_net)} kaal` : null,
    l.area_m2 != null ? `${Math.round(l.area_m2)} m²` : null,
    l.rooms != null ? `${l.rooms} kamers` : null,
  ].filter(Boolean);
  const kind = [l.label && l.label !== l.allocation_model ? l.label : null, l.allocation_model, l.landlord]
    .filter(Boolean)
    .join(' · ');

  return [
    `*${address}${place ? `, ${place}` : ''}*`,
    facts.join(' · '),
    kind,
    l.deadline_at ? `Reageren tot ${formatAmsterdam(l.deadline_at)}` : null,
    l.url,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatMessage(listings: NormalizedListing[]): string {
  const title = listings.length === 1 ? '🏠 Nieuwe woning op DAK' : `🏠 ${listings.length} nieuwe woningen op DAK`;
  return [`*${title}*`, ...listings.map(formatListing)].join('\n\n');
}
