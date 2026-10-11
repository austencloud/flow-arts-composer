# Arrangements in Studio, Phase 1: Schema v2 and Pure Edits

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/arrangements-studio-p1`, branch
> `codex/arrangements-studio-p1`) under the Agent Budget rule: no per-task
> subagents, one review at most. Steps use checkbox (`- [ ]`) syntax for
> tracking. Phases 2 to 5 of the spec get their own plans when they begin.

**Spec:** `docs/superpowers/specs/2026-10-11-arrangements-in-studio-design.md`,
sections "One effects system", "Errors" (drag clamps, migration never throws),
"Testing" (migration and pure-edit tests) and "Phases" (phase 1).

**Goal:** Move `ArrangementSnapshot` to `schemaVersion: 2`, where a cell's look
lives in `cell.appearance` (the object Studio animation items already use),
migrate every stored v1 snapshot on read, and give `post-project-edits` the
pure grid edits the Studio preview and panels will call in phases 2 to 4. No
visible change.

**Architecture:** `PostAnimationAppearanceSchema` moves out of
`post-project.ts` into its own module so `arrangement.ts` can import it without
a cycle (`post-project.ts` imports `arrangement.ts`). `arrangement-migration.ts`
holds the pure, total, idempotent v1 → v2 translation plus the reverse map
(`legacyCellFieldsFrom`) that the nested Arrange editor and
`ArrangementCellCanvas` keep using until phases 4 and 5. `arrangement.ts`
wraps the v2 schema in `z.preprocess(migrate)`, so every parse site
(`PostProjectSchema`, `composition-schemas`, `validateArrangementSnapshot`)
migrates for free. `arrangement-edits.ts` holds snapshot-level pure edits with
the clamp rules from the spec (cells stay inside the grid, spans stay within
empty neighbours, offsets at or above 0, invalid moves return the input);
`post-project-edits.ts` wraps each one through `setArrangementSnapshot`, which
already recomputes the clip's length.

**Tech Stack:** TypeScript, zod 4 (`z.preprocess`), Svelte 5 runes, Vitest
(`npm run test:ci -- <paths>`), `npm run check:fast`.

---

## File map

| Path | Responsibility |
| --- | --- |
| Create `src/lib/shared/media-composition/domain/post-animation-appearance.ts` | `PostAnimationAppearanceSchema` and `PostAnimationAppearance`, moved verbatim from `post-project.ts` |
| Modify `src/lib/shared/media-composition/domain/post-project.ts` | Import the schema from the new module, re-export it, drop the imports only it used |
| Create `src/lib/shared/media-composition/domain/arrangement-migration.ts` | v1 types, `migrateArrangementSnapshot`, `migrateArrangementCell`, `appearanceFromLegacyCellFields`, `legacyCellFieldsFrom`, `resolveLegacyCellFields` |
| Modify `src/lib/shared/media-composition/domain/arrangement.ts` | v2 types, `arrangementCellSchema`, `arrangementSnapshotV2Schema`, migrating `arrangementSnapshotSchema`, `validateArrangementSnapshot` returning the parsed v2 |
| Create `src/lib/shared/media-composition/domain/arrangement-edits.ts` | Snapshot-level pure edits and grid geometry helpers |
| Modify `src/lib/shared/media-composition/domain/post-project-edits.ts` | Project-level wrappers with the spec's names |
| Modify `src/lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.ts` | `GridCell extends ArrangementCell` plus the three v1 fields; restore rehydrates them; capture writes v2 |
| Modify `src/lib/features/compose/tabs/arrange/services/arrange-composition-converter.ts` | Save v2; rehydrate v1 fields on load |
| Modify `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte` | Read effect and trail mode through `resolveLegacyCellFields` |
| Modify the v1 literal sites | `post-editor-arrangement.ts`, `studio-arrangement-projects.ts`, `legacy-compose-timeline-import.ts`, `src/routes/test/studio-arrangement/fixture.ts`, four tests |
| Create `tests/unit/media-composition/arrangement-migration.test.ts` | Migration, idempotence, round trip, stored project |
| Create `tests/unit/media-composition/arrangement-edits.test.ts` | Every pure edit and the project wrappers |
| Modify `tests/unit/compose/arrangement-persistence.test.ts` | v2 expectations |

---

### Task 1: Move `PostAnimationAppearanceSchema` into its own module

**Files:**
- Create: `src/lib/shared/media-composition/domain/post-animation-appearance.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project.ts:1-21, 607-698`

- [ ] **Step 1: Create the module**

Copy lines 607 to 698 of `post-project.ts` (the schema and its type) into the new
file with these imports and this header comment:

```ts
import { z } from "zod";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { PROP_LOOKS } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import {
  TrackingMode,
  TrailEffect,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

/**
 * Display flags for a live animation, independent of viewer settings.
 *
 * A Studio animation item carries one as `animationAppearance`; an
 * arrangement carries one for its grid and an optional override per cell
 * (`arrangement.ts`). Only set flags apply, so an override merges over its
 * base. The schema lives here, not in `post-project.ts`, because
 * `arrangement.ts` needs it and `post-project.ts` imports `arrangement.ts`.
 */
export const PostAnimationAppearanceSchema = z
  .object({
    // … the body exactly as it stands in post-project.ts …
  })
  .strict();

export type PostAnimationAppearance = z.infer<
  typeof PostAnimationAppearanceSchema
>;
```

- [ ] **Step 2: Point `post-project.ts` at it**

Replace lines 607 to 698 with:

```ts
export { PostAnimationAppearanceSchema, type PostAnimationAppearance };
```

and add, next to the other domain imports at the top:

```ts
import {
  PostAnimationAppearanceSchema,
  type PostAnimationAppearance,
} from "#lib/shared/media-composition/domain/post-animation-appearance.js";
```

Remove the now-unused imports `PROP_LOOKS`, `EffectsConfig`, `TrackingMode`,
`TrailEffect` and `TrailMode`. Keep `PropType` (line 858 still uses it).

- [ ] **Step 3: Check**

Run: `npm run test:ci -- tests/unit/media-composition/post-editor-arrangement.test.ts tests/unit/media-composition/post-arrangement-source.test.ts`
Expected: PASS (nothing has changed yet in behaviour).

---

### Task 2: Migration module and schema v2 (TDD)

**Files:**
- Create: `src/lib/shared/media-composition/domain/arrangement-migration.ts`
- Modify: `src/lib/shared/media-composition/domain/arrangement.ts`
- Test: `tests/unit/media-composition/arrangement-migration.test.ts`

Design decisions carried from the spec, with one refinement:

- `effect` other than `none` → `appearance.effects = { ...DEFAULT_EFFECTS_CONFIG, activeEffect: effect, tipEffectMap: { "*": { effect } } }`.
  The `tipEffectMap` entry is what the v1 editor meant by a cell-wide effect.
- `effect: "none"` is kept as an explicit `activeEffect: "none"` rather than
  dropped. In `ArrangementCellCanvas` an explicit `none` turns per-tip effects
  off (`{ "*": { effect: "none" } }`) while an absent effect inherits the global
  setting, so dropping it would be a silent change.
- `trailMode` → `appearance.trail` with `settings = { ...DEFAULT_TRAIL_SETTINGS, mode }`;
  `enabled` is true when the resolved effect is `trails`. Unknown modes drop.
- `effort` → `appearance.effortPreset` when it is one of the eight presets,
  otherwise dropped.
- A field that is absent keeps whatever `appearance` already says; a field that
  is present and differs wins. That makes the nested editor's writes (which
  still set the v1 fields on `GridCell`) survive `captureSnapshot`, and makes
  migration idempotent.
- Malformed input and other versions come back unchanged so the v2 schema
  reports the error; `migrateArrangementSnapshot` never throws.

- [ ] **Step 1: Write the failing tests**

`tests/unit/media-composition/arrangement-migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  validateArrangementSnapshot,
  type ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  appearanceFromLegacyCellFields,
  legacyCellFieldsFrom,
  migrateArrangementSnapshot,
  resolveLegacyCellFields,
  type ArrangementSnapshotV1,
  type LegacyArrangementCell,
} from "#lib/shared/media-composition/domain/arrangement-migration.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { PostProjectSchema } from "#lib/shared/media-composition/domain/post-project.js";

