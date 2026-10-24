import { describe, expect, it } from 'vitest';
import fixture from './fixtures/dak-aanbod.json' with { type: 'json' };
import { createDakSource, dakNextDelay, detailUrl, parseAanbod } from '../src/sources/dak.js';
import { SourceChangedError } from '../src/types.js';

const clone = () => structuredClone(fixture) as typeof fixture;

describe('parseAanbod', () => {
  it('zet een echte DAK-respons om naar woningen', () => {
    const items = parseAanbod(fixture);
    expect(items).toHaveLength(6);
    for (const i of items) {
      expect(i.external_id).toMatch(/^\d+$/);
      expect(i.url).toBe(detailUrl(i.external_id));
      expect(i.deadline_at).toMatch(/Z$/);
      expect(i.rent_net).toBeGreaterThan(0);
      expect(i.city).toBeTruthy();
    }
    expect(new Set(items.map((i) => i.allocation_model))).toEqual(new Set(['Vrije sector', 'Lotingmodel', 'Aanbodmodel']));
  });

  it('gebruikt bij clusters de clustergegevens', () => {
    const cluster = parseAanbod(fixture).find((i) => i.external_id === '384788')!;
    expect(cluster.street).toMatch(/^Molenwerf/);
    expect(cluster.house_number).toBeNull();
    expect(cluster.rent_net).toBe(849.61);
    expect(cluster.area_m2).toBe(49);
    expect(cluster.rooms).toBe(3);
    expect(cluster.landlord).toBe('WormerWonen');
    expect(cluster.lat).toBeNull();
    expect(cluster.dwelling_type).toBe('Galerijflat');
  });

  it('normaliseert huisnummertoevoegingen', () => {
    const json = clone();
    const p = json.data.PublicatieLijst.List[0]!;
    p.Adres.Huisnummer = 26;
    p.Adres.HuisnummerToevoeging = '-hs';
    expect(parseAanbod(json)[0]!.house_number).toBe('26-hs');
    p.Adres.HuisnummerToevoeging = 'H';
    expect(parseAanbod(json)[0]!.house_number).toBe('26-H');
  });

  it('weigert een lege lijst', () => {
    const json = clone();
    json.data.PublicatieLijst.List = [];
    expect(() => parseAanbod(json)).toThrow(/lege lijst/);
  });

  it('meldt een gewijzigde API als SourceChangedError', () => {
    const json = clone();
    json.versionInfo.hasApiVersionChanged = true;
    expect(() => parseAanbod(json)).toThrow(SourceChangedError);
  });

  it('weigert een onverwachte structuur', () => {
    const json = clone() as { data: { PublicatieLijst: { List: unknown[] } } };
    json.data.PublicatieLijst.List = [{ Id: 1 }];
    expect(() => parseAanbod(json)).toThrow();
  });
});

describe('createDakSource', () => {
  it('haalt bij een nieuwe siteversie het versietoken opnieuw op', async () => {
    const calls: string[] = [];
    let token = 'oud';
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u.includes('moduleinfo') ? 'moduleinfo' : 'aanbod');
      if (u.includes('moduleinfo')) return Response.json({ manifest: { versionToken: token } });
      const sent = JSON.parse(String(init?.body)).versionInfo.moduleVersion;
      const json = clone();
      json.versionInfo.hasModuleVersionChanged = sent !== 'nieuw';
      return Response.json(json);
    }) as typeof fetch;

    const source = createDakSource(fakeFetch);
    token = 'nieuw';
    // Eerste moduleinfo geeft 'nieuw' al, dus geen retry nodig.
    expect((await source.fetchAll()).items).toHaveLength(6);
    expect(calls).toEqual(['moduleinfo', 'aanbod']);
  });

  it('probeert één keer opnieuw als het token verouderd is', async () => {
    const calls: string[] = [];
    let token = 'oud';
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u.includes('moduleinfo') ? 'moduleinfo' : 'aanbod');
      if (u.includes('moduleinfo')) return Response.json({ manifest: { versionToken: token } });
      const json = clone();
      json.versionInfo.hasModuleVersionChanged = JSON.parse(String(init?.body)).versionInfo.moduleVersion !== 'nieuw';
      token = 'nieuw';
      return Response.json(json);
    }) as typeof fetch;

    const { items, complete } = await createDakSource(fakeFetch).fetchAll();
    expect(items).toHaveLength(6);
    expect(complete).toBe(true);
    expect(calls).toEqual(['moduleinfo', 'aanbod', 'moduleinfo', 'aanbod']);
  });
});

describe('dakNextDelay', () => {
  // 22:30 UTC = 00:30 zomertijd, 23:00 UTC = 00:00 wintertijd (26 okt 2026 is wintertijd).
  it('checkt rond middernacht elke minuut', () => {
    expect(dakNextDelay(new Date('2026-10-20T22:01:00Z'))).toBeLessThanOrEqual(66_000); // 00:01 zomertijd
    expect(dakNextDelay(new Date('2026-12-01T23:05:00Z'))).toBeLessThanOrEqual(66_000); // 00:05 wintertijd
    expect(dakNextDelay(new Date('2026-12-01T22:59:00Z'))).toBeLessThanOrEqual(66_000); // 23:59 wintertijd
  });

  it('checkt de rest van de dag elke 10 minuten', () => {
    const d = dakNextDelay(new Date('2026-10-20T10:00:00Z'));
    expect(d).toBeGreaterThanOrEqual(540_000);
    expect(d).toBeLessThanOrEqual(660_000);
    expect(dakNextDelay(new Date('2026-12-01T23:30:00Z'))).toBeGreaterThanOrEqual(540_000); // 00:30 wintertijd
  });
});
