import { Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js';
import type { Balance } from '../types/content';
import type { Side } from '../systems/run';
import { theme } from './theme';
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, type Ease, type Tween, type Tweener } from '../utils/tween';

export interface CardViewOptions {
  situation: string;
  leftLabel: string;
  rightLabel: string;
  texture: Texture | null;
  balance: Balance;
  tweener: Tweener;
  /** Fired while dragging: which side is being previewed, or null. */
  onPreview: (side: Side | null) => void;
  /**
   * Fired when the player commits a choice (drag past threshold, tap a label, or
   * arrow key). Return false to refuse it (e.g. the scene is mid-transition); the
   * card then stays interactive.
   */
  onChoose: (side: Side) => boolean;
}

/**
 * The maroon situation card. Follows the pointer with rotation proportional to
 * horizontal drag; released past the threshold it flies off, otherwise it snaps
 * back. Design-space coordinates throughout (see TableScene.resize).
 */
export class CardView extends Container {
  private readonly opts: CardViewOptions;
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly cardWidth: number;
  private readonly leftTag: Container;
  private readonly rightTag: Container;
  private readonly leftArrow: Graphics;
  private readonly rightArrow: Graphics;

  private enabled = false;
  private dragging = false;
  private pointerId: number | null = null;
  private dragStart = { x: 0, y: 0 };
  private previewSide: Side | null = null;
  /** Set when a pointer sequence became a drag, so the trailing pointertap on a tag is ignored. */
  private suppressTap = false;

  constructor(opts: CardViewOptions) {
    super();
    this.opts = opts;
    const { card, textBox, illustration, choice } = theme.layout;
    this.cardWidth = card.width;
    // Position is the card's centre so rotation happens around the middle.
    this.homeX = card.x + card.width / 2;
    this.homeY = card.y + card.height / 2;
    this.position.set(this.homeX, this.homeY);
    const left = -card.width / 2;
    const top = -card.height / 2;

    const body = new Graphics()
      .roundRect(left, top, card.width, card.height, card.radius)
      .fill(theme.colors.card)
      .stroke({ width: 4, color: theme.colors.cardEdge });
    this.addChild(body);

    // ---- situation text on a tilted ink box
    const boxWidth = card.width - textBox.inset * 2;
    const situation = new Text({
      text: opts.situation,
      style: {
        fontFamily: theme.font.family,
        fontSize: theme.font.situation,
        fill: theme.colors.boxText,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: boxWidth - textBox.padding * 2,
        lineHeight: theme.font.situation * 1.25,
      },
    });
    // Auto-shrink long text so it never spills out of the box.
    const maxTextHeight = illustration.top - textBox.top - textBox.padding * 2 - 20;
    while (situation.height > maxTextHeight && situation.style.fontSize > theme.font.situationMin) {
      situation.style.fontSize -= 2;
      situation.style.lineHeight = situation.style.fontSize * 1.25;
    }
    const boxHeight = Math.max(textBox.minHeight, situation.height + textBox.padding * 2);
    const box = new Container();
    box.addChild(new Graphics().rect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight).fill(theme.colors.box));
    situation.anchor.set(0.5);
    box.addChild(situation);
    box.position.set(0, top + textBox.top + boxHeight / 2);
    box.rotation = (textBox.tiltDeg * Math.PI) / 180;
    this.addChild(box);

    // ---- illustration in a gold-framed portrait panel
    const panelY = top + illustration.top + illustration.height / 2;
    const { width: pw, height: ph, radius: pr, padding: pp } = illustration;
    const panel = new Graphics()
      .roundRect(-pw / 2, panelY - ph / 2, pw, ph, pr)
      .fill(theme.colors.panel)
      .stroke({ width: 5, color: theme.colors.panelEdge });
    this.addChild(panel);
    if (opts.texture) {
      const sprite = new Sprite(opts.texture);
      sprite.anchor.set(0.5);
      const innerW = pw - pp * 2;
      const innerH = ph - pp * 2;
      const scale = Math.min(innerW / sprite.texture.width, innerH / sprite.texture.height);
      sprite.scale.set(scale);
      sprite.position.set(0, panelY);
      // Round the picture's own corners to match the panel.
      const mask = new Graphics().roundRect(-innerW / 2, panelY - innerH / 2, innerW, innerH, pr - pp).fill(0xffffff);
      sprite.mask = mask;
      this.addChild(mask, sprite);
    } else {
      const q = new Text({
        text: '?',
        style: { fontFamily: theme.font.family, fontSize: 160, fill: theme.colors.panelEdge, fontWeight: 'bold' },
      });
      q.anchor.set(0.5);
      q.position.set(0, panelY);
      this.addChild(q);
    }

