/**
 * Canonical effects config state (Svelte 5 runes).
 *
 * This is the factory - consumers create an instance per context
 * (sequence viewer, export panel, etc.) and distribute via
 * effects-config-context.ts. See the state-management rule for why
 * we use factories + context rather than module-level singletons.
 */

import type {
  EffectsConfig,
  EffectType,
  TrailsIntent,
  FireIntent,
  LedIntent,
  CharcoalIntent,
  ZapIntent,
  SparklesIntent,
  GhostIntent,
  BloomIntent,
  GooIntent,
  BubblesIntent,
  PetalsIntent,
  SmokeIntent,
  InkIntent,
  FrostIntent,
  SilkIntent,
  AnimalIntent,
  PulseIntent,
} from "../domain/effects-config";
import { clampSilkIntensity } from "../domain/effects-config";

export interface EffectConfigMap {
  trails: TrailsIntent;
  fire: FireIntent;
  led: LedIntent;
  charcoal: CharcoalIntent;
  zap: ZapIntent;
  sparkles: SparklesIntent;
  ghost: GhostIntent;
  bloom: BloomIntent;
  goo: GooIntent;
  bubbles: BubblesIntent;
  petals: PetalsIntent;
  smoke: SmokeIntent;
  ink: InkIntent;
  frost: FrostIntent;
  silk: SilkIntent;
  animal: AnimalIntent;
  pulse: PulseIntent;
}
import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";
import {
  migrateEffectsConfig,
  normalizeLegacyEffectIntentColors,
} from "../domain/migrations";
import { migrateLedConfig } from "$lib/shared/animation-engine/domain/types/led-config-migration";
import {
  getDefaultEffectLayer,
  type EffectLayerMode,
} from "../domain/effect-layer-policy";
import { getSceneUndoManager } from "$lib/shared/3d/undo/get-scene-undo-manager";
import { charcoalParamsToSemantic } from "$lib/shared/animation-engine/domain/types/charcoal-spark-types";

const STORAGE_KEY = "tka_effects_config";
/**
 * Canonical localStorage key for the persisted effects config. Exported so
 * pre-open seams (e.g. tunnel-collection's openTunnelInViewer) can write a
 * config that a freshly-constructed `persist:true` instance boots with —
 * `createEffectsConfigState()` reads this key via `loadStoredConfig()` on
 * construct. Single source of truth; do not re-hardcode the string.
 */
export const EFFECTS_CONFIG_STORAGE_KEY = STORAGE_KEY;
const BASELINE_KEY = "tka_effects_baseline";
/** Per-effect custom-look snapshots (the Custom chip's target). */
const CUSTOM_KEY = "tka_effects_custom";
/** Flag marking the one-time clear of the polluted v1 custom data. */
const CUSTOM_CLEAN_FLAG = "tka_effects_custom_clean";
const VM_STORAGE_KEY = "animation-visibility-settings";

const EFFECT_IDS = [
  "trails",
  "fire",
  "led",
  "charcoal",
  "zap",
  "sparkles",
  "ghost",
  "bloom",
  "goo",
  "bubbles",
  "petals",
  "smoke",
  "ink",
  "frost",
  "silk",
  "animal",
  "pulse",
] as const;

/** One of the 16 concrete effect ids — `EffectType` minus "none". */
export type EffectId = (typeof EFFECT_IDS)[number];

/** Narrows an arbitrary string to a known effect id (the const-tuple union). */
export function isEffectId(value: string): value is EffectId {
  return (EFFECT_IDS as readonly string[]).includes(value);
}

function normalizeEffectIntent(effectId: string, intent: unknown): unknown {
  if (intent === null || typeof intent !== "object") {
    return intent;
  }
  if (effectId === "silk") {
    const silk = intent as SilkIntent;
    return { ...silk, intensity: clampSilkIntensity(silk.intensity) };
  }
  if (effectId === "bloom") {
    const bloom = intent as Partial<BloomIntent>;
    return {
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      ...bloom,
      falloff:
        bloom.falloff === "ring"
          ? "smooth"
          : (bloom.falloff ?? DEFAULT_EFFECTS_CONFIG.bloom.falloff),
    };
  }
  return intent;
}

function normalizeEffectsConfig(next: EffectsConfig): EffectsConfig {
  return {
    ...next,
    bloom: normalizeEffectIntent("bloom", next.bloom) as BloomIntent,
    silk: normalizeEffectIntent("silk", next.silk) as SilkIntent,
  };
}

