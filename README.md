# Q&A – Das Spiel zu unserem Podcast

Ein Web-App für Zweier-Runden: Ein Spieler stellt eine Frage und beantwortet sie sofort selbst.
Der andere Spieler sieht die Frage, aber nicht die Antwort – bis er selbst geantwortet hat.
Erst dann werden beide Antworten aufgedeckt, und die Rollen wechseln (der Antwortende darf nun
die nächste Frage stellen).

Fragen können **Multiple Choice** (2–8 Optionen) oder **Freitext** (max. 255 Zeichen) sein.

Gespielt wird in **privaten Räumen** mit je zwei Personen. Es gibt keine öffentliche Spielerliste:
Wer sich anmeldet, sieht niemanden außer den Personen, mit denen er selbst einen Raum teilt.

## Features

- **Private Räume**: Wer einen Raum erstellt, bekommt einen geheimen Einladungslink. Wer ihn
  öffnet, nimmt den zweiten Platz ein – danach ist der Link verbraucht. Bis zu 5 aktive Räume
  pro Person, auch mehrere mit derselben Person.
- **Zwei Wege hinein, beide eingeladen**: Eingeladene brauchen keinen Zugangscode – sie wählen
  auf der Einladungsseite direkt Name und Passwort und landen im Raum. Wer ohne Einladung
  starten will, braucht einen Zugangscode vom Admin. Beides ist geheim und genau einmal
  einlösbar; ohne das eine oder andere kommt niemand hinein.
- Sicheres Login (Passwort-Hashing mit bcrypt, signierte HttpOnly-Session-Cookies)
- Abwechselnder Zugzwang: nur der/die Fragende darf fragen, nur der/die andere darf antworten
- Antwort des Fragenden bleibt verborgen, bis die Gegenseite auch geantwortet hat
- Zufallsfrage aus einem Fragenkatalog, wahlweise aus den Kategorien **Locker**, **Spicy** und **Tief**
- Freitext-Reaktionen unter jeder aufgedeckten Runde, damit aus einer Frage ein Gespräch wird
- **Archivieren**: Fertige Räume wandern ins Archiv, bleiben lesbar und belegen keinen der
  5 Plätze mehr

## Tech-Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Prisma ORM](https://www.prisma.io) mit PostgreSQL
- Session-Auth mit `jose` (JWT in HttpOnly-Cookie) + `bcryptjs`

## Lokale Entwicklung

Voraussetzungen: Node.js 20+, eine lokale PostgreSQL-Datenbank.

```bash
npm install

# .env anlegen (siehe .env.example) und die drei Variablen setzen
cp .env.example .env

# Schema in die DB übertragen
npm run db:deploy

npm run dev
```

Die App läuft dann unter <http://localhost:3000>. Registriere dich einmal mit dem
`ADMIN_SETUP_CODE` aus der `.env` – dieser Account wird zum Admin und kann unter `/admin`
Zugangscodes für alle weiteren Spieler erzeugen und bei Bedarf einen kurzlebigen Passwortreset-Link für einen exakten Spielernamen erstellen.

## Kostenlos hosten (Vercel + Neon)

Diese Kombination ist dauerhaft kostenlos (Hobby-Tarif, keine Kreditkarte für Neon nötig) und
reicht für die vorgesehene Größenordnung (rund 20 Räume) locker aus.

### 1. Datenbank bei Neon anlegen

1. Auf <https://neon.tech> kostenlos registrieren.
2. Ein neues Projekt anlegen.
3. Den **Connection String** (Pooled Connection) kopieren, z. B.
   `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`.

### 2. App bei Vercel deployen

1. Dieses Repository auf GitHub pushen (falls noch nicht geschehen).
2. Auf <https://vercel.com> mit GitHub anmelden und "Add New… → Project" wählen, das Repo
   auswählen.
3. Unter **Environment Variables** setzen:
   - `DATABASE_URL` = der Connection String von Neon
   - `SESSION_SECRET` = eine lange zufällige Zeichenkette, z. B. erzeugt mit
     `openssl rand -base64 32`
   - `ADMIN_SETUP_CODE` = ein zufälliger Code, mit dem du dich einmalig als Admin registrierst
4. Auf **Deploy** klicken.

Beim Build führt `npm run build` automatisch den geschützten Befehl `npm run db:deploy` aus, wodurch das
Datenbankschema bei Neon angelegt wird – es sind keine weiteren manuellen Schritte nötig.

### 3. Einrichten und spielen

