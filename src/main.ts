import { Application, Assets, type Texture } from 'pixi.js';
import { loadGameData, type GameData } from './game/content';
import { SceneManager } from './scenes/SceneManager';
import { TableScene, type TableSceneAssets } from './scenes/TableScene';
import { METRICS, type Metric } from './types/content';
import { theme } from './ui/theme';
import { Music } from './utils/music';
import { rngFromQuery } from './utils/rng';
import { Sfx } from './utils/sfx';

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

/**
 * PixiJS rasterises text with the canvas, which only uses a web font once the
 * browser has loaded it. Wait for the faces we use, but never let a slow or
 * missing font block the game (the CSS stack falls back to Helvetica/Arial).
 */
async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  const faces = ['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px "Sage Peak"`));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.allSettled(faces), timeout]);
}

async function main(): Promise<void> {
  const data = loadGameData();
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = data.balance.uiStrings.loading;

  await waitForFonts();
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

  const { audio, uiStrings } = data.balance;
  const sfx = new Sfx(audio.sfxVolume);
  const music = new Music(`${import.meta.env.BASE_URL}assets/audio/${audio.music}`, audio.musicVolume);
  setupVolumeControls(sfx, music, uiStrings.sfxLabel, uiStrings.musicLabel);
  // Browsers only allow audio after a user gesture: the first swipe/key starts the music.
  const startMusic = () => {
    music.start();
    window.removeEventListener('pointerdown', startMusic);
    window.removeEventListener('keydown', startMusic);
  };
  window.addEventListener('pointerdown', startMusic);
  window.addEventListener('keydown', startMusic);

  const scenes = new SceneManager(app);
  scenes.goTo(new TableScene(data, assets, rng, sfx));
}

/** Two range sliders (effects, music); sliding to 0 mutes and greys the row. */
function setupVolumeControls(sfx: Sfx, music: Music, sfxLabel: string, musicLabel: string): void {
  const panel = document.getElementById('audio-controls');
  const sfxInput = document.getElementById('sfx-volume') as HTMLInputElement | null;
  const musicInput = document.getElementById('music-volume') as HTMLInputElement | null;
  if (!panel || !sfxInput || !musicInput) return;

  const wire = (input: HTMLInputElement, label: string, initial: number, apply: (v: number) => void) => {
    const row = input.closest('.volume') as HTMLElement;
    row.querySelector('.volume-name')!.textContent = label;
    input.setAttribute('aria-label', label);
    const render = (v: number) => {
      row.classList.toggle('is-muted', v === 0);
      input.title = v === 0 ? `${label}: muted` : `${label}: ${Math.round(v * 100)}%`;
    };
    input.value = String(Math.round(initial * 100));
    render(initial);
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      apply(v);
      render(v);
    });
  };
  wire(sfxInput, sfxLabel, sfx.getVolume(), (v) => sfx.setVolume(v));
  wire(musicInput, musicLabel, music.volume, (v) => music.setVolume(v));
  panel.hidden = false;
}

main().catch((err: unknown) => showFatalError(err instanceof Error ? err.message : String(err)));
