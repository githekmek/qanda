# Q&A – Das Spiel zu unserem Podcast

Ein Web-App für Zweier-Runden: Ein Spieler stellt eine Frage und beantwortet sie sofort selbst.
Der andere Spieler sieht die Frage, aber nicht die Antwort – bis er selbst geantwortet hat.
Erst dann werden beide Antworten aufgedeckt, und die Rollen wechseln (der Antwortende darf nun
die nächste Frage stellen).

Fragen können **Multiple Choice** (2–5 Optionen) oder **Freitext** (max. 255 Zeichen) sein.

Gespielt wird in **privaten Räumen** mit je zwei Personen. Es gibt keine öffentliche Spielerliste:
Wer sich anmeldet, sieht niemanden außer den Personen, mit denen er selbst einen Raum teilt.

## Features

- **Private Räume**: Wer einen Raum erstellt, bekommt einen geheimen Einladungslink. Wer ihn
  öffnet, nimmt den zweiten Platz ein – danach ist der Link verbraucht. Bis zu 5 aktive Räume
  pro Person, auch mehrere mit derselben Person.
- **Registrierung nur mit Zugangscode**: Der Admin erzeugt Codes, jeder Code gilt für genau
  eine Registrierung. Ohne Code kommt niemand hinein.
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
npx prisma migrate deploy

npm run dev
```

Die App läuft dann unter <http://localhost:3000>. Registriere dich einmal mit dem
`ADMIN_SETUP_CODE` aus der `.env` – dieser Account wird zum Admin und kann unter `/admin`
Zugangscodes für alle weiteren Spieler erzeugen.

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

Beim Build führt `npm run build` automatisch `prisma migrate deploy` aus, wodurch das
Datenbankschema bei Neon angelegt wird – es sind keine weiteren manuellen Schritte nötig.

### 3. Einrichten und spielen

1. Die von Vercel vergebene URL öffnen und dich mit dem `ADMIN_SETUP_CODE` registrieren.
   Dieser erste Account ist der Admin; danach funktioniert der Setup-Code nicht mehr.
2. Unter `/admin` für jede weitere Person einen Zugangscode erzeugen und den fertigen
   Registrierungslink verschicken.
3. Auf der Übersicht einen Raum erstellen und den Einladungslink an den Mitspieler schicken.

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
src/app/api/admin/*         Zugangscodes erzeugen, auflisten, zurückziehen
src/app/page.tsx            Übersicht der eigenen Räume
src/app/room/[id]           Spielseite eines Raums
src/app/join/[code]         Einladung annehmen
src/app/admin               Zugangscode-Verwaltung
src/app/login               Login und Registrierung (mit Zugangscode)
```
