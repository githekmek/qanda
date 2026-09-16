# Q&A Duell

Ein Web-App für zwei Spieler: Ein Spieler stellt eine Frage und beantwortet sie sofort selbst.
Der andere Spieler sieht die Frage, aber nicht die Antwort – bis er selbst geantwortet hat.
Erst dann werden beide Antworten aufgedeckt, und die Rollen wechseln (der Antwortende darf nun
die nächste Frage stellen).

Fragen können **Multiple Choice** (2–5 Optionen) oder **Freitext** (max. 255 Zeichen) sein.

Die App ist bewusst einfach gehalten: Sie ist für **genau zwei Spieler** (ein Spiel) ausgelegt,
nicht für viele parallele Spiele oder viele Nutzer.

## Features

- Registrierung mit Benutzername + Passwort (auf maximal 2 Spieler begrenzt)
- Sicheres Login (Passwort-Hashing mit bcrypt, signierte HttpOnly-Session-Cookies)
- Abwechselnder Zugzwang: nur der/die Fragende darf fragen, nur der/die andere darf antworten
- Antwort des Fragenden bleibt verborgen, bis die Gegenseite auch geantwortet hat
- Verlauf aller bisherigen Fragen und Antworten

## Tech-Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Prisma ORM](https://www.prisma.io) mit PostgreSQL
- Session-Auth mit `jose` (JWT in HttpOnly-Cookie) + `bcryptjs`

## Lokale Entwicklung

Voraussetzungen: Node.js 20+, eine lokale PostgreSQL-Datenbank.

```bash
npm install

# .env anlegen (siehe .env.example) und DATABASE_URL/SESSION_SECRET setzen
cp .env.example .env

# Schema in die DB übertragen
npx prisma migrate deploy

npm run dev
```

Die App läuft dann unter <http://localhost:3000>. Der erste registrierte Benutzer beginnt
als Fragensteller, sobald sich ein zweiter Benutzer registriert hat.

## Kostenlos hosten (Vercel + Neon)

Diese Kombination ist dauerhaft kostenlos (Hobby-Tarif, keine Kreditkarte für Neon nötig) und
reicht für ein Spiel mit zwei Spielern locker aus.

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
4. Auf **Deploy** klicken.

Beim Build führt `npm run build` automatisch `prisma migrate deploy` aus, wodurch das
Datenbankschema bei Neon angelegt wird – es sind keine weiteren manuellen Schritte nötig.

### 3. Spielen

1. Die von Vercel vergebene URL öffnen und den ersten Account registrieren.
2. Die URL an die zweite Person schicken, damit sie sich ebenfalls registriert.
3. Danach ist die Registrierung automatisch gesperrt (max. 2 Spieler) und das Spiel kann
   losgehen.

### Alternative: Supabase statt Neon

Genauso funktioniert eine kostenlose PostgreSQL-Datenbank von <https://supabase.com> – dort
einfach den Connection String (Settings → Database → Connection string, Modus "Session
pooling") als `DATABASE_URL` verwenden. Zu beachten: Supabase-Projekte im Free-Tier pausieren
nach etwa einer Woche Inaktivität automatisch und müssen dann im Supabase-Dashboard einmal neu
gestartet werden.

## Projektstruktur

```
prisma/schema.prisma       Datenmodell (User, Question, Answer, GameState)
src/lib/auth.ts             Session-Cookies (erstellen/lesen/löschen)
src/lib/game.ts             Zug-Logik, Sichtbarkeit der Antworten
src/app/api/auth/*          Registrierung, Login, Logout, aktueller Nutzer
src/app/api/game/*          Spielstand abrufen, Frage stellen, Frage beantworten
src/app/login               Login-/Registrierungsseite
src/app/game                Spielseite (Frage stellen/beantworten, Verlauf)
```
