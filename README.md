# huurradar

Huurwoningzoeker voor mezelf en twee vrienden. Verzamelt het aanbod van meerdere huursites, filtert op
ieders zoekprofiel en stuurt direct een melding (Telegram, of WhatsApp via CallMeBot) zodra
er een nieuwe passende woning online komt. Wie als eerste reageert, maakt vaak de meeste kans.

Eerste focus: **middenhuur en sociale huur in Amsterdam**.

## Architectuur

```
worker (Node, Google Cloud VM)        Supabase (Postgres, auth, realtime)        web (Vite + React + Chakra)
  scheduler per bron                    listings, search_profiles, matches          realtime lijst met matches
  → ondiepe check (vingerafdruk)  ───▶  trigger: match tegen alle profielen  ◀───  statussen, filters, dismiss
  → diff → detail → upsert              scrape_runs (monitoring)
  → notifier (Telegram/WhatsApp)  ◀──── matches waar notified_at IS NULL
```

- **worker**: draait als Docker-container op een Google Cloud e2-micro-VM. Eén adapter per bron.
- **Supabase**: database, auth (registreren met uitnodigingscode), RLS en realtime.
- **web**: Vite + React + TypeScript + Chakra UI v3, praat rechtstreeks met Supabase.

## Status

- [x] Bronnenonderzoek: zie [docs/bronnen.md](docs/bronnen.md)
- [x] Probe-script om bronnen vanaf de VM te testen
- [x] **MVP voor Amsterdam DAK**: database, worker, Telegram- en WhatsApp-meldingen en web-app.
      Installeren: zie [docs/handleiding.md](docs/handleiding.md)
- [x] Web-app online (Vercel)
- [x] Vesteda en MVGM (ikwilhuren.nu)
- [ ] Meer beleggers en verhuurmakelaars (zie [docs/bronnen.md](docs/bronnen.md))
- [ ] Automatisch reageren

## Repo

| Map | Inhoud |
|---|---|
| `apps/worker` | scraper + notifier (Node/TypeScript), draait in Docker op de VM |
| `apps/web` | web-app (Vite + React + Chakra UI v3) |
| `supabase/migrations` | databaseschema, RLS, matching en worker-functies |
| `supabase/tests` | tests van de migrations op een kale Postgres |
| `probe` | los script om bronnen te testen |
| `docs` | bronnenonderzoek en handleiding |

## Ontwikkelen

```bash
pnpm install
pnpm test                                    # unit tests worker
pnpm typecheck
PGHOST=... supabase/tests/run.sh             # databasetests (vereist een lokale Postgres)
pnpm --filter @huurradar/web dev             # web-app op http://localhost:5173
```

## Probe draaien

Test welke bronnen vanaf een machine bereikbaar zijn. Op de VM (Docker is daar al geïnstalleerd):

```bash
git clone https://github.com/IngmarGlerum/huurradar.git
cd huurradar
docker run --rm -v "$PWD/probe:/probe:ro" node:22-slim node /probe/probe.mjs
```

Per bron krijg je de HTTP-status, hoeveel advertenties gevonden zijn en of er een Cloudflare-check
tussen zit. Er worden geen gegevens opgeslagen of verstuurd.

De repo is privé, dus `git clone` vraagt om inloggegevens. Gebruik een
[personal access token](https://github.com/settings/tokens) met alleen leesrechten op deze repo als
wachtwoord, of kopieer de map `probe/` handmatig naar de VM.
