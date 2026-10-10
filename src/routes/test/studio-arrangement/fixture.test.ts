import { describe, expect, it } from "vitest";
import rawFixtures from "../../../../tests/fixtures/loop-audit/real-loop-fixtures.json";
import { arrangementDurationSeconds } from "$lib/shared/media-composition/domain/post-arrangement-item";
import { validateArrangementSnapshot } from "$lib/shared/media-composition/domain/arrangement";
import { createStudioArrangementFixture } from "./fixture";

describe("offline Studio arrangement harness", () => {
  it("uses real generated LOOP motions in a short editable arrangement", () => {
    const { sequence, snapshot, project } = createStudioArrangementFixture();
    const source = rawFixtures.rotated[0]!;
    expect(sequence.steps).toHaveLength(8);
    expect(sequence.steps[0]!.motions.left.motionType).toBe(source.steps[1]!.motions.blue.motionType);
    expect(sequence.steps[0]!.motions.right.endLocation).toBe(source.steps[1]!.motions.red.endLocation);
    expect(snapshot.cells).toHaveLength(64);
    expect(snapshot.cells[0]!.layers).toHaveLength(2);
    expect(snapshot.cells[1]!.layers[0]!.transformStack[0]!.type).toBe("shiftStart");
    expect(snapshot.cells[1]!.layers[0]!.sequence.steps[0]!.id).toBe(sequence.steps[1]!.id);
    expect(validateArrangementSnapshot(snapshot)).toEqual(snapshot);
    expect(arrangementDurationSeconds(snapshot)).toBe(2);
    expect(project.tracks[0]!.items[0]!.kind).toBe("arrangement");
  });
});
