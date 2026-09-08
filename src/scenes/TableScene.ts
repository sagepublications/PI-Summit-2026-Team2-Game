import { Container, Graphics, Text, type Texture } from 'pixi.js';
import type { Scene } from './Scene';
import type { GameData } from '../game/content';
import type { Card, Metric } from '../types/content';
import { applyChoice, createRun, formatDuration, pickEndBand, type Run, type Side } from '../systems/run';
import { CardView } from '../ui/CardView';
import { Hud } from '../ui/Hud';
import { DESIGN, theme } from '../ui/theme';
import { pick } from '../utils/random';
import type { Sfx } from '../utils/sfx';
import { Tweener } from '../utils/tween';

type Phase = 'intro' | 'start' | 'playing' | 'gameover' | 'end';

function applyTextResolution(node: Container, resolution: number): void {
  if (node instanceof Text) node.resolution = resolution;
  for (const child of node.children) applyTextResolution(child, resolution);
}

export interface TableSceneAssets {
  cards: Map<string, Texture>;
  icons: Partial<Record<Metric, Texture>>;
}

/**
 * The whole game is one table: a HUD and one card at a time. Which card is on
 * the table is decided by a small phase machine:
 *   intro → playing → (gameover →) end → start → playing → …
 */
export class TableScene implements Scene {
  readonly container = new Container();
  private readonly root = new Container(); // 1080×1920 design space, scaled to fit
  private readonly hud: Hud;
  private readonly tweener = new Tweener();
  private readonly rotateOverlay: Text;

  private phase: Phase = 'intro';
  private run: Run | null = null;
  private card: CardView | null = null;
  private busy = false;
  private lastMonths = 0;
  private endedByExhaustion = false;
  private lastFailure: { metric: Metric; bound: 0 | 100 } | null = null;
  private textResolution = 1;

  constructor(
    private readonly data: GameData,
    private readonly assets: TableSceneAssets,
    private readonly rng: () => number,
    private readonly sfx: Sfx,
  ) {
    const frame = new Graphics()
      .roundRect(0, 0, DESIGN.width, DESIGN.height, 48)
      .fill(theme.colors.frame)
      .stroke({ width: 3, color: theme.colors.frameEdge });
    for (const [x, y] of [[40, 40], [DESIGN.width - 40, 40], [40, DESIGN.height - 40], [DESIGN.width - 40, DESIGN.height - 40]]) {
      frame.poly([x!, y! - 12, x! + 12, y!, x!, y! + 12, x! - 12, y!]).fill(theme.colors.accent);
    }
    this.hud = new Hud(data.balance, assets.icons, this.tweener);
    this.root.addChild(frame, this.hud);

    this.rotateOverlay = new Text({
      text: data.balance.uiStrings.rotateDevice,
      style: { fontFamily: theme.font.family, fontSize: 22, fill: theme.colors.hudLabel, align: 'center', wordWrap: true, wordWrapWidth: 320 },
    });
    this.rotateOverlay.anchor.set(0.5);
    this.rotateOverlay.visible = false;

    this.container.addChild(this.root, this.rotateOverlay);
  }

  // ------------------------------------------------------------ Scene API
  enter(): void {
    window.addEventListener('keydown', this.onKey);
    // Pixi does not forward pointercancel to display objects; a cancelled touch
    // (OS gesture, notification, tab switch) would otherwise leave the card mid-drag.
    window.addEventListener('pointercancel', this.onInterrupt);
    window.addEventListener('blur', this.onInterrupt);
    document.addEventListener('visibilitychange', this.onInterrupt);
    this.hud.reset(this.startMetrics());
    void this.deal(pick(this.data.intro, this.rng), 'intro');
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointercancel', this.onInterrupt);
    window.removeEventListener('blur', this.onInterrupt);
    document.removeEventListener('visibilitychange', this.onInterrupt);
  }

  private readonly onInterrupt = (): void => {
    this.card?.cancelDrag();
  };

  update(dt: number): void {
    this.tweener.update(dt * 1000);
  }

  resize(width: number, height: number): void {
    const scale = Math.min(width / DESIGN.width, height / DESIGN.height);
    this.root.scale.set(scale);
    this.root.position.set((width - DESIGN.width * scale) / 2, (height - DESIGN.height * scale) / 2);
    // Rasterise text at its on-screen pixel size: crisp on 1080p (scale ≈ 0.56)
    // and on low-DPR phones, instead of drawing at full size and downsampling.
    this.textResolution = Math.max(0.5, (window.devicePixelRatio || 1) * scale);
    applyTextResolution(this.root, this.textResolution);
    // Let DOM overlays (the audio drawer) anchor to the frame's top-right corner
    // rather than the window's, so they float over the game at every viewport.
    const style = document.documentElement.style;
    style.setProperty('--frame-top', `${this.root.position.y}px`);
    style.setProperty('--frame-right', `${width - (this.root.position.x + DESIGN.width * scale)}px`);
    style.setProperty('--frame-scale', String(scale));
    // A phone on its side is unplayable at this aspect; ask for portrait. Desktop
    // windows that happen to be short are left alone (they can be resized).
    const touchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const tooShort = touchDevice && width > height && height < 600;
    this.root.visible = !tooShort;
    this.rotateOverlay.visible = tooShort;
    this.rotateOverlay.position.set(width / 2, height / 2);
  }

