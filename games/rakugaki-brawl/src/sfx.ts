/**
 * Procedural sound effects on the Web Audio API: no asset files, created
 * lazily on the first user gesture so autoplay policies are respected.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** Call from a click handler; creates/resumes the context. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  private out(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** Short filtered noise burst with a pitched thump underneath. */
  hit(big: boolean): void {
    const ctx = this.out(); if (!ctx) return;
    const t = ctx.currentTime;
    const dur = big ? 0.22 : 0.12;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = big ? 1800 : 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(big ? 0.5 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filt).connect(g).connect(ctx.destination);
    noise.start(t);
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.setValueAtTime(big ? 160 : 120, t); osc.frequency.exponentialRampToValueAtTime(40, t + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(big ? 0.5 : 0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(og).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }

  /** Whoosh for the wind-up: band-passed noise sweeping up. */
  swing(): void {
    const ctx = this.out(); if (!ctx) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.18), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.Q.value = 2;
    filt.frequency.setValueAtTime(400, t); filt.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(filt).connect(g).connect(ctx.destination);
    noise.start(t);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = 0.12): void {
    const ctx = this.out(); if (!ctx) return;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(ctx.destination); osc.start(at); osc.stop(at + dur);
  }

  /** Rising major arpeggio. */
  win(): void {
    const ctx = this.out(); if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.25));
    this.tone(1319, t + 0.4, 0.5, 'triangle', 0.15);
  }

  /** Two falling notes. */
  lose(): void {
    const ctx = this.out(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(330, t, 0.25, 'sawtooth', 0.08);
    this.tone(220, t + 0.25, 0.5, 'sawtooth', 0.08);
  }
}
