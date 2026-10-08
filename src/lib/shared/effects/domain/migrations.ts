import type { EffectsConfig } from "./effects-config";
import { clampSilkIntensity, EFFECTS_CONFIG_VERSION } from "./effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "./defaults";
import { migrateLedConfig } from "$lib/shared/animation-engine/domain/types/led-config-migration";

type UnknownRecord = Record<string, unknown>;

/**
 * Restores the prop-color fields written by pre-left/right effect settings.
 * Ghost draws each prop's own texture and colors, so its old hand colors are
 * dropped instead of restored.
 */
export function normalizeLegacyEffectIntentColors<T>(
  effectId: string,
  value: T
): T {
  if (
    (effectId !== "trails" && effectId !== "ghost") ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value;
  }

  const source = value as UnknownRecord;
  const normalized: UnknownRecord = { ...source };
  if (effectId === "ghost") {
    delete normalized.leftColor;
    delete normalized.rightColor;
  } else {
    normalized.leftColor ??= source.blueColor;
    normalized.rightColor ??= source.redColor;
  }
  delete normalized.blueColor;
  delete normalized.redColor;
  return normalized as T;
}

/**
 * Migrate an arbitrary stored EffectsConfig up to the current version.
 * Safe to call on a current-version config (returns it unchanged after
 * a structural clone).
 */
