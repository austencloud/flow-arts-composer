import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  addCatalogShapeMembers,
  createCatalogShapeMembers,
  sortCatalogShapeGroups,
} from "#lib/features/sticker-lab/services/catalog-shape-index.js";

function sequence(id: string): SequenceData {
  return { id, word: id, steps: [] } as unknown as SequenceData;
}

function paths(leftD: string, rightD = ""): MandalaPaths {
  return {
    left: leftD ? [{ d: leftD, tipIndex: 0 }] : [],
    right: rightD ? [{ d: rightD, tipIndex: 0 }] : [],
    purple: [],
  };
}

describe("catalog shape index", () => {
  it("groups combined shapes by exact canonical geometry", () => {
    const first = createCatalogShapeMembers(
      sequence("ONE"),
      paths("M 10 0 C 10 0, 20 0, 30 0", "M -10 0 C -10 0, -20 0, -30 0"),
      "combined"
    );
    const second = createCatalogShapeMembers(
      sequence("TWO"),
      paths("M -10 0 C -10 0, -20 0, -30 0", "M 10 0 C 10 0, 20 0, 30 0"),
      "combined"
    );
    const groups = new Map();
    addCatalogShapeMembers(groups, [...first, ...second]);

    expect(sortCatalogShapeGroups(groups)).toHaveLength(1);
    expect(sortCatalogShapeGroups(groups)[0]!.members).toHaveLength(2);
  });

  it("groups rotated solo paths into one orbit without collapsing their full pairs", () => {
    const first = createCatalogShapeMembers(
      sequence("EAST"),
      paths("M 10 0 C 10 0, 20 0, 30 0", "M -5 0 C -5 0, -10 0, -15 0"),
      "solo"
    );
    const second = createCatalogShapeMembers(
      sequence("NORTH"),
      paths("M 0 10 C 0 10, 0 20, 0 30", "M 0 -7 C 0 -7, 0 -14, 0 -21"),
      "solo"
    );
    const groups = new Map();
    addCatalogShapeMembers(groups, [first[0]!, second[0]!]);

    const grouped = sortCatalogShapeGroups(groups);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.members.map((member) => member.sequence.id)).toEqual([
      "EAST",
      "NORTH",
    ]);
    expect(grouped[0]!.members[0]!.fullPaths).not.toEqual(
      grouped[0]!.members[1]!.fullPaths
    );
  });

  it("emits both hands as separate solo members and one combined member", () => {
    const full = paths(
      "M 10 0 C 10 0, 20 0, 30 0",
      "M -10 0 C -10 0, -20 0, -30 0"
    );

    expect(
      createCatalogShapeMembers(sequence("PAIR"), full, "solo")
    ).toHaveLength(2);
    expect(
      createCatalogShapeMembers(sequence("PAIR"), full, "combined")
    ).toHaveLength(1);
  });
});
