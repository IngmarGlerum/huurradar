// Makelaardij Van der Linden (vanderlinden.nl): verhuurt o.a. voor Amvest in Amsterdam.
// Eén HTML-pagina met alle huurwoningen van het land; geen paginering.

import * as cheerio from 'cheerio';
import type { FetchResult, NormalizedListing, Source } from '../types.js';
import { daytimeNextDelay, HTML_HEADERS, splitAddress } from './common.js';

const BASE = 'https://www.vanderlinden.nl';
const LIST_URL = `${BASE}/woning-huren/`;

// Labels op de foto. Zonder label of met een van deze labels: beschikbaar.
const AVAILABLE = /^(direct beschikbaar|binnenkort beschikbaar|seniorenwoning|)$/i;

const toNumber = (s: string | undefined) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN);

export function parseVanderLinden(html: string): NormalizedListing[] {
  const $ = cheerio.load(html);
  const items: NormalizedListing[] = [];
  let cards = 0;

  $('.woninginfo').each((_, el) => {
    cards++;
    const card = $(el);
    const href = card.find('a.blocklink').attr('href') ?? '';
    // /huurwoning/Wijnsilostraat-12-Amsterdam/2561/
    const id = href.match(/\/(\d+)\/?$/)?.[1];
    if (!id) return;

    const status = card.find('.fotolabel').text().replace(/\s+/g, ' ').trim();
    if (!AVAILABLE.test(status)) return; // onder optie, belangstellendenlijst

    const text = card.text().replace(/\s+/g, ' ');
    const rent = toNumber(text.match(/€\s*([\d.]+)\s*per maand/)?.[1]);
    if (!Number.isFinite(rent)) return; // projecten zonder prijs

    const { street, houseNumber } = splitAddress(card.find('strong').first().text());
    const city = card.find('.fa-location-dot').parent().text().replace(/\s+/g, ' ').trim();
    const area = toNumber(card.find('.kiko-square-footage').parent().text().match(/([\d.,]+)\s*m²/)?.[1]);
    const bedrooms = Number(card.find('.kiko-bedroom').parent().text().trim());
    const energy = card.find('.energielabel').first().text().trim();

    items.push({
      external_id: id,
      url: new URL(href, BASE).toString(),
      street,
      house_number: houseNumber,
      postcode: null,
      city: city || null,
      district: null,
      rent_net: rent,
      rent_gross: null,
      area_m2: Number.isFinite(area) ? area : null,
      rooms: Number.isFinite(bedrooms) && bedrooms > 0 ? bedrooms + 1 : null,
      unit_kind: 'Woonruimte',
      dwelling_type: null,
      energy_label: energy || null,
      landlord: 'Van der Linden',
      allocation_model: 'Vrije sector',
      label: status || null,
      contract_type: null,
      target_group: /senior/i.test(status) ? 'Senioren' : null,
      lat: null,
      lng: null,
      published_at: null,
      deadline_at: null,
      raw: { text: text.trim(), status },
    });
  });

  if (cards === 0) throw new Error('Van der Linden: geen woningen gevonden op de pagina');
  return items;
}

export function createVanderLindenSource(fetchImpl: typeof fetch = fetch): Source {
  return {
    id: 'vanderlinden',
    name: 'Van der Linden',
    nextDelay: daytimeNextDelay,
    async fetchAll(): Promise<FetchResult> {
      const res = await fetchImpl(LIST_URL, { headers: HTML_HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Van der Linden: HTTP ${res.status}`);
      return { items: parseVanderLinden(await res.text()), complete: true };
    },
  };
}
