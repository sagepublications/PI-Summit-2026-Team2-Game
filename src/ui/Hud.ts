import { Container, Graphics, Text, type Texture } from 'pixi.js';
import { METRICS, type Balance, type Effects, type Metric } from '../types/content';
import type { Metrics } from '../systems/run';
import { MetricBar } from './MetricBar';
import { DESIGN, theme } from './theme';
import type { Tweener } from '../utils/tween';

/** Four metric bars plus the month/subtitle line with gold rules. */
export class Hud extends Container {
  private readonly bars: Record<Metric, MetricBar>;
  private readonly headerText: Text;
  private readonly rules = new Graphics();

  constructor(balance: Balance, icons: Partial<Record<Metric, Texture>>, tweener: Tweener) {
    super();
    const { margin, hud } = theme.layout;
    const totalWidth = DESIGN.width - margin * 2;
    const colWidth = totalWidth / METRICS.length;

    this.bars = {} as Record<Metric, MetricBar>;
    METRICS.forEach((m, i) => {
      const bar = new MetricBar(balance.uiStrings.metricLabels[m], icons[m] ?? null, balance, tweener);
      bar.position.set(margin + colWidth * i + (colWidth - hud.barWidth) / 2, hud.top);
      this.bars[m] = bar;
      this.addChild(bar);
    });

    this.headerText = new Text({
      text: '',
      style: { fontFamily: theme.font.family, fontSize: theme.font.header, fill: theme.colors.accent, letterSpacing: 6, fontWeight: 'bold' },
    });
    this.headerText.anchor.set(0.5);
    this.headerText.position.set(DESIGN.width / 2, theme.layout.header.y);
    this.addChild(this.rules, this.headerText);
  }

  /**
   * The line between the bars and the card: the month clock during play, or the
   * game title (bigger, heavier, white) on the intro and start screens.
   */
  setHeader(text: string, opts: { danger?: boolean; title?: boolean } = {}): void {
    const { danger = false, title = false } = opts;
    this.headerText.text = text;
    this.headerText.style.fontSize = title ? theme.font.title : theme.font.header;
    this.headerText.style.fontWeight = title ? '800' : 'bold';
    this.headerText.style.letterSpacing = title ? 1 : 6;
    this.headerText.style.fill = danger ? theme.colors.danger : title ? theme.colors.hudLabel : theme.colors.accent;
    const y = theme.layout.header.y;
    const gap = this.headerText.width / 2 + 28;
    const { margin } = theme.layout;
    this.rules
      .clear()
      .moveTo(margin, y)
      .lineTo(DESIGN.width / 2 - gap, y)
      .moveTo(DESIGN.width / 2 + gap, y)
      .lineTo(DESIGN.width - margin, y)
      .stroke({ width: 2, color: danger ? theme.colors.danger : theme.colors.accent, alpha: danger ? 1 : 0.6 });
  }

  reset(metrics: Metrics): void {
    for (const m of METRICS) this.bars[m].reset(metrics[m]);
  }

  preview(effects: Effects | null): void {
    for (const m of METRICS) this.bars[m].preview(effects ? effects[m] : 0);
  }

  /** Animate every changed bar; resolves when all tweens finish. */
  animateTo(after: Metrics, deltas: Effects): Promise<void> {
    return Promise.all(METRICS.map((m) => this.bars[m].animateTo(after[m], deltas[m]))).then(() => undefined);
  }

  markFailed(metric: Metric | null): void {
    for (const m of METRICS) this.bars[m].setFailed(m === metric);
  }
}
