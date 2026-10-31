// MVGM (ikwilhuren.nu): grote vastgoedbeheerder. Gewone HTML, 10 woningen per pagina,
// sorteerbaar op publicatiedatum (nieuwste eerst).
//
// Ondiepe check: elke run alleen pagina 1. Staan daar onbekende woningen, dan ook de volgende pagina's
// tot er een bekende opduikt. Elke 6 uur (en bij de start) een volledige ronde over alle pagina's,
// zodat verdwenen woningen als offline worden gemarkeerd.

import * as cheerio from 'cheerio';
import type { FetchResult, NormalizedListing, Source } from '../types.js';
import { daytimeNextDelay, HEADERS, sleep, splitAddress } from './common.js';

const BASE = 'https://ikwilhuren.nu';
// Standaardstraal van de site voor "Gemeente Amsterdam" is 10 km.
const LIST_URL = (page: number) => `${BASE}/aanbod/amsterdam/?sort=aanbodDESC&page=${page}`;
const FULL_SWEEP_MS = 6 * 60 * 60_000;
const MAX_PAGES = 60;
const PAGE_PAUSE_MS = 1_500;

export interface MvgmCard {
  id: string;
  status: string;
  listing: NormalizedListing;
}

const toNumber = (s: string | undefined) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN);

export function parseMvgmPage(html: string): { cards: MvgmCard[]; lastPage: number } {
  const $ = cheerio.load(html);
  const cards: MvgmCard[] = [];

  $('.card-woning').each((_, el) => {
    const card = $(el);
    const link = card.find('a.stretched-link').first();
    const href = link.attr('href') ?? '';
    // /object/amsterdam-1031kh-3-batteryparkstraat-2be2d314027aace54ebcf9cac5c660ad/
    const id = href.match(/-([0-9a-f]{32})\/?$/)?.[1];
    if (!id) return;

    const title = link.text().replace(/\s+/g, ' ').trim(); // "Appartement Batteryparkstraat 3"
    const address = (card.find('img').attr('alt') ?? '').trim(); // "Batteryparkstraat 3"
    const type = address && title.endsWith(address) ? title.slice(0, -address.length).trim() : null;
    const { street, houseNumber } = splitAddress(address || title);

    const body = card.find('.card-body');
    const place = body.children('span').eq(1).text().trim(); // "1031KH Amsterdam - 2Km."
    const placeMatch = place.match(/^(\d{4}\s?[A-Z]{2})\s+(.+?)(?:\s+-\s+[\d,.]+\s*Km\.?)?$/i);
    const facts = body.find('.dotted-spans').text().replace(/\s+/g, ' ');
    const rent = toNumber(facts.match(/€\s*([\d.]+)(?:,-|,\d{2})?\s*\/mnd/)?.[1]);
    const area = toNumber(facts.match(/([\d.,]+)\s*m\s*2/)?.[1]);
    const bedrooms = Number(facts.match(/(\d+)\s+slaapkamer/)?.[1]);
    // Status staat in het label met het gekleurde bolletje; andere labels zijn extra's ("met berging", "55+").
    const status = card.find('.badges .badge').filter((_, b) => $(b).find('.status-dot').length > 0).first().text().replace(/\s+/g, ' ').trim();
    const extras = card
      .find('.badges .badge')
      .filter((_, b) => $(b).find('.status-dot').length === 0)
      .map((_, b) => $(b).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);

    cards.push({
      id,
      status,
      listing: {
        external_id: id,
        url: new URL(href, BASE).toString(),
        street,
        house_number: houseNumber,
        postcode: placeMatch?.[1]?.replace(/\s/g, '').toUpperCase() ?? null,
        city: placeMatch?.[2] ?? null,
        district: null,
        rent_net: Number.isFinite(rent) ? rent : null,
        rent_gross: null,
        area_m2: Number.isFinite(area) ? area : null,
        rooms: Number.isFinite(bedrooms) ? bedrooms + 1 : null,
        unit_kind: 'Woonruimte',
        dwelling_type: type || null,
        energy_label: null,
        landlord: 'MVGM',
        allocation_model: 'Vrije sector',
        label: extras.join(', ') || null,
        contract_type: null,
        target_group: extras.some((e) => /55\+|65\+|senior/i.test(e)) ? 'Senioren' : null,
        lat: null,
        lng: null,
        published_at: null,
        deadline_at: null,
        raw: { title, place, facts: facts.trim(), status },
      },
    });
  });

  const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  return { cards, lastPage: pages.length ? Math.max(...pages) : 1 };
}

// Alleen woningen met de status "Te huur" tellen als beschikbaar.
const isForRent = (c: MvgmCard) => /^te huur$/i.test(c.status);

export function createMvgmSource(fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Source {
  let known = new Map<string, NormalizedListing>();
  let lastFullSweep = 0;

  async function page(n: number) {
    const res = await fetchImpl(LIST_URL(n), { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`MVGM: HTTP ${res.status} op pagina ${n}`);
    const parsed = parseMvgmPage(await res.text());
    if (n === 1 && parsed.cards.length === 0) throw new Error('MVGM: geen woningen gevonden op pagina 1');
    return parsed;
  }

  async function fullSweep(): Promise<FetchResult> {
    const all = new Map<string, NormalizedListing>();
    let lastPage = 1;
    for (let n = 1; n <= Math.min(lastPage, MAX_PAGES); n++) {
      if (n > 1) await sleep(PAGE_PAUSE_MS);
      const p = await page(n);
      lastPage = Math.max(lastPage, p.lastPage);
      for (const c of p.cards) if (isForRent(c)) all.set(c.id, c.listing);
      if (p.cards.length === 0) break;
    }
    known = all;
    lastFullSweep = now();
    return { items: [...all.values()], complete: true };
  }

  return {
    id: 'mvgm',
    name: 'MVGM',
    nextDelay: daytimeNextDelay,
    async fetchAll(): Promise<FetchResult> {
      if (now() - lastFullSweep > FULL_SWEEP_MS) return fullSweep();

      // Ondiep: pagina's aflopen tot we een bekende woning tegenkomen.
      const fresh = new Map<string, NormalizedListing>();
      for (let n = 1; n <= MAX_PAGES; n++) {
        if (n > 1) await sleep(PAGE_PAUSE_MS);
        const p = await page(n);
        let sawKnown = false;
        for (const c of p.cards) {
          if (known.has(c.id)) sawKnown = true;
          if (isForRent(c)) fresh.set(c.id, c.listing);
          else known.delete(c.id);
        }
        if (sawKnown || p.cards.length === 0 || n >= p.lastPage) break;
      }
      for (const [id, l] of fresh) known.set(id, l);
      // Bekende lijst + bijgewerkte nieuwste woningen; niet compleet, dus niets wordt als gemist geteld.
      return { items: [...known.values()], complete: false };
    },
  };
}
