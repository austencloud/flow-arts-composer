<script lang="ts">
  /**
   * PetalAmbientShower3D - scene-wide ambient petal shower.
   *
   * Spawns petals from a horizontal rectangle above the scene at rate
   * `ambientEmission * ambientAboveRate`. Petals fall with the same sway
   * model as PetalEmitter3D. Mounted ONCE per scene (not per tip).
   *
   * Spawn zone defaults: y = ceilingY (default +3), XZ span = ±zoneHalf
   * around the scene origin. Callers can override.
   */

  import { T, useTask } from "@threlte/core";
  import { CanvasTexture, DoubleSide, type Texture } from "three";
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
    /** Resolved petal params. */
    params: Petals3DParams;
    /** Gates mounting. */
    enabled: boolean;
    /** Y coordinate of the spawn ceiling. Default 3 world units. */
    ceilingY?: number;
    /** Half-extent of the spawn zone in XZ (world units). Default 1.4. */
    zoneHalf?: number;
  }

  let { params, enabled, ceilingY = 3, zoneHalf = 1.4 }: Props = $props();

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
    rx: number;
    ry: number;
    rz: number;
    angX: number;
    angY: number;
    angZ: number;
    phase: number;
    opacity: number;
    ember: boolean;
  }

  let petals = $state<Petal3D[]>([]);
  let spawnAccumulator = 0;
  let nextId = 0;
  let clock = 0;

  const MAX_AMBIENT = 512;
  const EMBER_MAX_AGE = 1.35;
  const FADE_OUT_FRACTION = 0.2;
  const FADE_IN_DURATION = 0.12;

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
    if (!enabled) return;

    const rate = params.ambientEmission * params.ambientAboveRate;
    spawnAccumulator += delta * rate;

    const palette = params.resolvedPalette;
    const fall = params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed);

    while (spawnAccumulator >= 1 && petals.length < MAX_AMBIENT) {
      const x = (Math.random() - 0.5) * 2 * zoneHalf;
      const z = (Math.random() - 0.5) * 2 * zoneHalf;
      const drift = 0.14;
      const shape = pickPetalSprite(palette);
      petals.push({
        id: nextId++,
        x,
        y: ceilingY + Math.random() * 0.5,
        z,
        vx: (Math.random() - 0.5) * drift,
        vy: -fall * (0.8 + Math.random() * 0.4),
        vz: (Math.random() - 0.5) * drift,
        age: 0,
        maxAge: params.lifetime * (0.75 + Math.random() * 0.2),
        size: resolvePetalWorldSize(
          params.baseSize,
          params.intensity,
          shape,
          true
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
        opacity: resolvePetalOpacity(shape, true),
        ember: rollEmberFlag(palette),
      });
      spawnAccumulator -= 1;
    }

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
        emissiveIntensity={0.14}
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