/**
 * Legacy effect keys the VM overlay consumes. Stripped from the VM entry
 * after migration — the visibility manager re-serializes unknown keys
 * (`{...defaults, ...parsed}` then full-object save), so without stripping
 * these never age out and the overlay re-imposes stale values on EVERY
 * load, silently clobbering the user's effects-config changes.
 */
const LEGACY_VM_EFFECT_KEYS = [
  "fireIntensity",
  "fireColorBlend",
  "fireTurbulence",
  "fireColorCurve",
  "firePropColors",
  "ledBrightness",
  "ledPatternId",
  "ledPatternSpeed",
  "ledPrimaryColor",
  "ledSecondaryColor",
  "ledColorMode",
  "ledActivePresetId",
  "ledUserPresets",
  "charcoalParams",
  "tipEffectMap",
  "effectLayerOverrides",
] as const;

/**
 * One-time migration from the old VM localStorage key.
 * If the user has non-default fire/LED/charcoal/tipEffectMap/effectLayerOverrides
 * persisted under the VM key but missing from the new EffectsConfig key, snapshot
 * them into the config once, then strip the consumed keys from the VM entry
 * so this genuinely runs once.
 */
function migrateFromVmStorageOnce(config: EffectsConfig): EffectsConfig {
  if (typeof window === "undefined") return config;
  try {
    const vmRaw = localStorage.getItem(VM_STORAGE_KEY);
    if (!vmRaw) return config;
    const vm = JSON.parse(vmRaw);
    const migrated = { ...config };

    // Fire
    if (vm.fireIntensity !== undefined) {
      migrated.fire = {
        ...migrated.fire,
        intensity: vm.fireIntensity ?? migrated.fire.intensity,
        colorBlend: vm.fireColorBlend ?? migrated.fire.colorBlend,
        turbulence: vm.fireTurbulence ?? migrated.fire.turbulence,
        colorCurve: vm.fireColorCurve ?? migrated.fire.colorCurve,
        propColors: vm.firePropColors ?? migrated.fire.propColors,
      };
    }

    // LED
    if (vm.ledPatternId !== undefined) {
      // The VM keys are v1-shaped; run them through the same total v1→v2
      // migration the versioned chain uses, then keep the current look for
      // anything the VM overlay did not carry.
      migrated.led = migrateLedConfig({
        ...migrated.led.look,
        ...(vm.ledBrightness !== undefined
          ? { brightness: vm.ledBrightness }
          : {}),
        patternId: vm.ledPatternId,
        patternSpeed: vm.ledPatternSpeed,
        primaryColor: vm.ledPrimaryColor,
        secondaryColor: vm.ledSecondaryColor,
        colorMode: vm.ledColorMode,
      });
    }

    // Charcoal — VM stores raw CharcoalSparkParams; convert to semantic scalars
    if (vm.charcoalParams) {
      const semantic = charcoalParamsToSemantic(vm.charcoalParams);
      migrated.charcoal = { ...migrated.charcoal, ...semantic };
    }

    // tipEffectMap
    if (vm.tipEffectMap && Object.keys(vm.tipEffectMap).length > 0) {
      migrated.tipEffectMap = vm.tipEffectMap;
    }

    // effectLayerOverrides
    if (
      vm.effectLayerOverrides &&
      Object.keys(vm.effectLayerOverrides).length > 0
    ) {
      migrated.effectLayerOverrides = vm.effectLayerOverrides;
    }

    // activeEffect — derive from tipEffectMap wildcard
    const wildcard = migrated.tipEffectMap["*"];
    if (wildcard) {
      migrated.activeEffect = wildcard.effect as typeof migrated.activeEffect;
    }

    // Strip the consumed legacy keys so the overlay can't re-impose stale
    // values on future loads. The effects-config key is canonical from here.
    let stripped = false;
    for (const key of LEGACY_VM_EFFECT_KEYS) {
      if (key in vm) {
        delete vm[key];
        stripped = true;
      }
    }
    if (stripped) {
      try {
        localStorage.setItem(VM_STORAGE_KEY, JSON.stringify(vm));
      } catch {
        /* quota exceeded or private browsing */
      }
    }

    return migrated;
  } catch {
    return config;
  }
}

