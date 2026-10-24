/**
 * The jam's sound: only the fire. A spinning wick is a rush of broadband noise
 * that swells as it passes, which filtered noise does honestly. Everything
 * tonal (crickets, a chord pad, a beat) is gone; synthesised tones read as a
 * synthesiser, not a field at night. A crowd murmur made from shaped noise
 * reads as wind, so it is gone too.
 *
 * Good night ambience (insects, voices, the dip station, far music) needs real
 * recordings. Until there are some, the page starts silent and sound is a
 * toggle.
 */

export interface JamAudioPoint {
  x: number;
  y: number;
  z: number;
}

export interface JamAudioFrame {
  dt: number;
  listener: JamAudioPoint;
  /** Unit vector the camera looks along. */
  forward: JamAudioPoint;
  /** Lit fire props, in any order. */
  fires: JamAudioPoint[];
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function setPosition(panner: PannerNode, p: JamAudioPoint, at: number): void {
  panner.positionX.setTargetAtTime(p.x, at, 0.05);
  panner.positionY.setTargetAtTime(p.y, at, 0.05);
  panner.positionZ.setTargetAtTime(p.z, at, 0.05);
}

function makePanner(ctx: AudioContext, refDistance: number, rolloff: number): PannerNode {
  return new PannerNode(ctx, {
    panningModel: "equalpower",
    distanceModel: "inverse",
    refDistance,
    rolloffFactor: rolloff,
    maxDistance: 400,
  });
}

export class JamAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private fireGain!: GainNode;
  private firePanner!: PannerNode;
  private fireFilter!: BiquadFilterNode;
  private clock = 0;
  private on = false;

  get enabled(): boolean {
    return this.on;
  }

  /** Turn sound on or off. Turning it on needs a user gesture the first time. */
  setEnabled(on: boolean): void {
    this.on = on;
    if (on) this.start();
    const ctx = this.ctx;
    if (!ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, on ? 0.8 : 0.15);
  }

  private start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = new GainNode(ctx, { gain: 0 });
    const compressor = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 3, attack: 0.01, release: 0.25 });
    this.master.connect(compressor).connect(ctx.destination);
    this.noise = noiseBuffer(ctx, 2);

    // Fire: low roaring noise that swells as the prop passes.
    const fire = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
    this.fireFilter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 700, Q: 0.7 });
    this.fireGain = new GainNode(ctx, { gain: 0 });
    this.firePanner = makePanner(ctx, 2.5, 1.4);
    fire.connect(this.fireFilter).connect(this.fireGain).connect(this.firePanner).connect(this.master);
    fire.start();
  }

  /** The catch of the player's props at the flame. */
  joinCue(at: JamAudioPoint): void {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    const t = ctx.currentTime;
    const panner = makePanner(ctx, 2, 1);
    setPosition(panner, at, t);
    panner.connect(this.master);
    const whoosh = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const filter = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 300, Q: 0.8 });
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    const gain = new GainNode(ctx, { gain: 0 });
    gain.gain.linearRampToValueAtTime(0.5, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    whoosh.connect(filter).connect(gain).connect(panner);
    whoosh.start(t);
    whoosh.stop(t + 1.5);
  }

  update(frame: JamAudioFrame): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || ctx.state !== "running") return;
    const t = ctx.currentTime;
    this.clock += frame.dt;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.setTargetAtTime(frame.listener.x, t, 0.03);
      l.positionY.setTargetAtTime(frame.listener.y, t, 0.03);
      l.positionZ.setTargetAtTime(frame.listener.z, t, 0.03);
      l.forwardX.setTargetAtTime(frame.forward.x, t, 0.03);
      l.forwardY.setTargetAtTime(frame.forward.y, t, 0.03);
      l.forwardZ.setTargetAtTime(frame.forward.z, t, 0.03);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }

    // The nearest lit prop.
    let nearest: JamAudioPoint | null = null;
    let best = Infinity;
    for (const f of frame.fires) {
      const d = (f.x - frame.listener.x) ** 2 + (f.z - frame.listener.z) ** 2;
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    if (nearest) {
      setPosition(this.firePanner, { x: nearest.x, y: nearest.y + 1.2, z: nearest.z }, t);
      // Two passes a second, the rhythm of a spinning wick.
      const swing = 0.5 + 0.5 * Math.sin(this.clock * Math.PI * 2 * 1.9);
      this.fireGain.gain.setTargetAtTime(0.12 + 0.3 * swing * swing, t, 0.05);
      this.fireFilter.frequency.setTargetAtTime(420 + 600 * swing, t, 0.05);
    } else {
      this.fireGain.gain.setTargetAtTime(0, t, 0.3);
    }
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close();
  }
}
