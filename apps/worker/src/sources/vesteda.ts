// Vesteda (vesteda.com): grootste woningbelegger van Nederland. De zoekpagina gebruikt een open
// JSON-API; één verzoek geeft alle woningen binnen de straal.

import { z } from 'zod';
import type { FetchResult, NormalizedListing, Source } from '../types.js';
import { daytimeNextDelay, HEADERS } from './common.js';

const BASE = 'https://www.vesteda.com';
const SEARCH_URL = `${BASE}/api/units/search/facet`;

// Midden van Amsterdam, straal 15 km: Amsterdam, Amstelveen, Diemen e.o.
const SEARCH_BODY = {
  filters: [0],
  latitude: 52.3675734,
  longitude: 4.9041389,
  place: 'Amsterdam',
  placeObject: { placeType: '1', name: 'Amsterdam', latitude: '52.3675734', longitude: '4.9041389' },
  placeType: 1,
  radius: 15,
  sorting: 0,
  priceFrom: 0,
  priceTo: 9999,
  language: 'nl',
};

// Uit de JavaScript van vesteda.com: UnitStatus { ForRent: 1, Rented: 2, RentedWithReservation: 3, Reserved: 4 }.
const FOR_RENT = 1;

const objectSchema = z.object({
  id: z.number(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  houseNumberAddition: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  priceUnformatted: z.number(),
  size: z.number().nullable(),
  numberOfBedRooms: z.number().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: z.number(),
  url: z.string(),
  onlyMiddleRent: z.boolean(),
  onlySixtyFivePlus: z.boolean(),
  entitysubtypelabel: z.string().nullable(),
});

const responseSchema = z.object({
  results: z.object({ objects: z.array(z.unknown()), objectsCount: z.number() }),
});

type VestedaObject = z.infer<typeof objectSchema>;

export function normalizeVesteda(o: VestedaObject, raw: unknown): NormalizedListing {
  const houseNumber = o.houseNumber ? `${o.houseNumber}${o.houseNumberAddition ? `-${o.houseNumberAddition}` : ''}` : null;
  return {
    external_id: String(o.id),
    url: `${BASE}${o.url}`,
    street: o.street,
    house_number: houseNumber,
    postcode: o.postalCode,
    city: o.city,
    district: o.district,
    rent_net: o.priceUnformatted > 0 ? o.priceUnformatted : null,
    rent_gross: null,
    area_m2: o.size || null,
    // Vesteda geeft slaapkamers; kamers = slaapkamers + woonkamer.
    rooms: o.numberOfBedRooms ? o.numberOfBedRooms + 1 : null,
    unit_kind: 'Woonruimte',
    dwelling_type: o.entitysubtypelabel,
    energy_label: null,
    landlord: 'Vesteda',
    allocation_model: 'Vrije sector',
    label: o.onlyMiddleRent ? 'Middenhuur' : null,
    contract_type: null,
    target_group: o.onlySixtyFivePlus ? 'Senioren' : null,
    lat: o.latitude,
    lng: o.longitude,
    published_at: null,
    deadline_at: null,
    raw,
  };
}

// Alleen woningen die te huur zijn; verhuurd of gereserveerd telt als niet (meer) beschikbaar.
export function parseVesteda(json: unknown): NormalizedListing[] {
  const res = responseSchema.parse(json);
  if (res.results.objects.length === 0) throw new Error('Vesteda: lege lijst ontvangen');
  return res.results.objects
    .map((raw) => ({ o: objectSchema.parse(raw), raw }))
    .filter(({ o }) => o.status === FOR_RENT)
    .map(({ o, raw }) => normalizeVesteda(o, raw));
}

export function createVestedaSource(fetchImpl: typeof fetch = fetch): Source {
  return {
    id: 'vesteda',
    name: 'Vesteda',
    nextDelay: daytimeNextDelay,
    async fetchAll(): Promise<FetchResult> {
      const res = await fetchImpl(SEARCH_URL, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(SEARCH_BODY),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Vesteda: HTTP ${res.status}`);
      return { items: parseVesteda(await res.json()), complete: true };
    },
  };
}
