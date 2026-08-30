import { Application } from 'pixi.js';
import { loadGameData, type GameData } from './game/content';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { SceneManager } from './scenes/SceneManager';
import { StartScene } from './scenes/StartScene';
import { theme } from './ui/theme';

function showFatalError(message: string): void {
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = `The game could not start.\n\n${message}`;
  document.body.replaceChildren(el);
  console.error(message);
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: theme.colors.background,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const data: GameData = await loadGameData();
  const scenes = new SceneManager(app);

  // Scene flow: Start -> Game -> Game Over -> (Play again) -> Start
  const goToStart = (): void => scenes.goTo(new StartScene(goToGame));
  const goToGame = (): void =>
    scenes.goTo(new GameScene(data, (result) => scenes.goTo(new GameOverScene(result, goToStart))));

  goToStart();
}

main().catch((err: unknown) => showFatalError(err instanceof Error ? err.message : String(err)));
