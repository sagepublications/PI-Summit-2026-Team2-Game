import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Balance } from '../types/content';
import { theme } from './theme';
import { lerp, type Tween, type Tweener } from '../utils/tween';

/**
 * One HUD metric: icon, thin bar, spaced small-caps label.
 * Supports a drag preview (ghost segment + signed delta), an animated value
 * change with a colour flash, and a pinned red "failed" state.
 */
export class MetricBar extends Container {
  private readonly icon: Sprite | Graphics;
  private readonly track = new Graphics();
  private readonly fill = new Graphics();
  private readonly ghost = new Graphics();
  private readonly labelText: Text;
  private readonly deltaText: Text;

  private value: number;
  private shown: number; // animated display value
  private previewDelta = 0;
  private failed = false;
  private flash = 0; // 1 -> 0 after a change
  private flashColor: number = theme.colors.gold;
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
      this.icon = new Graphics().circle(0, 0, iconSize / 2 - 4).stroke({ width: 4, color: theme.colors.gold });
    }
    this.icon.position.set(barWidth / 2, iconSize / 2);

    const barY = iconSize + 22;
    this.track.roundRect(0, barY, barWidth, barHeight, barHeight / 2).fill(theme.colors.barTrack);
    this.fill.position.y = barY;
    this.ghost.position.y = barY;

    this.labelText = new Text({
      text: label,
      style: { fontFamily: theme.font.family, fontSize: theme.font.label, fill: theme.colors.gold, letterSpacing: 4, fontWeight: 'bold' },
    });
    this.labelText.anchor.set(0.5, 0);
    this.labelText.position.set(barWidth / 2, barY + barHeight + 12);

    this.deltaText = new Text({
      text: '',
      style: { fontFamily: theme.font.family, fontSize: theme.font.preview, fill: theme.colors.parchment, fontWeight: 'bold' },
    });
    this.deltaText.anchor.set(0.5, 1);
    this.deltaText.position.set(barWidth / 2 + iconSize / 2 + 34, iconSize / 2 + 12);
    this.deltaText.visible = false;

    this.addChild(this.icon, this.track, this.fill, this.ghost, this.labelText, this.deltaText);
    this.redraw();
  }

  /** Bar colour for a value: red near either bound, otherwise gold. */
  private colorFor(v: number): number {
    const { min, max } = this.balance.metrics;
    if (this.failed) return theme.colors.bad;
    if (v - min <= this.balance.dangerWithin || max - v <= this.balance.dangerWithin) return theme.colors.danger;
    return theme.colors.gold;
  }

  private widthFor(v: number): number {
    const { min, max } = this.balance.metrics;
    return ((v - min) / (max - min)) * theme.layout.hud.barWidth;
  }

  private redraw(): void {
    const h = theme.layout.hud.barHeight;
    const base = this.colorFor(this.shown);
    const color = this.flash > 0 ? this.flashColor : base;
    this.fill.clear();
    const w = this.widthFor(this.shown);
    if (w > 0) this.fill.roundRect(0, 0, w, h, h / 2).fill(color);

    this.ghost.clear();
    if (this.previewDelta !== 0) {
      const { min, max } = this.balance.metrics;
      const target = Math.max(min, Math.min(max, this.value + this.previewDelta));
      const from = Math.min(this.widthFor(this.value), this.widthFor(target));
      const to = Math.max(this.widthFor(this.value), this.widthFor(target));
      const ghostColor = this.previewDelta > 0 ? theme.colors.good : theme.colors.bad;
      this.ghost.roundRect(from, -3, Math.max(4, to - from), h + 6, 3).fill({ color: ghostColor, alpha: 0.85 });
    }

    const labelColor = this.failed ? theme.colors.bad : theme.colors.gold;
    this.labelText.style.fill = labelColor;
    if (this.icon instanceof Sprite) this.icon.tint = this.failed ? theme.colors.bad : 0xffffff;
  }

  /** Show what a choice would do to this metric (0 clears). */
  preview(delta: number): void {
    this.previewDelta = delta;
    this.deltaText.visible = delta !== 0;
    if (delta !== 0) {
      this.deltaText.text = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
      this.deltaText.style.fill = delta > 0 ? theme.colors.good : theme.colors.bad;
    }
    this.redraw();
  }

  /** Jump to a value with no animation (run reset). */
  reset(value: number): void {
    this.value = this.shown = value;
    this.previewDelta = 0;
    this.deltaText.visible = false;
    this.failed = false;
    this.flash = 0;
    if (this.icon instanceof Sprite) this.icon.width = this.icon.height = theme.layout.hud.iconSize;
    this.redraw();
  }

  /** Animate to a new value and flash green/red; resolves when the tween ends. */
  async animateTo(value: number, delta: number): Promise<void> {
    this.preview(0);
    const from = this.shown;
    this.value = value;
    if (delta === 0) {
      this.shown = value;
      this.redraw();
      return;
    }
    this.flashColor = delta > 0 ? theme.colors.good : theme.colors.bad;
    const ms = this.balance.anim.barTweenMs;
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
