import { Application, Assets, type Texture } from 'pixi.js';
import { loadGameData, type GameData } from './game/content';
import { SceneManager } from './scenes/SceneManager';
import { TableScene, type TableSceneAssets } from './scenes/TableScene';
import { METRICS, type Metric } from './types/content';
import { theme } from './ui/theme';
import { rngFromQuery } from './utils/rng';

function showFatalError(message: string): void {
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = `The game could not start.\n\n${message}`;
  document.body.replaceChildren(el);
  console.error(message);
}

const ICON_FILES: Record<Metric, string> = { team: 'crown.svg', quality: 'shield.svg', deadline: 'hourglass.svg', budget: 'coin.svg' };

/**
 * Load every texture up front. One broken file must never take the game down:
 * failures are logged and the card falls back to a placeholder glyph.
 */
async function loadAssets(data: GameData): Promise<TableSceneAssets> {
  const base = import.meta.env.BASE_URL;
  const load = (url: string) => Assets.load<Texture>({ src: url, data: { resolution: 2 } });

  const allCards = [...data.intro, ...data.start, ...data.regular, ...data.endBands, ...data.endExhausted];
  for (const m of METRICS) for (const b of [0, 100] as const) allCards.push(...data.gameover[m][b]);
  const files = new Map(allCards.map((c) => [c.id, c.illustration.file] as const));

  const cards = new Map<string, Texture>();
  const entries = [...files];
  const cardResults = await Promise.allSettled(entries.map(([, file]) => load(`${base}assets/images/${file}`)));
  cardResults.forEach((r, i) => {
    const [id, file] = entries[i]!;
    if (r.status === 'fulfilled') cards.set(id, r.value);
    else console.warn(`Illustration "${file}" failed to load for card ${id}:`, r.reason);
  });

  const icons: Partial<Record<Metric, Texture>> = {};
  const iconResults = await Promise.allSettled(METRICS.map((m) => load(`${base}assets/ui/${ICON_FILES[m]}`)));
  iconResults.forEach((r, i) => {
    if (r.status === 'fulfilled') icons[METRICS[i]!] = r.value;
    else console.warn(`HUD icon failed to load: ${ICON_FILES[METRICS[i]!]}`, r.reason);
  });
  return { cards, icons };
}

async function main(): Promise<void> {
  const data = loadGameData();
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = data.balance.uiStrings.loading;

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: theme.colors.table,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  const assets = await loadAssets(data);

  loading?.remove();
  document.getElementById('app')!.appendChild(app.canvas);

  const { rng, seed } = rngFromQuery(window.location.search);
  if (seed !== null) console.info(`Seeded run: ${seed}`);

  const scenes = new SceneManager(app);
  scenes.goTo(new TableScene(data, assets, rng));
}

main().catch((err: unknown) => showFatalError(err instanceof Error ? err.message : String(err)));