export function migrateEffectsConfig(raw: unknown): EffectsConfig {
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_EFFECTS_CONFIG);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy migration shapes have arbitrary keys
  type LegacyRecord = Record<string, any>;
  const input = raw as Partial<EffectsConfig> & {
    version?: number;
    zap?: LegacyRecord;
    sparkles?: LegacyRecord;
    motion?: LegacyRecord;
    echo?: LegacyRecord;
    bloom?: LegacyRecord;
    bubbles?: LegacyRecord;
    petals?: LegacyRecord;
    smoke?: LegacyRecord;
    ink?: LegacyRecord;
    frost?: LegacyRecord;
    silk?: LegacyRecord;
    animal?: LegacyRecord;
  };
  const version = input.version ?? 1;

  // v2 → v3: split zap.color into zap.leftColor + zap.rightColor.
  // Mutate the input shape *before* the default-merge so downstream sees v3 shape.
  if (
    version < 3 &&
    input.zap &&
    typeof input.zap.color === "string" &&
    !input.zap.leftColor
  ) {
    input.zap.leftColor = input.zap.color;
    input.zap.rightColor = input.zap.color;
    delete input.zap.color;
  }

  // v3 → v4: collapse sparkles.rainbow boolean into colorMode enum and add
  // palette/spread/gravity/mode with sensible defaults. Mutate in place before
  // the default-merge so existing persisted configs upgrade without losing
  // user selections.
  if (version < 4 && input.sparkles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = input.sparkles as Record<string, any>;
    s.palette ??= ["#fbbf24", "#f59e0b", "#fde047"];
    s.colorMode ??= s.rainbow ? "rainbow" : "solid";
    s.spread ??= 8;
    s.gravity ??= 0.3;
    s.mode ??= "stream";
    delete s.rainbow;
  }

  // v4 → v5: extend motion with color/colorMode/length/count. Existing
  // persisted v4 configs only have blur/speedLines/threshold; inject
  // defaults so the upgraded shape matches the old MotionIntent.
  // NOTE: v6 discards this motion block entirely - echo replaces it.
  if (version < 5 && input.motion) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = input.motion as Record<string, any>;
    m.color ??= "#ffffff";
    m.colorMode ??= "solid";
    m.length ??= 0.5;
    m.count ??= 6;
  }

  // v5 → v6: Motion effect replaced by Echo (beat-onset phantoms). The old
  // motion fields (blur/speedLines/threshold/color/colorMode/length/count)
  // have no clean mapping to echo's stroboscopic phantom model, so we
  // discard them and reseed echo defaults. Tip-effect assignments that
  // named "motion" are rewritten to "echo" so existing sequences keep
  // firing a visual effect on the same tips.
  if (version < 6) {
    if (input.motion) {
      input.echo = {
        intensity: 0.7,
        decay: 4,
        interval: 1,
        shape: "staff",
        colorMode: "solid",
        color: "#ffffff",
        thickness: 3,
        // v19 luminous-stroboscope fields (seed at defaults; the merge would
        // fill these anyway, but the EchoIntent shape now requires them).
        glow: 0.6,
        depth: 0.5,
        flash: 0.5,
        // v25 long-exposure-strobe field (same rationale).
        streak: 0.35,
      };
      delete input.motion;
    }
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (entry?.effect === "motion") entry.effect = "echo";
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.activePresets && "motion" in (input.activePresets as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presets = input.activePresets as Record<string, any>;
      presets.echo = presets.motion;
      delete presets.motion;
    }
  }

  // v6 → v7: Bloom pivots from fullscreen-post-process stub
  // {intensity, threshold, radius(0-1)} into a per-tip radial-halo intent with
  // color, palette, colorMode, falloff, pulse, pulseRate. Preserve existing
  // intensity. Drop threshold (no longer meaningful). Map old radius (0-1
  // normalized) to the new pixel scale via old*200+8 clamped to [8, 200]. Seed
  // new fields from defaults. tipEffectMap entries pointing at "bloom" stay
  // valid.
  if (version < 7) {
    if (input.bloom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = input.bloom as Record<string, any>;
      const oldRadius = typeof b.radius === "number" ? b.radius : 0.5;
      const newRadiusPx = Math.min(200, Math.max(8, oldRadius * 200 + 8));
      const preservedIntensity =
        typeof b.intensity === "number" ? b.intensity : 0.7;
      b.radius = newRadiusPx;
      b.intensity = preservedIntensity;
      delete b.threshold;
      b.color ??= "#f472b6";
      b.palette ??= ["#f472b6", "#fbbf24", "#22d3ee"];
      b.colorMode ??= "solid";
      b.falloff ??= "smooth";
      b.pulse ??= 0;
      b.pulseRate ??= 1;
    }
  }

  // v7 → v8: add water intent. No field migration - absent water resolves to
  // DEFAULT_EFFECTS_CONFIG.water via the merge below.

  // v8 → v9: add bubbles intent + activePresets.bubbles. Net-new 10th effect
  // (11th chip including "none"). No field migration - absent bubbles resolves
  // to DEFAULT_EFFECTS_CONFIG.bubbles via the merge below. tipEffectMap entries
  // are unchanged (only the domain expands).

  // v9 → v10: add petals intent + activePresets.petals. Net-new 11th effect
  // (12th chip including "none"). No field migration - absent petals resolves
  // to DEFAULT_EFFECTS_CONFIG.petals via the merge below. tipEffectMap entries
  // are unchanged (only the domain expands).

  // v10 → v11: add smoke intent + activePresets.smoke. Net-new 12th effect
  // (13th chip including "none"). No field migration - absent smoke resolves
  // to DEFAULT_EFFECTS_CONFIG.smoke via the merge below. tipEffectMap entries
  // are unchanged (only the domain expands). First effect where palette
  // carries behavioral multipliers (lifetime, curl bias, rise bias) in
  // addition to color.

  // v11 → v12: add ink intent + activePresets.ink. Net-new 13th effect
  // (14th chip including "none"). No field migration - absent ink resolves
  // to DEFAULT_EFFECTS_CONFIG.ink via the merge below. tipEffectMap entries
  // are unchanged (only the domain expands). First stroke-based effect -
  // opaque flat-shaded pigment, variable width from velocity (slow =
  // thick loaded brush, fast = thin lifted brush). Sprint 1 = stroke MVP;
  // sprint 2 adds sag, strand breakup, splatter bursts, ground pooling.

  // v12 → v13: add frost intent + activePresets.frost. Net-new 14th effect
  // (15th chip including "none"). No field migration - absent frost resolves
  // to DEFAULT_EFFECTS_CONFIG.frost via the merge below.

  // v13 → v14: add silk intent + activePresets.silk. Net-new 15th effect
  // (16th chip including "none"). No field migration - absent silk resolves
  // to DEFAULT_EFFECTS_CONFIG.silk via the merge below.

  // v14 → v15: add pulse intent + activePresets.pulse. Net-new 16th effect
  // (17th chip including "none"). No field migration - absent pulse resolves
  // to DEFAULT_EFFECTS_CONFIG.pulse via the merge below.

  // v15 → v16: default LED brightness dropped 5 → 3. A persisted 5 on a
  // pre-16 config is the old default echoing back, not a user choice -
  // remap it. Users who picked 1-4 keep their setting.
  // (Runs before the v36 reshape below, so `led` is still the flat v1 object.)
  const legacyLed = input.led as LegacyRecord | undefined;
  if (version < 16 && legacyLed && legacyLed.brightness === 5) {
    legacyLed.brightness = 3;
  }

  // v16 → v17: Bloom became lens bloom and its defaults changed - intensity
  // 0.95 → 0.6 (the old 0.95 default was overkill against the new additive
  // layers) and colorMode "solid" → "prop-matched". A persisted value equal to
  // the OLD default is that default echoing back, not a user choice (same logic
  // as the v16 LED remap), so remap each independently. Users who picked any
  // other intensity / a non-solid mode keep their setting. The new streak,
  // spikes, and afterglow fields resolve from defaults via the merge below.
  if (version < 17 && input.bloom) {
    if (input.bloom.intensity === 0.95) input.bloom.intensity = 0.6;
    if (input.bloom.colorMode === "solid")
      input.bloom.colorMode = "prop-matched";
  }

  // v17 → v18: zap gains a `style` selector ("branching" | "plasma" | "web").
  // Net-new field, no migration code - absent style resolves to
  // DEFAULT_EFFECTS_CONFIG.zap.style ("branching") via the merge below. The
  // legacy `mode` field is retained but no longer drives rendering.

  // v18 → v19: echo becomes a luminous stroboscope - gains glow/depth/flash.
  // Net-new fields, no migration code - absent values resolve to
  // DEFAULT_EFFECTS_CONFIG.echo (glow 0.6, depth 0.5, flash 0.5) via the merge.

  // v19 → v20: pulse becomes a pressure shockwave - gains velocityScale/
  // asymmetry/chromatic/flash/harmonics (net-new, resolve from defaults via the
  // merge), and its default `style` flips "stroke" → "glow" (the rich gradient
  // front). A persisted value equal to the OLD default ("stroke") is that
  // default echoing back, not a user choice (same logic as the v17 bloom remap),
  // so remap it; a user who deliberately set glow (or stroke after this ships) is
  // left alone.
  if (version < 20 && input.pulse && input.pulse.style === "stroke") {
    input.pulse.style = "glow";
  }

  // v20 → v21: 2D petals adopt the airstream motion model — petals add
  // `carry` (velocity inherited from the prop tip) and `streakLength` (how
  // long that motion lingers). Both net-new; absent values resolve to
  // DEFAULT_EFFECTS_CONFIG.petals (carry 0.55, streakLength 0.4) via the merge
  // below. `swayAmplitude` is retained for the untouched 3D petal path. No
  // field mutation needed.

  // v21 → v22: fire gains `brightness` (HDR core glow, the bloom-blowout
  // lever, distinct from intensity). Net-new field; absent values resolve to
  // DEFAULT_EFFECTS_CONFIG.fire.brightness (1.0) via the merge below.

  // v22 → v23: silk gains a serpent form — form/creature/bodyLength/slither.
  // Net-new fields; absent values resolve to DEFAULT_EFFECTS_CONFIG.silk
  // (form "ribbon", creature "snake", bodyLength 0.5, slither 0.5) via the merge
  // below, so every persisted silk config keeps its velocity ribbon.

  // v23 → v24: zap gains tunable plasma wobble + glow/jitter —
  // wobbleRate/wobbleAmount/glow/jitter. Net-new fields; absent values resolve
  // to DEFAULT_EFFECTS_CONFIG.zap (wobbleRate 0.18, wobbleAmount 0.5, glow 0.5,
  // jitter 0.5) via the merge below. The old plasma wobble was a hardcoded
  // per-frame random; these make it a smooth controllable undulation.

  // v24 → v25: echo becomes a long-exposure strobe — clones are stamped into a
  // persistent accumulation buffer instead of cleared/redrawn every frame, and
  // it gains `streak` (the connective body-to-body thread between clones).
  // Net-new field; absent values resolve to DEFAULT_EFFECTS_CONFIG.echo.streak
  // (0.35) via the merge below. `decay`/`depth` keep their stored numbers — only
  // the renderer's interpretation changes (exposure length / falloff steepness),
  // so no field mutation is needed.

  // v25 → v26: echo pivots to the swept-prop mandala — it stamps the whole staff
  // body across the loop, accumulating the prop's swept figure, which locks +
  // blooms on loop close. `colorMode` default flips "solid" → "prop-matched"
  // (blue/red per hand). A persisted "solid" is the old default echoing back
  // (same logic as the v17 bloom / v20 pulse remaps), so remap it; a deliberate
  // solid set after this ships is left alone. decay → persistence, depth → core,
  // flash → lock-bloom (reinterpreted, no field mutation); interval/shape/streak
  // go unused but stay for config stability.
  if (version < 26 && input.echo && input.echo.colorMode === "solid") {
    input.echo.colorMode = "prop-matched";
  }

  // v26 → v27: the realistic "water" droplet effect is renamed to "goo" (a
  // viscous luminous metaball liquid). Mirror the v6 motion→echo rename — move
  // the config block, rewrite tipEffectMap + activePresets keys, and remap
  // activeEffect — so persisted configs and saved sequences keep firing the
  // effect under its new id instead of silently dropping it.
  if (version < 27) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy water key not in current shape
    const anyInput = input as any;
    if (anyInput.water && !anyInput.goo) anyInput.goo = anyInput.water;
    delete anyInput.water;
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (entry?.effect === "water") entry.effect = "goo";
      }
    }
    if (anyInput.activePresets && "water" in anyInput.activePresets) {
      const presets = anyInput.activePresets as Record<string, unknown>;
      if (presets.goo == null) presets.goo = presets.water;
      delete presets.water;
      // Preset ids were "water-*"; rename the persisted active id to "goo-*"
      // so the chosen look stays highlighted after the rename.
      if (typeof presets.goo === "string" && presets.goo.startsWith("water-")) {
        presets.goo = "goo-" + presets.goo.slice("water-".length);
      }
    }
    if (anyInput.activeEffect === "water") anyInput.activeEffect = "goo";
  }

  // v27 → v28: echo is rebuilt as a decaying prop onion-skin (it ghosts the real
  // prop sprite at past poses, fading out — no persistent figure). The old
  // swept-prop fields (shape/colorMode/color/thickness/glow/depth/flash/streak)
  // have no meaning in the new model, so strip echo down to the three fields that
  // do: intensity, decay (Persistence), interval (now Density). The user's real
  // intensity/decay carry over; `interval` was UNUSED in every prior echo, so its
  // stored value is never a user choice — reseed it to the Density default.
  if (version < 28 && input.echo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy echo fields not in current shape
    const e = input.echo as Record<string, any>;
    input.echo = {
      intensity:
        typeof e.intensity === "number"
          ? e.intensity
          : DEFAULT_EFFECTS_CONFIG.ghost.intensity,
      decay:
        typeof e.decay === "number"
          ? e.decay
          : DEFAULT_EFFECTS_CONFIG.ghost.decay,
      interval: DEFAULT_EFFECTS_CONFIG.ghost.interval,
    };
  }

  // v28 → v29: echo is renamed to "ghost" (it ghosts the real prop sprite as a
  // decaying onion-skin). Mirror the v6 motion→echo / v27 water→goo renames —
  // move the config block, rewrite tipEffectMap + activePresets keys (and any
  // echo-* preset id → ghost-*), and remap activeEffect — so persisted configs
  // and saved sequences keep firing the effect under its new id.
  if (version < 29) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy echo key not in current shape
    const anyInput = input as any;
    if (anyInput.echo && !anyInput.ghost) anyInput.ghost = anyInput.echo;
    delete anyInput.echo;
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (entry?.effect === "echo") entry.effect = "ghost";
      }
    }
    if (anyInput.activePresets && "echo" in anyInput.activePresets) {
      const presets = anyInput.activePresets as Record<string, unknown>;
      if (presets.ghost == null) presets.ghost = presets.echo;
      delete presets.echo;
      if (
        typeof presets.ghost === "string" &&
        presets.ghost.startsWith("echo-")
      ) {
        presets.ghost = "ghost-" + presets.ghost.slice("echo-".length);
      }
    }
    if (anyInput.activeEffect === "echo") anyInput.activeEffect = "ghost";
  }

  // v29 → v30: split silk's serpent form into a standalone "animal" effect
  // (snake/dragon/caterpillar), and retire "frost" from the roster. Mirrors the
  // motion→echo / water→goo / echo→ghost moves.
  if (version < 30) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyInput = input as any;

    // 1. Silk serpent → animal. silk.form is global, so a serpent form means
    //    every silk-assigned tip was rendering the creature.
    const silk = anyInput.silk as Record<string, any> | undefined;
    const wasSerpent = silk?.form === "serpent";
    if (wasSerpent) {
      anyInput.animal ??= {
        creature: silk!.creature ?? "snake",
        palette: silk!.palette ?? "velvet",
        customColor: silk!.customColor ?? "#600018",
        intensity: typeof silk!.intensity === "number" ? silk!.intensity : 0.85,
        width: typeof silk!.width === "number" ? silk!.width : 0.55,
        bodyLength:
          typeof silk!.bodyLength === "number" ? silk!.bodyLength : 0.55,
        slither: typeof silk!.slither === "number" ? silk!.slither : 0.55,
        trackingMode: silk!.trackingMode ?? "right_end",
      };
      // Reset silk to ribbon — drop the serpent-only fields (SilkIntent no longer
      // has them, so the merge reseeds silk's own defaults).
      delete silk!.form;
      delete silk!.creature;
      delete silk!.bodyLength;
      delete silk!.slither;
    }
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (wasSerpent && entry?.effect === "silk") entry.effect = "animal";
      }
    }
    if (anyInput.activePresets) {
      const presets = anyInput.activePresets as Record<string, any>;
      if (
        wasSerpent &&
        typeof presets.silk === "string" &&
        presets.silk.startsWith("silk-")
      ) {
        // silk-serpent → animal-serpent, silk-dragon → animal-dragon.
        const suffix = presets.silk.slice("silk-".length);
        if (suffix === "serpent" || suffix === "dragon") {
          presets.animal = "animal-" + suffix;
          delete presets.silk;
        }
      }
    }
    if (wasSerpent && anyInput.activeEffect === "silk")
      anyInput.activeEffect = "animal";

    // 2. Retire frost — neutralize persisted usage so nothing points at a dead
    //    effect. Frost config block + default stay dormant (deletion deferred).
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (entry?.effect === "frost") delete (input.tipEffectMap as any)[key];
      }
    }
    if (anyInput.activePresets && "frost" in anyInput.activePresets) {
      delete (anyInput.activePresets as Record<string, any>).frost;
    }
    if (anyInput.activeEffect === "frost") anyInput.activeEffect = "none";
  }

  // v30 → v31: the animal effect briefly shipped (interim dev builds only) under
  // the id "menagerie" before being renamed to "animal". Self-heal any persisted
  // "menagerie" so it doesn't point at a dead effect. No-op for configs that
  // never saw the interim id.
  if (version < 31) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyInput = input as any;
    if (anyInput.menagerie && !anyInput.animal)
      anyInput.animal = anyInput.menagerie;
    delete anyInput.menagerie;
    if (input.tipEffectMap) {
      for (const key of Object.keys(input.tipEffectMap)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (input.tipEffectMap as any)[key] as
          | Record<string, any>
          | undefined;
        if (entry?.effect === "menagerie") entry.effect = "animal";
      }
    }
    if (anyInput.activePresets) {
      const presets = anyInput.activePresets as Record<string, any>;
      if (typeof presets.menagerie === "string") {
        presets.animal = presets.menagerie.replace(/^menagerie-/, "animal-");
      }
      delete presets.menagerie;
    }
    if (anyInput.activeEffect === "menagerie") anyInput.activeEffect = "animal";
  }

  // v31 → v32 seeded Ghost-owned hand colors. v39 retires them again (below),
  // so there is nothing to seed.

  // v32 → v33: Fire can preserve the original broad liquid presentation as a
  // named preset. Existing looks remain on the current natural Fire default.
  if (version < 33 && input.fire) {
    const fire = input.fire as LegacyRecord;
    fire.renderingStyle ??= "natural";
  }

  // v33 → v34: Bloom separates the live white source from its colored halo.
  // Saved looks gain the restrained factory source, and the retired Ring
  // falloff resolves to Smooth instead of preserving the target-like center.
  if (version < 34 && input.bloom) {
    const bloom = input.bloom as LegacyRecord;
    bloom.coreStrength ??= DEFAULT_EFFECTS_CONFIG.bloom.coreStrength;
    if (bloom.falloff === "ring") bloom.falloff = "smooth";
  }

  // v34 → v35: retire Bloom's Aurora preset and its dispersion field. Clear a
  // saved Aurora selection so the UI does not retain a dead preset id.
  if (input.bloom) delete input.bloom.chromatic;
  if (input.activePresets?.bloom === "bloom-prism") {
    input.activePresets = { ...input.activePresets, bloom: null };
  }

  // v35 → v36: the LED effect becomes a physical prop simulator - a device
  // plus a strip pattern - instead of a flat pattern id with loose colors.
  // migrateLedConfig is total, so any stored shape resolves to a usable v2.
  if (version < 36) {
    input.led = migrateLedConfig(input.led);
    if (input.activePresets?.led) {
      // The v1 preset ids name patterns that no longer exist.
      input.activePresets = { ...input.activePresets, led: null };
    }
  }

  // v36 → v37: the factory trail narrows by one pixel so it supports the prop
  // path instead of covering the mandala beneath it. Only the former factory
  // width moves; deliberate thinner or thicker choices stay untouched.
  if (version < 37 && input.trails?.thickness === 5) {
    input.trails = {
      ...input.trails,
      thickness: DEFAULT_EFFECTS_CONFIG.trails.thickness,
    };
  }

  // v37 → v38: effect intent follows physical hand identity. Keep reading the
  // literal prop-color keys saved before the terminology migration.
  if (version < 38) {
    if (input.trails) {
      input.trails = normalizeLegacyEffectIntentColors("trails", input.trails);
    }
  }

  // v38 → v39: Ghost draws each prop's own texture and colors, so its saved
  // hand colors (either spelling) no longer mean anything.
  if (version < 39 && input.ghost) {
    input.ghost = normalizeLegacyEffectIntentColors("ghost", input.ghost);
  }

  const out: EffectsConfig = {
    ...DEFAULT_EFFECTS_CONFIG,
    ...input,
    trails: { ...DEFAULT_EFFECTS_CONFIG.trails, ...(input.trails ?? {}) },
    fire: { ...DEFAULT_EFFECTS_CONFIG.fire, ...(input.fire ?? {}) },
    led: migrateLedConfig(input.led ?? DEFAULT_EFFECTS_CONFIG.led),
    charcoal: { ...DEFAULT_EFFECTS_CONFIG.charcoal, ...(input.charcoal ?? {}) },
    zap: { ...DEFAULT_EFFECTS_CONFIG.zap, ...(input.zap ?? {}) },
    sparkles: { ...DEFAULT_EFFECTS_CONFIG.sparkles, ...(input.sparkles ?? {}) },
    ghost: { ...DEFAULT_EFFECTS_CONFIG.ghost, ...(input.ghost ?? {}) },
    bloom: { ...DEFAULT_EFFECTS_CONFIG.bloom, ...(input.bloom ?? {}) },
    goo: { ...DEFAULT_EFFECTS_CONFIG.goo, ...(input.goo ?? {}) },
    bubbles: { ...DEFAULT_EFFECTS_CONFIG.bubbles, ...(input.bubbles ?? {}) },
    petals: { ...DEFAULT_EFFECTS_CONFIG.petals, ...(input.petals ?? {}) },
    smoke: { ...DEFAULT_EFFECTS_CONFIG.smoke, ...(input.smoke ?? {}) },
    ink: { ...DEFAULT_EFFECTS_CONFIG.ink, ...(input.ink ?? {}) },
    frost: { ...DEFAULT_EFFECTS_CONFIG.frost, ...(input.frost ?? {}) },
    silk: {
      ...DEFAULT_EFFECTS_CONFIG.silk,
      ...(input.silk ?? {}),
      intensity: clampSilkIntensity(input.silk?.intensity),
    },
    animal: { ...DEFAULT_EFFECTS_CONFIG.animal, ...(input.animal ?? {}) },
    pulse: { ...DEFAULT_EFFECTS_CONFIG.pulse, ...(input.pulse ?? {}) },
    activePresets: {
      ...DEFAULT_EFFECTS_CONFIG.activePresets,
      ...(input.activePresets ?? {}),
    },
    version: EFFECTS_CONFIG_VERSION,
  };

  return out;
}
