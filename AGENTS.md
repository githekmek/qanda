<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Arbeitsweise in diesem Projekt

Dieses Projekt wird abwechselnd bzw. parallel mit Claude und Codex entwickelt. Manche
Aufgaben bekommen beide Agenten mit demselben Prompt; der Projektinhaber vergleicht die
Ergebnisse und entscheidet, welche Variante übernommen wird.

## Branches

| Branch          | Wer arbeitet dort | Vercel-Deployment |
| --------------- | ----------------- | ----------------- |
| `claudepreview` | nur Claude        | Preview           |
| `codexpreview`  | nur Codex         | Preview           |
| `main`          | niemand direkt    | Produktion        |

- **Nur auf dem eigenen Preview-Branch arbeiten und dorthin pushen.** Claude nutzt
  ausschließlich `claudepreview`, Codex ausschließlich `codexpreview`. Den Branch des
  anderen Agenten nie anfassen. Keine weiteren Branches anlegen, sofern nicht ausdrücklich
  danach gefragt wird.
- **Nie direkt auf `main` pushen.** Vercel deployt jeden Push nach `main` sofort als
  Produktion. Eine Variante kommt nur nach `main`, wenn der Projektinhaber das ausdrücklich
  für genau diese Variante anweist – dann per Fast-Forward bzw. Merge des Preview-Branches.

## Neue Aufgabe beginnen

Sagt der Projektinhaber, dass eine neue Aufgabe beginnt, startet der eigene Preview-Branch
wieder exakt vom aktuellen `main`, damit beide Agenten vom selben Stand ausgehen:

1. `git fetch origin`
2. Prüfen, ob der eigene Branch Commits enthält, die nicht in `origin/main` sind
   (`git log origin/main..HEAD`). Falls ja: nachfragen, bevor sie verworfen werden.
3. `git reset --hard origin/main` und `git push --force-with-lease`

Ohne diese Ansage nicht zurücksetzen – Nachbesserungen zur laufenden Aufgabe kommen als
weitere Commits auf denselben Branch.

## Sonstiges

- **Änderungen am UI vorher besprechen**, am besten mit einem SVG-Mockup, statt sie direkt
  umzusetzen.
- Antworten und Oberflächentexte auf Deutsch.
- Datenbankmigrationen nur additiv und so, dass bestehende Daten erhalten bleiben. Jeder
  Preview-Branch hat eine eigene Preview-Datenbank; die Produktionsdatenbank nie aus einem
  Preview-Branch heraus verändern.
