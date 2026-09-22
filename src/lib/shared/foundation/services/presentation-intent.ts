import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  normalizeLegacyTrailSettings,
  type TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import type { EffectType } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import { EFFECT_LABELS } from "$lib/shared/effects/domain/effect-meta";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { migrateEffectsConfig } from "$lib/shared/effects/domain/migrations";
import type { EffectsConfig } from "$lib/shared/effects/domain/effects-config";
import type { CreatorIntent } from "$lib/shared/foundation/domain/models/creator-intent";
import type {
  EffectIntentKey,
  PresentationEffectsConfig,
  PresentationIntent,
  PresentationTrailSettings,
} from "$lib/shared/foundation/domain/models/presentation-intent";
import { safeClone } from "$lib/shared/foundation/utils/safe-clone";
import {
  resolveViewerCustomColorPair,
  type ViewerCustomColorPair,
} from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
import { normalizeHandHexColor } from "@tka/render-composition";

/** A fully populated look, ready to push into an animation scope. */
export interface ResolvedPresentationValue {
  primaryPropColors: ViewerCustomColorPair | null;
  trail: TrailSettings;
  effects: EffectsConfig;
}

export type ResolvedPresentation =
  | { kind: "recorded"; value: ResolvedPresentationValue }
  | { kind: "neutral" }
  | { kind: "absent" };

export interface PresentationSource {
  primaryPropColors: ViewerCustomColorPair | null | undefined;
  trail: TrailSettings;
  effects: EffectsConfig;
}

export interface PresentationSummary {
  /** Null means the theme's blue/red defaults. */
  colors: ViewerCustomColorPair | null;
  trailLabel: string;
  /** Distinct effect labels in first-seen order; empty when no tip has an effect. */
  effectLabels: string[];
}

const TRAIL_MODE_LABELS: Record<TrailMode, string> = {
  [TrailMode.OFF]: "No trail",
  [TrailMode.FADE]: "Fade trail",
  [TrailMode.LOOP_CLEAR]: "Loop-clear trail",
  [TrailMode.PERSISTENT]: "Persistent trail",
};

/**
 * Trail fields that make it into a saved presentation, in the exact order
 * they appear on `TrailSettings` minus `usePathCache`, `previewMode`, and
 * `additionalLayerColors` (workflow flags / tunnel-only data — see
 * PresentationTrailSettings). This is an allowlist, not a denylist: a stale
 * key the live trail object carries from old localStorage (e.g. `style`,
 * `glowEnabled` from a retired shape) is silently dropped instead of leaking
 * into Firestore and the public digest.
 */
const PRESENTATION_TRAIL_KEYS = [
  "mode",
  "effect",
  "fadeDurationMs",
  "maxPoints",
  "lineWidth",
  "glowBlur",
  "leftColor",
  "rightColor",
  "minOpacity",
  "maxOpacity",
  "trackingMode",
  "hideProps",
  "tailLength",
] as const satisfies readonly (keyof PresentationTrailSettings)[];

/**
 * Copy exactly the keys of `keys` off `obj`. Generic over a single type
 * parameter `K`, so both the read (`obj[key]`) and the write (`out[key]`)
 * resolve to the same opaque `T[K]` — unlike looping over a literal-union-typed
 * array inline, this lets TS verify the copy is sound without a cast.
 */
function pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}

/** Copy a single key from `from` to `to`, for callers that build the target
 * object field-by-field under a condition (see capturePresentation). Same
 * generic-`K` trick as `pick`. */
function copyKey<T, K extends keyof T>(from: T, to: Partial<T>, key: K): void {
  to[key] = from[key];
}

/** Copy only the allowlisted fields off a live trail object. */
function pickPresentationTrail(trail: TrailSettings): PresentationTrailSettings {
  return pick(trail, PRESENTATION_TRAIL_KEYS);
}

/**
 * Order tip-map keys: wildcard "*" first, then numeric tip indices in
 * ascending numeric order (so "2" sorts before "10", unlike a lexicographic
 * sort), then any other keys in their original insertion order.
 */
