<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import {
    semanticToCharcoalParams,
    type CharcoalSparkParams,
  } from "#lib/shared/animation-engine/domain/types/charcoal-spark-types.js";
  import {
    SPARK_2D_PIXELS_PER_METRE,
    SPARK_GRAVITY,
    SPARK_SHUTTER_SECONDS,
    releaseSparkVelocity2D,
    resolveSparkMaterial,
    sampleSparkDiameter,
    sampleSparkFork,
    sparkBurnTime,
    sparkCoolTime,
    sparkHeat,
    sparkLifetime,
    stepSparkVelocity,
    type SparkMaterial,
  } from "#lib/shared/effects/domain/spark-physics.js";
  import type { EffectPreset } from "../presets/types";
  import { mulberry32 } from "./tile-paint";

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
   * intensity/spread/glow through semanticToCharcoalParams and the shared
   * spark physics the 2D and 3D stages fly their sparks with, plus the same
   * three-stop temperature ramp - and paints the frame it lands on, sparks as
   * the streaks the stage draws. Nothing here is keyed off preset.id, and
   * nothing invents a curve the stage does not have.
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
   * The simulation runs in a 950-unit-wide window, drawn at the 2D stage's
   * scale for a 950 px canvas, so a spark flies as far across the tile as it
   * does across the stage.
   */
  const VIEW_W = 950;
  const VIEW_H = (950 * HEIGHT) / WIDTH;
  const SCALE = WIDTH / VIEW_W;
  const PIXELS_PER_METRE = (SPARK_2D_PIXELS_PER_METRE * VIEW_W) / 500;

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
    vz: number;
    diameter: number;
    burnTime: number;
    coolTime: number;
    age: number;
    maxLife: number;
    forkAt: number;
    size: number;
    active: boolean;
  };

  /**
   * Two spinning emitters, high in the frame, the way the Fire tile shows two
   * flames. TKA is dual-wielded, so two is the truthful count, and it is also
   * what makes the composition work.
   *
   * Composition took two tries. A single sweep across the tile packed every
   * spark against the right edge. A single large spin then showed a comet at
   * the tip and little else, because the tile is a wide letterbox only about
   * a metre and a third tall, so a falling spark clears it in well under a
   * second and the honest picture is mostly black. Two small spins placed at 28% height give the shower the
   * remaining 72% to fall through, and the sparks that survive that fall are
   * exactly the difference between one preset and the next.
   *
   * Radii and period put the tip near 4 m/s - an ordinary spin - so the
   * sparks leave at their real speed rather than a flattering one.
   */
  const SPIN_CY = VIEW_H * 0.28;
  const SPIN_RX = VIEW_W * 0.1;
  const SPIN_RY = VIEW_H * 0.17;
  const SPIN_TURNS = 4;
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

  function simulate(params: CharcoalSparkParams): Spark[] {
    const rand = mulberry32(SEED);
    const material: SparkMaterial = resolveSparkMaterial(params.emissionStyle);
    const spread = params.spread ?? 0.4;
    const glow = params.glow ?? 0.5;
    // The stage pool runs to a thousand or more; a 2.4s tile never needs
    // that many, and the cap keeps a max-intensity preset from costing more
    // than it shows.
    const capacity = Math.min(params.maxParticles, 900);
    const pool: Spark[] = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      diameter: 0,
      burnTime: 0,
      coolTime: 0,
      age: 0,
      maxLife: 0,
      forkAt: -1,
      size: 1,
      active: false,
    }));

    let cursor = 0;
    const claim = (): Spark => {
      const slot = pool[cursor % capacity]!;
      cursor += 1;
      return slot;
    };

    const body = (slot: Spark, diameter: number): void => {
      slot.diameter = diameter;
      slot.burnTime = sparkBurnTime(material, diameter);
      slot.coolTime = sparkCoolTime(material, diameter);
      slot.maxLife = sparkLifetime(slot.burnTime, slot.coolTime);
      slot.age = 0;
      slot.forkAt = sampleSparkFork(material, slot.burnTime, rand(), rand());
      slot.size =
        1.6 * (0.75 + glow * 0.5) * Math.sqrt(diameter / 0.0003) * SCALE;
      slot.active = true;
    };

    const spawn = (tip: { x: number; y: number; vx: number; vy: number }) => {
      const slot = claim();
      releaseSparkVelocity2D(
        slot,
        tip.vx,
        tip.vy,
        material.carry,
        material.scatter * (0.55 + spread * 0.9) * PIXELS_PER_METRE,
        rand
      );
      slot.x = tip.x;
      slot.y = tip.y;
      body(slot, sampleSparkDiameter(material, rand()));
    };

    const fork = (parent: Spark): void => {
      parent.active = false;
      const children =
        material.forkChildrenMin +
        Math.floor(
          rand() * (material.forkChildrenMax - material.forkChildrenMin + 1)
        );
      for (let i = 0; i < children; i += 1) {
        const child = claim();
        releaseSparkVelocity2D(
          child,
          parent.vx,
          parent.vy,
          1,
          material.forkSpeed * PIXELS_PER_METRE,
          rand
        );
        child.x = parent.x;
        child.y = parent.y;
        body(child, parent.diameter * (0.4 + rand() * 0.2));
        child.forkAt = -1;
      }
    };

    // Throw as many sparks as the pool can hold for their real lifetimes,
    // the way the stage's emission budget does, scaled by the look's rate.
    const meanLife = Math.max(
      0.05,
      (params.lifetimeMin + params.lifetimeMax) / 2
    );
    const rate = Math.min(
      params.ambientRate * 2,
      (capacity * 0.85) / meanLife / SPIN_CENTERS.length
    );

    let accumulator = 0;
    for (let t = 0; t < DURATION; t += DT) {
      // Half a revolution apart, so the two showers are never the same shower
      // twice - the pair reads as two props rather than one mirrored stamp.
      const tips = SPIN_CENTERS.map((cx, i) => tipAt(t, cx, i * Math.PI));

      accumulator += rate * DT;
      while (accumulator >= 1) {
        accumulator -= 1;
        for (const tip of tips) spawn(tip);
      }

      for (const p of pool) {
        if (!p.active) continue;
        stepSparkVelocity(
          p,
          DT,
          p.diameter,
          material,
          0,
          SPARK_GRAVITY * PIXELS_PER_METRE,
          0,
          1 / PIXELS_PER_METRE
        );
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        p.age += DT;
        if (p.forkAt >= 0 && p.age >= p.forkAt) fork(p);
        else if (p.age >= p.maxLife) p.active = false;
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
    ctx.lineCap = "round";

    // Each spark is the streak it paints in one camera shutter, as on the
    // stage: a soft wide pass for the glow, then the bright core.
    for (const pass of [
      { width: 3, alpha: 0.22 },
      { width: 1, alpha: 1 },
    ]) {
      for (const p of sparks) {
        const heat = sparkHeat(p.age, p.burnTime, p.coolTime);
        const [r, g, b] = temperatureColor(heat, params);
        const x = p.x * SCALE;
        const y = p.y * SCALE;
        const tx = (p.x - p.vx * SPARK_SHUTTER_SECONDS) * SCALE;
        const ty = (p.y - p.vy * SPARK_SHUTTER_SECONDS) * SCALE;
        if (Math.max(x, tx) < 0 || Math.min(x, tx) > WIDTH) continue;
        if (Math.max(y, ty) < 0 || Math.min(y, ty) > HEIGHT) continue;
        const alpha =
          Math.min(1, heat / 0.35) * (0.75 + heat * 0.6) * pass.alpha;
        ctx.strokeStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.min(1, alpha)})`;
        ctx.lineWidth = Math.max(0.8, p.size * (0.55 + heat * 0.45) * 2) * pass.width;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
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
