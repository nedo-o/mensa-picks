# Mensa-Picks

Zeigt jeden Tag die drei Menüs, die dir am besten schmecken dürften – aus allen
Mensen der ETH Zürich und der Universität Zürich, getrennt nach Mittag und
Abend, mit Preis, Standort und Bild.

**Website:** <https://nedo-o.github.io/mensa-picks/>

Die Menüs werden mehrmals täglich automatisch neu geladen. Beim ersten Besuch
kalibrierst du deinen Geschmack einmal; danach merkt sich die Seite dein Profil.

## So funktioniert es

- **Kalibrierung:** Beim ersten Öffnen wählst du deine No-Gos und entscheidest
  dann in 15 Runden zwischen je zwei echten Menüs dieser Woche. Daraus lernt die
  App, welche Zutaten, Küchen und Zubereitungen du magst.
- **Top 3:** Für Mittag und Abend siehst du je die drei besten Treffer.
- **Kein Fleisch / kein Fisch:** Diese beiden No-Gos sind streng. Geprüft werden
  Titel, Zutaten, die von der Mensa deklarierte Herkunft (z. B. «Schwein & Kalb»)
  und die Allergene. Vorgeschlagen wird nur, was die Mensa selbst als frei davon
  kennzeichnet (vegetarisch oder vegan; bei «kein Fleisch» auch Fischgerichte).
  Menüs ohne Kennzeichnung fallen sicherheitshalber weg.
  Fleischersatz wie «Planted Chicken» wird auf vegetarisch deklarierten Menüs
  richtig erkannt. Wer nur eine Fleischsorte meidet, bekommt auch keine
  Fleischgerichte, bei denen die Sorte nicht angegeben ist.
- **Weiterlernen:** Daumen hoch/runter auf den Karten verfeinern das Profil.
  Unter «Mein Geschmack» siehst du, was gelernt wurde, kannst No-Gos ändern,
  weiter kalibrieren oder alles zurücksetzen.
- **Profil-Link:** Unter «Mein Geschmack» gibt es einen Link mit deinem
  Profil-Code. Öffne ihn auf dem Handy, dann hast du dort denselben Geschmack.
  Es gibt keine Konten und keine Passwörter – der Link ist dein Zugang, also
  nicht weitergeben.
- **Filter:** Zentrum, Hönggerberg, Irchel – dazu «Weitere» für Oerlikon,
  Botanischer Garten und Basel. Unter «Mensen» sind alle Standorte aufgelistet,
  aufklappbar mit dem ganzen Tagesangebot.

## Aufbau

Die Website ist statisch und wird von GitHub Pages ausgeliefert. Ein
GitHub-Actions-Workflow (`.github/workflows/deploy.yml`) baut sie nach einem
Zeitplan neu: Er lädt die Menüs der Woche, sucht die Bilder und legt alles als
Dateien ab. Die Geschmacksprofile speichert ein kleiner Cloudflare Worker
(`worker/`) unter zufälligen Codes.

- `build/site.mjs` – baut die Website nach `dist/`
- `lib/week.js` – stellt die Woche zusammen; `lib/eth.js`, `lib/uzh.js` – Menüdaten der beiden Hochschulen
- `lib/images.js` – Fotos, Platzhalter-Erkennung, Bildsuche
- `public/` – die Web-App; `dict.js` ist das Zutaten-Wörterbuch, `taste.js` das Geschmacksmodell
- `worker/` – Profilspeicher für Cloudflare Workers (KV)
- `server.js` – lokaler Modus zum Entwickeln: `node server.js --open` baut dieselben Daten auf dem eigenen Rechner

### Datenquellen

| Was | Quelle |
| --- | --- |
| ETH-Menüs, Preise, Fotos | Cookpit-API der ETH (`idapps.ethz.ch`) |
| UZH-Menüs, Preise, Fotos | Öffentliche Food2050-Seiten des ZFV (`app.food2050.ch`) |
| Ersatzbilder («Symbolbild») | Rezeptfotos von TheMealDB, frei lizenzierte Fotos von Openverse |

Die UZH bietet keine offene API ohne Schlüssel an; die App liest deshalb die
Daten, die die öffentlichen Menüseiten mitliefern. Ändert der ZFV den Aufbau
dieser Seiten, muss `lib/uzh.js` angepasst werden.

Hat ein Menü kein eigenes Foto (oder nur einen Platzhalter), sucht die App ein
Bild, das sicher ein Gericht zeigt: zuerst ein Rezeptfoto mit demselben Namen,
dann ein als Essen verschlagwortetes Foto, sonst das ähnlichste Rezept nach
Zutaten und Küche. Solche Bilder sind als «Symbolbild» gekennzeichnet – sie
zeigen ein ähnliches Gericht, nicht das Menü der Mensa.

### Selber betreiben

1. Repo forken, in den Repo-Einstellungen unter «Pages» als Quelle «GitHub
   Actions» wählen.
2. Cloudflare-Konto anlegen, dann im Ordner `worker/`:
   `npx wrangler login`, `npx wrangler kv namespace create PROFILES` (die
   ausgegebene ID in `wrangler.toml` eintragen) und `npx wrangler deploy`.
3. Die Worker-Adresse als Repo-Variable `PROFILE_API` hinterlegen
   (`gh variable set PROFILE_API --body https://…workers.dev`).
4. Den Workflow einmal von Hand starten («Actions» → «Website bauen und
   veröffentlichen» → «Run workflow»).

Ohne Worker läuft die Website auch, dann bleibt das Profil nur im jeweiligen
Browser gespeichert.

Dies ist ein privates Hobbyprojekt und steht in keiner Verbindung zur ETH, zur
UZH oder zum ZFV.
