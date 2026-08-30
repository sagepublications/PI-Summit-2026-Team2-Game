# PI Summit 2026 – Team 2 Game

Browser game built with **TypeScript + PixiJS 8 + Vite + pnpm**. Fully client-side. Spec: [`docs/spec-v0.pdf`](docs/spec-v0.pdf).

> The game concept, rules and real content are decided at the planning meeting. This repo currently contains the complete tech stack, content pipeline, CI and a placeholder Start → Game → Game Over flow ready to be filled in.

## Quick start

```sh
pnpm install
pnpm run dev       # local dev server (opens browser)
pnpm run build     # production build -> dist/
pnpm run check     # validate content + typecheck + build (must pass before merging)
```

Requires Node ≥ 22 and pnpm 10 (`corepack enable` if pnpm isn't installed).

## How content works

1. Team authors content in the **shared spreadsheet** — one item per row.
2. Export as CSV → save over `content/game-content.csv`.
3. Run `pnpm run content` (also runs inside `build`/`check`).
   - Validates every row: required fields, unique IDs, types, allowed values, ranges, references to other IDs, referenced asset files exist.
   - Errors list the **spreadsheet row number** and the problem; nothing is written if any row is invalid.
   - On success writes `public/data/game-content.json` (commit it).
4. Tunable numbers live in `content/balance.json` → `public/data/balance.json`.

The content format is defined **once** in [`src/types/content.ts`](src/types/content.ts). To add a column: add it to the schema, add it to the CSV, run `pnpm run content`.

Images/audio referenced by content go in `public/assets/images/` and `public/assets/audio/`.

## Project layout

```
src/
  main.ts          boot PixiJS, load content, start scene flow
  game/            content loading
  scenes/          Scene interface, SceneManager, Start/Game/GameOver
  systems/         gameplay systems (input, scoring, …) — add as needed
  ui/              Button, theme (colours/fonts)
  types/           Zod schemas + TS types for content and balance
  utils/           random helpers
public/
  assets/          images/, audio/
  data/            generated JSON (do not edit by hand)
content/           game-content.csv, balance.json  ← team edits these
scripts/           build-content.ts (CSV → validated JSON)
docs/              spec
```

## CI / deployment

`.github/workflows/ci.yml` runs `pnpm run check` on every PR and push to `main`, then deploys `main` to **GitHub Pages**.

One-time setup: in the repo's *Settings → Pages*, set **Source** to **GitHub Actions**. The game is then live at `https://sagepublications.github.io/PI-Summit-2026-Team2-Game/`.

## Day-of checklist

- [ ] Fill in spec §1–4 and §6; agree the content row format
- [ ] Update `src/types/content.ts` + CSV columns; `pnpm run content`
- [ ] Replace placeholder `GameScene` with the real mechanic
- [ ] Keep `pnpm run check` green; play-test often
- [ ] Definition of Done in spec §6 (including play-test by another team member)
