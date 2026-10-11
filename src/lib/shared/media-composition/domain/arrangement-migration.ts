import type { CellEffect } from "#lib/shared/animation-engine/domain/compose-types.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import type { ArrangementCell, ArrangementSnapshot } from "./arrangement.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/**
 * `schemaVersion: 1` kept a cell's look in three loose fields: `effect`,
 * `trailMode` and `effort`. Version 2 keeps it in `cell.appearance`, the
 * object Studio animation items already carry, so one effects system serves
 * both. These functions translate forward for stored snapshots and backward
 * for the nested Arrange editor and `ArrangementCellCanvas`, which keep
 * reading the v1 fields until phases 4 and 5 of the arrangements-in-Studio
 * spec.
 */

export const CELL_EFFECTS = [
  "none",
  "fire",
  "charcoal",
  "led",
  "trails",
] as const satisfies readonly CellEffect[];

/** The eight presets `PostAnimationAppearance.effortPreset` accepts. */
export const EFFORT_PRESETS = [
  "linear",
  "glide",
  "dab",
  "press",
  "punch",
  "elastic",
  "bounce",
  "anticipation",
] as const;

export type EffortPreset = (typeof EFFORT_PRESETS)[number];

/** The per-cell look fields of `schemaVersion: 1`. */
export interface LegacyCellFields {
  effect?: CellEffect;
  trailMode?: TrailMode;
  effort?: string;
}

export type LegacyArrangementCell = Omit<ArrangementCell, "appearance"> &
  LegacyCellFields;

export interface ArrangementSnapshotV1 {
  schemaVersion: 1;
  cells: LegacyArrangementCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
}

type AppearanceTrail = NonNullable<PostAnimationAppearance["trail"]>;

const CELL_EFFECT_SET: ReadonlySet<string> = new Set(CELL_EFFECTS);
const EFFORT_PRESET_SET: ReadonlySet<string> = new Set(EFFORT_PRESETS);
const TRAIL_MODE_SET: ReadonlySet<string> = new Set(Object.values(TrailMode));

function isCellEffect(value: unknown): value is CellEffect {
  return typeof value === "string" && CELL_EFFECT_SET.has(value);
}

function isEffortPreset(value: unknown): value is EffortPreset {
  return typeof value === "string" && EFFORT_PRESET_SET.has(value);
}

function isTrailMode(value: unknown): value is TrailMode {
  return typeof value === "string" && TRAIL_MODE_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A cell-wide effect as the v1 editor meant it: every tip, nothing per hand. */
function effectsForCellEffect(effect: CellEffect): EffectsConfig {
  return {
    ...structuredClone(DEFAULT_EFFECTS_CONFIG),
    activeEffect: effect,
    tipEffectMap: { "*": { effect } },
  };
}

function trailForMode(
  existing: AppearanceTrail | undefined,
  mode: TrailMode,
  enabled: boolean
): AppearanceTrail {
  const settings = { ...DEFAULT_TRAIL_SETTINGS, ...existing?.settings, mode };
  return {
    enabled,
    trackingMode: existing?.trackingMode ?? settings.trackingMode,
    thickness: existing?.thickness ?? settings.lineWidth,
    brightness: existing?.brightness ?? 1,
    tailLength: existing?.tailLength ?? settings.tailLength,
    leftColor: existing?.leftColor ?? settings.leftColor,
    rightColor: existing?.rightColor ?? settings.rightColor,
    settings,
  };
}

/**
 * Folds the v1 look fields into an appearance. An absent field keeps what
 * `existing` says; a present field that differs wins, so the nested editor's
 * last change survives a round trip and the fold is idempotent. An explicit
 * `effect: "none"` stays explicit (it turns per-tip effects off, where an
 * absent effect inherits the global setting). Unknown trail modes and efforts
 * are dropped, never rejected.
 */
export function appearanceFromLegacyCellFields(
  existing: PostAnimationAppearance | undefined,
  legacy: LegacyCellFields
): PostAnimationAppearance | undefined {
  let next = existing;
  const effect = isCellEffect(legacy.effect) ? legacy.effect : undefined;
  if (effect !== undefined && next?.effects?.activeEffect !== effect)
    next = { ...next, effects: effectsForCellEffect(effect) };
  if (
    isTrailMode(legacy.trailMode) &&
    next?.trail?.settings?.mode !== legacy.trailMode
  ) {
    const active = effect ?? next?.effects?.activeEffect ?? "trails";
    next = {
      ...next,
      trail: trailForMode(next?.trail, legacy.trailMode, active === "trails"),
    };
  }
  if (isEffortPreset(legacy.effort) && next?.effortPreset !== legacy.effort)
    next = { ...next, effortPreset: legacy.effort };
  return next;
}

/** The v1 fields an appearance stands for, for code that still reads them. */
export function legacyCellFieldsFrom(
  appearance: PostAnimationAppearance | undefined
): LegacyCellFields {
  const fields: LegacyCellFields = {};
  const active = appearance?.effects?.activeEffect;
  if (isCellEffect(active)) fields.effect = active;
  const mode = appearance?.trail?.settings?.mode;
  if (mode !== undefined) fields.trailMode = mode;
  if (appearance?.effortPreset !== undefined)
    fields.effort = appearance.effortPreset;
  return fields;
}

/**
 * A cell's effective v1 fields: its own, where the nested editor set them,
 * over the ones its appearance implies.
 */
export function resolveLegacyCellFields(
  cell: ArrangementCell & Partial<LegacyCellFields>
): LegacyCellFields {
  const fields = legacyCellFieldsFrom(cell.appearance);
  if (cell.effect !== undefined) fields.effect = cell.effect;
  if (cell.trailMode !== undefined) fields.trailMode = cell.trailMode;
  if (cell.effort !== undefined) fields.effort = cell.effort;
  return fields;
}

/** One cell as v2: the v1 fields folded into `appearance` and removed. */
export function migrateArrangementCell(
  cell: LegacyArrangementCell | ArrangementCell
): ArrangementCell {
  const {
    effect,
    trailMode,
    effort,
    appearance: existing,
    ...rest
  } = cell as ArrangementCell & LegacyCellFields;
  if (effect === undefined && trailMode === undefined && effort === undefined)
    return cell as ArrangementCell;
  const appearance = appearanceFromLegacyCellFields(existing, {
    effect,
    trailMode,
    effort,
  });
  return appearance ? { ...rest, appearance } : rest;
}

/**
 * Any stored snapshot as `schemaVersion: 2`. Total over v1 and v2 input and
 * idempotent; a v2 cell that still carries v1 fields (the nested editor writes
 * them until phase 5) is folded the same way. Other versions and malformed
 * input come back unchanged for the schema to reject.
 */
export function migrateArrangementSnapshot(
  snapshot: ArrangementSnapshotV1 | ArrangementSnapshot
): ArrangementSnapshot;
export function migrateArrangementSnapshot(snapshot: unknown): unknown;
export function migrateArrangementSnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.cells)) return snapshot;
  if (snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2)
    return snapshot;
  return {
    ...snapshot,
    schemaVersion: 2,
    cells: snapshot.cells.map((cell) =>
      isRecord(cell)
        ? migrateArrangementCell(cell as unknown as LegacyArrangementCell)
        : cell
    ),
  };
}
