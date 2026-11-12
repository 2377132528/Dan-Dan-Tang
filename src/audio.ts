type SoundName =
  | 'ui'
  | 'turn'
  | 'shot'
  | 'explosion'
  | 'hit'
  | 'heal'
  | 'death'
  | 'victory'
  | 'defeat'
  | 'tick'
  | 'fly'
  | 'pow'
  | 'crate'
  | 'teleport'
  | 'shield'
  | 'crit'
  | 'start';

const STORAGE_KEY = 'ddt-wind-muted';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    this.unlocked = true;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage is optional.
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
    if (!this.muted) {
      this.unlock();
      this.play('ui');
    }
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoise(this.ctx);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = last * 2.3;
    }
    return buffer;
  }

  private tone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    delay = 0,
    endFrequency?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private noise(
    duration: number,
    gainValue: number,
    filterType: BiquadFilterType,
    frequency: number,
    endFrequency?: number,
    delay = 0,
    q = 0.8,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const now = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), now + duration);
    }
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.04);
  }

  play(name: SoundName): void {
    if (this.muted || !this.unlocked) return;
    switch (name) {
      case 'ui':
        this.tone(640, 0.08, 0.045, 'sine', 0, 880);
        break;
      case 'start':
        this.tone(392, 0.12, 0.06, 'triangle');
        this.tone(523, 0.14, 0.06, 'triangle', 0.1);
        this.tone(784, 0.24, 0.055, 'triangle', 0.2);
        break;
      case 'turn':
        this.tone(523, 0.12, 0.055, 'triangle');
        this.tone(659, 0.18, 0.05, 'triangle', 0.1);
        break;
      case 'shot':
        this.noise(0.24, 0.16, 'bandpass', 1800, 380, 0, 0.6);
        this.tone(180, 0.22, 0.12, 'sine', 0, 62);
        break;
      case 'fly':
        this.noise(0.35, 0.025, 'bandpass', 500, 1200, 0, 1.2);
        break;
      case 'explosion':
        this.noise(0.65, 0.34, 'lowpass', 1200, 90, 0, 0.8);
        this.tone(92, 0.45, 0.24, 'sine', 0, 34);
        this.tone(54, 0.6, 0.16, 'triangle', 0.02, 28);
        break;
      case 'hit':
        this.tone(180, 0.1, 0.09, 'square', 0, 90);
        this.noise(0.12, 0.08, 'highpass', 800, 300);
        break;
      case 'heal':
        [523, 659, 784, 1047].forEach((freq, index) => {
          this.tone(freq, 0.22, 0.05, 'sine', index * 0.06);
        });
        break;
      case 'death':
        this.tone(320, 0.6, 0.08, 'sawtooth', 0, 70);
        this.noise(0.3, 0.06, 'lowpass', 700, 100);
        break;
      case 'victory':
        [523, 659, 784, 1047, 1319].forEach((freq, index) => {
          this.tone(freq, 0.34, 0.06, 'triangle', index * 0.11);
        });
        break;
      case 'defeat':
        [392, 349, 294, 196].forEach((freq, index) => {
          this.tone(freq, 0.4, 0.06, 'triangle', index * 0.14);
        });
        break;
      case 'tick':
        this.tone(920, 0.045, 0.03, 'square', 0, 700);
        break;
      case 'pow':
        this.tone(140, 0.5, 0.16, 'sawtooth', 0, 480);
        this.tone(280, 0.45, 0.14, 'triangle', 0.08, 920);
        this.noise(0.4, 0.15, 'bandpass', 600, 2400, 0, 1.5);
        break;
      case 'crate':
        this.tone(440, 0.1, 0.06, 'sine', 0);
        this.tone(659, 0.12, 0.06, 'sine', 0.07);
        this.tone(880, 0.22, 0.07, 'triangle', 0.14);
        break;
      case 'teleport':
        this.tone(880, 0.22, 0.08, 'sine', 0, 220);
        this.noise(0.2, 0.08, 'bandpass', 1400, 400);
        break;
      case 'shield':
        this.tone(330, 0.15, 0.06, 'triangle', 0, 660);
        this.tone(660, 0.25, 0.05, 'sine', 0.1);
        break;
      case 'crit':
        this.tone(880, 0.18, 0.12, 'square', 0, 1200);
        this.noise(0.18, 0.14, 'highpass', 1200, 400);
        break;
    }
  }
}
