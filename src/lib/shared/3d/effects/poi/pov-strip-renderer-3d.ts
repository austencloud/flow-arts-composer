/**
 * PovStripRenderer3D - Full-strip LED renderer with POV trail accumulation.
 *
 * Distributes N LED billboards along a staff axis. Each LED's color comes
 * from a StripPattern frame chosen by the caller's clock, so a pixel staff
 * runs the same loop the 2D sampler runs. Trail ghosts are accumulated in a
 * PovTrailRing to create the persistence-of-vision effect - images forming
 * in the air as the avatar spins, exactly like watching a pixel poi
 * performer in a dark room.
 *
 * Reuses the existing LedMaterial3D shader (additive blending, core + halo).
 */

import type {
  Vector3} from "three";
import {
  PlaneGeometry,
  InstancedMesh,
  InstancedBufferAttribute,
  Object3D,
  type Camera,
  type Quaternion,
} from "three";
import {
  shutterCutoffSeconds,
  type LedShutter,
} from "#lib/shared/animation-engine/domain/led-photometry.js";
import { createLedMaterial, type LedMaterialOptions } from "../led/led-material-3d";
import { QualityTier } from "../types";
import { PovTrailRing, type PovTrailSnapshot } from "./pov-trail-ring";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

/** Rendered-LED ceiling per quality tier. A shorter device keeps its own count. */
const LEDS_PER_TIER: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 200,
  [QualityTier.MEDIUM]: 100,
  [QualityTier.LOW]: 50,
};

/**
 * Persistence frame count per quality tier. LOW renders bulbs only, matching
 * what the capsule ribbon path does at LOW (TRAIL_FADE_DURATION[LOW] === 0).
 */
const PERSISTENCE_FRAMES: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 12,
  [QualityTier.MEDIUM]: 8,
  [QualityTier.LOW]: 0,
};

/** Billboard size for each LED - smaller than 2-point LEDs since we have 200 */
const POV_LED_SIZE = 0.012;

/** The ghost-persistence window this renderer accepts, in seconds. */
const PERSISTENCE_MIN_SECONDS = 0.05;
const PERSISTENCE_MAX_SECONDS = 0.5;

/**
 * Map the look's shutter onto the ghost persistence window, so one persistence
 * control drives both the 2D accumulation buffer and the 3D trail ring.
 *
 * The shutter cutoff is the age past which a contribution is dropped, which is
 * exactly what the ring's cutoff means; the ring's own capacity then bounds it.
 *
 * The ring weights its ghosts on a linear ramp rather than under the shutter
 * kernel, so the window matches the 2D path but the falloff inside it does not.
 * The 3D LED path still owes the same photometric rewrite the 2D path just got.
 */
export function shutterToPovPersistence(shutter: LedShutter): number {
  const cutoff = shutterCutoffSeconds(shutter);
  if (!Number.isFinite(cutoff)) return PERSISTENCE_MIN_SECONDS;
  return Math.max(
    PERSISTENCE_MIN_SECONDS,
    Math.min(PERSISTENCE_MAX_SECONDS, cutoff)
  );
}

export class PovStripRenderer3D {
  private mesh: InstancedMesh | null = null;
  private instanceColors!: Float32Array;
  private instanceAlphas!: Float32Array;
  private instanceStretches!: Float32Array;
  private dummy = new Object3D();
  private trail!: PovTrailRing;
  private qualityTier: QualityTier;
  private activeLedCount = 0;
  private parent: Object3D | null = null;
  private maxInstances = 0;
  /** The device's LED count; Infinity means "whatever the tier allows". */
  private readonly requestedLedCount: number;

  /** Persistence duration in seconds (default 120ms) */
  private persistenceDuration = 0.12;

  // Reusable snapshot to avoid allocations each frame
  private currentSnapshot!: PovTrailSnapshot;

  /**
   * @param qualityTier - caps rendered LED count and ghost density
   * @param ledCount - the device's LED count (32 / 72 / 200). Omitted, the
   *   renderer fills the tier ceiling.
   */
  constructor(qualityTier: QualityTier = QualityTier.HIGH, ledCount?: number) {
    this.qualityTier = qualityTier;
    this.requestedLedCount =
      ledCount != null && Number.isFinite(ledCount)
        ? Math.max(1, Math.round(ledCount))
        : Number.POSITIVE_INFINITY;
    this.allocate(qualityTier);
  }

  /** Rendered LED count after the tier ceiling is applied. */
  get ledCount(): number {
    return this.activeLedCount;
  }

