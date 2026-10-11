<script lang="ts">
  /**
   * PetalEmitter3D - per-tip motion-burst petal emitter.
   *
   * 3D petals have **dual-source emission** (spec 1h):
   *   1. Ambient: spawned from an above-scene ceiling zone by
   *      `PetalAmbientShower3D`. Uniform fall across the scene.
   *   2. Motion: bursts from the tip driven by velocity. That's what
   *      this component handles.
   *
   * Unlike bubbles (which rise) petals fall (+y is up, so vy is negative).
   * Sinusoidal sway adds horizontal flutter. Rotation tumbles on all 3
   * axes for per-petal randomness.
   *
   * Ash palette: ember flag rolls at spawn; when true, the petal gets a
   * brief additive orange glow in its first 400ms of life (rendered as a
   * tinted slightly-larger mesh behind the main petal).
   */

  import { T, useTask } from "@threlte/core";
  import { Vector3, CanvasTexture, DoubleSide, type Texture } from "three";
  import type { Petals3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
  import {
    drawPetalSilhouette,
    pickPetalSprite,
    pickPetalTint,
    resolvePetalOpacity,
    rollEmberFlag,
    type PetalSpriteShape,
  } from "#lib/shared/effects/domain/petal-palettes.js";
  import {
    resolveEmberWorldSpan,
    resolvePetalWorldSize,
  } from "./petal-world-art-direction";

  interface Props {
    /** World-space position of this tip. null = hidden. */
    position: Vector3 | null;
    /** Tip velocity in metres per second. */
    propVelocity: Vector3;
    /** Resolved petal params. */
    params: Petals3DParams;
    /** Gates mounting. */
    enabled: boolean;
  }

  let { position, propVelocity, params, enabled }: Props = $props();

  interface Petal3D {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    age: number;
    maxAge: number;
    size: number;
    shape: PetalSpriteShape;
    tint: string;
    /** Tumble angular velocities on each axis. */
    rx: number;
    ry: number;
    rz: number;
    /** Current rotation angles. */
    angX: number;
    angY: number;
    angZ: number;
    /** Per-petal phase offset for sway. */
    phase: number;
    fallVelocity: number;
    dragBase: number;
    opacity: number;
    /** Ember flag for ash palette. */
    ember: boolean;
  }

  let petals = $state<Petal3D[]>([]);
  let spawnAccumulator = 0;
  let nextId = 0;
  let clock = 0;

  const PER_TIP_CAP = 256;
  const EMBER_MAX_AGE = 1.35;
  const FADE_OUT_FRACTION = 0.2;
  const FADE_IN_DURATION = 0.12;

  // Texture cache keyed by (palette-id, shape, tint). Lazy-baked via
  // CanvasTexture on first need - compact, but large enough to preserve the
  // folded and curled silhouettes when this fallback renderer is mounted.
  // even across 24+ combinations.
  const textureCache = new Map<string, CanvasTexture>();

  function getOrBakeTexture(
    shape: PetalSpriteShape,
    tint: string
  ): CanvasTexture | null {
    const key = `${shape}:${tint}`;
    const cached = textureCache.get(key);
    if (cached) return cached;
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 96, 96);
    ctx.save();
    ctx.translate(48, 48);
    drawPetalSilhouette(ctx, shape, 40, tint);
    ctx.restore();
    const tex = new CanvasTexture(canvas);
    tex.needsUpdate = true;
    textureCache.set(key, tex);
    return tex;
  }

  useTask((delta) => {
    clock += delta;
    if (!enabled || !position) return;

    const speed = propVelocity.length();
    const speedScalar =
      params.motionReferenceSpeed > 0
        ? Math.min(1, speed / params.motionReferenceSpeed)
        : 0;
    // Per-tip emitter is motion-only in 3D; ambient is handled by the
    // scene-wide PetalAmbientShower3D.
    const rate = params.motionEmission * speedScalar * params.motionTipRate;

    spawnAccumulator += delta * rate;
    const palette = params.resolvedPalette;
    const fall = params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed);

    while (spawnAccumulator >= 1 && petals.length < PER_TIP_CAP) {
      const px = position.x;
      const py = position.y;
      const pz = position.z;
      const ox = (Math.random() - 0.5) * 0.08;
      const oy = (Math.random() - 0.5) * 0.06;
      const oz = (Math.random() - 0.5) * 0.08;
      const drift = 0.22;
      const shape = pickPetalSprite(palette);
      const fallVelocity = -fall * (0.82 + Math.random() * 0.32);
      petals.push({
        id: nextId++,
        x: px + ox,
        y: py + oy,
        z: pz + oz,
        vx: propVelocity.x * params.carry + (Math.random() - 0.5) * drift,
        vy: propVelocity.y * params.carry - fall * 0.12,
        vz: propVelocity.z * params.carry + (Math.random() - 0.5) * drift,
        age: 0,
        maxAge: params.lifetime * (0.52 + Math.random() * 0.24),
        size: resolvePetalWorldSize(
          params.baseSize,
          params.intensity,
          shape,
          false
        ),
        shape,
        tint: pickPetalTint(palette),
        rx: (Math.random() - 0.5) * 2.0,
        ry: (Math.random() - 0.5) * 2.5,
        rz: (Math.random() - 0.5) * 2.0,
        angX: Math.random() * Math.PI * 2,
        angY: Math.random() * Math.PI * 2,
        angZ: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        fallVelocity,
        dragBase: 0.03 + params.streakLength * 0.5,
        opacity: resolvePetalOpacity(shape, false),
        ember: rollEmberFlag(palette),
      });
      spawnAccumulator -= 1;
    }

    // Integrate + age + cull.
    const swayFreq = params.swayFrequency;
    const swayBase = params.swayBaseSpeed * params.swayAmplitude;
    const surviving: Petal3D[] = [];
    for (const p of petals) {
      p.age += delta;
      if (p.age >= p.maxAge) continue;
      const swayX =
        Math.sin(p.phase + clock * swayFreq * Math.PI * 2) * swayBase;
      const swayZ =
        Math.cos(p.phase * 1.3 + clock * swayFreq * Math.PI * 2) *
        swayBase *
        0.5;
      const drag = Math.pow(p.dragBase, delta);
      const fallEase = 1 - Math.pow(0.2, delta);
      p.vx *= drag;
      p.vz *= drag;
      p.vy += (p.fallVelocity - p.vy) * fallEase;
      p.x += (p.vx + swayX) * delta;
      p.y += p.vy * delta;
      p.z += (p.vz + swayZ) * delta;
      p.angX += p.rx * delta;
      p.angY += p.ry * delta;
      p.angZ += p.rz * delta;
      surviving.push(p);
    }
    petals = surviving;
  });

  function renderOpacity(p: Petal3D): number {
    const lifeT = p.age / p.maxAge;
    const fadeIn = p.age < FADE_IN_DURATION ? p.age / FADE_IN_DURATION : 1;
    const fadeOut =
      lifeT > 1 - FADE_OUT_FRACTION ? (1 - lifeT) / FADE_OUT_FRACTION : 1;
    return Math.max(0, fadeIn * fadeOut * p.opacity);
  }

  function emberOpacity(p: Petal3D): number {
    if (!p.ember) return 0;
    if (p.age >= EMBER_MAX_AGE) return 0;
    return (1 - p.age / EMBER_MAX_AGE) * 1.1;
  }

  const palette = $derived(params.resolvedPalette);
  const emberColor = $derived(palette.emberEdge?.color ?? "#ff6020");