function loadStoredConfig(): EffectsConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EffectsConfig>;
    const storedVersion =
      typeof parsed.version === "number" ? parsed.version : 1;
    // Versioned migration chain FIRST — it needs the raw legacy field shapes
    // (e.g. v2 zap.color) before any default-merge injects current-shape
    // fields. It also merges defaults and stamps the current version.
    const migrated = migrateEffectsConfig(parsed);
    // Then the one-time legacy VM-key overlay (strips the keys it consumes).
    const withVm = migrateFromVmStorageOnce(migrated);
    // The VM key predates config versioning entirely, so a VM-supplied
    // brightness 5 is the same stale pre-v16 default — apply the v16 remap
    // to the overlaid value too.
    if (storedVersion < 16 && withVm.led.look.brightness === 5) {
      withVm.led = {
        ...withVm.led,
        look: { ...withVm.led.look, brightness: 3 },
      };
    }
    return withVm;
  } catch {
    return null;
  }
}

/**
 * Per-effect personal-default snapshots persisted under CUSTOM_KEY. A plain
 * `Record<effectId, intent>`; absent or malformed → null (seed from config).
 */
function loadStoredPersonalDefaults(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * One-time clear of the v1 `tka_effects_custom` data. The first cut auto-seeded
 * the Custom slot from the live config, so a *selected* preset (e.g. Neon) leaked
 * in as "your custom". Discard it once so the Custom chip starts genuinely empty.
 */
function cleanPollutedCustomDataOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(CUSTOM_CLEAN_FLAG)) return;
    localStorage.removeItem(CUSTOM_KEY);
    localStorage.setItem(CUSTOM_CLEAN_FLAG, "1");
  } catch {
    /* quota exceeded or private browsing */
  }
}