    // ---- side arrows
    this.leftArrow = new Graphics().poly([-14, 0, 8, -18, 8, 18]).fill(theme.colors.arrow);
    this.leftArrow.position.set(left + 46, panelY);
    this.rightArrow = new Graphics().poly([14, 0, -8, -18, -8, 18]).fill(theme.colors.arrow);
    this.rightArrow.position.set(-left - 46, panelY);
    this.leftArrow.alpha = this.rightArrow.alpha = 0.55;
    this.addChild(this.leftArrow, this.rightArrow);

    // ---- choice tags
    const tagY = -top - choice.bottom - choice.height / 2;
    this.leftTag = this.makeTag(opts.leftLabel, 'left');
    this.leftTag.position.set(left + textBox.inset + choice.width / 2, tagY);
    this.leftTag.rotation = (-choice.tiltDeg * Math.PI) / 180;
    this.rightTag = this.makeTag(opts.rightLabel, 'right');
    this.rightTag.position.set(-left - textBox.inset - choice.width / 2, tagY);
    this.rightTag.rotation = (choice.tiltDeg * Math.PI) / 180;
    this.addChild(this.leftTag, this.rightTag);

    // ---- input
    this.eventMode = 'static';
    this.cursor = 'grab';
    this.on('pointerdown', this.onPointerDown);
    this.on('globalpointermove', this.onPointerMove);
    this.on('pointerup', this.onPointerUp);
    this.on('pointerupoutside', this.onPointerUp);
    // Note: Pixi 8 does not emit `pointercancel` for pointer-event devices; the
    // scene listens on window and calls cancelDrag() instead.