  // ----------------------------------------------------------- game flow
  private startMetrics() {
    const s = this.data.balance.metrics.start;
    return { team: s, quality: s, deadline: s, budget: s };
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || this.busy || !this.card || this.rotateOverlay.visible) return;
    if (e.code === 'ArrowLeft') this.card.commit('left');
    else if (e.code === 'ArrowRight') this.card.commit('right');
    else return;
    e.preventDefault();
  };

  private headerFor(phase: Phase, months: number): { text: string; danger?: boolean; title?: boolean } {
    const ui = this.data.balance.uiStrings;
    // Arabic numerals: the mock-up used roman ones, but "MONTH XVIII" is slow to
    // read at a glance and the spec asks the clock to display how many months.
    const clock = `${ui.month} ${months}`;
    switch (phase) {
      case 'intro':
      case 'start':
        // The game title takes the header line on the start screens (month 0 says nothing).
        return { text: ui.title, title: true };
      case 'playing':
        return { text: clock };
      case 'gameover':
        return { text: `${clock} · ${ui.gameover.header}`, danger: true };
      case 'end':
        return { text: `${months} ${months === 1 ? ui.month : ui.months}${this.endedByExhaustion ? ` · ${ui.end.header}` : ''}` };
    }
  }

  /** The facts on the end card: how long the product lasted and what finished it. */
  private endSummary(months: number): { label: string; value: string }[] {
    const ui = this.data.balance.uiStrings;
    const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const reason = this.lastFailure
      ? ui.reasonHit
          .replace('{metric}', sentenceCase(ui.metricLabels[this.lastFailure.metric]))
          .replace('{bound}', String(this.lastFailure.bound))
      : ui.reasonCleared;
    return [
      { label: ui.survived, value: formatDuration(months, { month: ui.month.toLowerCase(), months: ui.months.toLowerCase(), year: ui.year, years: ui.years }) },
      { label: ui.endedBy, value: reason },
    ];
  }

  /** Put a card on the table for the given phase. Input stays locked until it has landed. */
  private async deal(content: Card, phase: Phase): Promise<void> {
    this.busy = true;
    this.phase = phase;
    const months = this.run?.months ?? this.lastMonths;
    const header = this.headerFor(phase, months);
    this.hud.setHeader(header.text, header);

    const ui = this.data.balance.uiStrings;
    const fallback = phase === 'playing' ? null : ui[phase];
    const situation = content.situation.replace(/\{\s*months\s*\}/gi, String(months));

    const view = new CardView({
      situation,
      leftLabel: content.left.text ?? fallback?.left ?? '←',
      rightLabel: content.right.text ?? fallback?.right ?? '→',
      texture: this.assets.cards.get(content.id) ?? null,
      summary: phase === 'end' ? this.endSummary(months) : undefined,
      balance: this.data.balance,
      tweener: this.tweener,
      onPreview: (side) => this.hud.preview(side && phase === 'playing' ? content[side].effects : null),
      onChoose: (side) => this.acceptChoice(view, side),
    });
    this.card = view;
    applyTextResolution(view, this.textResolution);
    this.root.addChild(view);
    await view.dealIn();
    view.setInteractive(true);
    this.busy = false;
    this.publishDebugState(content);
  }

  /** Dev-server only: lets automated play-tests read the game state (window.__game). */
  private publishDebugState(content: Card): void {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __game: unknown }).__game = {
      phase: this.phase,
      months: this.run?.months ?? this.lastMonths,
      metrics: this.run ? { ...this.run.metrics } : null,
      card: { id: content.id, type: content.type, left: content.left.effects, right: content.right.effects },
    };
  }

  /** Synchronous gate: accept the choice only if this card is live and nothing is animating. */
  private acceptChoice(view: CardView, side: Side): boolean {
    if (this.busy || view !== this.card) return false;
    this.busy = true;
    this.card = null;
    void this.advance(view, side);
    return true;
  }

  private async advance(view: CardView, side: Side): Promise<void> {
    this.sfx.swoosh(side === 'left' ? -1 : 1);
    const flyAway = view.flyOff(side).then(() => {
      this.root.removeChild(view);
      view.destroy({ children: true, texture: false });
    });

    switch (this.phase) {
      case 'intro':
      case 'start': {
        this.run = createRun(this.data.regular, this.data.balance, this.rng);
        this.endedByExhaustion = false;
        this.lastFailure = null;
        this.hud.markFailed(null);
        this.hud.reset(this.run.metrics);
        await flyAway;
        await this.deal(this.run.current!, 'playing');
        return;
      }
      case 'playing': {
        const run = this.run!;
        const result = applyChoice(run, side, this.data.balance);
        this.hud.preview(null);
        const bars = this.hud.animateTo(result.after, result.deltas);
        await flyAway;
        if (result.outcome.kind === 'continue') {
          await this.deal(run.current!, 'playing');
          return;
        }
        await bars;
        this.lastMonths = run.months;
        if (result.outcome.kind === 'gameover') {
          const { metric, bound } = result.outcome;
          this.lastFailure = { metric, bound };
          this.hud.markFailed(metric);
          this.sfx.lose();
          await this.deal(pick(this.data.gameover[metric][bound], this.rng), 'gameover');
        } else {
          this.endedByExhaustion = true;
          this.lastFailure = null;
          this.sfx.win();
          // Deliberate reading of spec §2: the team authored a dedicated "completed all
          // cards" end card, so it takes precedence over the month-band card on a full clear.
          const pool = this.data.endExhausted.length > 0 ? this.data.endExhausted : pickEndBand(this.data.endBands, run.months);
          await this.deal(pick(pool, this.rng), 'end');
        }
        return;
      }
      case 'gameover': {
        await flyAway;
        await this.deal(pick(pickEndBand(this.data.endBands, this.lastMonths), this.rng), 'end');
        return;
      }
      case 'end': {
        this.run = null;
        this.hud.markFailed(null);
        this.hud.reset(this.startMetrics());
        this.lastMonths = 0;
        await flyAway;
        await this.deal(pick(this.data.start, this.rng), 'start');
        return;
      }
    }
  }
}
