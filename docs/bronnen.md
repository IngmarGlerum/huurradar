# Bronnen

Onderzocht in oktober 2026 vanuit een cloudomgeving (datacenter-IP). Resultaten vanaf de Google
Cloud-VM kunnen afwijken; draai daarvoor het probe-script.

## Amsterdam DAK (`amsterdam.mijndak.nl`), voorheen WoningNet Stadsregio Amsterdam

**Bereikbaar, met een interne JSON-API. Geen inlog nodig.**

De site is een OutSystems Reactive-app. Het volledige aanbod voor niet-ingelogde bezoekers komt uit één
verzoek. Werkt ook vanaf de Google Cloud-VM (getest).

```
POST https://amsterdam.mijndak.nl/screenservices/DAKWP/Overzicht/Woningaanbod/DataActionHaalUitgelogdAanbod
Content-Type: application/json; charset=UTF-8
X-CSRFToken: T6C+9iB49TLra4jEsMeSckDMNhQ=     (vaste anonieme OutSystems-waarde)
```

- De body is de schermstatus van OutSystems; het sjabloon staat in
  [`probe/dak-aanbod-request.json`](../probe/dak-aanbod-request.json).
- `versionInfo.moduleVersion` = `manifest.versionToken` uit `GET /moduleservices/moduleinfo`. Dat
  verandert bij elke update van de site, dus haal het bij elke start (en na
  `hasModuleVersionChanged: true`) opnieuw op.
- `versionInfo.apiVersion` (`7VY+7u8+RlC1gUalF+dr8Q`) staat in `/scripts/DAKWP.Overzicht.Woningaanbod.mvc.js`.
  Geeft de server `hasApiVersionChanged: true`, dan is de API gewijzigd en moet de adapter worden
  bijgewerkt. Daarop alarmeren.
- **Valkuil:** `clientVariables.SamenwerkingsverbandId` moet `"2"` zijn (code `SRA`, Stadsregio
  Amsterdam). Met de standaardwaarde `"0"` komt er een lege lijst terug, zonder foutmelding.
- Eén verzoek geeft het hele aanbod (152 woningen bij de test), dus paginering is niet nodig.

### Velden per publicatie (`data.PublicatieLijst.List[]`)

| Veld | Betekenis |
|---|---|
| `Id` | publicatie-ID (uniek) |
| `PublicatieDatum`, `EinddatumTijd` | begin en einde van de reactietermijn (UTC) |
| `PublicatieModel` | `Aanbodmodel` (inschrijfduur), `Lotingmodel`, `Vrije sector` (o.a. middenhuur) |
| `PublicatieLabel` | bijv. `Middenhuur`, `Voorrang kleine(re) huishoudens` |
| `ContractVorm` | `Onbepaalde tijd contract`, `Jongerencontract`, `Flexcontract` |
| `Adres.*` | straat, huisnummer, postcode, woonplaats, wijk |
| `Eenheid.NettoHuur`, `Eenheid.Brutohuur` | huur |
| `Eenheid.WoonVertrekkenTotOpp`, `Eenheid.AantalKamers` | m², kamers |
| `Eenheid.EnergieLabel`, `Eenheid.Eigenaar`, `Eenheid.Doelgroep` | energielabel, corporatie, doelgroep |
| `Eenheid.Lengtegraad`, `Eenheid.Breedtegraad` | coördinaten |
| `IsCluster`, `Cluster.*` | projecten met meerdere woningen |
| `AantalReactiesOpPublicatie` | altijd `0` als je niet bent ingelogd |

### Publicatieritme

Bij de test was **147 van de 152** publicaties gepubliceerd om **00:01 Nederlandse tijd**, op werkdagen,
met een reactietermijn van meestal 7 dagen.

- **Sociale huur** (`Aanbodmodel`, `Lotingmodel`): volgorde op inschrijfduur of loting, snelheid
  maakt niet uit. Elk uur checken is genoeg.
- **Middenhuur / vrije sector**: volgens Lieven de Key worden kandidaten gesorteerd op voorrangsregels
  en **reactietijd**, en worden de eerste tien uitgenodigd. Dus: om 00:01 een melding sturen telt.
- **Schema:** elke minuut tussen 00:00 en 00:15, verder elk uur.

## Pararius (`www.pararius.nl`)

**Geblokkeerd, ook vanaf de Google Cloud-VM:** HTTP 403 met een Cloudflare-challenge ("Even
geduld..."), ook in een headless browser.

Alternatief: de **e-mailmeldingen van Pararius zelf** gebruiken (zoekopdracht
opslaan, meldingen naar een aparte mailbox, de worker leest die via IMAP). De vertraging daarvan moet
nog worden gemeten.

## Huurwoningen.nl (`www.huurwoningen.nl`)

Zelfde beeld als Pararius: HTTP 403 met een Cloudflare-challenge, ook vanaf de VM.

## Funda

Bewust niet opgenomen: strenge botbescherming en juridische stappen tegen scrapers.

## Regels middenhuur Amsterdam (achtergrond)

- Sinds 1 juli 2025 is een **huisvestingsvergunning** nodig voor middenhuur bij particuliere
  verhuurders: huur ongeveer €900 tot €1.185 (prijspeil 2025), 144 tot 186 WWS-punten.
- Inkomensgrenzen voor middenhuur in 2026 volgens één bron: €70.149 (één persoon), €93.531 (twee of
  meer). Nog te bevestigen.
