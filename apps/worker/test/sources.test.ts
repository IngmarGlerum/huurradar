import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vestedaFixture from './fixtures/vesteda-search.json' with { type: 'json' };
import { daytimeNextDelay, splitAddress } from '../src/sources/common.js';
import { createMvgmSource, parseMvgmPage } from '../src/sources/mvgm.js';
import { parseVesteda } from '../src/sources/vesteda.js';

const mvgmHtml = readFileSync(new URL('./fixtures/mvgm-aanbod.html', import.meta.url), 'utf8');

describe('Vesteda', () => {
  it('neemt alleen woningen die te huur zijn (status 1)', () => {
    const items = parseVesteda(vestedaFixture);
    const statuses = vestedaFixture.results.objects.map((o) => o.status);
    expect(items).toHaveLength(statuses.filter((s) => s === 1).length);
    for (const i of items) {
      expect(i.url).toMatch(/^https:\/\/www\.vesteda\.com\/nl\//);
      expect(i.rent_net).toBeGreaterThan(0);
      expect(i.postcode).toMatch(/^\d{4}[A-Z]{2}$/);
      expect(i.landlord).toBe('Vesteda');
    }
  });

  it('markeert middenhuur', () => {
    const json = structuredClone(vestedaFixture);
    for (const o of json.results.objects) o.status = 1;
    const middenhuur = parseVesteda(json).filter((i) => i.label === 'Middenhuur');
    expect(middenhuur.length).toBeGreaterThan(0);
  });

  it('weigert een lege lijst', () => {
    const json = structuredClone(vestedaFixture);
    json.results.objects = [];
    expect(() => parseVesteda(json)).toThrow(/lege lijst/);
  });
});

describe('MVGM', () => {
  it('leest kaarten van een echte pagina', () => {
    const { cards, lastPage } = parseMvgmPage(mvgmHtml);
    expect(cards).toHaveLength(10);
    expect(lastPage).toBe(27);
    const first = cards[0]!;
    expect(first.status).toBe('Te huur');
    expect(first.listing).toMatchObject({
      street: 'Batteryparkstraat',
      house_number: '3',
      postcode: '1031KH',
      city: 'Amsterdam',
      rent_net: 1733,
      area_m2: 68,
      rooms: 2,
      dwelling_type: 'Appartement',
    });
    expect(first.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ondiepe check: alleen pagina 1 als daar een bekende woning staat', async () => {
    const calls: string[] = [];
    let t = 0;
    const fakeFetch = (async (url: string | URL) => {
      calls.push(String(url));
      // Eén pagina met de fixture, verder leeg.
      const page = Number(new URL(String(url)).searchParams.get('page'));
      return new Response(page === 1 ? mvgmHtml : mvgmHtml.replace(/card-woning/g, 'x'));
    }) as typeof fetch;
    const source = createMvgmSource(fakeFetch, () => t);
    t = 7 * 60 * 60_000; // eerste run: volledige ronde

    const full = await source.fetchAll();
    expect(full.complete).toBe(true);
    const callsAfterFull = calls.length;

    t += 60_000;
    const shallow = await source.fetchAll();
    expect(shallow.complete).toBe(false);
    expect(calls.length - callsAfterFull).toBe(1);
    expect(shallow.items.length).toBe(full.items.length);
  }, 120_000);
});

describe('common', () => {
  it('splitst adressen', () => {
    expect(splitAddress('Batteryparkstraat 3')).toEqual({ street: 'Batteryparkstraat', houseNumber: '3' });
    expect(splitAddress('Tt. Vasumweg 32 D7')).toEqual({ street: 'Tt. Vasumweg', houseNumber: '32 D7' });
    expect(splitAddress('Geen nummer')).toEqual({ street: 'Geen nummer', houseNumber: null });
  });

  it('checkt overdag elke 3 minuten en \'s nachts elk kwartier', () => {
    expect(daytimeNextDelay(new Date('2026-10-20T10:00:00Z'))).toBeLessThanOrEqual(3 * 60_000 * 1.15);
    expect(daytimeNextDelay(new Date('2026-10-20T01:00:00Z'))).toBeGreaterThanOrEqual(15 * 60_000 * 0.9);
  });
});
