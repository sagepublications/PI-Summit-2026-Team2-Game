import { Container, Text } from 'pixi.js';
import type { Scene } from './Scene';
import type { GameResult } from './GameScene';
import { Button } from '../ui/Button';
import { theme } from '../ui/theme';

export class GameOverScene implements Scene {
  readonly container = new Container();
  private readonly title: Text;
  private readonly summary: Text;
  private readonly againButton: Button;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') this.onPlayAgain();
  };

  constructor(result: GameResult, private readonly onPlayAgain: () => void) {
    this.title = new Text({
      text: 'Game Over',
      style: { fontFamily: theme.font.family, fontSize: theme.font.title, fill: theme.colors.text, fontWeight: '700' },
    });
    this.title.anchor.set(0.5);

    this.summary = new Text({
      text: `Score: ${result.score}\nItems completed: ${result.itemsSeen}`,
      style: { fontFamily: theme.font.family, fontSize: theme.font.heading, fill: theme.colors.primary, align: 'center' },
    });
    this.summary.anchor.set(0.5);

    this.againButton = new Button('Play again', () => this.onPlayAgain());
    this.againButton.pivot.set(130, 32);

    this.container.addChild(this.title, this.summary, this.againButton);
  }

  enter(): void {
    window.addEventListener('keydown', this.onKey);
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  update(): void {}

  resize(width: number, height: number): void {
    this.title.position.set(width / 2, height * 0.3);
    this.summary.position.set(width / 2, height * 0.5);
    this.againButton.position.set(width / 2, height * 0.7);
  }
}
