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
  private readonly titleText: Text;
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

    this.titleText = new Text({
      text: balance.uiStrings.title,
      style: { fontFamily: theme.font.family, fontSize: theme.font.title, fill: theme.colors.hudLabel, fontWeight: '800', letterSpacing: 1 },
    });
    this.titleText.anchor.set(0.5);
    this.titleText.position.set(DESIGN.width / 2, theme.layout.title.y);
    this.titleText.visible = false;

    this.addChild(this.rules, this.headerText, this.titleText);
  }

  /** The game title is shown on the intro and start screens only. */
  showTitle(visible: boolean): void {
    this.titleText.visible = visible;
  }

  setHeader(text: string, danger = false): void {
    this.headerText.text = text;
    const color = danger ? theme.colors.danger : theme.colors.accent;
    this.headerText.style.fill = color;
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