  private allocate(tier: QualityTier): void {
    this.activeLedCount = Math.max(
      1,
      Math.min(this.requestedLedCount, LEDS_PER_TIER[tier])
    );
    const persistenceFrames = PERSISTENCE_FRAMES[tier];

    // Max instances: active LEDs + (LEDs * persistence frames)
    this.maxInstances = this.activeLedCount * (1 + persistenceFrames);
    this.trail = new PovTrailRing(this.activeLedCount, persistenceFrames);

    this.instanceColors = new Float32Array(this.maxInstances * 3);
    this.instanceAlphas = new Float32Array(this.maxInstances);
    this.instanceStretches = new Float32Array(this.maxInstances * 2);

    this.currentSnapshot = {
      positions: new Float32Array(this.activeLedCount * 3),
      colors: new Uint8Array(this.activeLedCount * 3),
      timestamp: 0,
    };
  }

  initialize(parent: Object3D, materialOptions?: LedMaterialOptions): void {
    if (this.mesh) return;
    this.parent = parent;

    const geometry = new PlaneGeometry(POV_LED_SIZE, POV_LED_SIZE);
    const material = createLedMaterial({
      glowRadius: 0.8,
      brightness: 1.0,
      emissiveStrength: 2.5,
      ...materialOptions,
    });

    this.mesh = new InstancedMesh(geometry, material, this.maxInstances);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100;

    // Instanced attributes
    const colorAttr = new InstancedBufferAttribute(this.instanceColors, 3);
    colorAttr.setUsage(35048); // DynamicDrawUsage
    geometry.setAttribute("instanceColor", colorAttr);

    const alphaAttr = new InstancedBufferAttribute(this.instanceAlphas, 1);
    alphaAttr.setUsage(35048);
    geometry.setAttribute("instanceAlpha", alphaAttr);

    const stretchAttr = new InstancedBufferAttribute(this.instanceStretches, 2);
    stretchAttr.setUsage(35048);
    geometry.setAttribute("instanceStretch", stretchAttr);

    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  /**
   * Update all LED instances for the current frame.
   *
   * @param staffAxis - Normalized direction vector along the staff
   * @param staffCenter - World-space center of the staff
   * @param staffHalfLength - Half the staff length in world units
   * @param frameIndex - Pattern frame to show, from the caller's loop clock
   * @param pattern - Active strip pattern
   * @param camera - Current camera (for billboard orientation)
   * @param currentTime - Current time in seconds
   * @param brightness - Global brightness multiplier (0–1)
   */
  update(
    staffAxis: Vector3,
    staffCenter: Vector3,
    staffHalfLength: number,
    frameIndex: number,
    pattern: StripPattern,
    camera: Camera,
    currentTime: number,
    brightness: number
  ): void {
    if (!this.mesh || pattern.frameCount <= 0) return;

    const cameraQuat = camera.quaternion;

    const wrappedFrame =
      (((Math.floor(frameIndex) % pattern.frameCount) + pattern.frameCount) %
        pattern.frameCount);
    const frame = pattern.frames[wrappedFrame];
    if (!frame) return;

    // Sample stride: if pattern has more LEDs than our quality tier renders
    const sampleStride = pattern.ledCount / this.activeLedCount;

    let instanceIndex = 0;

    // Compute LED positions along staff axis and record snapshot
    for (let i = 0; i < this.activeLedCount && instanceIndex < this.maxInstances; i++) {
      // Position: distribute uniformly along staff
      const t = this.activeLedCount > 1 ? (i / (this.activeLedCount - 1)) * 2 - 1 : 0;
      const px = staffCenter.x + staffAxis.x * staffHalfLength * t;
      const py = staffCenter.y + staffAxis.y * staffHalfLength * t;
      const pz = staffCenter.z + staffAxis.z * staffHalfLength * t;

      // Sample color from pattern (nearest-neighbor from full-res data)
      const srcLed = Math.min(Math.floor(i * sampleStride), pattern.ledCount - 1);
      const srcOffset = srcLed * 3;
      const r = frame.colors[srcOffset]! / 255;
      const g = frame.colors[srcOffset + 1]! / 255;
      const b = frame.colors[srcOffset + 2]! / 255;

      // Record in snapshot
      const snapIdx = i * 3;
      this.currentSnapshot.positions[snapIdx] = px;
      this.currentSnapshot.positions[snapIdx + 1] = py;
      this.currentSnapshot.positions[snapIdx + 2] = pz;
      this.currentSnapshot.colors[snapIdx] = frame.colors[srcOffset]!;
      this.currentSnapshot.colors[snapIdx + 1] = frame.colors[srcOffset + 1]!;
      this.currentSnapshot.colors[snapIdx + 2] = frame.colors[srcOffset + 2]!;

      // Active LED instance
      this.setInstance(
        instanceIndex, px, py, pz, cameraQuat,
        r * brightness, g * brightness, b * brightness,
        brightness, 1.0, 0
      );
      instanceIndex++;
    }

    // Push snapshot to trail ring
    this.currentSnapshot.timestamp = currentTime;
    this.trail.push(this.currentSnapshot);

    // Render trail ghosts from ring buffer
    const cutoff = currentTime - this.persistenceDuration;
    const snapshots = this.trail.getSnapshotsNewerThan(cutoff);

    for (let s = 0; s < snapshots.length - 1 && instanceIndex < this.maxInstances; s++) {
      // Skip the most recent snapshot - it's the current frame
      const snap = snapshots[s]!;
      const age = currentTime - snap.timestamp;
      const alpha = (1.0 - age / this.persistenceDuration) * 0.7 * brightness;

      if (alpha < 0.01) continue;

      for (let i = 0; i < this.activeLedCount && instanceIndex < this.maxInstances; i++) {
        const posIdx = i * 3;
        const colIdx = i * 3;
        const r = snap.colors[colIdx]! / 255;
        const g = snap.colors[colIdx + 1]! / 255;
        const b = snap.colors[colIdx + 2]! / 255;

        // Skip black LEDs in trails (no point rendering invisible ghosts)
        if (r < 0.01 && g < 0.01 && b < 0.01) continue;

        this.setInstance(
          instanceIndex,
          snap.positions[posIdx]!,
          snap.positions[posIdx + 1]!,
          snap.positions[posIdx + 2]!,
          cameraQuat,
          r * alpha, g * alpha, b * alpha,
          alpha, 1.0, 0
        );
        instanceIndex++;
      }
    }

    this.mesh.count = instanceIndex;

    // Flag attributes for GPU upload
    const geo = this.mesh.geometry;
    (geo.getAttribute("instanceColor") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("instanceAlpha") as InstancedBufferAttribute).needsUpdate = true;
    (geo.getAttribute("instanceStretch") as InstancedBufferAttribute).needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private setInstance(
    index: number,
    x: number, y: number, z: number,
    cameraQuat: Quaternion,
    r: number, g: number, b: number,
    alpha: number,
    stretchFactor: number,
    stretchAngle: number
  ): void {
    this.dummy.position.set(x, y, z);
    this.dummy.quaternion.copy(cameraQuat);
    this.dummy.updateMatrix();
    this.mesh!.setMatrixAt(index, this.dummy.matrix);

    const ci = index * 3;
    this.instanceColors[ci] = r;
    this.instanceColors[ci + 1] = g;
    this.instanceColors[ci + 2] = b;

    this.instanceAlphas[index] = alpha;

    const si = index * 2;
    this.instanceStretches[si] = stretchFactor;
    this.instanceStretches[si + 1] = stretchAngle;
  }

  setPersistenceDuration(seconds: number): void {
    this.persistenceDuration = Math.max(
      PERSISTENCE_MIN_SECONDS,
      Math.min(PERSISTENCE_MAX_SECONDS, seconds)
    );
  }

  /** Push look changes into the shared LED shader without a rebuild. */
  updateMaterialUniforms(options: Partial<LedMaterialOptions>): void {
    if (!this.mesh || Array.isArray(this.mesh.material)) return;
    const mat = this.mesh.material as ReturnType<typeof createLedMaterial>;
    if (options.glowRadius !== undefined) {
      mat.uniforms.uGlowRadius!.value = options.glowRadius;
    }
    if (options.brightness !== undefined) {
      mat.uniforms.uBrightness!.value = options.brightness;
    }
    if (options.emissiveStrength !== undefined) {
      mat.uniforms.uEmissiveStrength!.value = options.emissiveStrength;
    }
  }

  setQualityTier(tier: QualityTier): void {
    if (tier === this.qualityTier) return;
    // Quality tier change requires full re-initialization
    this.dispose();
    this.qualityTier = tier;
    this.allocate(tier);
    // Caller must re-initialize after tier change
  }

  reset(): void {
    this.trail.clear();
    if (this.mesh) {
      this.mesh.count = 0;
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.parent?.remove(this.mesh);
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach((m) => m.dispose());
      } else {
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }
    this.trail.clear();
    this.parent = null;
  }
}
