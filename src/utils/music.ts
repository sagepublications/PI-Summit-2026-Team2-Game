/**
 * Looping background music via an <audio> element. Browsers block audio until
 * the page has had a user gesture, so `start()` is called from the first
 * pointerdown/keydown and simply retries on the next gesture if it is refused.
 */
export class Music {
  private readonly el: HTMLAudioElement;
  private started = false;

  constructor(url: string, volume: number) {
    this.el = new Audio(url);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = volume;
  }

  get volume(): number {
    return this.el.volume;
  }

  /** 0 pauses the track (and shows as muted); any other value resumes it. */
  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.el.volume = clamped;
    if (clamped === 0) {
      this.el.pause();
    } else if (this.started && this.el.paused) {
      void this.el.play().catch(() => undefined);
    }
  }

  /** Begin playback (idempotent). Safe to call before a gesture: failures are swallowed. */
  start(): void {
    this.started = true;
    if (this.el.volume === 0) return;
    void this.el.play().catch(() => undefined);
  }

  get playing(): boolean {
    return !this.el.paused;
  }
}
