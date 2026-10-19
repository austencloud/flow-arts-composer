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
   * Flight uses the same falling-plate physics as the pooled renderer.
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

  import type { PetalBody } from "#lib/shared/effects/domain/petal-aero.js";
  import {
    createFallbackPetalBody,
    advanceFallbackPetalBody,
  } from "./petal-fallback-flight.js";

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
    body: PetalBody;
    age: number;
    maxAge: number;
    size: number;
    shape: PetalSpriteShape;
    tint: string;
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
      const size = resolvePetalWorldSize(
        params.baseSize,
        params.intensity,
        shape,
        false
      );
      const body = createFallbackPetalBody(
        params,
        shape,
        size,
        { x: px + ox, y: py + oy, z: pz + oz },
        {
          x: propVelocity.x * params.carry + (Math.random() - 0.5) * drift,
          y: propVelocity.y * params.carry - fall * 0.12,
          z: propVelocity.z * params.carry + (Math.random() - 0.5) * drift,
        }
      );
      petals.push({
        id: nextId++,
        body,
        age: 0,
        maxAge: params.lifetime * (0.52 + Math.random() * 0.24),
        size,
        shape,
        tint: pickPetalTint(palette),
        opacity: resolvePetalOpacity(shape, false),
        ember: rollEmberFlag(palette),
      });
      spawnAccumulator -= 1;
    }

    // Integrate + age + cull.
    const surviving: Petal3D[] = [];
    for (const p of petals) {
      p.age += delta;
      if (p.age >= p.maxAge) continue;
      advanceFallbackPetalBody(p.body, clock, delta);
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
      position.x={p.body.x}
      position.y={p.body.y}
      position.z={p.body.z}
      quaternion={[p.body.qx, p.body.qy, p.body.qz, p.body.qw]}
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
        position.x={p.body.x}
        position.y={p.body.y}
        position.z={p.body.z}
        quaternion={[p.body.qx, p.body.qy, p.body.qz, p.body.qw]}
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
