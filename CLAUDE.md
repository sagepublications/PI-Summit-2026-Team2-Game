# Project rules (from docs/spec.v1.pdf §5)

Read `docs/spec.v1.pdf` (latest spec) fully before changing gameplay.

## Priorities
1. Complete, playable gameplay loop first — get end-to-end playable early.
2. Correct core mechanic. 3. Easy integration of team content. 4. Clear feedback. 5. Polish. 6. Stretch.
- All **Must Have** items before any **Stretch** item.
- Prefer the simplest implementation. No unnecessary architecture, abstractions or dependencies.

## Stack (fixed)
TypeScript · PixiJS 8 · Vite · pnpm · plain CSS · JSON content · localStorage only if needed.
Fully client-side. **No** backend, React, Vue, ECS, or state-management libraries. Svelte only if a clear UI need arises.

## Content
- Content lives in `content/game-content.csv` (the team's spreadsheet export, one card = one row — column format is the team's, documented in README) and `content/balance.json`.
- Schema, spreadsheet parsers (`parseCardRow`, `parseEffects`, `parseTrigger`) and cross-card rules (`validateContentSet`) are defined **once** in `src/types/content.ts`; build script, game and tests all use them.
- `pnpm run content` validates and writes `src/data/*.json` (imported + bundled). Generated JSON **is committed**; never edit it by hand.
- Every card needs an illustration `public/assets/images/card-<ID>.<png|svg|jpg|webp>`; the "Situation illustration" cell is the art prompt. Filenames are case-sensitive on CI/Pages.
- Never hard-code content, balance numbers or UI strings in game logic — they come from `balance.json` (`uiStrings`, `allowedEffects`, timings…).
- Validation errors must name the spreadsheet row and the problem; warnings must not fail the build (unless `--strict`).

## Commands
`pnpm run dev` · `pnpm run build` · `pnpm run test` · `pnpm run check` (content → test → typecheck → build). Run `check` frequently; never leave it red. `?seed=N` in the URL makes a run reproducible.

## Layout
`src/main.ts` boots Pixi, preloads images (never fatal), starts `TableScene` via `SceneManager`; the whole game is one scene with a HUD and one `CardView` at a time, driven by a phase machine (intro → playing → gameover → end → start …). Pure rules live in `src/systems/run.ts`.
- `src/systems/`, `src/types/`, `src/utils/random.ts`, `src/utils/rng.ts` must not import `pixi.js` or touch the DOM — they are type-checked under `tsconfig.node.json` and run in `node:test`.
- All layout is in a 1080×1920 design space scaled to fit the window (`src/ui/theme.ts`); drag maths is done in design space.

## Git
Do not mention Claude in commit messages or add it as a co-author.
