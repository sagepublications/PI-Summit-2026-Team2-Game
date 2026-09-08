/**
 * Sound effects synthesised with the Web Audio API — no audio files needed.
 * The AudioContext is created lazily on the first play() call, which always
 * follows a user gesture (a swipe), so browser autoplay rules are satisfied.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor(private readonly volume: number) {}

  private get audio(): { ctx: AudioContext; out: GainNode } | null {
    if (this.muted || this.volume <= 0) return null;
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, out: this.master! };
  }

  /** Card flying off: a short burst of band-passed noise sweeping upward, panned toward the swipe. */
  swoosh(direction: -1 | 1): void {
    const a = this.audio;
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime;
    const dur = 0.28;

    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.6);
    filter.frequency.exponentialRampToValueAtTime(900, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0, t);
    pan.pan.linearRampToValueAtTime(direction * 0.8, t + dur);

    noise.connect(filter).connect(gain).connect(pan).connect(out);
    noise.start(t);
    noise.stop(t + dur);
  }

  /** Game over: the sad trombone — three sliding notes, each drooping, the last one long. */
  lose(): void {
    const a = this.audio;
    if (!a) return;
    const { ctx, out } = a;
    const t0 = ctx.currentTime;
    // [start Hz, end Hz, duration s]
    const notes: [number, number, number][] = [
      [311, 293, 0.42],
      [293, 277, 0.42],
      [277, 262, 0.42],
      [262, 185, 1.1],
    ];
    let t = t0;
    for (const [from, to, dur] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.linearRampToValueAtTime(to, t + dur);

      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 6;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = dur > 1 ? 9 : 4;
      vibrato.connect(vibratoGain).connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.linearRampToValueAtTime(600, t + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.45, t + 0.05);
      gain.gain.setValueAtTime(0.45, t + dur - 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      vibrato.start(t);
      osc.stop(t + dur);
      vibrato.stop(t + dur);
      t += dur + 0.06;
    }
  }

  /** Deck cleared: a bright rising arpeggio with a held top chord. */
  win(): void {
    const a = this.audio;
    if (!a) return;
    const { ctx, out } = a;
    const t0 = ctx.currentTime;
    const play = (freq: number, at: number, dur: number, type: OscillatorType, level: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + dur);
    };
    // C5 E5 G5 C6 run, then a C major chord sustained.
    const run = [523.25, 659.25, 783.99, 1046.5];
    run.forEach((f, i) => play(f, t0 + i * 0.11, 0.22, 'triangle', 0.5));
    const chordAt = t0 + run.length * 0.11;
    for (const f of [523.25, 659.25, 783.99, 1046.5]) {
      play(f, chordAt, 1.2, 'triangle', 0.35);
      play(f * 2, chordAt, 0.9, 'sine', 0.12);
    }
  }
}