function orderedTipKeys(map: EffectsConfig["tipEffectMap"]): string[] {
  const keys = Object.keys(map ?? {});
  const rank = (key: string): [number, number] => {
    if (key === "*") return [0, 0];
    const n = Number(key);
    return Number.isInteger(n) && String(n) === key ? [1, n] : [2, 0];
  };
  return keys
    .map((key, index) => ({ key, index, rank: rank(key) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map((entry) => entry.key);
}

// EffectType ("none" + the 17 real effects) and EffectIntentKey (the same 17
// real effects, derived from EffectsConfig's own keys) must name the exact
// same set of effects minus "none". If a new effect is ever added to one
// union and not the other, this fails to compile instead of silently
// producing a Set the intent-key indexing below can't trust.
type _AssertEffectKeys = [Exclude<EffectType, "none">] extends [EffectIntentKey]
  ? [EffectIntentKey] extends [Exclude<EffectType, "none">]
    ? true
    : never
  : never;
true satisfies _AssertEffectKeys;

function referencedEffects(map: EffectsConfig["tipEffectMap"]): Set<EffectIntentKey> {
  const seen = new Set<EffectIntentKey>();
  const source = map ?? {};
  for (const key of orderedTipKeys(source)) {
    const assignment = source[key];
    if (assignment?.effect && assignment.effect !== "none") seen.add(assignment.effect);
  }
  return seen;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for anything shaped like a resolvable color pair; anything else
 * (missing fields, non-string values, arrays, primitives, or strings that
 * aren't valid hex colors) is not a pair we can trust and should resolve to
 * the theme default instead of guessing. `normalizeHandHexColor` returns the
 * fallback ("" here) for anything it can't parse as hex, so an empty result
 * on either hand marks the whole pair malformed. */
function isColorPairShape(value: unknown): value is { left: string; right: string } {
  if (!isRecord(value)) return false;
  return (
    normalizeHandHexColor(value.left, "") !== "" &&
    normalizeHandHexColor(value.right, "") !== ""
  );
}

/**
 * Drop own properties whose value is `undefined`. `normalizeLegacyTrailSettings`'s
 * `??=` fallbacks (e.g. `rightColor ??= redColor`) assign even when both sides are
 * nullish, leaving an explicit `rightColor: undefined` own-property on the result.
 * Spreading that object over DEFAULT_TRAIL_SETTINGS would then overwrite the
 * default with `undefined` instead of leaving it defaulted, so this must run
 * before the spread.
 */
function definedEntries<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Snapshot the live scene for storage. Pure: no store reads. Drops trail
 * workflow fields and every effect intent the tip map does not reference.
 */
export function capturePresentation(source: PresentationSource): PresentationIntent {
  const trail = safeClone(source.trail);
  const effects = safeClone(source.effects);
  const kept = referencedEffects(effects.tipEffectMap);
  const prunedEffects: PresentationEffectsConfig = {
    version: effects.version,
    tipEffectMap: effects.tipEffectMap,
    activePresets: effects.activePresets,
    activeEffect: effects.activeEffect,
    effectLayerOverrides: effects.effectLayerOverrides,
  };
  for (const key of kept) {
    if (effects[key] !== undefined) {
      copyKey(effects, prunedEffects, key);
    }
  }

  return {
    primaryPropColors: source.primaryPropColors
      ? resolveViewerCustomColorPair(source.primaryPropColors)
      : null,
    trail: pickPresentationTrail(trail),
    effects: prunedEffects,
  };
}

/** The single definition of what legacy and "default look" sequences show. */
export function neutralPresentation(): ResolvedPresentationValue {
  return {
    primaryPropColors: null,
    trail: safeClone(DEFAULT_TRAIL_SETTINGS),
    effects: safeClone(DEFAULT_EFFECTS_CONFIG),
  };
}

const warned = new Set<string>();

function warnOnce(key: string, error: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[presentation-intent] malformed presentation, rendering neutral", error);
}

/**
 * Read a stored intent. The saved trail/effects are normalized and migrated
 * FIRST, then missing fields are filled from DEFAULT_TRAIL_SETTINGS /
 * DEFAULT_EFFECTS_CONFIG (migrateEffectsConfig does its own default-fill at
 * its tail) — never the other way around, or the legacy fallbacks
 * (normalizeLegacyTrailSettings's blueColor -> leftColor, every
 * version-gated migration in migrateEffectsConfig) would find their target
 * field already populated by a default and never fire. Never throws;
 * garbage resolves neutral.
 */
export function resolvePresentation(
  intent: CreatorIntent | null | undefined,
  warnKey: string
): ResolvedPresentation {
  if (intent?.presentation === undefined) return { kind: "absent" };
  if (intent.presentation === null) return { kind: "neutral" };

  try {
    const saved = intent.presentation;
    if (!isRecord(saved.trail) || !isRecord(saved.effects)) {
      throw new Error("presentation.trail and presentation.effects must be objects");
    }
    const trail: TrailSettings = {
      ...safeClone(DEFAULT_TRAIL_SETTINGS),
      ...definedEntries(normalizeLegacyTrailSettings(safeClone(saved.trail))),
    };
    const effects = migrateEffectsConfig(safeClone(saved.effects));
    const primaryPropColors = isColorPairShape(saved.primaryPropColors)
      ? resolveViewerCustomColorPair(saved.primaryPropColors)
      : null;
    return { kind: "recorded", value: { primaryPropColors, trail, effects } };
  } catch (error) {
    warnOnce(warnKey, error);
    return { kind: "neutral" };
  }
}

/** Human labels for the save dialog's summary line. */
export function summarizePresentation(
  value: ResolvedPresentationValue
): PresentationSummary {
  const effectLabels: string[] = [];
  for (const effect of referencedEffects(value.effects.tipEffectMap)) {
    const label = EFFECT_LABELS[effect] ?? effect;
    if (!effectLabels.includes(label)) effectLabels.push(label);
  }
  return {
    colors: value.primaryPropColors,
    trailLabel: TRAIL_MODE_LABELS[value.trail.mode] ?? "Trail",
    effectLabels,
  };
}
