import { Container, Text } from 'pixi.js';
import type { Scene } from './Scene';
import type { GameData } from '../game/content';
import type { ContentItem } from '../types/content';
import { Button } from '../ui/Button';
import { theme } from '../ui/theme';
import { isConfirmKey } from '../utils/input';
import { shuffle } from '../utils/random';

export interface GameResult {
  score: number;
  itemsSeen: number;
}

/**
 * PLACEHOLDER gameplay: shows one content item at a time; "Next" advances and
 * scores points; the run ends after balance.itemsPerRun items.
 * Replace the core mechanic here once the game is designed.
 */
export class GameScene implements Scene {
  readonly container = new Container();
  private readonly queue: ContentItem[];
  private index = 0;
  private score = 0;

  private readonly hud: Text;
  private readonly title: Text;
  private readonly body: Text;
  private readonly nextButton: Button;

  constructor(
    private readonly data: GameData,
    private readonly onGameOver: (result: GameResult) => void,
  ) {
    this.queue = shuffle(data.items).slice(0, data.balance.itemsPerRun);

    this.hud = new Text({
      text: '',
      style: { fontFamily: theme.font.family, fontSize: theme.font.small, fill: theme.colors.textMuted },
    });
    this.title = new Text({
      text: '',
      style: { fontFamily: theme.font.family, fontSize: theme.font.heading, fill: theme.colors.text, fontWeight: '700' },
    });
    this.title.anchor.set(0.5);
    this.body = new Text({
      text: '',
      style: {
        fontFamily: theme.font.family,
        fontSize: theme.font.body,
        fill: theme.colors.text,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 760,
      },
    });
    this.body.anchor.set(0.5, 0);

    this.nextButton = new Button('Next', () => this.advance());

    this.container.addChild(this.hud, this.title, this.body, this.nextButton);
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (isConfirmKey(e)) this.advance();
  };

  enter(): void {
    window.addEventListener('keydown', this.onKey);
    this.showCurrent();
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  update(): void {}

  resize(width: number, height: number): void {
    this.hud.position.set(24, 20);
    this.title.position.set(width / 2, height * 0.25);
    this.body.position.set(width / 2, height * 0.35);
    this.body.style.wordWrapWidth = Math.min(760, width - 48);
    this.nextButton.position.set(width / 2, height * 0.8);
  }

  private showCurrent(): void {
    const item = this.queue[this.index];
    if (!item) {
      this.onGameOver({ score: this.score, itemsSeen: this.index });
      return;
    }
    this.hud.text = `Item ${this.index + 1} / ${this.queue.length}   Score: ${this.score}`;
    this.title.text = item.title;
    this.body.text = item.text;
  }

  private advance(): void {
    this.score += this.data.balance.pointsPerItem;
    this.index += 1;
    this.showCurrent();
  }
}
