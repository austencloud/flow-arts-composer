import { describe, expect, it } from "vitest";
import { describeCastForDirectorRevision } from "#lib/features/stage/domain/tika-director-revision.js";
import type { PerformerDomainSnapshot } from "#lib/shared/3d/undo/scene-undo-types.js";

function snapshot(
  overrides: Partial<PerformerDomainSnapshot> = {}
): PerformerDomainSnapshot {
  return {
    index: -1,
    selectedPerformerIndex: null,
    characterId: "ch01",
    displayName: "A",
    loadedSequence: null,
    settings: {
      prop: "staff",
      effortId: "default",
      effect: "none",
      handEffects: {},
      staffLengthCm: 80,
      propBuild: null,
    },
    planes: {
      customLeftPlane: null,
      customRightPlane: null,
      planeMode: "auto",
      beatPlaneOverrides: new Map(),
    },
    ...overrides,
  } as PerformerDomainSnapshot;
}

describe("TIKA Director cast revision", () => {
  it("ignores the sequence a rig loads as a consequence of the document", () => {
    // Assigning lanes makes the viewer load new sequences a tick later and
    // wipes per-beat plane overrides. Neither is an authored scene change, so
    // the undo guard must not see the scene as "changed" because of them.
    const before = describeCastForDirectorRevision([
      snapshot({
        loadedSequence: null,
        planes: {
          customLeftPlane: null,
          customRightPlane: null,
          planeMode: "auto",
          beatPlaneOverrides: new Map([[2, "wall"]]),
        },
      }),
    ]);
    const after = describeCastForDirectorRevision([
      snapshot({
        loadedSequence: { id: "seq-1", word: "ABC" } as never,
        planes: {
          customLeftPlane: null,
          customRightPlane: null,
          planeMode: "auto",
          beatPlaneOverrides: new Map(),
        },
      }),
    ]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("still changes for an authored look edit", () => {
    const before = describeCastForDirectorRevision([snapshot()]);
    const prop = describeCastForDirectorRevision([
      snapshot({ settings: { ...snapshot().settings, prop: "fans" } }),
    ]);
    const character = describeCastForDirectorRevision([
      snapshot({ characterId: "ch02" }),
    ]);
    const plane = describeCastForDirectorRevision([
      snapshot({
        planes: {
          customLeftPlane: "wall",
          customRightPlane: null,
          planeMode: "custom",
          beatPlaneOverrides: new Map(),
        } as never,
      }),
    ]);
    expect(JSON.stringify(prop)).not.toBe(JSON.stringify(before));
    expect(JSON.stringify(character)).not.toBe(JSON.stringify(before));
    expect(JSON.stringify(plane)).not.toBe(JSON.stringify(before));
  });
});