export function createEffectsConfigState(
  initial: EffectsConfig = DEFAULT_EFFECTS_CONFIG,
  options: { persist?: boolean } = {}
) {
  // persist:false → fully isolated instance (no read from / write to the shared
  // tka_effects_config key). For ephemeral surfaces (tunnel/effects judges,
  // landing previews) that must not clobber the user's global effects config.
  const persist = options.persist ?? true;
  const stored = persist ? loadStoredConfig() : null;
  // The VM-key migration reads and rewrites the viewer's shared
  // `animation-visibility-settings` entry, so non-persisted instances skip it.
  let config = $state<EffectsConfig>(
    normalizeEffectsConfig(
      stored ??
        (persist
          ? migrateFromVmStorageOnce(
              migrateEffectsConfig(structuredClone(initial))
            )
          : migrateEffectsConfig(structuredClone(initial)))
    )
  );
  let version = $state(0);
  // Transient, never-persisted hover-intent signal: "the user is about to make
  // this effect active — warm its renderer now." Sibling to activeEffect; read
  // by the canvas layer to call engine.prewarmEffect(). Not part of the config
  // schema, so serialize/replace ignore it.
  let prewarmHint = $state<EffectType | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let defaultsTimer: ReturnType<typeof setTimeout> | null = null;
  const sceneUndo = getSceneUndoManager();

  // registerDomain replaces the previous "effects" handler on the shared undo
  // manager, so only the persisted instance registers; otherwise the last card
  // preview to mount would become the app-wide effects undo target.
  if (persist) {
    sceneUndo.registerDomain("effects", {
      capture: () => {
        try {
          return structuredClone(config);
        } catch {
          return JSON.parse(JSON.stringify(config));
        }
      },
      restore: (snapshot) => {
        try {
          config = normalizeEffectsConfig(structuredClone(snapshot));
        } catch {
          config = normalizeEffectsConfig(JSON.parse(JSON.stringify(snapshot)));
        }
        version++;
        scheduleSave();
      },
    });
  }

  function scheduleSave() {
    version++;
    if (!persist) return; // ephemeral instance: bump reactivity, never touch storage
    if (typeof window === "undefined") return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch {
        /* quota exceeded or private browsing */
      }
    }, 300);
  }

  /** Debounced persist of the personal-default map (separate from the live config). */
  function persistPersonalDefaults() {
    if (!persist) return; // ephemeral instance: in-memory only
    if (typeof window === "undefined") return;
    if (defaultsTimer) clearTimeout(defaultsTimer);
    defaultsTimer = setTimeout(() => {
      try {
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(personalDefaults));
      } catch {
        /* quota exceeded or private browsing */
      }
    }, 300);
  }

  const cloneOne = <T>(v: T): T => {
    try {
      return structuredClone(v);
    } catch {
      return JSON.parse(JSON.stringify(v));
    }
  };

  // Per-effect Custom slot — "your last-modified look". Auto-captured on every
  // manual updateEffect (NOT applyPreset / restorePersonalDefault / resetToFactory)
  // and is the target of the Custom chip. Persisted under CUSTOM_KEY so it survives
  // reload. Starts EMPTY (null) — seeded ONLY from the persisted store, never from
  // the live config, so a *selected* preset never leaks in as "your custom". The
  // chip stays disabled until the first real edit populates a slot.
  // Spec: docs/superpowers/specs/2026-06-27-custom-chip-design.md
  if (persist) cleanPollutedCustomDataOnce();
  const storedDefaults = persist ? loadStoredPersonalDefaults() : null;
  const personalDefaults = $state<Record<string, unknown>>({});
  for (const id of EFFECT_IDS) {
    const stored = storedDefaults?.[id];
    personalDefaults[id] =
      stored != null
        ? normalizeEffectIntent(
            id,
            normalizeLegacyEffectIntentColors(id, cloneOne(stored))
          )
        : null;
  }

  // Heal stale trail colours. The retired trail "Custom" preset seeded magenta/
  // violet defaults (#8b5cf6 / #ec4899) that leaked into some persisted configs,
  // so the trail Default chip showed magenta+blue instead of the matched red/blue.
  // Reset that exact leaked pair (live config + personal default) to the factory
  // colours. Idempotent; only the leaked pair is touched, never a real colour pick.
  function healStaleTrailColors(
    t: { leftColor?: string; rightColor?: string } | undefined | null
  ): boolean {
    if (t && t.leftColor === "#8b5cf6" && t.rightColor === "#ec4899") {
      t.leftColor = DEFAULT_EFFECTS_CONFIG.trails.leftColor;
      t.rightColor = DEFAULT_EFFECTS_CONFIG.trails.rightColor;
      return true;
    }
    return false;
  }
  const healedConfig = healStaleTrailColors(
    config.trails as { leftColor?: string; rightColor?: string }
  );
  const healedDefault = healStaleTrailColors(
    personalDefaults.trails as { leftColor?: string; rightColor?: string }
  );
  if (persist && healedConfig) scheduleSave();
  if (persist && healedDefault) persistPersonalDefaults();

  /** Structural deep-equality for effect intents (scalars, string arrays, shallow objects). */
  function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (
      a === null ||
      b === null ||
      typeof a !== "object" ||
      typeof b !== "object"
    )
      return false;
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }

  function updateEffect<K extends keyof EffectConfigMap>(
    effectId: K,
    patch: Partial<EffectConfigMap[K]>
  ) {
    if (!isEffectId(effectId)) {
      throw new Error(`Unknown effect id: "${effectId}"`);
    }
    sceneUndo.captureState("update-effect-config", `Update ${effectId}`);
    // The keyed config write is a genuine TS mapped-type limitation: indexing
    // config by the generic K and merging Partial<EffectConfigMap[K]> can't be
    // expressed without widening, so the cast stays here (and at applyPreset).
    (config as unknown as Record<string, unknown>)[effectId] =
      normalizeEffectIntent(effectId, {
        ...(config as unknown as Record<string, EffectConfigMap[K]>)[effectId],
        ...patch,
      });
    config.activePresets[effectId as keyof typeof config.activePresets] = null;
    // A manual edit IS the user's personal default — capture and persist it.
    personalDefaults[effectId] = cloneOne(
      (config as unknown as Record<string, unknown>)[effectId]
    );
    scheduleSave();
    persistPersonalDefaults();
    sceneUndo.commitStateCoalescing(`effects-${effectId}`);
  }

  /** The effect's personal default ("your look"), or null if none seeded. */
  function personalDefault<K extends keyof EffectConfigMap>(
    id: K
  ): EffectConfigMap[K] | null {
    return (personalDefaults[id] as EffectConfigMap[K] | undefined) ?? null;
  }

  /** True once this effect's personal default differs from the factory original. */
  function hasCustom(id: keyof EffectConfigMap): boolean {
    const snap = personalDefaults[id];
    if (snap == null) return false;
    return !deepEqual(
      snap,
      (DEFAULT_EFFECTS_CONFIG as unknown as Record<string, unknown>)[id]
    );
  }

  /** Restore this effect's personal default (the Default chip). No-op without one. */
  function restorePersonalDefault<K extends keyof EffectConfigMap>(id: K) {
    if (!isEffectId(id)) return;
    const snap = personalDefaults[id];
    if (snap == null) return;
    sceneUndo.captureState("restore-custom-effect", `Restore ${id}`);
    (config as unknown as Record<string, unknown>)[id] = normalizeEffectIntent(
      id,
      cloneOne(snap)
    );
    config.activePresets[id as keyof typeof config.activePresets] = null;
    scheduleSave();
    sceneUndo.commitState();
  }

  const factoryOf = (id: string) =>
    cloneOne(
      (DEFAULT_EFFECTS_CONFIG as unknown as Record<string, unknown>)[id]
    );

  /**
   * Reset one effect to the factory original (the buried escape hatch). Also
   * wipes its personal default back to factory, so a later Default click can't
   * resurrect the discarded tuning.
   */
  function resetToFactory<K extends keyof EffectConfigMap>(id: K) {
    if (!isEffectId(id)) return;
    sceneUndo.captureState("reset-effect-default", `Reset ${id} to factory`);
    (config as unknown as Record<string, unknown>)[id] = factoryOf(id);
    personalDefaults[id] = factoryOf(id);
    config.activePresets[id as keyof typeof config.activePresets] = null;
    scheduleSave();
    persistPersonalDefaults();
    sceneUndo.commitState();
  }

  /** Reset every effect to the factory original (the global nuke). One undo entry. */
  function resetAllToFactory() {
    sceneUndo.captureState("reset-all-effects", "Reset all effects to factory");
    for (const id of EFFECT_IDS) {
      (config as unknown as Record<string, unknown>)[id] = factoryOf(id);
      personalDefaults[id] = factoryOf(id);
      config.activePresets[id as keyof typeof config.activePresets] = null;
    }
    scheduleSave();
    persistPersonalDefaults();
    sceneUndo.commitState();
  }

  function setActiveEffect(effect: EffectType) {
    sceneUndo.captureState("set-active-effect", "Set active effect");
    if (effect === "none") {
      config.activeEffect = "none";
      config.tipEffectMap = {};
    } else {
      config.activeEffect = effect;
      config.tipEffectMap = { "*": { effect } };
    }
    scheduleSave();
    sceneUndo.commitState();
  }

  /** Hover-intent: ask the canvas layer to warm this effect's renderer ahead of
   *  a click. Setting a new value retriggers the canvas $effect; re-warming an
   *  already-warm renderer is a no-op downstream, so spamming this is cheap. */
  function requestPrewarm(effect: EffectType) {
    prewarmHint = effect;
  }

  function getEffectLayer(effectId: string): EffectLayerMode {
    return (
      config.effectLayerOverrides[effectId] ?? getDefaultEffectLayer(effectId)
    );
  }

  function setEffectLayer(effectId: string, mode: EffectLayerMode) {
    if (mode === getDefaultEffectLayer(effectId)) {
      const { [effectId]: _omit, ...rest } = config.effectLayerOverrides;
      config.effectLayerOverrides = rest;
    } else {
      config.effectLayerOverrides = {
        ...config.effectLayerOverrides,
        [effectId]: mode,
      };
    }
    scheduleSave();
  }

  function setTipEffectMap(map: TipEffectMap) {
    sceneUndo.captureState("toggle-effect", "Toggle tip effects");
    config.tipEffectMap = map;
    scheduleSave();
    sceneUndo.commitState();
  }

  /**
   * Apply a named preset: shallow-merge its intent patch over the one effect
   * it targets, mark the chip active, and record exactly ONE undo entry. The
   * patch only ever touches a single effect's intent (presets never span
   * effects), so a per-effect shallow merge is the correct depth — same as
   * updateEffect.
   */
  function applyPreset<K extends keyof EffectConfigMap>(
    effectType: K,
    presetId: string,
    patch: Partial<EffectConfigMap[K]>
  ) {
    sceneUndo.captureState("apply-effect-preset", `Apply ${effectType} preset`);
    // Same generic mapped-type limitation as updateEffect — see comment there.
    (config as unknown as Record<string, unknown>)[effectType] =
      normalizeEffectIntent(effectType, {
        ...(config as unknown as Record<string, EffectConfigMap[K]>)[
          effectType
        ],
        ...patch,
      });
    config.activePresets[effectType as keyof typeof config.activePresets] =
      presetId;
    scheduleSave();
    sceneUndo.commitState();
  }

  function replace(next: EffectsConfig) {
    try {
      config = normalizeEffectsConfig(
        migrateEffectsConfig(structuredClone(next))
      );
    } catch {
      config = normalizeEffectsConfig(
        migrateEffectsConfig(JSON.parse(JSON.stringify(next)))
      );
    }
    scheduleSave();
  }

  // Explicit "this is my normal" snapshot, separate from the live auto-save.
  // Persisted instances also mirror it to localStorage so it survives reload;
  // ephemeral instances keep it in memory only.
  let baselineMem: EffectsConfig | null = null;

  function cloneConfig(c: EffectsConfig): EffectsConfig {
    try {
      return structuredClone(c);
    } catch {
      return JSON.parse(JSON.stringify(c));
    }
  }

  /** Promote the current tuning to the baseline (what Reset returns to). */
  function saveAsBaseline() {
    const snap = cloneConfig(config);
    baselineMem = snap;
    if (persist && typeof window !== "undefined") {
      try {
        localStorage.setItem(BASELINE_KEY, JSON.stringify(snap));
      } catch {
        /* quota exceeded or private browsing */
      }
    }
  }

  /** Restore the saved baseline, or factory defaults when none was saved. */
  function resetToBaseline() {
    let next = baselineMem;
    if (!next && persist && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(BASELINE_KEY);
        if (raw) next = migrateEffectsConfig(JSON.parse(raw));
      } catch {
        /* malformed/inaccessible baseline */
      }
    }
    replace(next ?? cloneConfig(DEFAULT_EFFECTS_CONFIG));
  }

  /** Detached copy of the full current config (transients like prewarmHint excluded by construction). */
  function snapshot(): EffectsConfig {
    try {
      return structuredClone($state.snapshot(config)) as EffectsConfig;
    } catch {
      return JSON.parse(JSON.stringify(config)) as EffectsConfig;
    }
  }

  return {
    get config() {
      return config;
    },
    get tipEffectMap() {
      return config.tipEffectMap;
    },
    get trails() {
      return config.trails;
    },
    get fire() {
      return config.fire;
    },
    get led() {
      return config.led;
    },
    get charcoal() {
      return config.charcoal;
    },
    get zap() {
      return config.zap;
    },
    get sparkles() {
      return config.sparkles;
    },
    get ghost() {
      return config.ghost;
    },
    get bloom() {
      return config.bloom;
    },
    get goo() {
      return config.goo;
    },
    get bubbles() {
      return config.bubbles;
    },
    get petals() {
      return config.petals;
    },
    get smoke() {
      return config.smoke;
    },
    get ink() {
      return config.ink;
    },
    get frost() {
      return config.frost;
    },
    get silk() {
      return config.silk;
    },
    get animal() {
      return config.animal;
    },
    get pulse() {
      return config.pulse;
    },
    get activePresets() {
      return config.activePresets;
    },
    get activeEffect() {
      return config.activeEffect;
    },
    get effectLayerOverrides() {
      return config.effectLayerOverrides;
    },
    get version() {
      return version;
    },
    get prewarmHint() {
      return prewarmHint;
    },

    effect<K extends keyof EffectConfigMap>(id: K): EffectConfigMap[K] {
      return (config as unknown as Record<string, unknown>)[
        id
      ] as EffectConfigMap[K];
    },

    updateEffect,
    setActiveEffect,
    requestPrewarm,
    getEffectLayer,
    setEffectLayer,
    setTipEffectMap,
    applyPreset,
    replace,
    saveAsBaseline,
    resetToBaseline,
    personalDefault,
    hasCustom,
    restorePersonalDefault,
    resetToFactory,
    resetAllToFactory,
    snapshot,
  };
}

export type EffectsConfigState = ReturnType<typeof createEffectsConfigState>;

/**
 * What a persist:true instance would boot with, for the URL layer's own-link
 * comparison. Null when nothing is stored. Mirrors the persist:true
 * constructor path exactly (`stored ?? ...` then `normalizeEffectsConfig`) by
 * delegating to the same private loader + normalize functions rather than
 * duplicating their logic.
 */
export function loadPersistedEffectsConfig(): EffectsConfig | null {
  const stored = loadStoredConfig();
  return stored ? normalizeEffectsConfig(stored) : null;
}
