<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import {
    semanticToCharcoalParams,
    type CharcoalSparkParams,
  } from "#lib/shared/animation-engine/domain/types/charcoal-spark-types.js";
  import type { EffectPreset } from "../presets/types";

  interface Props {
    preset: EffectPreset<"charcoal">;
    active?: boolean;
  }

  const { preset, active = false }: Props = $props();
  let canvas = $state<HTMLCanvasElement>();

  const WIDTH = 720;
  const HEIGHT = 270;

  /**
   * A still frame of the real spark system, not a drawing of one.
   *
   * Coal is a particle simulation: how far a spark flies, how long it burns and
   * what colour it cools through are all consequences of physics the panel
   * already owns. So the tile runs that physics - the preset's own
   * intensity/spread/glow through semanticToCharcoalParams, the same emission,
   * gravity, drag, lifetime, shrink and three-stop temperature ramp the
   * WebGL renderer uses - and paints the frame it lands on. Nothing here is
   * keyed off preset.id, and nothing invents a curve the stage does not have.
   *
   * That matters more for Coal than for any other effect. Its eight looks are
   * three numbers and a palette, and the generic tile drew all eight as the same
   * swoosh in different colours - so Steel Wool and Ash, which behave nothing
   * alike, were indistinguishable. Run the simulation and Steel Wool is a dense
   * tight shower, Cinder Fan is a wide slow drift, Ash is a thin grey dribble.
   *
   * emissionStyle is honoured, because it now reaches 2D. It used to be
   * 3D-only, so the tile deliberately ignored it rather than promise a
   * difference the 2D stage would not deliver; semanticToCharcoalParams folds
   * the spark half of the 3D motion profile in, so the tile gets it for free
   * and by construction shows exactly what the stage will do.
   */
  const CHARCOAL_DEFAULTS = DEFAULT_EFFECTS_CONFIG.charcoal;

  /**
   * The simulation runs in the renderer's own viewbox units so that gravity,
   * perturbation speeds and spark sizes keep the values they were tuned at. The
   * tile is a 950-unit-wide window onto that space, which is the stage width the
   * defaults assume.
   */
  const VIEW_W = 950;
  const VIEW_H = (950 * HEIGHT) / WIDTH;
  const SCALE = WIDTH / VIEW_W;

  const DT = 1 / 60;
  const DURATION = 2.4;

  /**
   * One fixed seed for every look, so any difference between two tiles is the
   * difference between two presets and never the difference between two dice.
   */
  const SEED = 0x51c0a1;

  type Spark = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    active: boolean;
  };

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Two spinning emitters, high in the frame, the way the Fire tile shows two
   * flames. TKA is dual-wielded, so two is the truthful count, and it is also
   * what makes the composition work.
   *
   * Composition took two tries. A single sweep across the tile packed every
   * spark against the right edge. A single large spin then showed a comet at
   * the tip and little else, because the tile is a wide letterbox: at the tight
   * end of the spread range gravity runs 480 units/s^2, so a spark clears a
   * third of this frame's height in half a second and the honest picture is
   * mostly black. Two small spins placed at 28% height give the shower the
   * remaining 72% to fall through, and the sparks that survive that fall are
   * exactly the difference between one preset and the next.
   *
   * Radii and period put tip speed near 900 viewbox units/s - an ordinary spin -
   * so velocity inheritance carries its real weight rather than a flattering one.
   */
  const SPIN_CY = VIEW_H * 0.28;
  const SPIN_RX = VIEW_W * 0.1;
  const SPIN_RY = VIEW_H * 0.17;
  const SPIN_TURNS = 2;
  const SPIN_CENTERS = [VIEW_W * 0.3, VIEW_W * 0.7];

  function tipAt(
    t: number,
    cx: number,
    phase: number
  ): { x: number; y: number; vx: number; vy: number } {
    const a = (t / DURATION) * SPIN_TURNS * Math.PI * 2 + phase;
    const w = (SPIN_TURNS * Math.PI * 2) / DURATION;
    return {
      x: cx + Math.cos(a) * SPIN_RX,
      y: SPIN_CY + Math.sin(a) * SPIN_RY,
      vx: -Math.sin(a) * SPIN_RX * w,
      vy: Math.cos(a) * SPIN_RY * w,
    };
  }

  /** The renderer's three-stop ramp: cool -> mid over [0,0.5], mid -> core above. */
  function temperatureColor(
    t: number,
    params: CharcoalSparkParams
  ): [number, number, number] {
    if (t > 0.5) {
      const b = (t - 0.5) * 2;
      return [
        params.midColor[0] + (params.coreColor[0] - params.midColor[0]) * b,
        params.midColor[1] + (params.coreColor[1] - params.midColor[1]) * b,
        params.midColor[2] + (params.coreColor[2] - params.midColor[2]) * b,
      ];
    }
    const b = t * 2;
    return [
      params.coolColor[0] + (params.midColor[0] - params.coolColor[0]) * b,
      params.coolColor[1] + (params.midColor[1] - params.coolColor[1]) * b,
      params.coolColor[2] + (params.midColor[2] - params.coolColor[2]) * b,
    ];
  }

  /** The renderer's envelope: fade in over the first 5%, out over the last 30%. */
  function envelope(lifeRatio: number): number {
    if (lifeRatio > 0.95) return (1 - lifeRatio) / 0.05;
    if (lifeRatio > 0.3) return 1;
    return lifeRatio / 0.3;
  }

  function simulate(params: CharcoalSparkParams): Spark[] {
    const rand = mulberry32(SEED);
    // The stage pool runs to thousands; a 2.4s tile never needs that many, and
    // the cap keeps a max-intensity preset from costing more than it shows.
    const capacity = Math.min(params.maxParticles, 900);
    const pool: Spark[] = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      active: false,
    }));

    let cursor = 0;
    const claim = (): Spark => {
      const slot = pool[cursor % capacity]!;
      cursor += 1;
      return slot;
    };

    const spawn = (
      tip: { x: number; y: number; vx: number; vy: number },
      speed: number
    ): void => {
      const slot = claim();
      const angle =
        Math.atan2(tip.vy, tip.vx) + (rand() - 0.5) * 2 * params.spreadAngle;
      const perturb =
        params.perturbSpeedMin +
        rand() * (params.perturbSpeedMax - params.perturbSpeedMin);
      slot.x = tip.x;
      slot.y = tip.y;
      slot.vx = tip.vx * params.velocityInheritance + Math.cos(angle) * perturb;
      slot.vy = tip.vy * params.velocityInheritance + Math.sin(angle) * perturb;
      slot.maxLife =
        params.lifetimeMin + rand() * (params.lifetimeMax - params.lifetimeMin);
      slot.life = slot.maxLife;
      slot.size =
        (params.sizeMin + rand() * (params.sizeMax - params.sizeMin)) * SCALE;
      slot.active = true;
      void speed;
    };

    let accumulator = 0;
    const dragPerStep = Math.pow(params.drag, DT);

    for (let t = 0; t < DURATION; t += DT) {
      // Half a revolution apart, so the two showers are never the same shower
      // twice - the pair reads as two props rather than one mirrored stamp.
      const tips = SPIN_CENTERS.map((cx, i) => tipAt(t, cx, i * Math.PI));

      accumulator += params.ambientRate * DT;
      while (accumulator >= 1) {
        accumulator -= 1;
        for (const tip of tips) spawn(tip, 0);
      }

      // One burst, early enough that its debris has the rest of the run to fall.
      // Reversals are where Coal pops on the stage and where intensity does its
      // loudest work, so a tile of pure ambient emission would undersell every
      // high-intensity preset.
      if (Math.abs(t - DURATION * 0.3) < DT * 0.5) {
        const burst = Math.min(params.burstMultiplier, params.burstMax, 120);
        for (const tip of tips) {
          for (let i = 0; i < burst; i += 1) spawn(tip, 0);
        }
      }

      for (const p of pool) {
        if (!p.active) continue;
        p.vy += params.gravity * DT;
        p.vx *= dragPerStep;
        p.vy *= dragPerStep;
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        p.life -= DT;
        if (p.life <= 0) p.active = false;
      }
    }

    return pool.filter((p) => p.active);
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;

    const intent = { ...CHARCOAL_DEFAULTS, ...(preset.patch ?? {}) };
    const params = semanticToCharcoalParams(
      {
        intensity: intent.intensity,
        spread: intent.spread,
        glow: intent.glow,
        emissionStyle: intent.emissionStyle,
      },
      {
        coreColor: intent.coreColor,
        midColor: intent.midColor,
        coolColor: intent.coolColor,
      }
    );

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#0a0806");
    background.addColorStop(1, "#050404");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const sparks = simulate(params);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Glow pass first, so the halos sit under the cores rather than washing
    // them out - the same order the renderer draws sparks then ember glows.
    const glowRadius = params.emberGlowRadius * SCALE;
    const glowAlpha = Math.min(params.emberGlowIntensity * 0.06, 0.3);
    for (const p of sparks) {
      const lifeRatio = p.life / p.maxLife;
      const [r, g, b] = temperatureColor(lifeRatio, params);
      const x = p.x * SCALE;
      const y = p.y * SCALE;
      if (x < -glowRadius || x > WIDTH + glowRadius) continue;
      if (y < -glowRadius || y > HEIGHT + glowRadius) continue;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      const rgb = `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
      halo.addColorStop(0, `rgba(${rgb}, ${glowAlpha * envelope(lifeRatio)})`);
      halo.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of sparks) {
      const lifeRatio = p.life / p.maxLife;
      const [r, g, b] = temperatureColor(lifeRatio, params);
      const x = p.x * SCALE;
      const y = p.y * SCALE;
      // The renderer shrinks a spark linearly through the last half of its
      // life, so a long-lived look thins out towards its tail instead of
      // ending on full-size dots.
      const size = p.size * (lifeRatio < 0.5 ? lifeRatio * 2 : 1);
      if (size <= 0) continue;
      if (x < -size || x > WIDTH + size || y < -size || y > HEIGHT + size)
        continue;
      const alpha = envelope(lifeRatio);
      const core = ctx.createRadialGradient(x, y, 0, x, y, size);
      const rgb = `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
      core.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      core.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.55})`);
      core.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
</script>

<div class="coal-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={WIDTH} height={HEIGHT}></canvas>
</div>

<style>
  .coal-thumbnail {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: #070505;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .coal-thumbnail.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #38bdf8) 50%,
      transparent
    );
  }
</style>