</script>

{#each petals as p (p.id)}
  {@const op = renderOpacity(p)}
  {@const tex = getOrBakeTexture(p.shape, p.tint)}
  {#if op > 0.02 && tex}
    <T.Mesh
      position.x={p.x}
      position.y={p.y}
      position.z={p.z}
      rotation.x={p.angX}
      rotation.y={p.angY}
      rotation.z={p.angZ}
    >
      <T.PlaneGeometry args={[p.size * 2, p.size * 2]} />
      <T.MeshLambertMaterial
        map={tex as Texture}
        transparent
        opacity={op}
        depthWrite={false}
        side={DoubleSide}
        emissive="#ffffff"
        emissiveIntensity={0.16}
      />
    </T.Mesh>
    {#if p.ember && emberOpacity(p) > 0.02}
      <T.Mesh
        position.x={p.x}
        position.y={p.y}
        position.z={p.z}
        rotation.x={p.angX}
        rotation.y={p.angY}
        rotation.z={p.angZ}
      >
        <T.PlaneGeometry
          args={[resolveEmberWorldSpan(p.size), resolveEmberWorldSpan(p.size)]}
        />
        <T.MeshBasicMaterial
          color={emberColor}
          transparent
          opacity={emberOpacity(p) * 0.92}
          depthWrite={false}
          side={DoubleSide}
        />
      </T.Mesh>
    {/if}
  {/if}
{/each}
