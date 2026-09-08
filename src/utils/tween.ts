/** Minimal promise-based tweening driven from the scene's update(dt). */
export type Ease = (t: number) => number;

export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic: Ease = (t) => t * t * t;
export const easeInOutQuad: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack: Ease = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/** Awaitable tween; `cancel()` stops it where it is and resolves the promise. */
export type Tween = Promise<void> & { cancel(): void };

interface Active {
  elapsed: number;
  duration: number;
  ease: Ease;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

export class Tweener {
  private active: Active[] = [];

  /** Runs `onUpdate(eased t)` from 0..1 over `durationMs`; resolves on completion or cancel. */
  to(durationMs: number, onUpdate: (t: number) => void, ease: Ease = easeOutCubic): Tween {
    let entry: Active | null = null;
    const promise = new Promise<void>((resolve) => {
      if (durationMs <= 0) {
        onUpdate(1);
        resolve();
        return;
      }
      entry = { elapsed: 0, duration: durationMs, ease, onUpdate, resolve };
      this.active.push(entry);
    }) as Tween;
    promise.cancel = () => {
      if (!entry) return;
      const i = this.active.indexOf(entry);
      if (i >= 0) {
        this.active.splice(i, 1);
        entry.resolve();
      }
    };
    return promise;
  }

  update(dtMs: number): void {
    if (this.active.length === 0) return;
    const finished: Active[] = [];
    for (const a of this.active) {
      a.elapsed += dtMs;
      const t = Math.min(1, a.elapsed / a.duration);
      a.onUpdate(a.ease(t));
      if (t >= 1) finished.push(a);
    }
    if (finished.length > 0) {
      this.active = this.active.filter((a) => !finished.includes(a));
      for (const a of finished) a.resolve();
    }
  }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
