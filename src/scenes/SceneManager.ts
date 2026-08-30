import type { Application } from 'pixi.js';
import type { Scene } from './Scene';

export class SceneManager {
  private current: Scene | null = null;

  constructor(private readonly app: Application) {
    app.ticker.add((ticker) => this.current?.update(ticker.deltaMS / 1000));
    window.addEventListener('resize', () => this.resizeCurrent());
  }

  get width(): number {
    return this.app.renderer.width;
  }

  get height(): number {
    return this.app.renderer.height;
  }

  /** Replace the active scene. The old scene is exited and destroyed. */
  goTo(scene: Scene): void {
    if (this.current) {
      this.current.exit();
      this.app.stage.removeChild(this.current.container);
      this.current.container.destroy({ children: true });
    }
    this.current = scene;
    this.app.stage.addChild(scene.container);
    scene.enter();
    this.resizeCurrent();
  }

  private resizeCurrent(): void {
    this.current?.resize(this.width, this.height);
  }
}
