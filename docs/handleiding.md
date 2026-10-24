# Handleiding: huurradar installeren

Eenmalig, in deze volgorde. Reken op een half uur tot een uur.

## 1. Database (Supabase)

1. Open je project op [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Plak de inhoud van [`supabase/migrations/20261024000000_init.sql`](../supabase/migrations/20261024000000_init.sql)
   en klik op **Run**. Je ziet "Success. No rows returned".
3. **Authentication → Sign In / Providers**: zet **Allow new users to sign up** uit. Alleen mensen die
   je uitnodigt kunnen dan inloggen.
4. **Authentication → Users → Add user → Send invitation**: nodig jezelf en je twee vrienden uit
   met hun e-mailadres.
5. **Authentication → URL Configuration**:
   - **Site URL**: het adres waar de web-app draait (zie stap 4). Voor nu `http://localhost:5173`.
   - **Redirect URLs**: voeg `http://localhost:5173` toe, en later het adres van de gehoste app.
6. **Project Settings → API Keys**: hier staan de **publishable key** (voor de web-app) en de
   **secret key** (voor de worker). Deel de secret key met niemand.

## 2. WhatsApp-meldingen activeren (CallMeBot), per persoon

Iedereen die meldingen wil, doet dit zelf op zijn eigen telefoon:

1. Open de [WhatsApp-instructies van CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/)
   en zet het telefoonnummer van de bot in je contacten.
2. Stuur de bot via WhatsApp het activatiebericht dat op die pagina staat.
3. Je krijgt een antwoord met je **API-key**.
4. Vul je nummer (`+316...`) en de API-key in de web-app in, op het tabblad **WhatsApp**.

## 3. Worker op de Google Cloud-VM

Via SSH op de VM:

```bash
cd ~/huurradar          # de map van de probe; anders eerst: git clone https://github.com/IngmarGlerum/huurradar.git
git pull
cp .env.example .env
nano .env               # vul SUPABASE_SECRET_KEY in; zet voor de eerste test DRY_RUN=true
./deploy.sh             # bouwt het image (eerste keer een paar minuten) en start de worker
docker compose logs -f  # stoppen met Ctrl+C; de worker blijft draaien
```

In de logs zie je na een paar seconden een regel `"msg":"verwerkt"` met `"new":152` (of het aantal dat
dan online staat). Op het tabblad **Status** van de web-app zie je dezelfde run.

**Testen zonder berichten:** met `DRY_RUN=true` logt de worker de WhatsApp-teksten
(`"msg":"DRY_RUN: melding niet verstuurd"`) in plaats van ze te versturen. Werkt alles, zet dan
`DRY_RUN=false` in `.env` en draai `./deploy.sh` opnieuw.

**Updates:** na elke nieuwe versie in GitHub op de VM `./deploy.sh` draaien.

**Beheerdersmelding (optioneel):** vul `ALERT_WHATSAPP_PHONE` en `ALERT_CALLMEBOT_APIKEY` in `.env` in
(je eigen nummer en key). Je krijgt dan een WhatsApp als DAK 3 keer achter elkaar faalt of als de
API van DAK is gewijzigd.

## 4. Web-app

### Lokaal (om te beginnen)

Op je eigen computer, in de map van de repo:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # vul de publishable key in
pnpm --filter @huurradar/web dev               # open http://localhost:5173
```

Log in met je e-mailadres; je krijgt een inloglink. Maak op het tabblad **Zoekprofielen** een profiel
aan en vul op **WhatsApp** je gegevens in.

### Online (zodat je vrienden er ook bij kunnen)

De web-app is een statische site; gratis hosten kan bijvoorbeeld bij Netlify of Cloudflare Pages, gekoppeld
aan deze GitHub-repo:

- **Build command:** `pnpm --filter @huurradar/web build`
- **Publish directory:** `apps/web/dist`
- **Environment variables:** `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`

Zet daarna het adres van de site in Supabase bij **Site URL** en **Redirect URLs** (stap 1.5).

## Hoe het werkt

- De worker vraagt rond middernacht (23:58–00:20) elke minuut het DAK-aanbod op, verder elke 10 minuten.
  DAK publiceert vrijwel alles om 00:01.
- Is de lijst gelijk aan de vorige keer, dan wordt er niets geschreven.
- Nieuwe woningen worden in de database direct gematcht tegen ieders zoekprofielen. Elke nieuwe match
  geeft één WhatsApp; meerdere tegelijk worden gebundeld.
- Een woning die 2 keer achter elkaar niet meer in het aanbod staat, krijgt in de app een rode rand
  ("staat niet meer online"). Na de reactietermijn: "reactietermijn verlopen".
- Een nieuw of gewijzigd zoekprofiel toont de woningen die nu al online staan, zonder WhatsApp.
- Parkeerplaatsen worden nooit gematcht.

## Problemen

| Wat je ziet | Wat je doet |
|---|---|
| Status: "geen runs" | Draait de worker? `docker compose ps` en `docker compose logs --tail 50` op de VM |
| Status: "fout" met `HTTP 403` | DAK blokkeert het IP van de VM; meld het in de chat |
| Melding "API-versie gewijzigd" | DAK heeft de site aangepast; de adapter moet worden bijgewerkt |
| Geen WhatsApp, wel matches | Klopt nummer/API-key? In de worker-logs staat `melding mislukt` met de reden |
| Inloglink komt niet aan | Check je spam; Supabase verstuurt maar een paar mails per uur met de standaardmailserver |
