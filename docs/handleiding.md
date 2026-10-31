# Handleiding: huurradar installeren

Eenmalig, in deze volgorde. Reken op een half uur tot een uur.

## 1. Database (Supabase)

1. Open je project op [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Plak de inhoud van [`supabase/migrations/20261024000000_init.sql`](../supabase/migrations/20261024000000_init.sql)
   en klik op **Run**. Je ziet "Success. No rows returned".
3. Doe hetzelfde met [`supabase/migrations/20261025000000_telegram.sql`](../supabase/migrations/20261025000000_telegram.sql)
   (in een nieuwe query), daarna met
   [`supabase/migrations/20261029000000_invite_code.sql`](../supabase/migrations/20261029000000_invite_code.sql)
   , [`supabase/migrations/20261031000000_vesteda_mvgm.sql`](../supabase/migrations/20261031000000_vesteda_mvgm.sql)
   , [`supabase/migrations/20261101000000_quiet_first_run.sql`](../supabase/migrations/20261101000000_quiet_first_run.sql)
   en [`supabase/migrations/20261101010000_vanderlinden_vbt.sql`](../supabase/migrations/20261101010000_vanderlinden_vbt.sql).
   Elke migration voer je één keer uit, in volgorde van de datum in de bestandsnaam.
4. **Authentication → Sign In / Providers**: zet **Allow new users to sign up** uit. Alleen mensen die
   je uitnodigt kunnen dan inloggen.
5. **Authentication → Users → Add user → Create new user**: maak jezelf aan met e-mailadres en
   wachtwoord, en zet **Auto Confirm User** aan. Zo heb je geen uitnodigingsmail nodig (die links verlopen
   snel en mailprogramma's openen ze soms al vooraf). Je vrienden voeg je op dezelfde manier toe en je geeft
   ze hun wachtwoord. Inloggen kan met wachtwoord of met een inloglink per mail.
6. **Authentication → URL Configuration**:
   - **Site URL**: het adres waar de web-app draait (zie stap 4 hieronder). Voor nu `http://localhost:5173`.
   - **Redirect URLs**: voeg `http://localhost:5173` toe, en later het adres van de gehoste app.
7. **Project Settings → API Keys**: hier staan de **publishable key** (voor de web-app) en de
   **secret key** (voor de worker). Deel de secret key met niemand.

### Zelf registreren met een uitnodigingscode

Gebruikers kunnen zelf een account aanmaken in de app ("Nog geen account? Account aanmaken"), met een
uitnodigingscode die jij uitdeelt. Zonder de juiste code weigert de database het account.

1. **Code instellen** (SQL Editor, nieuwe query):
   ```sql
   update public.app_config set invite_code = 'kies-een-lange-code';
   ```
2. **Authentication → Sign In / Providers**: zet **Allow new users to sign up** aan.
3. Bij **Email**: zet **Confirm email** uit. Anders moet elke nieuwe gebruiker eerst een bevestigingsmail
   aanklikken, en de standaardmailserver van Supabase verstuurt maar een paar mails per uur.
4. Stuur je vrienden het adres van de app en de code.

Zolang er een code is ingesteld, kun je via het dashboard ("Create new user") geen gebruikers meer
aanmaken: ook die moeten de code meesturen. Laat nieuwe mensen zich dus via de app registreren.
Registreren weer dichtzetten: `update public.app_config set invite_code = null;` én **Allow new users to
sign up** uit. (Alleen de code op `null` zetten is niet genoeg: dan controleert de database niets meer.)

## 2. Telegram-bot aanmaken (eenmalig, door jou)

Eén bot voor iedereen:

1. Zoek in Telegram **@BotFather** (met blauw vinkje) en stuur `/newbot`.
2. Kies een naam (bijv. `huurradar`) en een gebruikersnaam die op `bot` eindigt
   (bijv. `huurradar_ingmar_bot`).
3. Je krijgt een **token** (`123456789:AAF...`). Dat komt in de `.env` op de VM (stap 3) en nergens anders.
4. De **gebruikersnaam** komt in de configuratie van de web-app (stap 4).

Koppelen doet daarna iedereen zelf in de web-app: tabblad **Meldingen** → **Koppel Telegram** → in
Telegram op **Start** tikken. Elke melding heeft knoppen **✅ Gereageerd** en **🗑 Niet interessant**
die je lijst in de app direct bijwerken.

**Je eigen chat-ID** (voor beheerdersmeldingen, optioneel): koppel eerst Telegram in de app, en kijk dan in
Supabase → **Table Editor → notification_settings** bij jouw rij in de kolom `telegram_chat_id`.

WhatsApp via CallMeBot kan ook nog (tabblad Meldingen), maar die dienst is vaak vol. Telegram gaat voor als
beide zijn ingesteld.

## 3. Worker op de Google Cloud-VM

Via SSH op de VM:

```bash
cd ~/huurradar          # de map van de probe; anders eerst: git clone https://github.com/IngmarGlerum/huurradar.git
git pull
cp .env.example .env
nano .env               # vul SUPABASE_SECRET_KEY en TELEGRAM_BOT_TOKEN in; zet voor de eerste test DRY_RUN=true
./deploy.sh             # bouwt het image (eerste keer een paar minuten) en start de worker
docker compose logs -f  # stoppen met Ctrl+C; de worker blijft draaien
```

In de logs zie je na een paar seconden een regel `"msg":"verwerkt"` met `"new":152` (of het aantal dat
dan online staat). Op het tabblad **Status** van de web-app zie je dezelfde run.

**Testen zonder berichten:** met `DRY_RUN=true` logt de worker de berichten
(`"msg":"DRY_RUN: melding niet verstuurd"`) in plaats van ze te versturen. Werkt alles, zet dan
`DRY_RUN=false` in `.env` en draai `./deploy.sh` opnieuw.

**Updates:** na elke nieuwe versie in GitHub op de VM `./deploy.sh` draaien.

**Beheerdersmelding (optioneel):** vul `ALERT_TELEGRAM_CHAT_ID` in `.env` in (zie stap 2). Je krijgt dan
een bericht als DAK 3 keer achter elkaar faalt of als de API van DAK is gewijzigd.

Het koppelen in de app (de bot antwoordt op **Start**) werkt alleen als de worker draait, ook met
`DRY_RUN=true`.

## 4. Web-app

### Lokaal (om te beginnen)

Op je eigen computer, in de map van de repo:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # vul de publishable key en de bot-gebruikersnaam in
pnpm --filter @huurradar/web dev               # open http://localhost:5173
```

Log in met je e-mailadres; je krijgt een inloglink. Maak op het tabblad **Zoekprofielen** een profiel
aan en koppel op **Meldingen** je Telegram.

### Online (zodat je vrienden er ook bij kunnen)

De web-app is een statische site; gratis hosten kan bijvoorbeeld bij Netlify of Cloudflare Pages, gekoppeld
aan deze GitHub-repo:

- **Build command:** `pnpm --filter @huurradar/web build`
- **Publish directory:** `apps/web/dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` en `VITE_TELEGRAM_BOT_USERNAME`

Zet daarna het adres van de site in Supabase bij **Site URL** en **Redirect URLs** (stap 1.6).

## Hoe het werkt

- De worker vraagt rond middernacht (23:58–00:20) elke minuut het DAK-aanbod op, verder elke 10 minuten.
  DAK publiceert vrijwel alles om 00:01.
- Is de lijst gelijk aan de vorige keer, dan wordt er niets geschreven.
- Nieuwe woningen worden in de database direct gematcht tegen ieders zoekprofielen. Elke nieuwe match
  geeft een Telegram-bericht (of WhatsApp, gebundeld).
- Een woning die 2 keer achter elkaar niet meer in het aanbod staat, krijgt in de app een rode rand
  ("staat niet meer online"). Na de reactietermijn: "reactietermijn verlopen".
- Een nieuw of gewijzigd zoekprofiel toont de woningen die nu al online staan, zonder melding.
- Parkeerplaatsen worden nooit gematcht.

## Problemen

| Wat je ziet | Wat je doet |
|---|---|
| Status: "geen runs" | Draait de worker? `docker compose ps` en `docker compose logs --tail 50` op de VM |
| Status: "fout" met `HTTP 403` | DAK blokkeert het IP van de VM; meld het in de chat |
| Melding "API-versie gewijzigd" | DAK heeft de site aangepast; de adapter moet worden bijgewerkt |
| Geen melding, wel matches | Is Telegram gekoppeld (tabblad Meldingen)? In de worker-logs staat `melding mislukt` met de reden |
| Bot reageert niet op Start | Draait de worker, en staat `TELEGRAM_BOT_TOKEN` in `.env`? Logs: `"telegram":true` bij het starten |
| Inloglink komt niet aan / "email rate limit exceeded" | Supabase verstuurt maar een paar mails per uur met de standaardmailserver; log in met je wachtwoord |
| "Signups not allowed" | Registreren staat uit, of het e-mailadres bestaat niet als gebruiker |
| "De uitnodigingscode klopt niet" | Controleer de code; de actuele staat in `public.app_config` |
