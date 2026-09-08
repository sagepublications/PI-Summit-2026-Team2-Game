import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Balance } from '../types/content';
import { theme } from './theme';
import { lerp, type Tween, type Tweener } from '../utils/tween';

/**
 * One HUD metric: icon, thin bar, spaced small-caps label.
 * While the player drags, a single-colour dot above the icon shows how big the
 * effect on this metric would be — never which way it goes. After a swipe the
 * bar tweens to its new value with a white flash; near a bound it turns red,
 * and the metric that ended the run stays pinned red.
 */
export class MetricBar extends Container {
  private readonly icon: Sprite | Graphics;
  private readonly track = new Graphics();
  private readonly fill = new Graphics();
  private readonly dot = new Graphics();
  private readonly labelText: Text;
  /** Signed change shown after a swipe lands (never during the preview). */
  private readonly deltaText: Text;
  private deltaTween: Tween | null = null;

  private value: number;
  private shown: number; // animated display value
  private failed = false;
  private flash = 0; // 1 -> 0 after a change
  private tween: Tween | null = null;

  constructor(
    label: string,
    iconTexture: Texture | null,
    private readonly balance: Balance,
    private readonly tweener: Tweener,
  ) {
    super();
    const { iconSize, barWidth, barHeight } = theme.layout.hud;
    this.value = this.shown = balance.metrics.start;

    if (iconTexture) {
      const s = new Sprite(iconTexture);
      s.anchor.set(0.5);
      s.width = s.height = iconSize;
      this.icon = s;
    } else {
      this.icon = new Graphics().circle(0, 0, iconSize / 2 - 4).stroke({ width: 4, color: theme.colors.hudIcon });
    }
    this.icon.position.set(barWidth / 2, iconSize / 2);

    const barY = iconSize + 22;
    this.track.roundRect(0, barY, barWidth, barHeight, barHeight / 2).fill({ color: theme.colors.barTrack, alpha: 0.2 });
    this.fill.position.y = barY;
    // The preview dot sits just above the icon, centred on the column.
    this.dot.position.set(barWidth / 2, -14);

    this.labelText = new Text({
      text: label,
      style: { fontFamily: theme.font.family, fontSize: theme.font.label, fill: theme.colors.hudLabel, letterSpacing: 4, fontWeight: 'bold' },
    });
    this.labelText.anchor.set(0.5, 0);
    this.labelText.position.set(barWidth / 2, barY + barHeight + 12);

    this.deltaText = new Text({
      text: '',
      style: { fontFamily: theme.font.family, fontSize: theme.font.delta, fill: theme.colors.gain, fontWeight: '700' },
    });
    this.deltaText.anchor.set(0.5, 1);
    this.deltaText.visible = false;

    this.addChild(this.icon, this.track, this.fill, this.dot, this.labelText, this.deltaText);
    this.redraw();
  }

  /** "+20" / "−10" rising from the bar and fading out, once the change has landed. */
  private showDelta(delta: number): void {
    const { barWidth, iconSize } = theme.layout.hud;
    this.deltaTween?.cancel();
    this.deltaText.text = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
    this.deltaText.style.fill = delta > 0 ? theme.colors.gain : theme.colors.danger;
    this.deltaText.visible = true;
    const startY = iconSize + 10;
    this.deltaText.position.set(barWidth / 2, startY);
    this.deltaText.alpha = 1;
    this.deltaTween = this.tweener.to(this.balance.anim.deltaFloatMs, (t) => {
      this.deltaText.position.y = startY - 60 * t;
      this.deltaText.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    });
    void this.deltaTween.then(() => {
      if (this.deltaText.alpha <= 0.01) this.deltaText.visible = false;
    });
  }

  private inDanger(v: number): boolean {
    const { min, max } = this.balance.metrics;
    return v - min <= this.balance.dangerWithin || max - v <= this.balance.dangerWithin;
  }

  private widthFor(v: number): number {
    const { min, max } = this.balance.metrics;
    return ((v - min) / (max - min)) * theme.layout.hud.barWidth;
  }

  private redraw(): void {
    const h = theme.layout.hud.barHeight;
    const base = this.failed || this.inDanger(this.shown) ? theme.colors.danger : theme.colors.barFill;
    const color = this.flash > 0 ? theme.colors.flash : base;
    this.fill.clear();
    const w = this.widthFor(this.shown);
    if (w > 0) this.fill.roundRect(0, 0, w, h, h / 2).fill(color);

    const tint = this.failed ? theme.colors.danger : theme.colors.hudIcon;
    this.labelText.style.fill = this.failed ? theme.colors.danger : theme.colors.hudLabel;
    if (this.icon instanceof Sprite) this.icon.tint = tint;
  }

  /** Show how big a choice's effect on this metric would be (0 hides the dot). */
  preview(delta: number): void {
    this.dot.clear();
    if (delta !== 0) {
      const r = (Math.abs(delta) / 10) * theme.layout.hud.dotRadiusPerTen;
      this.dot.circle(0, 0, r).fill(theme.colors.previewDot);
    }
  }

  /** Jump to a value with no animation (run reset). */
  reset(value: number): void {
    this.tween?.cancel();
    this.deltaTween?.cancel();
    this.deltaText.visible = false;
    this.value = this.shown = value;
    this.failed = false;
    this.flash = 0;
    this.preview(0);
    if (this.icon instanceof Sprite) this.icon.width = this.icon.height = theme.layout.hud.iconSize;
    this.redraw();
  }

  /** Animate to a new value with a flash and icon pulse; resolves when the tween ends. */
  async animateTo(value: number, delta: number): Promise<void> {
    this.preview(0);
    const from = this.shown;
    this.value = value;
    if (delta === 0) {
      this.shown = value;
      this.redraw();
      return;
    }
    const ms = this.balance.anim.barTweenMs;
    this.showDelta(delta);
    this.tween?.cancel();
    this.tween = this.tweener.to(ms, (t) => {
      this.shown = lerp(from, value, t);
      this.flash = 1 - t;
      const pulse = 1 + 0.25 * Math.sin(Math.PI * t);
      if (this.icon instanceof Sprite) this.icon.width = this.icon.height = theme.layout.hud.iconSize * pulse;
      this.redraw();
    });
    await this.tween;
    this.shown = this.value;
    this.flash = 0;
    if (this.icon instanceof Sprite) this.icon.width = this.icon.height = theme.layout.hud.iconSize;
    this.redraw();
  }

  /** Pin the bar red (the metric that ended the run). */
  setFailed(failed: boolean): void {
    this.failed = failed;
    this.redraw();
  }
}
