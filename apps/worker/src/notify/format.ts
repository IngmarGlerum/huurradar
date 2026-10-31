import { formatAmsterdam } from '../time.js';
import type { NormalizedListing } from '../types.js';
import type { InlineButton } from './telegram.js';

// Korte naam van de bron voor in berichten ("Nieuwe woning bij DAK", "Bekijk bij Vesteda").
const SOURCE_NAMES: Record<string, string> = {
  dak: 'DAK',
  vesteda: 'Vesteda',
  mvgm: 'MVGM',
  vanderlinden: 'Van der Linden',
  vbt: 'VB&T',
};
export const sourceName = (l: NormalizedListing & { source_id?: string }) =>
  SOURCE_NAMES[l.source_id ?? ''] ?? l.landlord ?? 'huurradar';

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function parts(l: NormalizedListing) {
  return {
    address: [l.street, l.house_number].filter(Boolean).join(' '),
    place: [l.city, l.district !== l.city ? l.district : null].filter(Boolean).join(' · '),
    facts: [
      l.rent_net != null ? `${euro.format(l.rent_net)} kaal` : null,
      l.area_m2 != null ? `${Math.round(l.area_m2)} m²` : null,
      l.rooms != null ? `${l.rooms} kamers` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    kind: [l.label && l.label !== l.allocation_model ? l.label : null, l.allocation_model, l.landlord]
      .filter(Boolean)
      .join(' · '),
    deadline: l.deadline_at ? `Reageren tot ${formatAmsterdam(l.deadline_at)}` : null,
  };
}

// WhatsApp (CallMeBot): platte tekst met *vet*, meerdere woningen in één bericht.
export function formatListing(l: NormalizedListing): string {
  const p = parts(l);
  return [`*${p.address}${p.place ? `, ${p.place}` : ''}*`, p.facts, p.kind, p.deadline, l.url]
    .filter(Boolean)
    .join('\n');
}

export function formatMessage(listings: NormalizedListing[]): string {
  const names = [...new Set(listings.map(sourceName))].join(', ');
  const title = listings.length === 1 ? `🏠 Nieuwe woning bij ${names}` : `🏠 ${listings.length} nieuwe woningen (${names})`;
  return [`*${title}*`, ...listings.map(formatListing)].join('\n\n');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Telegram: één bericht per woning, met knoppen.
export function formatTelegram(l: NormalizedListing): string {
  const p = parts(l);
  return [
    `🏠 <b>Nieuwe woning bij ${escapeHtml(sourceName(l))}</b>`,
    '',
    `<b>${escapeHtml(p.address || 'Adres onbekend')}</b>`,
    p.place ? escapeHtml(p.place) : null,
    p.facts ? escapeHtml(p.facts) : null,
    p.kind ? escapeHtml(p.kind) : null,
    p.deadline ? `⏰ ${escapeHtml(p.deadline)}` : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

export function telegramKeyboard(l: NormalizedListing & { id: number }): InlineButton[][] {
  return [
    [{ text: `Bekijk bij ${sourceName(l)}`, url: l.url }],
    [
      { text: '✅ Gereageerd', callback_data: `reacted:${l.id}` },
      { text: '🗑 Niet interessant', callback_data: `dismissed:${l.id}` },
    ],
  ];
}
