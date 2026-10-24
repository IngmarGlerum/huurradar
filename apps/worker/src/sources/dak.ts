// Amsterdam DAK (amsterdam.mijndak.nl), voorheen WoningNet Stadsregio Amsterdam.
// Zie docs/bronnen.md voor hoe deze API werkt en waarom de request er zo uitziet.

import { z } from 'zod';
import requestTemplate from './dak-aanbod-request.json' with { type: 'json' };
import { amsterdamMinuteOfDay, jitter } from '../time.js';
import { SourceChangedError, type FetchResult, type NormalizedListing, type Source } from '../types.js';

const BASE = 'https://amsterdam.mijndak.nl';
const AANBOD_URL = `${BASE}/screenservices/DAKWP/Overzicht/Woningaanbod/DataActionHaalUitgelogdAanbod`;
// Publieke, vaste CSRF-waarde van OutSystems voor niet-ingelogde bezoekers.
const ANONYMOUS_CSRF = 'T6C+9iB49TLra4jEsMeSckDMNhQ=';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'nl-NL,nl;q=0.9',
};

// DAK publiceert vrijwel alles om 00:01. Rond middernacht elke minuut, verder elke 10 minuten.
const PEAK_START = 23 * 60 + 58;
const PEAK_END = 20;

export function dakNextDelay(now: Date): number {
  const m = amsterdamMinuteOfDay(now);
  const peak = m >= PEAK_START || m < PEAK_END;
  return peak ? jitter(60_000, 0.1) : jitter(10 * 60_000, 0.1);
}

// Getallen komen als string ("713.02"); "0.0" met Bekend=false betekent onbekend.
const num = z.union([z.string(), z.number()]).transform((v) => Number(v));

const publicatieSchema = z.object({
  Id: z.string(),
  PublicatieDatum: z.string(),
  EinddatumTijd: z.string(),
  PublicatieModel: z.string(),
  PublicatieLabel: z.string(),
  ContractVorm: z.string(),
  IsCluster: z.boolean(),
  EenheidSoort: z.string(),
  Adres: z.object({
    Straatnaam: z.string(),
    Huisnummer: z.number(),
    Huisletter: z.string(),
    HuisnummerToevoeging: z.string(),
    Postcode: z.string(),
    Woonplaats: z.string(),
    Wijk: z.string(),
  }),
  Eenheid: z.object({
    DetailSoort: z.string(),
    AantalKamers: z.number(),
    WoonVertrekkenTotOpp: num,
    Doelgroep: z.string(),
    NettoHuurBekend: z.boolean(),
    NettoHuur: num,
    BrutoHuurBekend: z.boolean(),
    Brutohuur: num,
    Lengtegraad: num,
    Breedtegraad: num,
    EnergieLabel: z.string(),
    Eigenaar: z.string(),
  }),
  Cluster: z.object({
    Naam: z.string(),
    DetailSoort: z.string(),
    Doelgroep: z.string(),
    PrijsMinBekend: z.boolean(),
    PrijsMin: num,
    WoonVertrekkenTotOppMin: z.number(),
    AantalKamersMin: z.number(),
    Lengtegraad: num,
    Breedtegraad: num,
    Eigenaar: z.string(),
  }),
});

const responseSchema = z.object({
  versionInfo: z.object({
    hasModuleVersionChanged: z.boolean(),
    hasApiVersionChanged: z.boolean(),
  }),
  data: z
    .object({
      PublicatieLijst: z.object({ List: z.array(z.unknown()) }).optional(),
      Result: z.object({ IsSuccess: z.boolean(), ErrorMessage: z.string() }).optional(),
    })
    .optional(),
  exception: z.object({ message: z.string() }).optional(),
});

type Publicatie = z.infer<typeof publicatieSchema>;

const orNull = <T>(v: T | '' | 0): T | null => (v === '' || v === 0 ? null : v);

export function detailUrl(id: string): string {
  return `${BASE}/HuisDetails?PublicatieId=${encodeURIComponent(id)}`;
}

