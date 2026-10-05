# Mensa-Picks

Zeigt jeden Tag die drei Menüs, die dir am besten schmecken dürften – aus allen
Mensen der ETH Zürich und der Universität Zürich, getrennt nach Mittag und
Abend, mit Preis, Standort und Bild.

Die App läuft lokal auf deinem Computer (macOS, Windows oder Linux) und wird im
Browser bedient. Dein Geschmacksprofil bleibt auf deinem Gerät.

## Installieren

1. [Node.js](https://nodejs.org) installieren (LTS-Version, mindestens 20).
2. Die App herunterladen: oben auf dieser GitHub-Seite **Code → Download ZIP**
   und das ZIP entpacken
   ([Direktlink](https://github.com/nedo-o/mensa-picks/archive/refs/heads/main.zip)).
   Oder mit Git: `git clone https://github.com/nedo-o/mensa-picks.git`.

Weitere Pakete oder ein `npm install` braucht es nicht.

## Starten

| System | So geht's |
| --- | --- |
| macOS | Doppelklick auf `start.command`. Blockiert macOS die Datei beim ersten Mal: Rechtsklick → «Öffnen» → «Öffnen». |
| Windows | Doppelklick auf `start.bat`. Fragt die Firewall nach, «Zulassen» wählen (nur nötig, wenn du die App auch am Handy öffnen willst). |
| Linux | Im Terminal im App-Ordner: `./start.sh` |

Oder überall im Terminal, im Ordner der App:

```bash
node server.js --open
```

Der Browser öffnet <http://localhost:3210>. Das Terminal-Fenster muss offen
bleiben, solange du die App benutzt. Es zeigt auch die Adresse fürs Handy an –
Computer und Handy müssen dafür im gleichen WLAN sein.

Anderer Port: `PORT=8080 node server.js` (Windows: `set PORT=8080` und dann
`node server.js`).

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
- **Filter:** Zentrum, Hönggerberg, Irchel – dazu «Weitere» für Oerlikon,
  Botanischer Garten und Basel. Unter «Mensen» sind alle Standorte aufgelistet,
  aufklappbar mit dem ganzen Tagesangebot.

## Datenquellen

| Was | Quelle |
| --- | --- |
| ETH-Menüs, Preise, Fotos | Cookpit-API der ETH (`idapps.ethz.ch`) |
| UZH-Menüs, Preise, Fotos | Öffentliche Food2050-Seiten des ZFV (`app.food2050.ch`) |
| Ersatzbilder («Symbolbild») | Rezeptfotos von TheMealDB, frei lizenzierte Fotos von Openverse |

Die UZH bietet keine offene API ohne Schlüssel an; die App liest deshalb die
Daten, die die öffentlichen Menüseiten mitliefern. Ändert der ZFV den Aufbau
dieser Seiten, muss `lib/uzh.js` angepasst werden.

Menüs werden 30–60 Minuten zwischengespeichert, «Aktualisieren» lädt sofort neu.

Hat ein Menü kein eigenes Foto (oder nur einen Platzhalter), sucht die App ein
Bild, das sicher ein Gericht zeigt: zuerst ein Rezeptfoto mit demselben Namen,
dann ein als Essen verschlagwortetes Foto, sonst das ähnlichste Rezept nach
Zutaten und Küche. Solche Bilder sind als «Symbolbild» gekennzeichnet – sie
zeigen ein ähnliches Gericht, nicht das Menü der Mensa.

## Aufbau

- `server.js` – kleiner HTTP-Server (API + statische Dateien), ohne Abhängigkeiten
- `lib/eth.js`, `lib/uzh.js` – Menüdaten der beiden Hochschulen
- `lib/images.js` – Fotos, Platzhalter-Erkennung, Bildsuche
- `public/` – die Web-App; `dict.js` ist das Zutaten-Wörterbuch, `taste.js` das Geschmacksmodell
- `data/` – entsteht beim ersten Start: dein Profil (`profile.json`) und der Cache.
  Der Ordner ist nicht Teil des Repos und kann jederzeit gelöscht werden.

Dies ist ein privates Hobbyprojekt und steht in keiner Verbindung zur ETH, zur
UZH oder zum ZFV.
