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
        cell(1, 1, {
          effort: "glide",
          effect: "trails",
          trailMode: TrailMode.OFF,
        }),
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
      v1([
        plain,
        cell(0, 1, { trailMode: "wobble" as TrailMode, effort: "high" }),
      ])
    );
    expect(migrated.cells[0]).toBe(plain);
    expect(migrated.cells[1]).toEqual(cell(0, 1));
    expect(migrated.cells[1]).not.toHaveProperty("appearance");
  });

  it("is idempotent", () => {
    const once = migrateArrangementSnapshot(
      v1([
        cell(0, 0, {
          effect: "charcoal",
          trailMode: TrailMode.LOOP_CLEAR,
          effort: "dab",
        }),
      ])
    );
    const twice = migrateArrangementSnapshot(once);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("lets a v1 field the nested editor changed win over the stored appearance", () => {
    const stored = migrateArrangementSnapshot(
      v1([cell(0, 0, { effect: "fire" })])
    );
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
    const folded = migrateArrangementSnapshot(
      edited as unknown as ArrangementSnapshot
    );
    expect(folded.cells[0]?.appearance).toMatchObject({
      props: false,
      effects: { activeEffect: "led", tipEffectMap: { "*": { effect: "led" } } },
    });
    expect(folded.cells[0]).not.toHaveProperty("effect");
  });

  it("keeps the appearance when the v1 fields agree with it", () => {
    const stored = migrateArrangementSnapshot(
      v1([
        cell(0, 0, { effect: "fire", trailMode: TrailMode.FADE, effort: "punch" }),
      ])
    );
    const appearance = stored.cells[0]!.appearance!;
    const legacy = legacyCellFieldsFrom(appearance);
    expect(legacy).toEqual({
      effect: "fire",
      trailMode: TrailMode.FADE,
      effort: "punch",
    });
    expect(appearanceFromLegacyCellFields(appearance, legacy)).toBe(appearance);
  });

  it("resolves a cell's own v1 fields over the ones its appearance implies", () => {
    const stored = migrateArrangementSnapshot(
      v1([cell(0, 0, { effect: "fire" })])
    );
    const resolved = resolveLegacyCellFields({
      ...stored.cells[0]!,
      effect: "led",
    });
    expect(resolved.effect).toBe("led");
    expect(resolveLegacyCellFields(stored.cells[0]!).effect).toBe("fire");
    expect(resolveLegacyCellFields(cell(1, 1) as never)).toEqual({});
  });

  it("validates v1 input as v2 and rejects other versions and bad geometry", () => {
    const valid = validateArrangementSnapshot(
      v1([cell(0, 0, { effect: "fire" })])
    );
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
      v1([
        cell(0, 0, { effect: "fire", effort: "glide" }),
      ]) as unknown as ArrangementSnapshot,
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
