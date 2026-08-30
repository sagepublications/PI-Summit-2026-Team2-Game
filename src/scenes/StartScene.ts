import { Container, Text } from 'pixi.js';
import type { Scene } from './Scene';
import { Button } from '../ui/Button';
import { isConfirmKey } from '../utils/input';
import { theme } from '../ui/theme';

export class StartScene implements Scene {
  readonly container = new Container();
  private readonly title: Text;
  private readonly howTo: Text;
  private readonly startButton: Button;
  private readonly onKey = (e: KeyboardEvent) => {
    if (isConfirmKey(e)) this.onStart();
  };

  constructor(private readonly onStart: () => void) {
    this.title = new Text({
      text: 'Working Title',
      style: { fontFamily: theme.font.family, fontSize: theme.font.title, fill: theme.colors.text, fontWeight: '700' },
    });
    this.title.anchor.set(0.5);

    this.howTo = new Text({
      text: 'How to play: [replace with instructions after the planning meeting]\nClick Start or press Space.',
      style: {
        fontFamily: theme.font.family,
        fontSize: theme.font.body,
        fill: theme.colors.textMuted,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 700,
      },
    });
    this.howTo.anchor.set(0.5);

    this.startButton = new Button('Start', () => this.onStart());

    this.container.addChild(this.title, this.howTo, this.startButton);
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
    this.howTo.position.set(width / 2, height * 0.5);
    this.howTo.style.wordWrapWidth = Math.min(700, width - 48);
    this.startButton.position.set(width / 2, height * 0.7);
  }
}