function layer(id: string, beats = 4): LegacyArrangementCell["layers"][number] {
  return {
    sequence: { id, steps: Array.from({ length: beats }, () => ({})) },
    beatOffset: 0,
    propColors: { left: "#3575e2", right: "#ed1c24" },
    transformStack: [],
  } as unknown as LegacyArrangementCell["layers"][number];
}

function cell(
  row: number,
  col: number,
  extra: Partial<LegacyArrangementCell> = {}
): LegacyArrangementCell {
  return {
    id: `cell-${row}-${col}`,
    row,
    col,
    layers: [layer(`seq-${row}-${col}`)],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation",
    ...extra,
  };
}

function v1(cells: LegacyArrangementCell[]): ArrangementSnapshotV1 {
  return {
    schemaVersion: 1,
    cells,
    gridRows: 2,
    gridCols: 2,
    bpm: 120,
    skipStartPlacement: true,
  };
}

describe("arrangement snapshot migration", () => {
  it("folds each v1 look field into the cell's appearance", () => {
    const migrated = migrateArrangementSnapshot(
      v1([
        cell(0, 0, { effect: "fire" }),
        cell(0, 1, { effect: "none" }),
        cell(1, 0, { trailMode: TrailMode.PERSISTENT }),
        cell(1, 1, { effort: "glide", effect: "trails", trailMode: TrailMode.OFF }),
      ])
    );
    expect(migrated.schemaVersion).toBe(2);
    const [fire, none, trail, combined] = migrated.cells;
    expect(fire).not.toHaveProperty("effect");
    expect(fire?.appearance?.effects).toMatchObject({
      activeEffect: "fire",
      tipEffectMap: { "*": { effect: "fire" } },
    });
    expect(typeof fire?.appearance?.effects?.version).toBe("number");
    expect(none?.appearance?.effects?.activeEffect).toBe("none");
    expect(trail?.appearance?.effects).toBeUndefined();
    expect(trail?.appearance?.trail).toMatchObject({
      enabled: true,
      settings: { mode: TrailMode.PERSISTENT },
    });
    expect(trail).not.toHaveProperty("trailMode");
    expect(combined?.appearance).toMatchObject({
      effortPreset: "glide",
      effects: { activeEffect: "trails" },
      trail: { enabled: true, settings: { mode: TrailMode.OFF } },
    });
    expect(combined).not.toHaveProperty("effort");
  });

  it("marks a trail disabled when another effect owns the cell", () => {
    const migrated = migrateArrangementSnapshot(
      v1([cell(0, 0, { effect: "led", trailMode: TrailMode.FADE })])
    );
    expect(migrated.cells[0]?.appearance?.trail?.enabled).toBe(false);
  });

  it("drops unknown trail modes and efforts and leaves plain cells alone", () => {
    const plain = cell(0, 0);
    const migrated = migrateArrangementSnapshot(
      v1([plain, cell(0, 1, { trailMode: "wobble" as TrailMode, effort: "high" })])
    );
    expect(migrated.cells[0]).toBe(plain);
    expect(migrated.cells[1]).toEqual(cell(0, 1));
    expect(migrated.cells[1]).not.toHaveProperty("appearance");
  });

  it("is idempotent", () => {
    const once = migrateArrangementSnapshot(
      v1([cell(0, 0, { effect: "charcoal", trailMode: TrailMode.LOOP_CLEAR, effort: "dab" })])
    );
    const twice = migrateArrangementSnapshot(once);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("lets a v1 field the nested editor changed win over the stored appearance", () => {
    const stored = migrateArrangementSnapshot(v1([cell(0, 0, { effect: "fire" })]));
    const edited = {
      ...stored,
      cells: [
        {
          ...stored.cells[0]!,
          appearance: { ...stored.cells[0]!.appearance, props: false },
          effect: "led",
        },
      ],
    };
    const folded = migrateArrangementSnapshot(edited as unknown as ArrangementSnapshot);
    expect(folded.cells[0]?.appearance).toMatchObject({
      props: false,
      effects: { activeEffect: "led", tipEffectMap: { "*": { effect: "led" } } },
    });
    expect(folded.cells[0]).not.toHaveProperty("effect");
  });

  it("keeps the appearance when the v1 fields agree with it", () => {
    const stored = migrateArrangementSnapshot(
      v1([cell(0, 0, { effect: "fire", trailMode: TrailMode.FADE, effort: "punch" })])
    );
    const appearance = stored.cells[0]!.appearance!;
    const legacy = legacyCellFieldsFrom(appearance);
    expect(legacy).toEqual({ effect: "fire", trailMode: TrailMode.FADE, effort: "punch" });
    expect(appearanceFromLegacyCellFields(appearance, legacy)).toBe(appearance);
  });

  it("resolves a cell's own v1 fields over the ones its appearance implies", () => {
    const stored = migrateArrangementSnapshot(v1([cell(0, 0, { effect: "fire" })]));
    const resolved = resolveLegacyCellFields({ ...stored.cells[0]!, effect: "led" });
    expect(resolved.effect).toBe("led");
    expect(resolveLegacyCellFields(stored.cells[0]!).effect).toBe("fire");
    expect(resolveLegacyCellFields(cell(1, 1) as never)).toEqual({});
  });

  it("validates v1 input as v2 and rejects other versions and bad geometry", () => {
    const valid = validateArrangementSnapshot(v1([cell(0, 0, { effect: "fire" })]));
    expect(valid.schemaVersion).toBe(2);
    expect(valid.cells[0]?.appearance?.effects?.activeEffect).toBe("fire");
    expect(valid).toEqual(validateArrangementSnapshot(valid));
    expect(() =>
      validateArrangementSnapshot({ ...v1([cell(0, 0)]), schemaVersion: 3 })
    ).toThrow();
    expect(() =>
      validateArrangementSnapshot({ ...v1([cell(0, 0)]), gridRows: 9 })
    ).toThrow();
    expect(() => validateArrangementSnapshot(null)).toThrow();
  });

  it("migrates the arrangement inside a stored project on parse", () => {
    const project = createArrangementProject(
      v1([cell(0, 0, { effect: "fire", effort: "glide" })]) as unknown as ArrangementSnapshot,
      "studio-arrangement:one",
      1_700_000_000_000
    );
    const loaded = PostProjectSchema.parse(JSON.parse(JSON.stringify(project)));
    const item = loaded.tracks[0]?.items[0];
    expect(item?.kind).toBe("arrangement");
    if (item?.kind !== "arrangement") return;
    expect(item.snapshot.schemaVersion).toBe(2);
    expect(item.snapshot.cells[0]).not.toHaveProperty("effect");
    expect(item.snapshot.cells[0]?.appearance).toMatchObject({
      effortPreset: "glide",
      effects: { activeEffect: "fire" },
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-migration.test.ts`
Expected: FAIL, the migration module does not exist.

- [ ] **Step 3: Write `arrangement-migration.ts`**

```ts
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
 * reading the v1 fields until phases 4 and 5 of the spec.
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
 * last change survives a round trip and the fold is idempotent. Unknown trail
 * modes and efforts are dropped, never rejected.
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
```

- [ ] **Step 4: Rewrite `arrangement.ts` as v2**

```ts
import { z } from "zod";
import type {
  TunnelLayerConfig,
  CellMediaType,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
import { migrateArrangementSnapshot } from "./arrangement-migration.js";
import {
  PostAnimationAppearanceSchema,
  type PostAnimationAppearance,
} from "./post-animation-appearance.js";

export const ARRANGEMENT_SCHEMA_VERSION = 2;
/** The backing grid is always this many rows and columns; `gridRows × gridCols` of it show. */
export const ARRANGEMENT_MAX_GRID_SIZE = 8;

export interface ArrangementCell {
  id: string;
  row: number;
  col: number;
  layers: TunnelLayerConfig[];
  beatOffset: number;
  colSpan: number;
  rowSpan: number;
  mediaType: CellMediaType;
  speedMultiplier?: number;
  /** Look and effects for this cell over the grid's `appearance`; set flags only. */
  appearance?: PostAnimationAppearance;
  tipEffectMap?: TipEffectMap;
  tipEffortMap?: TipEffortMap;
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
}

export interface ArrangementSnapshot {
  schemaVersion: 2;
  cells: ArrangementCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
  /** The grid's default look and effects; a cell's `appearance` overrides set flags. */
  appearance?: PostAnimationAppearance;
}

// jsonValueSchema and layerSchema unchanged

export const arrangementCellSchema = z
  .object({
    id: z.string(),
    row: z.number().int().min(0).max(ARRANGEMENT_MAX_GRID_SIZE - 1),
    col: z.number().int().min(0).max(ARRANGEMENT_MAX_GRID_SIZE - 1),
    layers: z.array(layerSchema).max(4),
    beatOffset: z.number().finite(),
    colSpan: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
    rowSpan: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
    mediaType: z.enum([
      "video",
      "animation",
      "image",
      "choreo-card",
      "viewer-3d",
      "empty",
    ]),
    speedMultiplier: z.number().finite().positive().optional(),
    appearance: PostAnimationAppearanceSchema.optional(),
    tipEffectMap: z.record(z.string(), jsonValueSchema).optional(),
    tipEffortMap: z.record(z.string(), jsonValueSchema).optional(),
    leftMotionVisible: z.boolean().optional(),
    rightMotionVisible: z.boolean().optional(),
  })
  .passthrough();

/** A `schemaVersion: 2` snapshot as stored. `arrangementSnapshotSchema` migrates older ones into it. */
export const arrangementSnapshotV2Schema = z.object({
  schemaVersion: z.literal(ARRANGEMENT_SCHEMA_VERSION),
  cells: z.array(arrangementCellSchema),
  gridRows: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
  gridCols: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
  bpm: z.number().finite().positive(),
  skipStartPlacement: z.boolean(),
  appearance: PostAnimationAppearanceSchema.optional(),
});

/** Accepts a v1 or v2 snapshot and parses it as v2. */
export const arrangementSnapshotSchema = z.preprocess(
  (value) => migrateArrangementSnapshot(value),
  arrangementSnapshotV2Schema
);

/** The snapshot as v2, detached from its input. Throws on anything the schema rejects. */
export function validateArrangementSnapshot(
  value: unknown
): ArrangementSnapshot {
  return structuredClone(
    arrangementSnapshotSchema.parse(value)
  ) as ArrangementSnapshot;
}
```

- [ ] **Step 5: Run the migration tests**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-migration.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(arrangement): schema v2 with cell appearance and v1 migration" \
  -- src/lib/shared/media-composition/domain/post-animation-appearance.ts \
     src/lib/shared/media-composition/domain/post-project.ts \
     src/lib/shared/media-composition/domain/arrangement-migration.ts \
     src/lib/shared/media-composition/domain/arrangement.ts \
     tests/unit/media-composition/arrangement-migration.test.ts
```

(With the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.)

---

### Task 3: Pure grid edits (TDD)

**Files:**
- Create: `src/lib/shared/media-composition/domain/arrangement-edits.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts` (after `setArrangementSnapshot`, line 185)
- Test: `tests/unit/media-composition/arrangement-edits.test.ts`

Rules (spec "Errors" and "The preview edits the grid"):

- Positions are `row`/`col` in the backing grid; a cell covers
  `colSpan × rowSpan` positions from its origin. Only cells inside
  `gridRows × gridCols` show and take part in overlap rules; the rest stay in
  the array so growing the grid brings them back.
- A position is *free* for a cell when no other visible cell that holds layers
  or spans more than 1×1 covers it. Empty 1×1 records under a span stay in the
  array, hidden, as the nested editor already does.
- `moveCell` swaps the two cells' content (layers, offset, spans, media type,
  speed, appearance, tip maps, visibility); `id`, `row` and `col` name the
  position and stay. Invalid (target covered by a span, either rect leaves the
  grid or lands on a blocked position) returns the input snapshot.
- `resizeCell` clamps to the grid, then to free neighbours: as many columns
  along the origin row as are free, then as many rows across those columns.
- `setCellOffset` floors `beatOffset` at 0 and clamps `speedMultiplier` to
  0.25..4.
- `staggerCells(snapshot, beatsPerCell)` sets `beatOffset = index × beatsPerCell`
  over the visible cells that hold layers, in reading order.
- Every edit returns the same snapshot reference when nothing changes.

- [ ] **Step 1: Write the failing tests**

`tests/unit/media-composition/arrangement-edits.test.ts` covers: `setGrid`
(clamp, shrink spans, keep out-of-range cells, no-op identity), `moveCell`
(swap with positional ids, spans travel, covered target, overflow, blocked
overlap, sparse target created), `resizeCell` (grid clamp, stops at a layered
neighbour, grows over empty neighbours, row limit, identity), `setCellLayers`
(replace, refuse five, unknown cell), `setCellOffset` (floor, speed clamp,
identity), `setCellAppearance` (cell, grid, remove, identity), `clearCell`,
`staggerCells` (reading order, skips empty and hidden), `setSkipStartPlacement`,
and the project wrappers (`setArrangementGrid` changes the clip length through
`setArrangementSnapshot`; a no-op returns the same project; a non-arrangement id
returns the same project). Full code is in the test file written in this task.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-edits.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `arrangement-edits.ts`**

Exports: `ARRANGEMENT_MAX_LAYERS`, `ARRANGEMENT_MIN_CELL_SPEED`,
`ARRANGEMENT_MAX_CELL_SPEED`, `ArrangementCellOffset`, `arrangementCellId`,
`createArrangementCell`, `isVisibleCell`, `visibleCells`, `cellAt`,
`occupiedPositions`, `setGrid`, `setSkipStartPlacement`, `canMoveCell`,
`moveCell`, `resizeCell`, `setCellLayers`, `setCellOffset`,
`setCellAppearance`, `clearCell`, `staggerCells`. Full code is in the module
written in this task; the rules above are its contract.

- [ ] **Step 4: Add the project wrappers to `post-project-edits.ts`**

```ts
/** One grid edit on an arrangement item; the clip's length follows through `setArrangementSnapshot`. */
function editArrangement(
  project: PostProject,
  itemId: string,
  ctx: EditContext,
  edit: (snapshot: ArrangementSnapshot) => ArrangementSnapshot
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement") return project;
  const next = edit(located.item.snapshot);
  return next === located.item.snapshot
    ? project
    : setArrangementSnapshot(project, itemId, next, ctx);
}

export function setArrangementGrid(project, itemId, rows, cols, ctx)
export function setArrangementSkipStartPlacement(project, itemId, skip, ctx)
export function moveArrangementCell(project, itemId, cellId, row, col, ctx)
export function resizeArrangementCell(project, itemId, cellId, colSpan, rowSpan, ctx)
export function setArrangementCellLayers(project, itemId, cellId, layers, ctx)
export function setArrangementCellOffset(project, itemId, cellId, offset, ctx)
export function setArrangementCellAppearance(project, itemId, cellId | null, appearance, ctx)
export function clearArrangementCell(project, itemId, cellId, ctx)
export function staggerArrangement(project, itemId, beatsPerCell, ctx)
```

Each delegates to the snapshot-level function of the matching name.

- [ ] **Step 5: Run the tests**

Run: `npm run test:ci -- tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/post-editor-arrangement.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(arrangement): pure grid edits for Studio" \
  -- src/lib/shared/media-composition/domain/arrangement-edits.ts \
     src/lib/shared/media-composition/domain/post-project-edits.ts \
     tests/unit/media-composition/arrangement-edits.test.ts
```

---

### Task 4: Bridge the nested editor and the cell canvas to v2

**Files:**
- Modify: `src/lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.ts:71-96, 264-284, 432-441`
- Modify: `src/lib/features/compose/tabs/arrange/services/arrange-composition-converter.ts:160-180`
- Modify: `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte:81-142, 423-426`
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-arrangement.ts:6`
- Modify: `src/lib/features/post/services/studio-arrangement-projects.ts:144, 198`
- Modify: `src/lib/features/post/services/legacy-compose-timeline-import.ts:160`
- Modify: `src/routes/test/studio-arrangement/fixture.ts:120`
- Modify tests: `tests/unit/compose/arrangement-persistence.test.ts`, `tests/unit/compose/arrange-grid-undo.test.ts:57`, `tests/unit/media-composition/post-editor-arrangement.test.ts:20`, `tests/unit/media-composition/post-arrangement-export.test.ts:13`, `tests/unit/media-composition/post-arrangement-source.test.ts:43`

- [ ] **Step 1: `GridCell` keeps the v1 fields on top of the v2 cell**

```ts
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";
import { resolveLegacyCellFields } from "#lib/shared/media-composition/domain/arrangement-migration.js";

/**
 * A single cell in the grid, each one a mini-tunnel. The nested editor still
 * writes `effect`, `trailMode` and `effort`; `captureSnapshot` folds them into
 * `appearance` (schema v2) and `restoreSnapshot` reads them back out.
 */
export interface GridCell extends ArrangementCell {
  effect?: CellEffect;
  trailMode?: TrailMode;
  effort?: string;
}
```

`restoreSnapshot` (internal): `restored[index] = { ...cell, ...resolveLegacyCellFields(cell) }`.
`captureSnapshot`: `schemaVersion: 2`.

- [ ] **Step 2: Converter saves v2 and rehydrates on load**

`gridCellsToComposition`: `{ schemaVersion: 2, ...snapshot }`.
`compositionToGridState`: `cells: snapshot.cells.map((cell) => ({ ...cell, ...legacyCellFieldsFrom(cell.appearance) }))`.

- [ ] **Step 3: `ArrangementCellCanvas` reads through the bridge**

```ts
import { resolveLegacyCellFields } from "../domain/arrangement-migration.js";
const legacy = $derived(resolveLegacyCellFields(cell));
```

Replace every `cell.effect` with `legacy.effect` and every `cell.trailMode`
with `legacy.trailMode` (lines 84, 103-104, 122, 135, 423, 426). Nothing else
changes; phase 4 resolves `appearance` properly.

- [ ] **Step 4: v1 literals become v2**

Change `schemaVersion: 1` to `2` at the six source sites and four test sites
listed above. Rewrite `arrangement-persistence.test.ts` so the first test
expects `schemaVersion` 2, no `effect` key on the saved cell,
`appearance.effects.activeEffect === "fire"`, `trail.settings.mode` and
`effortPreset`, and a loaded cell that carries the three v1 fields again; add a
case that an effort outside the presets (`"high"`) is dropped; and make the
rejection test use `schemaVersion: 3` for the version half and keep
`gridRows: 9` for the geometry half.

- [ ] **Step 5: Run the affected tests**

Run:

```bash
npm run test:ci -- tests/unit/compose tests/unit/media-composition/arrangement-migration.test.ts tests/unit/media-composition/arrangement-edits.test.ts tests/unit/media-composition/post-editor-arrangement.test.ts tests/unit/media-composition/post-arrangement-export.test.ts tests/unit/media-composition/post-arrangement-source.test.ts tests/unit/post src/routes/test/studio-arrangement
```

Expected: PASS.

- [ ] **Step 6: Type check**

Run: `npm run check:fast`
Expected: no new errors against the baseline on `main` (compare counts; the
baseline is around 638 pre-existing errors). Grep the output for the files in
this plan; none may appear.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(arrangement): nested editor and cell canvas read schema v2" \
  -- src/lib/features/compose/tabs/arrange/state/arrange-grid-state.svelte.ts \
     src/lib/features/compose/tabs/arrange/services/arrange-composition-converter.ts \
     src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte \
     src/lib/shared/share/components/post-studio/editor/post-editor-arrangement.ts \
     src/lib/features/post/services/studio-arrangement-projects.ts \
     src/lib/features/post/services/legacy-compose-timeline-import.ts \
     src/routes/test/studio-arrangement/fixture.ts \
     tests/unit/compose/arrangement-persistence.test.ts \
     tests/unit/compose/arrange-grid-undo.test.ts \
     tests/unit/media-composition/post-editor-arrangement.test.ts \
     tests/unit/media-composition/post-arrangement-export.test.ts \
     tests/unit/media-composition/post-arrangement-source.test.ts
```

---

### Task 5: Integrate

- [ ] **Step 1: Merge `main` into the branch** and rerun only what it invalidates.
- [ ] **Step 2: From `E:/tka-platform`:** `npm run wt:finish -- codex/arrangements-studio-p1 --nonvisual`
  (no visible change in this phase; the Studio route is checked in phase 2).
- [ ] **Step 3:** Confirm the merge commit is on local `main`, update the
  project memory, report. Nothing is pushed.

---

## Self-review

- **Spec coverage.** "One effects system": types, migration rules, `validateArrangementSnapshot` accepts v1 and returns v2 (Task 2); `ArrangementCellCanvas` reading `appearance` is deferred to phase 4 as the spec's phase list says, with the bridge in Task 4 so nothing changes visibly. "Retired" names for the pure edits: all eight in Task 3, plus `setArrangementSkipStartPlacement` which the Grid panel's switch needs. "Errors": clamps and invalid-drop identity in Task 3; migration never throws and drops unknown values in Task 2. "Testing": migration fixtures per effect, trail mode, effort and empty value, idempotence, round trip, pure-edit cases (swap, resize clamp, grid resize keeping out-of-range cells, stagger order, clear, offset floor), existing persistence tests kept passing (rewritten for v2 expectations). Tempo rescale, lane geometry, tool rows and Library are phases 2 to 5.
- **Placeholders.** Tasks 1, 2 and 4 carry their code. Task 3's module and test are long; their contracts are stated in full and the files are written in that task.
- **Type consistency.** `LegacyCellFields` / `LegacyArrangementCell` / `ArrangementSnapshotV1` are defined in Task 2 and used in Task 4's tests; `resolveLegacyCellFields` and `legacyCellFieldsFrom` are defined in Task 2 and used in Task 4; `setArrangementSnapshot` (existing) is what Task 3's wrappers call; `ARRANGEMENT_MAX_GRID_SIZE` is defined in Task 2 and used in Task 3.
