import { Container, Graphics, Text } from 'pixi.js';
import { theme } from './theme';

/** Simple rounded text button with hover/press feedback. */
export class Button extends Container {
  private readonly bg = new Graphics();
  private readonly labelText: Text;
  private readonly w: number;
  private readonly h: number;

  constructor(label: string, onClick: () => void, width = 260, height = 64) {
    super();
    this.w = width;
    this.h = height;

    this.labelText = new Text({
      text: label,
      style: { fontFamily: theme.font.family, fontSize: theme.font.body, fill: theme.colors.background, fontWeight: '600' },
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(width / 2, height / 2);

    this.draw(theme.colors.primary);
    this.addChild(this.bg, this.labelText);
    // Position refers to the button's centre, whatever its size.
    this.pivot.set(width / 2, height / 2);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => this.draw(theme.colors.primaryHover));
    this.on('pointerout', () => {
      this.draw(theme.colors.primary);
      this.scale.set(1);
    });
    this.on('pointerdown', () => this.scale.set(0.96));
    this.on('pointerup', () => this.scale.set(1));
    this.on('pointertap', onClick);
  }

  private draw(color: number): void {
    this.bg.clear().roundRect(0, 0, this.w, this.h, 12).fill(color);
  }
}
