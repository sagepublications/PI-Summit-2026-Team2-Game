# Project rules (from docs/spec-v0.pdf §5)

Read `docs/spec-v0.pdf` (or `docs/spec-*.pdf`, latest) fully before implementing gameplay.

## Priorities
1. Complete, playable gameplay loop first — get end-to-end playable early.
2. Correct core mechanic. 3. Easy integration of team content. 4. Clear feedback. 5. Polish. 6. Stretch.
- All **Must Have** items before any **Stretch** item.
- Prefer the simplest implementation. No unnecessary architecture, abstractions or dependencies.

## Stack (fixed)
TypeScript · PixiJS 8 · Vite · pnpm · plain CSS · JSON content · localStorage only if needed.
Fully client-side. **No** backend, React, Vue, ECS, or state-management libraries. Svelte only if a clear UI need arises.

## Content
- Content lives in `content/game-content.csv` (one authored item = one row) and `content/balance.json`.
- Schema is defined **once** in `src/types/content.ts` (Zod); build script and game both use it.
- `pnpm run content` validates and writes `src/data/*.json` (imported + bundled). Generated JSON **is committed**; never edit it by hand.
- CSV cells are strings: use `csvInt`/`csvNumber`/`csvEnum`/`csvBool`/`optionalText` helpers from `src/types/content.ts` for non-text columns.
- Asset filenames must match disk exactly (case-sensitive on CI/Pages).
- Never hard-code content or balance numbers in game logic.
- Validation errors must name the spreadsheet row and the problem.

## Commands
`pnpm run dev` · `pnpm run build` · `pnpm run check` (content → typecheck → build). Run `check` frequently; never leave it red.

## Layout
`src/main.ts` boots Pixi + `SceneManager`; scenes in `src/scenes/` (`Scene` interface); reusable UI in `src/ui/`; gameplay systems in `src/systems/`; helpers in `src/utils/`.

## Git
Do not mention Claude in commit messages or add it as a co-author.
