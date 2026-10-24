// Probe: test vanaf deze machine welke bronnen bereikbaar zijn en wat ze teruggeven.
// Geen dependencies, alleen Node 22. Draaien: zie README.md ("Probe draaien").

import { readFile } from 'node:fs/promises';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl;q=0.9' };

// Publieke, vaste CSRF-waarde van OutSystems voor niet-ingelogde bezoekers.
const OUTSYSTEMS_ANONYMOUS_CSRF = 'T6C+9iB49TLra4jEsMeSckDMNhQ=';

const DAK = 'https://amsterdam.mijndak.nl';

async function probeDak() {
  const t0 = Date.now();
  const info = await fetch(`${DAK}/moduleservices/moduleinfo`, { headers: HEADERS });
  if (!info.ok) return { bron: 'DAK', ok: false, status: info.status };
  const versionToken = (await info.json()).manifest.versionToken;

  const body = JSON.parse(await readFile(new URL('./dak-aanbod-request.json', import.meta.url), 'utf8'));
  body.versionInfo.moduleVersion = versionToken;

  const res = await fetch(
    `${DAK}/screenservices/DAKWP/Overzicht/Woningaanbod/DataActionHaalUitgelogdAanbod`,
    {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-CSRFToken': OUTSYSTEMS_ANONYMOUS_CSRF,
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => null);
  const lijst = json?.data?.PublicatieLijst?.List ?? [];
  const telling = (f) => lijst.reduce((acc, p) => ((acc[f(p)] = (acc[f(p)] ?? 0) + 1), acc), {});

  return {
    bron: 'DAK',
    ok: res.ok && lijst.length > 0,
    status: res.status,
    ms: Date.now() - t0,
    apiVersieGewijzigd: json?.versionInfo?.hasApiVersionChanged,
    fout: json?.exception?.message,
    aantal: lijst.length,
    perModel: telling((p) => p.PublicatieModel),
    perPlaats: telling((p) => p.Adres.Woonplaats),
    voorbeeld: lijst.slice(0, 3).map((p) => ({
      id: p.Id,
      gepubliceerd: p.PublicatieDatum,
      einde: p.EinddatumTijd,
      model: p.PublicatieModel,
      adres: `${p.Adres.Straatnaam} ${p.Adres.Huisnummer}${p.Adres.Huisletter}, ${p.Adres.Woonplaats}`,
      nettoHuur: p.Eenheid.NettoHuur,
      m2: p.Eenheid.WoonVertrekkenTotOpp,
    })),
  };
}

async function probeHtml(bron, url, linkPatroon) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html' } });
  const html = await res.text();
  const links = new Set([...html.matchAll(linkPatroon)].map((m) => m[0]));
  return {
    bron,
    ok: res.ok && links.size > 0,
    status: res.status,
    ms: Date.now() - t0,
    cloudflare: /cf_chl_opt|challenge-platform|Just a moment|Even geduld/i.test(html),
    advertentielinks: links.size,
    voorbeeld: [...links].slice(0, 3),
  };
}

const probes = [
  probeDak,
  () =>
    probeHtml(
      'Pararius',
      'https://www.pararius.nl/huurwoningen/amsterdam/0-1200',
      /\/(appartement|huis|studio|kamer)-te-huur\/amsterdam\/[a-z0-9]+\/[a-z0-9-]+/g,
    ),
  () =>
    probeHtml(
      'Huurwoningen.nl',
      'https://www.huurwoningen.nl/in/amsterdam/?price=0-1200',
      /\/huren\/amsterdam\/[a-z0-9]+\/[a-z0-9-]+/g,
    ),
];

for (const probe of probes) {
  try {
    console.log(JSON.stringify(await probe(), null, 2));
  } catch (e) {
    console.log(JSON.stringify({ fout: String(e) }));
  }
}