1. Die von Vercel vergebene URL öffnen und dich mit dem `ADMIN_SETUP_CODE` registrieren.
   Dieser erste Account ist der Admin; danach funktioniert der Setup-Code nicht mehr.
2. Auf der Übersicht einen Raum erstellen und den Einladungslink an den Mitspieler schicken –
   der braucht nichts weiter, er wählt beim Öffnen des Links direkt Name und Passwort.
3. Nur wer ohne Einladung eigene Räume eröffnen soll, braucht einen Zugangscode: unter `/admin`
   erzeugen und den fertigen Registrierungslink verschicken.

### Alternative: Supabase statt Neon

Genauso funktioniert eine kostenlose PostgreSQL-Datenbank von <https://supabase.com> – dort
einfach den Connection String (Settings → Database → Connection string, Modus "Session
pooling") als `DATABASE_URL` verwenden. Zu beachten: Supabase-Projekte im Free-Tier pausieren
nach etwa einer Woche Inaktivität automatisch und müssen dann im Supabase-Dashboard einmal neu
gestartet werden.

## Projektstruktur

```
prisma/schema.prisma        Datenmodell (User, AccessCode, Room, Question, Answer, Reaction)
src/lib/auth.ts             Session-Cookies (erstellen/lesen/löschen)
src/lib/admin.ts            Admin-Prüfung
src/lib/rooms.ts            Raum-Zugriffsprüfung und Raumlimit
src/lib/game.ts             Zug-Logik, Sichtbarkeit der Antworten
src/lib/codes.ts            Erzeugen und Normalisieren von Zugangs-/Einladungscodes
src/lib/questionCatalog.ts  Fragenkatalog (Locker/Spicy/Tief) inkl. Zufallsziehung
src/app/api/auth/*          Registrierung, Login, Logout, aktueller Nutzer
src/app/api/rooms/*         Räume anlegen/auflisten, Spielzüge, Archivieren, Einladungslink
src/app/api/invites/*       Einladung ansehen und annehmen
src/app/api/admin/*         Zugangscodes und Admin-Passwortreset
src/app/page.tsx            Übersicht der eigenen Räume
src/app/room/[id]           Spielseite eines Raums
src/app/join/[code]         Einladung annehmen
src/app/admin               Administration für Zugangscodes und Passwortreset
src/app/login               Login und Registrierung (mit Zugangscode)
```

## Sicherheitskorrekturen und bestehende Daten

Bestehende Passwörter, Session-Cookies, Nutzer-IDs, Räume, Einladungen und Antworten
bleiben gültig. Die neue Migration legt ausschließlich `LoginRateLimit` an.
Neue Konten benötigen mindestens 12 Zeichen (höchstens 72 UTF-8-Bytes);
bestehende Nutzer müssen ihr Passwort nicht ändern.

Die Anmeldung erlaubt 10 Versuche pro Benutzername in 15 Minuten. Auf Vercel
gelten zusätzlich 100 Versuche pro IP, anhand des von Vercel gesetzten Headers
`x-vercel-forwarded-for`. Bei anderem Hosting IP-Drosselung am vertrauenswürdigen
Reverse Proxy konfigurieren. Ein HTTP 429 enthält die Wartezeit in `Retry-After`.

Datenbankänderungen nur mit `npm run db:deploy` bzw. `npm run build` ausführen.
Historische Migrationen bleiben unverändert, damit bereits angewendete
Migrationsstände weiterhin passen. Der Schutz verweigert die alte Löschmigration,
falls sie noch offen ist und Bestandsdaten vorhanden sind. Er setzt keine
Datenbank zurück und markiert keine Migration ohne Ausführung als erledigt.
Bei diesem Stopp bleibt die bisherige App unverändert; die alte Einzelspiel-
Datenbank benötigt vor dem Upgrade einen gesonderten datenerhaltenden Übernahmeplan.
Vor Produktivmigrationen einen Datenbank-Snapshot beim Hostinganbieter erstellen.
Vercel-Vorschau-Builds führen Datenbankmigrationen nur dann aus, wenn die Preview-Umgebung
eine eigene `DATABASE_URL` verwendet und `RUN_PREVIEW_MIGRATIONS=true` ausschließlich für
Preview gesetzt ist. Ohne diese ausdrückliche Freigabe wird keine Preview-Datenbank verändert.
Production migriert weiterhin unabhängig davon über ihre eigene `DATABASE_URL`.

Bereits durch frühere Versionen entstandene zusätzliche Räume oder offene
Fragen werden nicht gelöscht. Neue Spielzüge sind durch serialisierbare
Transaktionen mit begrenzten Wiederholungsversuchen abgesichert.

## Regressionstests

GitHub Actions verwendet eine eigene PostgreSQL-Testdatenbank, keine Produktivdaten
oder Repository-Secrets. Lokal mit einer separaten lokalen Testdatenbank:

```bash
npm ci
npm run test:unit
npm run test:migrations
npm run lint
npm run build
npm run test:integration
```

Datenbanktests akzeptieren nur PostgreSQL auf localhost/127.0.0.1 und verwenden
eigene, anschließend entfernte Testschemas. Geprüft werden Neuinstallation,
datenerhaltendes Upgrade, Schutz alter Datenbanken, parallele Spielzüge,
atomare Registrierung, Einladungserneuerung, Raumlimits und bisherige Logins.

Die Abhängigkeiten enthalten Next.js 16.3.8 (Sicherheitspatch) und eine gezielte
Überschreibung von `@prisma/config` → `deepmerge-ts` auf 8.0.2 gegen
GHSA-ggr8-5vv4-36mx. Prisma bleibt auf der bisherigen 6.x-Version; die
Migrationstests prüfen die Kompatibilität. Die Überschreibung kann entfallen,
sobald die verwendete Prisma-Version selbst eine korrigierte Abhängigkeit enthält.

Security-Update Oktober 2026: `sharp` ist auf 0.35.5 und `source-map-js` auf 1.2.2
festgelegt. Der vollständige Abhängigkeitscheck bleibt eine Voraussetzung für die Freigabe.

### Befristeter Umfang der Entwicklungs-Ausnahme

Der Betreiber hat am 13.10.2026 ausschließlich GHSA-vfj7-8cjw-p6xm für die
Entwicklungsprüfung freigegeben. Es gibt derzeit keinen veröffentlichten Patch für
`braces@3.0.3`. Der Angriff erfordert tief verschachtelte, nicht vertrauenswürdige
Glob-Muster; in diesem Projekt verarbeitet die Next.js-Lint-Konfiguration nur
projektinterne Dateimuster, keine Eingaben aus Räumen oder HTTP-Anfragen.

`npm run audit:security` erlaubt ausschließlich diese Advisory-ID und ihre
Weiterleitung über die exakt festgelegten Entwicklungs-Versionen von
`micromatch`, `fast-glob`, `@next/eslint-plugin-next` und `eslint-config-next`.
Alle betroffenen Installationen müssen im Lockfile als `dev: true` markiert sein.
Andere Meldungen, neue Versionen, produktive Vorkommen und Audit-Fehler blockieren
die Freigabe. Die Ausnahme wird im CI-Protokoll sichtbar ausgegeben. Zusätzlich
muss `npm audit --omit=dev` ohne Ausnahme erfolgreich sein.

Die Ausnahme bei einem verfügbaren Upstream-Fix entfernen; bei Änderungen an
Lint-Abhängigkeiten oder Glob-Eingaben muss sie erneut bewertet werden.

### Neue Kommentare und Ausklappen

Kommentare sind pro Frage ausklappbar. Alle neuen fremden Kommentare erhalten
„Neu“ und eine blaue Markierung. Fragen mit neuen Kommentaren öffnen sich
automatisch; eine manuell geschlossene Frage bleibt während des Besuchs geschlossen.
„Anzeigen“ und „Nächsten anzeigen“ springen durch die neuen Kommentare.

Der erste Besuch eines Raums nach Einführung übernimmt vorhandene Kommentare als
Ausgangsstand. Danach werden Kommentare erst nach mindestens 600 ms mit mindestens
50 % sichtbarer Fläche im geöffneten Bereich und sichtbarem Browser-Tab als gesehen
gespeichert. Eigene Kommentare werden nie als neu markiert. Markierungen bleiben
für den laufenden Besuch erhalten; ungesehene Kommentare bleiben beim nächsten
Besuch neu. Auch neue Kommentare an älteren Fragen und archivierte Räume werden
berücksichtigt. Der Gelesen-Stand wird pro Nutzer in der Datenbank gespeichert und
gilt daher auch auf anderen Geräten. Bei Speicherfehlern wird erneut versucht;
ein nicht bestätigter Kommentar kann beim nächsten Besuch erneut als neu erscheinen.

Migration `20261013000000_reaction_reads` ergänzt ausschließlich zwei Tabellen und
Indizes. Bestehende Nutzer, Räume, Einladungen, Fragen, Antworten und Reaktionen
bleiben unverändert. Vorschau wie bisher mit eigenem Neon-Branch prüfen.

### Gemeinsame Einzelantworten

Bei Mehrfachauswahl erhält jede von beiden gewählte Option in beiden Antwortzeilen
einen grünen Haken mit dem zugänglichen Text „Von beiden gewählt“. Verglichen werden
Optionsindizes, damit gleiche Beschriftungen nicht irrtümlich gleichgesetzt werden.
Die Kennzeichnung „gleich“ für vollständig identische Antworten bleibt erhalten.

### Admin-Passwortreset ohne hinterlegte E-Mail

Ein Admin kann unter **Administration → Passwort zurücksetzen** einen Spieler über den exakten Spielernamen suchen und einen Reset-Link erzeugen. Der Link ist 30 Minuten gültig, nur einmal verwendbar und muss privat weitergegeben werden. Ein neuer Admin-Link ersetzt einen vorherigen Admin-Link desselben Spielers. Das Erzeugen des Links beendet keine laufende Sitzung; erst die erfolgreiche Passwortänderung widerruft alte Sitzungen. Der Admin sieht und setzt das neue Passwort nicht.

Dafür ist keine Schemaänderung nötig: Der Link verwendet die bestehende RecoveryToken-Tabelle. Nur der SHA-256-Hash des zufälligen Tokens wird gespeichert; Räume, Fragen, Antworten, Kommentare und Einstellungen werden nicht verändert.

### Passwortreset mit Gmail

Bestehende und neue Nutzer können unter **Konto** mit ihrem aktuellen Passwort eine
E-Mail-Adresse hinterlegen. Erst nach Bestätigung des einmaligen Links wird sie
gespeichert bzw. eine bisherige Adresse ersetzt. Die Registrierung bleibt kompatibel;
ohne bestätigte Adresse ist ein E-Mail-Reset nicht möglich.

Für jedes Vercel-Environment separat konfigurieren:
- `GMAIL_APP_PASSWORD`: separates Google-App-Passwort nach Aktivierung der Zwei-Faktor-Authentifizierung (niemals NEXT_PUBLIC).
- `GMAIL_USER`: die vollständige Gmail-Adresse des eigenen App-Versandkontos.
- `APP_URL`: HTTPS-Ursprung der jeweiligen App ohne Pfad, Query oder Fragment.
  Produktion: `https://qanda-psi.vercel.app`; Preview: tatsächliche Preview-Adresse.
  Preview niemals mit der Produktionsadresse konfigurieren.
- `DATABASE_URL`: weiterhin pro Environment getrennt auf den richtigen Neon-Branch.

Ohne diese drei Mail-Einstellungen bleiben Login, Räume und Spiele nutzbar.
Der Versand ist dann sichtbar deaktiviert. Nach dem Setzen der Variablen neu deployen.
Der Versand verwendet Nodemailer über `smtp.gmail.com:465` mit TLS.
Eine eigene Domain ist nicht erforderlich. Ein separates Gmail-Konto für die App verwenden.
App-Passwörter müssen für das Konto verfügbar sein; das normale Google-Passwort genügt nicht.
Gmail kann Zustellungen begrenzen oder blockieren. Bei Änderung des Google-Passworts
muss das widerrufene App-Passwort in Vercel ersetzt werden.
Alte `RESEND_*`- und `BREVO_*`-Variablen werden nicht mehr verwendet.
Echte Zustellung und Linkziel zuerst in Preview prüfen; danach Produktion separat konfigurieren.
Keine produktiven API-Schlüssel in Tests oder Git hinterlegen.

Reset-Anfragen antworten neutral. Der Versand erfolgt nach der Antwort über Next.js
`after`, um die Existenz eines Kontos nicht anhand von Versandlatenz offenzulegen.
Links gelten 30 Minuten, enthalten 256 Bit Zufall und werden ausschließlich als
SHA-256-Hash gespeichert. Tokens stehen im URL-Fragment, nicht in Querystrings,
und werden nur durch explizites Absenden verbraucht (Mail-Linkscanner verbrauchen sie nicht).
Nach erfolgreichem Reset sind alle bisherigen Sitzungen und offenen Links ungültig.
Ein Versionswert von 0 erhält alte Sitzungscookies bis zum ersten Reset.

Limits: pro Adresse bzw. Konto 3 Versandanforderungen / 15 Minuten, zusätzlich
30 Recovery-Anfragen / 15 Minuten je vertrauenswürdiger Vercel-IP und maximal
100 Versandanforderungen / 24 Stunden je Datenbank. Gmail-Kontingente sind über
Preview und Produktion gemeinsam zu berücksichtigen. Bei Versandfehlern keine
Tokens oder Adressen protokollieren; fehlgeschlagene Links werden verworfen.
Abgelaufene Tokens sind ungültig und werden beim nächsten Versand für denselben
Kontozweck ersetzt.

Migration `20261014000000_account_recovery` ergänzt nullable E-Mail-Felder,
eine Sitzungsversionsnummer (Standard 0) und die Token-Tabelle. Keine Löschung,
kein Zurücksetzen von Konten oder Spieldaten. Migrationstests vergleichen bestehende
Konten, Passwort-Hashes, Räume, Fragen, Antworten, Kommentare und Gelesen-Stände.
Browser- und HTTP-Tests verwenden ausschließlich einen lokalen Versand-Ersatz,
der nur per Test-Startoption Nodemailer ersetzt und TLS-/Gmail-Konfiguration sowie Nachrichtendaten prüft;
der App-Code verwendet immer den festen Gmail-SMTP-Endpunkt. Ein echter Zustelltest bleibt nach Einrichtung erforderlich.

### Profil, Darstellung und freiwillige Benachrichtigungen

`/konto` bietet die bestätigte E-Mail-Adresse, zwei unabhängige Opt-in-Schalter und
Standard/Bunt/Dark. Standard folgt wie bisher der Geräteeinstellung; Bunt und Dark
sind explizit. Einstellungen sind pro Konto gespeichert. Ohne bestätigte Adresse
oder Versandkonfiguration können Benachrichtigungen nicht eingeschaltet werden.
Bei Bestätigung einer neuen Adresse werden beide Schalter ausgeschaltet und alte
Versandaufträge entfernt; der Nutzer kann für die neue Adresse erneut zustimmen.

Migration `20261014010000_profile_notifications` ergänzt ausschließlich drei
User-Felder (Standard, false, false) und eine Versandtabelle. Keine bestehenden
Räume, Kommentare oder sonstigen Spielinhalte werden gelöscht oder neu angelegt.
Aktivieren erzeugt keine Benachrichtigungen für historische Ereignisse.

Beim Beitritt kann der erste Fragende eine Zug-Mail erhalten; nach einer neuen
Frage der Antwortende; nach der Antwort darf derselbe Spieler die nächste Frage
stellen. Neue fremde Kommentare werden pro Empfänger und Raum nach mindestens
fünf Minuten gesammelt. Inhalte, Spielernamen und Raumnamen stehen nicht in Mails,
nur ein Hinweis sowie Links zum privaten Raum und den Einstellungen.

Versandaufträge entstehen atomar mit dem Ereignis. Nach Spielaktionen versucht
`after` fällige Aufträge abzuarbeiten. Für zuverlässige Zustellung ohne weitere
App-Besuche ist zusätzlich ein Zeitgeber erforderlich:
- `GET /api/notifications/dispatch`, Header `Authorization: Bearer <CRON_SECRET>`.
- `CRON_SECRET` mindestens 32 zufällige Zeichen, separat je Umgebung.
- Empfohlenes Intervall: fünf Minuten. Vercel Hobby erlaubt nur tägliche Cron-Läufe;
  deshalb wird kein mit Hobby inkompatibler Minutentakt automatisch eingerichtet.
  Auf Pro kann ein Vercel-Cron verwendet werden, auf Hobby ein externer Zeitgeber.
- Preview-Versand separat über die Preview-Adresse testen, niemals mit Produktions-DB.
- Ohne Zeitgeber kann der Versand bis zur nächsten Spielaktion warten.
  Die Einrichtung des Zeitgebers ist daher vor produktiver Freigabe erforderlich.

Konkurrierende Worker beanspruchen Aufträge mit einer Datenbanksperrfrist.
Deaktivierte Mailtypen, archivierte Räume, veraltete Züge und ausschließlich
über 24 Stunden alte Aufträge werden verworfen. SMTP-Fehler werden mit wachsendem
Abstand erneut versucht; ein abgebrochener Worker wird nach fünf Minuten freigegeben.
SMTP bietet keine Exactly-once-Garantie: Wird eine Mail angenommen und die Bestätigung
geht verloren, ist bei Wiederholung ein Duplikat möglich (stabile Message-ID).
Ein bereits an SMTP übergebener Versand kann durch Ausschalten nicht zurückgerufen werden.
Höchstens 10 Benachrichtigungsmails pro Nutzer/Stunde und 100 pro DB/24 Stunden;
Recovery hat sein separates 100er-Budget. Preview und Produktion teilen das Gmail-Kontingent.