export function normalizePublicatie(p: Publicatie, raw: unknown): NormalizedListing {
  const a = p.Adres;
  const e = p.Eenheid;
  const c = p.Cluster;
  // Toevoeging staat er soms al met streepje in ("-hs"), soms zonder ("H").
  const addition = a.HuisnummerToevoeging.replace(/^-+/, '').trim();
  const houseNumber = a.Huisnummer ? `${a.Huisnummer}${a.Huisletter}${addition ? `-${addition}` : ''}` : null;
  const rentNet = p.IsCluster ? (c.PrijsMinBekend ? c.PrijsMin : null) : e.NettoHuurBekend ? e.NettoHuur : null;

  return {
    external_id: p.Id,
    url: detailUrl(p.Id),
    street: orNull(a.Straatnaam) ?? (p.IsCluster ? orNull(c.Naam) : null),
    house_number: houseNumber,
    postcode: orNull(a.Postcode),
    city: orNull(a.Woonplaats),
    district: orNull(a.Wijk),
    rent_net: rentNet,
    rent_gross: !p.IsCluster && e.BrutoHuurBekend ? e.Brutohuur : null,
    area_m2: orNull(p.IsCluster ? c.WoonVertrekkenTotOppMin : e.WoonVertrekkenTotOpp),
    rooms: orNull(p.IsCluster ? c.AantalKamersMin : e.AantalKamers),
    unit_kind: orNull(p.EenheidSoort),
    dwelling_type: orNull(p.IsCluster ? c.DetailSoort : e.DetailSoort),
    energy_label: orNull(e.EnergieLabel),
    landlord: orNull(p.IsCluster ? c.Eigenaar : e.Eigenaar),
    allocation_model: orNull(p.PublicatieModel),
    label: orNull(p.PublicatieLabel),
    contract_type: orNull(p.ContractVorm),
    target_group: orNull(p.IsCluster ? c.Doelgroep : e.Doelgroep),
    lat: orNull(p.IsCluster ? c.Breedtegraad : e.Breedtegraad),
    lng: orNull(p.IsCluster ? c.Lengtegraad : e.Lengtegraad),
    published_at: p.PublicatieDatum,
    deadline_at: p.EinddatumTijd,
    raw,
  };
}

// Zet de ruwe API-respons om naar woningen. Gooit een fout bij een lege of onbegrijpelijke lijst,
// zodat een kapotte adapter nooit "alles is weg" betekent.
export function parseAanbod(json: unknown): NormalizedListing[] {
  const res = responseSchema.parse(json);
  if (res.versionInfo.hasApiVersionChanged) {
    throw new SourceChangedError('DAK: API-versie gewijzigd, adapter bijwerken (apiVersion in dak.ts)');
  }
  if (res.exception) throw new Error(`DAK: serverfout: ${res.exception.message}`);
  if (res.data?.Result && !res.data.Result.IsSuccess) {
    throw new Error(`DAK: ${res.data.Result.ErrorMessage || 'onbekende fout'}`);
  }
  const list = res.data?.PublicatieLijst?.List ?? [];
  if (list.length === 0) throw new Error('DAK: lege lijst ontvangen');
  return list.map((raw) => normalizePublicatie(publicatieSchema.parse(raw), raw));
}

export function createDakSource(fetchImpl: typeof fetch = fetch): Source {
  let moduleVersion: string | null = null;

  async function loadModuleVersion(): Promise<string> {
    const res = await fetchImpl(`${BASE}/moduleservices/moduleinfo`, { headers: HEADERS });
    if (!res.ok) throw new Error(`DAK: moduleinfo HTTP ${res.status}`);
    const json = (await res.json()) as { manifest?: { versionToken?: string } };
    const token = json.manifest?.versionToken;
    if (!token) throw new SourceChangedError('DAK: geen versionToken in moduleinfo');
    return token;
  }

  async function request(version: string): Promise<unknown> {
    const body = structuredClone(requestTemplate);
    body.versionInfo.moduleVersion = version;
    const res = await fetchImpl(AANBOD_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json; charset=UTF-8', 'X-CSRFToken': ANONYMOUS_CSRF },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DAK: aanbod HTTP ${res.status}`);
    return res.json();
  }

  return {
    id: 'dak',
    name: 'Amsterdam DAK',
    nextDelay: dakNextDelay,
    async fetchAll(): Promise<FetchResult> {
      moduleVersion ??= await loadModuleVersion();
      let json = await request(moduleVersion);
      // Na een update van de site eenmalig het nieuwe versietoken ophalen en opnieuw proberen.
      if ((json as { versionInfo?: { hasModuleVersionChanged?: boolean } }).versionInfo?.hasModuleVersionChanged) {
        moduleVersion = await loadModuleVersion();
        json = await request(moduleVersion);
      }
      return { items: parseAanbod(json), complete: true };
    },
  };
}
