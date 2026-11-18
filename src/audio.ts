export class ShowAudio {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: OscillatorNode | null = null;
  private bedGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    this.muted = readMuted();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("starlight-muted", this.muted ? "1" : "0");
    } catch {
      // The show still plays if storage is blocked.
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  startBed(): void {
    const ctx = this.ready();
    if (!ctx || !this.master || this.bed) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = 98;
    filter.type = "lowpass";
    filter.frequency.value = 240;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.25);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.bed = osc;
    this.bedGain = gain;
  }

  stopBed(): void {
    if (!this.ctx || !this.bed || !this.bedGain) {
      this.bed = null;
      this.bedGain = null;
      return;
    }
    const time = this.ctx.currentTime;
    this.bedGain.gain.cancelScheduledValues(time);
    this.bedGain.gain.setValueAtTime(Math.max(this.bedGain.gain.value, 0.0001), time);
    this.bedGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    this.bed.stop(time + 0.2);
    this.bed = null;
    this.bedGain = null;
  }

  tick(progress: number): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    this.tone(760 - progress * 430, ctx.currentTime, 0.07, "triangle", 0.055);
    this.noiseHit(0.035, 4200 - progress * 2200, 0.03);
  }

  fanfare(): void {
    this.stopBed();
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    this.noiseHit(0.28, 1600, 0.1);
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1318.51];
    melody.forEach((freq, index) => {
      this.tone(freq, now + index * 0.11, 0.32, "triangle", 0.08);
    });
    [523.25, 659.25, 783.99].forEach((freq) => {
      this.tone(freq, now + 0.58, 1.35, "sine", 0.045);
    });
    [1567.98, 1975.53, 2349.32, 2637.02].forEach((freq, index) => {
      this.tone(freq, now + 0.95 + index * 0.09, 0.2, "sine", 0.035);
    });
  }

  private ready(): AudioContext | null {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.4);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, when: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noiseHit(duration: number, frequency: number, volume: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    const time = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.stop(time + duration);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem("starlight-muted") === "1";
  } catch {
    return false;
  }
}
