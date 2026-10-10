<script lang="ts">
  /**
   * SmokeRenderer3D - per-tip curl-noise puff emitter for the 3D scene.
   *
   * Each puff is a camera-facing sprite (T.Sprite + SpriteMaterial) tinted
   * by a shared CanvasTexture that encodes a radial core-to-edge gradient.
   * Motion combines:
   *   - world-up rise (+y) scaled by palette.riseBias × intent.riseSpeed
   *   - curl-noise lateral sway in the XZ plane, sampled from the shared
   *     `SampledCurlGrid2D` utility. Curl is evaluated in 2D (XZ) only -
   *     vertical motion stays palette-controlled so puffs feel like they
   *     rise rather than tumble.
   *
   * Pool policy mirrors the 2D renderer: when the per-tip cap is hit,
   * new spawns are dropped rather than recycling alive particles. Fog
   * palette at max spawn hits a density plateau that reads as natural
   * occupation, not popping.
   *
   * The genie palette's hue-shift flag (`hueShift: true`) surfaces through
   * params.resolvedPalette.hueShift and is ignored at 1i.i - 1i.iii will
   * branch the material's color to sample a lifetime gradient.
   */

  import { T, useTask } from "@threlte/core";
  import { Vector3, CanvasTexture, type Texture } from "three";
  import type { Smoke3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
  import { SampledCurlGrid2D } from "./smoke-curl-field";

  interface Props {
    /** World-space position of this tip. null = hidden. */
    position: Vector3 | null;
    /** Tip velocity in metres per second. */
    propVelocity: Vector3;
    /** Resolved smoke params. */
    params: Smoke3DParams;
    /** Gates mounting. */
    enabled: boolean;
  }

  let { position, propVelocity, params, enabled }: Props = $props();

  interface SmokePuff3D {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    age: number;
    maxAge: number;
    r0: number;
    r1: number;
    /** Per-puff noise phase - decorrelates neighbours sampling the same curl cell. */
    phase: number;
    /** Cached base alpha from intent.intensity at spawn. */
    peakAlpha: number;
  }

  let puffs = $state<SmokePuff3D[]>([]);
  let spawnAccumulator = 0;
  let nextId = 0;
  let clock = 0;

  const PER_TIP_CAP = 256;
  const FADE_OUT_FRACTION = 0.3;
  const FADE_IN_DURATION = 0.15;

  // One curl field per renderer instance - cheap (64*64 = 4k float pairs).
  // Tests on the shared module cover determinism and bounded output.
  const curlField = new SampledCurlGrid2D(64, 16, 1 / 3);

  // Shared puff texture - baked once per (core, edge) color pair. The
  // radial gradient is 128x128 RGBA; multiple palettes cache separately
  // so color changes don't rebuild every frame.
  const textureCache = new Map<string, CanvasTexture>();

  function getOrBakePuffTexture(core: string, edge: string): CanvasTexture | null {
    const key = `${core}:${edge}`;
    const cached = textureCache.get(key);
    if (cached) return cached;
    if (typeof document === "undefined") return null;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    const center = size / 2;
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    const { r: cr, g: cg, b: cb } = hexToRgb(core);
    const { r: er, g: eg, b: eb } = hexToRgb(edge);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
    grad.addColorStop(0.55, `rgba(${er},${eg},${eb},0.55)`);
    grad.addColorStop(1, `rgba(${er},${eg},${eb},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();
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
    const rate =
      params.ambientEmission * params.ambientSpawnRate +
      params.motionEmission * speedScalar * params.motionSpawnRate;

    spawnAccumulator += delta * rate;
    const baseRadius = params.baseRadius * (0.7 + 0.9 * params.intensity);
    const peakAlpha = 0.25 + 0.45 * params.intensity;

    while (spawnAccumulator >= 1 && puffs.length < PER_TIP_CAP) {
      const ox = (Math.random() - 0.5) * 0.06;
      const oy = (Math.random() - 0.5) * 0.04;
      const oz = (Math.random() - 0.5) * 0.06;
      const jitter = 0.8 + Math.random() * 0.4;
      const r0 = baseRadius * jitter;
      const r1 = r0 * 3.0 * (0.8 + Math.random() * 0.4);
      const lifeJitter = 0.8 + Math.random() * 0.4;
      puffs.push({
        id: nextId++,
        x: position.x + ox,
        y: position.y + oy,
        z: position.z + oz,
        vx: (Math.random() - 0.5) * 0.08,
        vy: params.resolvedRiseSpeed * (0.85 + Math.random() * 0.3),
        vz: (Math.random() - 0.5) * 0.08,
        age: 0,
        maxAge: params.lifetimeSeconds * lifeJitter,
        r0,
        r1,
        phase: Math.random() * Math.PI * 2,
        peakAlpha,
      });
      spawnAccumulator -= 1;
    }

    // Integrate + age + cull. Curl is 2D (XZ plane) - we want smoke to
    // rise mostly vertically, with swirl in the horizontal plane.
    const curlScale = 1 / Math.max(1e-3, params.noiseScale);
    const CURL_BASE_MS = 1.2; // m/s lateral swirl at resolvedCurlStrength=1
    const drag = Math.pow(0.4, delta);
    const surviving: SmokePuff3D[] = [];
    for (const p of puffs) {
      p.age += delta;
      if (p.age >= p.maxAge) continue;
      const curl = curlField.sample(
        p.x * curlScale + p.phase,
        p.z * curlScale,
        clock,
      );
      const cx = curl.vx * params.resolvedCurlStrength * CURL_BASE_MS;
      const cz = curl.vy * params.resolvedCurlStrength * CURL_BASE_MS;
      p.x += (p.vx + cx) * delta;
      p.y += p.vy * delta;
      p.z += (p.vz + cz) * delta;
      // Light drag on the spawn-time horizontal kick.
      p.vx *= drag;
      p.vz *= drag;
      surviving.push(p);
    }
    puffs = surviving;
  });

  function renderOpacity(p: SmokePuff3D): number {
    const lifeT = p.age / p.maxAge;
    const fadeIn = p.age < FADE_IN_DURATION ? p.age / FADE_IN_DURATION : 1;
    const fadeOut =
      lifeT > 1 - FADE_OUT_FRACTION
        ? (1 - lifeT) / FADE_OUT_FRACTION
        : 1;
    return Math.max(0, fadeIn * fadeOut * p.peakAlpha);
  }

  function renderRadius(p: SmokePuff3D): number {
    const lifeT = p.age / p.maxAge;
    return p.r0 + (p.r1 - p.r0) * lifeT;
  }

  const palette = $derived(params.resolvedPalette);
  const tex = $derived(getOrBakePuffTexture(palette.core, palette.edge));

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const s = hex.trim().replace(/^#/, "");
    const norm =
      s.length === 3
        ? s
            .split("")
            .map((c) => c + c)
            .join("")
        : s.length >= 6
          ? s.slice(0, 6)
          : "d8d8d8";
    return {
      r: parseInt(norm.slice(0, 2), 16),
      g: parseInt(norm.slice(2, 4), 16),
      b: parseInt(norm.slice(4, 6), 16),
    };
  }
</script>

{#each puffs as p (p.id)}
  {@const op = renderOpacity(p)}
  {@const r = renderRadius(p)}
  {#if op > 0.02 && tex}
    <T.Sprite
      position.x={p.x}
      position.y={p.y}
      position.z={p.z}
      scale.x={r * 2}
      scale.y={r * 2}
      scale.z={1}
    >
      <T.SpriteMaterial
        map={tex as Texture}
        transparent
        opacity={op}
        depthWrite={false}
      />
    </T.Sprite>
  {/if}
{/each}
