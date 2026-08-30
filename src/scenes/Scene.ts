import { Container } from 'pixi.js';

/** A screen of the game (Start, Game, Game Over...). One is active at a time. */
export interface Scene {
  /** Root display object; SceneManager adds/removes it from the stage. */
  readonly container: Container;
  /** Called when the scene becomes active. */
  enter(): void;
  /** Called before the scene is removed; clean up listeners here. */
  exit(): void;
  /** Called every frame with delta time in seconds. */
  update(dt: number): void;
  /** Called on enter and whenever the window is resized. */
  resize(width: number, height: number): void;
}