    // Dealt face-down-ish: dealIn() animates to full size.
    this.alpha = 0;
    this.scale.set(0.9);
  }

  private makeTag(label: string, side: Side): Container {
    const { choice } = theme.layout;
    const tag = new Container();
    tag.addChild(
      new Graphics()
        .rect(-choice.width / 2, -choice.height / 2, choice.width, choice.height)
        .fill(theme.colors.tag)
        .stroke({ width: 2, color: theme.colors.tagEdge }),
    );
    const text = new Text({
      text: label,
      style: {
        fontFamily: theme.font.family,
        fontSize: theme.font.choice,
        fill: theme.colors.tagText,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: choice.width - 70,
        lineHeight: theme.font.choice * 1.2,
      },
    });
    while (text.height > choice.height - 24 && text.style.fontSize > theme.font.choiceMin) {
      text.style.fontSize -= 2;
      text.style.lineHeight = text.style.fontSize * 1.2;
    }
    text.anchor.set(0.5);
    text.position.set(side === 'left' ? 10 : -10, 0);
    tag.addChild(text);
    const arrow = new Graphics()
      .poly(side === 'left' ? [-8, 0, 4, -8, 4, 8] : [8, 0, -4, -8, -4, 8])
      .fill(theme.colors.tagText);
    arrow.position.set(side === 'left' ? -choice.width / 2 + 22 : choice.width / 2 - 22, 0);
    tag.addChild(arrow);

    tag.eventMode = 'static';
    tag.cursor = 'pointer';
    tag.on('pointertap', (e) => {
      // A tap (not a drag) on a tag chooses that side.
      if (!this.enabled || this.dragging || this.suppressTap) return;
      e.stopPropagation();
      this.commit(side);
    });
    return tag;
  }

  /** Enable/disable player input (the scene locks input during animations). */
  setInteractive(on: boolean): void {
    this.enabled = on;
    this.cursor = on ? 'grab' : 'default';
  }

  private designPoint(e: FederatedPointerEvent): { x: number; y: number } {
    return this.parent ? this.parent.toLocal(e.global) : { x: e.global.x, y: e.global.y };
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    // A stale pointer (touch cancelled by the OS, tab switch) must not block a new one.
    if (this.pointerId !== null && this.dragging) return;
    this.pointerId = e.pointerId;
    this.dragStart = this.designPoint(e);
    this.dragging = false;
    this.suppressTap = false;
    this.cursor = 'grabbing';
  };

  private readonly onPointerMove = (e: FederatedPointerEvent): void => {
    if (this.pointerId !== e.pointerId || !this.enabled) return;
    const p = this.designPoint(e);
    const dx = p.x - this.dragStart.x;
    const dy = p.y - this.dragStart.y;
    if (!this.dragging && Math.hypot(dx, dy) < 6) return; // ignore jitter so taps stay taps
    this.dragging = true;
    this.applyDrag(dx, dy);
    const { deadzonePx } = this.opts.balance.swipe;
    const side: Side | null = dx <= -deadzonePx ? 'left' : dx >= deadzonePx ? 'right' : null;
    if (side !== this.previewSide) {
      this.previewSide = side;
      this.highlight(side);
      this.opts.onPreview(side);
    }
  };

  private readonly onPointerUp = (e: FederatedPointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    this.cursor = 'grab';
    if (!this.dragging) return;
    this.dragging = false;
    this.suppressTap = true;
    const dx = this.x - this.homeX;
    const threshold = this.opts.balance.swipe.thresholdFraction * this.cardWidth;
    if (Math.abs(dx) >= threshold) {
      this.commit(dx < 0 ? 'left' : 'right');
    } else {
      this.cancelDrag();
    }
  };

  /**
   * Abandon the current drag: clear pointer state and preview, snap home.
   * Also called by the scene on window blur / pointercancel, which Pixi does
   * not deliver to display objects.
   */
  cancelDrag(): void {
    this.pointerId = null;
    this.dragging = false;
    this.cursor = this.enabled ? 'grab' : 'default';
    this.previewSide = null;
    this.highlight(null);
    this.opts.onPreview(null);
    if (this.x !== this.homeX || this.y !== this.homeY || this.rotation !== 0) this.snapBack();
  }

  private applyDrag(dx: number, dy: number): void {
    const { maxRotationDeg } = this.opts.balance.swipe;
    this.position.set(this.homeX + dx, this.homeY + dy * 0.25);
    this.rotation = clamp(dx / (this.cardWidth / 2), -1, 1) * ((maxRotationDeg * Math.PI) / 180);
  }

  private highlight(side: Side | null): void {
    this.leftTag.alpha = side === 'right' ? 0.45 : 1;
    this.rightTag.alpha = side === 'left' ? 0.45 : 1;
    this.leftArrow.alpha = side === 'left' ? 1 : 0.55;
    this.rightArrow.alpha = side === 'right' ? 1 : 0.55;
  }

  /**
   * Commit a choice (drag past threshold, tag tap or arrow key). The scene
   * decides whether it can accept it right now; only then is the card locked.
   */
  commit(side: Side): void {
    if (!this.enabled) return;
    if (!this.opts.onChoose(side)) return;
    this.setInteractive(false);
    this.pointerId = null;
    this.dragging = false;
    this.highlight(side);
    this.opts.onPreview(side);
  }

  /** The one position/rotation tween allowed at a time (snap-back vs fly-off never overlap). */
  private motion: Tween | null = null;
  private move(durationMs: number, onUpdate: (t: number) => void, ease: Ease): Tween {
    this.motion?.cancel();
    this.motion = this.opts.tweener.to(durationMs, onUpdate, ease);
    return this.motion;
  }

  /** Slide + spin off screen in the swipe direction. */
  flyOff(side: Side): Promise<void> {
    const dir = side === 'left' ? -1 : 1;
    const fromX = this.x;
    const fromY = this.y;
    const fromRot = this.rotation;
    const toX = this.homeX + dir * (this.cardWidth + 900);
    const toRot = dir * ((this.opts.balance.swipe.maxRotationDeg * 2.2 * Math.PI) / 180);
    return this.move(
      this.opts.balance.anim.flyOffMs,
      (t) => {
        this.position.set(lerp(fromX, toX, t), lerp(fromY, fromY - 60, t));
        this.rotation = lerp(fromRot, toRot, t);
        this.alpha = 1 - t * 0.6;
      },
      easeInCubic,
    );
  }

  private snapBack(): Promise<void> {
    const fromX = this.x;
    const fromY = this.y;
    const fromRot = this.rotation;
    return this.move(
      this.opts.balance.anim.snapBackMs,
      (t) => {
        this.position.set(lerp(fromX, this.homeX, t), lerp(fromY, this.homeY, t));
        this.rotation = lerp(fromRot, 0, t);
      },
      easeOutBack,
    );
  }

  /** Grow/fade in at the home position. */
  dealIn(): Promise<void> {
    this.position.set(this.homeX, this.homeY);
    this.rotation = 0;
    return this.move(
      this.opts.balance.anim.dealInMs,
      (t) => {
        this.alpha = t;
        this.scale.set(lerp(0.9, 1, t));
      },
      easeOutCubic,
    );
  }
}
