import { describe, expect, it } from "vitest";
import type { ArrangementSnapshot } from "$lib/shared/media-composition/domain/arrangement";
import { MediaSourceSchema } from "$lib/shared/media-composition/domain/media-source-schema";
import { PostProjectSchema } from "$lib/shared/media-composition/domain/post-project";
import {
  arrangementBeatAt,
  arrangementDurationSeconds,
  createArrangementItem,
  createArrangementProject,
} from "$lib/shared/media-composition/domain/post-arrangement-item";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";

function cell(
  id: string,
  col: number,
  steps: number
): ArrangementSnapshot["cells"][number] {
  return {
    id,
    row: 0,
    col,
    colSpan: 1,
    rowSpan: 1,
    beatOffset: col * 0.5,
    mediaType: "animation",
    layers: [
      {
        sequence: {
          id: `sequence-${id}`,
          steps: Array.from({ length: steps }, () => ({})),
        },
        beatOffset: 0.25,
        propColors: { left: "#fff", right: "#f00" },
        transformStack: [],
      },
    ] as ArrangementSnapshot["cells"][number]["layers"],
  };
}

const snapshot: ArrangementSnapshot = {
  schemaVersion: 1,
  cells: [cell("a", 0, 2), cell("b", 1, 3)],
  gridRows: 1,
  gridCols: 2,
  bpm: 90,
  skipStartPlacement: true,
};

describe("editable arrangement source", () => {
  it("keeps the full grid and its timing through the project and source schemas", () => {
    const project = createArrangementProject(
      snapshot,
      "studio-arrangement:one",
      123
    );
    const loaded = PostProjectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(loaded.sequenceId).toBe("studio-arrangement:one");
    expect(loaded.tracks[0]?.items[0]).toMatchObject({
      kind: "arrangement",
      snapshot,
      sourceIn: 0,
      sourceOut: 4,
      duration: 4,
    });
    expect(
      MediaSourceSchema.parse({ id: "source", kind: "arrangement", snapshot })
    ).toMatchObject({ snapshot });
    expect(arrangementDurationSeconds(snapshot)).toBe(4);
    expect(arrangementBeatAt(snapshot, 2)).toBe(3);
  });

  it("evaluates trim and rate in source seconds before the snapshot BPM", () => {
    const project = createArrangementProject(
      snapshot,
      "studio-arrangement:two",
      123
    );
    const item = project.tracks[0]!.items[0]!;
    if (item.kind !== "arrangement") throw new Error("Expected arrangement");
    project.tracks[0]!.items[0] = {
      ...item,
      sourceIn: 0.5,
      sourceOut: 3,
      speed: 2,
      duration: 1.25,
    };
    const normalized = normalizeProject(project);
    const compiled = compilePostProject(normalized, { now: 123 })!;
    expect(compiled.durationSeconds).toBe(1.25);
    expect(compiled.preset.sourceRoles).toMatchObject([
      { key: "arrangement:arrangement-1", acceptedKinds: ["arrangement"] },
    ]);
    const layer = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      0.5
    )[0]!;
    expect(layer.sourceTimeSeconds).toBeCloseTo(1.5);
    expect(arrangementBeatAt(snapshot, layer.sourceTimeSeconds)).toBeCloseTo(
      2.25
    );
  });

  it("does not stretch an arrangement overlay past its source trim when fill is requested", () => {
    const project = createArrangementProject(
      snapshot,
      "studio-arrangement:three",
      123
    );
    project.tracks.push({
      id: "overlay",
      hidden: false,
      locked: false,
      items: [
        {
          ...createArrangementItem(snapshot, "overlay-arrangement", 0, false),
          sourceOut: 1,
          duration: 1,
          fill: true,
          anchor: { itemId: "arrangement-1", offset: 0 },
        },
      ],
    });

    const normalized = normalizeProject(project);
    expect(normalized.tracks[1]?.items[0]).toMatchObject({
      kind: "arrangement",
      duration: 1,
      sourceOut: 1,
      fill: false,
    });
  });
});
