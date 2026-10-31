// VB&T Verhuurmakelaars (vbtverhuurmakelaars.nl): verhuurt o.a. voor Amvest en Bouwinvest.
// Open JSON-API; één verzoek geeft alle woningen van het land.

import { z } from 'zod';
import type { FetchResult, NormalizedListing, Source } from '../types.js';
import { daytimeNextDelay, HEADERS, splitAddress } from './common.js';

const BASE = 'https://vbtverhuurmakelaars.nl';
// "type=purchase" staat zo in de site zelf, maar geeft huurwoningen terug.
const SEARCH_URL = `${BASE}/api/properties/search?type=purchase`;
const SEARCH_BODY = {
  limit: 1000,
  page: 1,
  filter: {
    city: '',
    radius: 0,
    address: '',
    priceRental: { min: 0, max: 0 },
    availablefrom: '',
    surface: '',
    rooms: 0,
    typeCategory: '',
  },
};

const houseSchema = z.object({
  id: z.string(),
  url: z.string(),
  address: z.object({ city: z.string().nullable(), house: z.string().nullable() }),
  prices: z.object({
    rental: z.object({ price: z.number(), serviceCharges: z.number().nullable().optional() }),
  }),
  status: z.object({ name: z.string() }),
  attributes: z.object({ type: z.object({ category: z.string().nullable() }) }).optional(),
  plot: z.number().nullable().optional(),
  rooms: z.number().nullable().optional(),
  acceptance: z.string().nullable().optional(),
  coordinate: z.array(z.number()).nullable().optional(),
  usps: z.array(z.object({ text: z.string().nullable() })).nullable().optional(),
});

const responseSchema = z.object({ houses: z.array(z.unknown()) });

type House = z.infer<typeof houseSchema>;

export function normalizeVbt(h: House, raw: unknown): NormalizedListing {
  const { street, houseNumber } = splitAddress(h.address.house ?? '');
  const category = h.attributes?.type.category ?? null;
  const rent = h.prices.rental.price;
  const service = h.prices.rental.serviceCharges ?? 0;
  // Gereguleerde (midden)huur herken je aan de inkomensgrens in de kenmerken.
  const middenhuur = (h.usps ?? []).some((u) => /inkomen maximaal|huisvestingsverordening/i.test(u.text ?? ''));
  return {
    external_id: h.id,
    url: new URL(h.url, BASE).toString(),
    street,
    house_number: houseNumber,
    postcode: null,
    city: h.address.city,
    district: null,
    rent_net: rent > 0 ? rent : null,
    rent_gross: rent > 0 && service > 0 ? rent + service : null,
    area_m2: h.plot || null,
    rooms: h.rooms || null,
    unit_kind: category === 'other' ? 'Parkeergelegenheid' : 'Woonruimte',
    dwelling_type: category && category !== 'other' ? category : null,
    energy_label: null,
    landlord: 'VB&T',
    allocation_model: 'Vrije sector',
    label: middenhuur ? 'Middenhuur' : null,
    contract_type: null,
    target_group: null,
    lat: h.coordinate?.[1] ?? null,
    lng: h.coordinate?.[0] ?? null,
    published_at: null,
    deadline_at: null,
    raw,
  };
}

// Alleen status "available"; option, rentreserved en rentinuse tellen als niet beschikbaar.
export function parseVbt(json: unknown): NormalizedListing[] {
  const res = responseSchema.parse(json);
  if (res.houses.length === 0) throw new Error('VB&T: lege lijst ontvangen');
  return res.houses
    .map((raw) => ({ h: houseSchema.parse(raw), raw }))
    .filter(({ h }) => h.status.name === 'available')
    .map(({ h, raw }) => normalizeVbt(h, raw));
}

export function createVbtSource(fetchImpl: typeof fetch = fetch): Source {
  return {
    id: 'vbt',
    name: 'VB&T',
    nextDelay: daytimeNextDelay,
    async fetchAll(): Promise<FetchResult> {
      const res = await fetchImpl(SEARCH_URL, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Referer: `${BASE}/woningen`,
        },
        body: JSON.stringify(SEARCH_BODY),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`VB&T: HTTP ${res.status}`);
      return { items: parseVbt(await res.json()), complete: true };
    },
  };
}
