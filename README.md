# Roadmap to Ruin – PI Summit 2026 Team 2

A Reigns-style swipe game: keep your product alive for as many months as you can by balancing **Team, Quality, Deadline and Budget** while every card offers a damned-if-you-do, damned-if-you-don't choice. Any metric hitting 0 **or** 100 ends the run.

Built with **TypeScript + PixiJS 8 + Vite + pnpm**, fully client-side. Spec: [`docs/spec.v1.pdf`](docs/spec.v1.pdf).

## Quick start

```sh
pnpm install
pnpm run dev       # local dev server
pnpm run build     # production build -> dist/
pnpm run check     # validate content + tests + typecheck + build (must pass before merging)
```

Requires Node ≥ 22.12 (24 recommended) and pnpm 10 (`corepack enable` if pnpm isn't installed).

Controls: drag the card left/right (mouse or touch), tap a choice tag, or press **←** / **→**. Add `?seed=1234` to the URL for a reproducible card order when reporting a bug. Sound effects (swoosh, game-over trombone, deck-cleared fanfare) are synthesised in the browser; background music loops from `public/assets/audio/<file>` (named in `balance.json → audio.music`) and starts on the first swipe. Two sliders top-right set effects and music volume — slide to 0 to mute (the row greys out); starting levels are `audio.sfxVolume` / `audio.musicVolume`.

## How content works

Content is authored by the team in the shared spreadsheet, exported as CSV, validated and converted to JSON by `pnpm run content`, and bundled with the game. **No code changes are needed to add or edit cards.**

1. Edit the spreadsheet — one card per row.
2. In Excel: **File → Save As → "CSV UTF-8 (Comma delimited)"** → save over `content/game-content.csv`. (A plain "CSV (Comma delimited)" export is also accepted; the build re-decodes it and warns.)
3. Put each card's picture in `public/assets/images/` named **`card-<ID>.png`** (or `.svg`, `.jpg`, `.webp`) — e.g. row with ID `29` → `card-29.png`. Filenames are case-sensitive. Generated art is best dropped as `<ID>.png` into `docs/cards/` (never `dist/`, which the build wipes) and converted to 600×900 WebP for the web; the game shows it in a 2:3 portrait panel.
4. Run `pnpm run content`. Fix anything it reports (it names the spreadsheet row). It also runs inside `build` and `check`.
5. Commit `content/game-content.csv`, the images and the generated `src/data/*.json`.

### Columns

Headers are matched case- and spacing-insensitively. Extra columns (e.g. "Author") are ignored with a warning.

| Column | Required | What goes in it |
|---|---|---|
| `ID` | yes | Any unique text/number. Also names the image file (`card-<ID>.png`). |
| `Card type` | yes | `Start card`, `Regular draw`, `Game over card` or `End card`. Rows still saying `Card type` (the template placeholder), typed rows with nothing else filled in, and Regular draws with a blank situation or a whole blank choice side are skipped with a note so half-written rows don't break the build. |
| `Situation text` | yes | The card text. Keep it under ~220 characters (longer text shrinks to fit; you'll get a warning). |
| `Situation illustration` | yes | A short description of the picture — this is the prompt used to generate the art. If no `card-<ID>` image exists yet, the build fails and prints this prompt so the image can be generated. (You can also put an actual filename here.) |
| `Swipe left text` / `Swipe right text` | regular cards | The choice labels (≤ 60 characters). Optional on other card types — defaults come from `content/balance.json → uiStrings`. |
| `Swipe left effect` / `Swipe right effect` | regular cards | Free text such as `Team +20, deadlines -10, budget -10` or `-20 to quality, +10 to budget`. Allowed values: **0, ±10, ±20** (`balance.json → allowedEffects`). Metrics: team, quality, deadline(s), budget. Each side must change at least one metric. Phrases like "then regular draw" / "End card" are ignored. Other card types must leave these empty (or just the flow phrase). Type minus as a plain hyphen: Excel exports a typographic minus as `?`, which the build reads as minus but warns about. |
| `Notes` | non-regular cards | For **Game over** cards: which metric and bound, e.g. `Team 0 card`, `Budget 100 card`. For **End** cards: the month band, e.g. `0-6 months`, `25+ months`, or `Completed all available decision cards` for the deck-exhausted ending. For **Start** cards: `first playthrough` marks the intro/tutorial card; anything else is the "new run" card. Free text on regular cards. |
| `Trigger` | optional | If present, used instead of `Notes` for the trigger above. |

Rules the build enforces: every ID unique; one or more Game over card for each of the 8 metric/bound combinations; an End card for the `0-6 months` band; at least one Start card and one Regular draw; every referenced image exists. Warnings (don't fail the build unless you run `pnpm run content --strict`): long text, unknown columns, non-UTF-8 export, too few regular cards to reach the top month band.

### Balance

`content/balance.json` holds every tunable number and UI string: starting metric value and bounds, allowed effect sizes, swipe threshold/rotation/deadzone, animation timings, the "danger" zone, HUD labels, header text per screen and default choice labels. The schema lives in `src/types/content.ts`.

### How the run works

Intro card (first load) → regular cards drawn at random, each once, one month each → a metric hits 0/100 → matching Game over card → End card for the month band → "new venture" Start card → next run. If the deck runs out first, the exhaustion End card is shown directly.

The End card carries the end-of-game summary: **Survived** (months, with years once past 12), **Ended by** ("Team hit 0" or "Every card played…") and, as the outcome, the card's own text. Labels are in `balance.json → uiStrings` (`survived`, `endedBy`, `reasonHit` with `{metric}`/`{bound}`, `reasonCleared`).

## Project layout

```
src/
  main.ts          boot PixiJS, preload images, start the table scene
  game/content.ts  imports src/data JSON, re-validates, groups cards by role
  scenes/          Scene interface, SceneManager, TableScene (HUD + one card, phase machine)
  systems/run.ts   pure rules: metrics, months, deck, game over, end bands (no Pixi/DOM)
  ui/              CardView (drag/swipe), MetricBar, Hud, theme (Sage brand palette + 1080×1920 layout)
  assets/fonts/    Sage Peak woff2 (400/600/700/800), bundled via src/style.css
  types/content.ts Zod schemas, spreadsheet parsers, cross-card validation (shared by build + game + tests)
  utils/           rng (seeded), tween, random
  data/            generated JSON (do not edit by hand)
public/assets/     images/card-<ID>.* illustrations, ui/ HUD icons
content/           game-content.csv, balance.json  ← team edits these
scripts/           build-content.ts (CSV → validated JSON), encoding.ts
tests/             node:test suites for rules + content parsing (run by `pnpm run test`)
docs/              spec, original content export
```

## CI / deployment

`.github/workflows/ci.yml` runs `pnpm run check` on every PR and push to `main`, then deploys `main` to **GitHub Pages** at https://sagepublications.github.io/PI-Summit-2026-Team2-Game/. The bundle is built with a relative base (`./`), so it works at any path without configuration.
