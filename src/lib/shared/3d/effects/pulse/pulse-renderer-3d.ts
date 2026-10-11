import { CircleGeometry, type Object3D, RingGeometry } from "three";
import {
  ParticleInstancePool3D,
  type ParticleInstanceWrite,
} from "../instancing/particle-instance-pool-3d";
import { setRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import {
  isTrackedTip,
  type PulseTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import {
  resolvePulseRingColor,
  resolvePulseWakeColor,
} from "#lib/shared/effects/domain/pulse-palettes.js";
import {
  PULSE_STAGE_UNITS_PER_METRE,
  PulseBeatClock,
  PulseTipMotion,
  pulseAccentThreshold,
  pulseCharge,
  pulseOvertoneGap,
  pulseRingLife,
  smoothstep,
} from "#lib/shared/effects/domain/pulse-rhythm.js";

const RING_CAPACITY = 512;
const INSTANCE_CAPACITY = 4096;
const FRINGE_SIDES = [1, -1] as const;

/** Rotate a 0-1 color's hue around the gray axis, as the 2D fringe does. */
function rotateHue(
  right: number,
  green: number,
  left: number,
  degrees: number,
  out: MutableRgb
): MutableRgb {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const k = (1 - cos) / 3;
  const sin = Math.sqrt(1 / 3) * Math.sin(angle);
  const m0 = cos + k;
  const m1 = k - sin;
  const m2 = k + sin;
  const channel = (x: number, y: number, z: number) =>
    Math.max(0, Math.min(1, x * m0 + y * m1 + z * m2));
  out.right = channel(right, green, left);
  out.green = channel(green, left, right);
  out.left = channel(left, right, green);
  return out;
}

export class PulseRenderer3D {
  private readonly ringPool = new ParticleInstancePool3D({
    capacity: INSTANCE_CAPACITY,
    geometry: new RingGeometry(0.86, 1, 48),
    billboard: true,
    additive: true,
    renderOrder: 118,
  });
  private readonly glowPool = new ParticleInstancePool3D({
    capacity: INSTANCE_CAPACITY,
    geometry: new CircleGeometry(1, 48),
    billboard: true,
    additive: true,
    renderOrder: 117,
  });
  private readonly active = new Uint8Array(RING_CAPACITY);
  private readonly x = new Float32Array(RING_CAPACITY);
  private readonly y = new Float32Array(RING_CAPACITY);
  private readonly z = new Float32Array(RING_CAPACITY);
  private readonly age = new Float32Array(RING_CAPACITY);
  private readonly lifetime = new Float32Array(RING_CAPACITY);
  private readonly maxRadius = new Float32Array(RING_CAPACITY);
  private readonly energy = new Float32Array(RING_CAPACITY);
  private readonly amplitude = new Float32Array(RING_CAPACITY);
  private readonly intensity = new Float32Array(RING_CAPACITY);
  private readonly velocityScale = new Float32Array(RING_CAPACITY);
  private readonly asymmetry = new Float32Array(RING_CAPACITY);
  private readonly chromatic = new Float32Array(RING_CAPACITY);
  private readonly flash = new Float32Array(RING_CAPACITY);
  private readonly thickness = new Float32Array(RING_CAPACITY);
  private readonly glowStyle = new Uint8Array(RING_CAPACITY);
  private readonly right = new Float32Array(RING_CAPACITY);
  private readonly green = new Float32Array(RING_CAPACITY);
  private readonly left = new Float32Array(RING_CAPACITY);
  private readonly fadeRight = new Float32Array(RING_CAPACITY);
  private readonly fadeGreen = new Float32Array(RING_CAPACITY);
  private readonly fadeLeft = new Float32Array(RING_CAPACITY);
  private readonly hueShift = new Uint8Array(RING_CAPACITY);
  private readonly driftX = new Float32Array(RING_CAPACITY);
  private readonly driftY = new Float32Array(RING_CAPACITY);
  private readonly driftZ = new Float32Array(RING_CAPACITY);
  private readonly drag = new Float32Array(RING_CAPACITY);
  private readonly beat = new PulseBeatClock();
  private readonly motion = new Map<number, PulseTipMotion>();
  private readonly charging: PulseTipSource3D[] = [];
  private readonly color: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly fadeColor: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly center = { x: 0, y: 0, z: 0 };
  private readonly fringeColor: MutableRgb = { right: 1, green: 1, left: 1 };
  private readonly writeState: ParticleInstanceWrite = {
    x: 0,
    y: 0,
    z: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    right: 1,
    green: 1,
    left: 1,
    alpha: 1,
  };
  private clock = 0;
  private cursor = 0;
  private frameIntensityScale = 1;

  initialize(parent: Object3D): void {
    this.ringPool.initialize(parent);
    this.glowPool.initialize(parent);
  }

  update(sources: readonly PulseTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.frameIntensityScale = 1 / Math.sqrt(Math.max(1, sources.length / 2));
    this.charging.length = 0;
    const lead = sources[0];
    const ringBeat = lead
      ? this.beat.advance(lead.currentStep, dt, lead.params.beatInterval)
      : false;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      this.checkTrigger(source, ringBeat, dt);
    }

    this.ringPool.beginFrame();
    this.glowPool.beginFrame();
    for (let index = 0; index < RING_CAPACITY; index++) {
      if (this.active[index] === 0) continue;
      this.age[index]! += dt;
      if (this.age[index]! < 0) continue;
      if (this.age[index]! >= this.lifetime[index]!) {
        this.active[index] = 0;
        continue;
      }
      this.writeRing(index);
    }
    const charge = pulseCharge(this.beat.phase);
    for (const source of this.charging) this.writeCharge(source, charge);
    this.glowPool.commit();
    this.ringPool.commit();
  }

  clear(): void {
    this.active.fill(0);
    this.motion.clear();
    this.charging.length = 0;
    this.ringPool.clear();
    this.glowPool.clear();
  }

  dispose(): void {
    this.ringPool.dispose();
    this.glowPool.dispose();
  }

  private checkTrigger(
    source: PulseTipSource3D,
    ringBeat: boolean,
    dt: number
  ): void {
    const params = source.params;
    const beatSeconds = this.beat.beatSeconds;
    let motion = this.motion.get(source.sourceId);
    if (!motion) {
      motion = new PulseTipMotion();
      this.motion.set(source.sourceId, motion);
    }
    motion.feed(
      source.velocity.x * PULSE_STAGE_UNITS_PER_METRE,
      source.velocity.y * PULSE_STAGE_UNITS_PER_METRE,
      source.velocity.z * PULSE_STAGE_UNITS_PER_METRE,
      dt,
      beatSeconds
    );

    if (params.trigger === "beat") {
      if (ringBeat) this.fire(source, motion, motion.energy);
      if (params.charge > 0.01) this.charging.push(source);
    } else if (params.trigger === "velocity") {
      const threshold = pulseAccentThreshold(params.velocityThreshold);
      if (motion.accent(threshold, this.clock, beatSeconds)) {
        this.fire(source, motion, motion.peak);
      }
    } else {
      if (ringBeat) this.fire(source, motion, motion.energy);
      const owed = motion.continuous(dt, beatSeconds);
      for (let ring = 0; ring < owed; ring++) {
        this.resolveColor(source);
        this.spawn(source, motion, motion.energy, 0.3 + 0.3 * motion.energy, 0);
      }
    }
  }

  /** A triggered ring plus the overtones that trail it. */
  private fire(
    source: PulseTipSource3D,
    motion: PulseTipMotion,
    energy: number
  ): void {
    this.resolveColor(source);
    const gap = pulseOvertoneGap(this.beat.beatSeconds);
    const harmonics = Math.round(source.params.harmonics * 3);
    for (let harmonic = 0; harmonic <= harmonics; harmonic++) {
      this.spawn(
        source,
        motion,
        energy,
        Math.max(0.2, 1 - harmonic * 0.24),
        harmonic * gap
      );
    }
  }

  private resolveColor(source: PulseTipSource3D): void {
    const params = source.params;
    const ring = resolvePulseRingColor(
      params,
      source.propColor,
      source.sourceId,
      this.clock
    );
    setRgbFromHex(this.color, ring);
    setRgbFromHex(this.fadeColor, resolvePulseWakeColor(params, ring));
  }

  private spawn(
    source: PulseTipSource3D,
    motion: PulseTipMotion,
    energy: number,
    amplitude: number,
    delay: number
  ): void {
    const params = source.params;
    const slot = this.takeSlot(params.poolSize);
    const life = pulseRingLife(params.lifetime, this.beat.beatSeconds, amplitude);
    // Momentum: the ring's center keeps some of the tip's travel, in metres.
    const carry = (params.asymmetry * 0.85) / PULSE_STAGE_UNITS_PER_METRE;
    this.active[slot] = 1;
    this.x[slot] = source.position.x;
    this.y[slot] = source.position.y;
    this.z[slot] = source.position.z;
    this.driftX[slot] = motion.vx * carry;
    this.driftY[slot] = motion.vy * carry;
    this.driftZ[slot] = motion.vz * carry;
    this.drag[slot] = 0.14 * life;
    this.age[slot] = -delay;
    this.lifetime[slot] = life;
    this.maxRadius[slot] = source.params.maxRadiusWorld;
    this.energy[slot] = energy;
    this.amplitude[slot] = amplitude;
    this.intensity[slot] = source.params.intensity * this.frameIntensityScale;
    this.velocityScale[slot] = source.params.velocityScale;
    this.asymmetry[slot] = source.params.asymmetry;
    this.chromatic[slot] = source.params.chromatic;
    this.flash[slot] = delay === 0 && amplitude >= 1 ? params.flash : 0;
    this.thickness[slot] = source.params.ringThicknessRatio;
    this.glowStyle[slot] = source.params.style === "glow" ? 1 : 0;
    this.right[slot] = this.color.right;
    this.green[slot] = this.color.green;
    this.left[slot] = this.color.left;
    this.fadeRight[slot] = this.fadeColor.right;
    this.fadeGreen[slot] = this.fadeColor.green;
    this.fadeLeft[slot] = this.fadeColor.left;
    this.hueShift[slot] =
      params.resolvedPalette.hueShift && params.colorMode === "solid" ? 1 : 0;
  }

  /** Build-up before a beat: a ring closing on the tip and a swelling core. */
  private writeCharge(
    source: PulseTipSource3D,
    charge: { shape: number; strength: number }
  ): void {
    const params = source.params;
    const strength =
      charge.strength * params.charge * params.intensity * this.frameIntensityScale;
    if (strength < 0.004) return;
    const shape = charge.shape;
    this.resolveColor(source);
    const write = this.writeState;
    write.x = source.position.x;
    write.y = source.position.y;
    write.z = source.position.z;
    write.scaleZ = 1;
    write.right = this.color.right;
    write.green = this.color.green;
    write.left = this.color.left;

    const closing =
      params.maxRadiusWorld * 0.5 * (1 - shape * shape) +
      3 / PULSE_STAGE_UNITS_PER_METRE;
    write.scaleX = closing;
    write.scaleY = closing;
    write.alpha = Math.min(1, strength * 0.7 * shape);
    this.ringPool.write(write);

    const core = (4 + 14 * shape) / PULSE_STAGE_UNITS_PER_METRE;
    write.scaleX = core;
    write.scaleY = core;
    write.alpha = Math.min(1, strength * 0.55);
    this.glowPool.write(write);
  }

  private writeRing(index: number): void {
    const progress = this.age[index]! / this.lifetime[index]!;
    const eased = 1 - Math.pow(1 - progress, 3);
    const energy = this.energy[index]!;
    const radius =
      this.maxRadius[index]! *
      (0.45 + 0.55 * this.velocityScale[index]! * energy) *
      this.amplitude[index]! *
      eased;
    if (radius < 0.008) return;
    const envelope =
      smoothstep(0, 0.035, progress) * Math.pow(1 - progress, 1.5);
    const alpha =
      this.intensity[index]! *
      (0.45 + 0.55 * energy) *
      envelope *
      this.amplitude[index]!;
    const colorMix = this.hueShift[index] === 1 ? progress : progress * 0.35;
    const right =
      this.right[index]! + (this.fadeRight[index]! - this.right[index]!) * colorMix;
    const green =
      this.green[index]! +
      (this.fadeGreen[index]! - this.green[index]!) * colorMix;
    const left =
      this.left[index]! +
      (this.fadeLeft[index]! - this.left[index]!) * colorMix;
    const drag = this.drag[index]!;
    const drift = drag * (1 - Math.exp(-this.age[index]! / drag));
    const centerX = this.x[index]! + this.driftX[index]! * drift;
    const centerY = this.y[index]! + this.driftY[index]! * drift;
    const centerZ = this.z[index]! + this.driftZ[index]! * drift;
    const center = this.center;
    center.x = centerX;
    center.y = centerY;
    center.z = centerZ;
    const scaleX = radius;
    const scaleY = radius;
    const normalizedThickness = Math.min(
      1,
      Math.max(0, (this.thickness[index]! - 0.035) / 0.215)
    );
    const copies = 1 + Math.round(normalizedThickness * 3);
    for (let copy = 0; copy < copies; copy++) {
      const inset = 1 - copy * 0.035;
      this.writeInstance(
        this.ringPool,
        center,
        scaleX * inset,
        scaleY * inset,
        right,
        green,
        left,
        alpha / Math.sqrt(copies),
        0
      );
    }

    // Chromatic fringe: a warmer ring just outside the front, a cooler one inside.
    const fringe = this.chromatic[index]! * (0.4 + 0.6 * energy);
    if (fringe > 0.04) {
      const spread = 1 + fringe * 0.045;
      const fringeAlpha = alpha * fringe * 0.5;
      for (const side of FRINGE_SIDES) {
        const tint = rotateHue(right, green, left, side * 38, this.fringeColor);
        const scale = side > 0 ? spread : 1 / spread;
        this.writeInstance(
          this.ringPool,
          center,
          scaleX * scale,
          scaleY * scale,
          tint.right,
          tint.green,
          tint.left,
          fringeAlpha,
          0
        );
      }
    }

    const flashAlpha =
      this.flash[index]! * alpha * Math.pow(Math.max(0, 1 - progress * 5), 2);
    if (this.glowStyle[index] === 1 || flashAlpha > 0.004) {
      const glowScale =
        this.glowStyle[index] === 1 ? radius * 0.94 : radius * 0.38;
      this.writeInstance(
        this.glowPool,
        center,
        glowScale,
        glowScale,
        right,
        green,
        left,
        this.glowStyle[index] === 1 ? alpha * 0.09 : flashAlpha * 0.5,
        0
      );
    }
  }

  private writeInstance(
    pool: ParticleInstancePool3D,
    center: { x: number; y: number; z: number },
    scaleX: number,
    scaleY: number,
    right: number,
    green: number,
    left: number,
    alpha: number,
    xOffset: number
  ): void {
    const write = this.writeState;
    write.x = center.x + xOffset;
    write.y = center.y;
    write.z = center.z;
    write.scaleX = scaleX;
    write.scaleY = scaleY;
    write.scaleZ = 1;
    write.right = right;
    write.green = green;
    write.left = left;
    write.alpha = alpha;
    pool.write(write);
  }

  private takeSlot(limit: number): number {
    const capacity = Math.max(1, Math.min(RING_CAPACITY, limit));
    for (let offset = 0; offset < capacity; offset++) {
      const index = (this.cursor + offset) % capacity;
      if (this.active[index] === 0) {
        this.cursor = (index + 1) % capacity;
        return index;
      }
    }
    const index = this.cursor % capacity;
    this.cursor = (index + 1) % capacity;
    return index;
  }
}
