import { afterEach, describe, expect, it } from "vitest";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";
import { FALG } from "#lib/shared/combination/domain/demo-fixtures.js";
import { Plane } from "@austencloud/scene-3d";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const dispose: Array<() => void> = [];
function makeViewer() {
  const result = createViewer3DStateForTest({ persistent: false });
  result.state.performerManager.initialize();
  dispose.push(() => {
    result.state.performerManager.destroy();
    result.dispose();
  });
  return result.state;
}
afterEach(() => {
  while (dispose.length) dispose.pop()?.();
});

describe("3D performer copy and paste", () => {
  it("copies the selected character's score, appearance, planes, pose and placement independently", () => {
    const viewer = makeViewer();
    const source = viewer.performerManager.performers[0]!;
    source.loadSequence(FALG);
    source.setProp(PropType.FAN);
    source.setEffort("glide");
    source.setHandPlane("left", Plane.WHEEL);
    source.setStepHandPlane(2, "right", Plane.FLOOR);
    source.setPropBuild({ fanBuild: "fire" });
    source.position.x = 2;
    source.position.z = -1;
    source.snapFacingAngle(1.25);
    source.goToStep(3);
    source.setProgress(0.4);
    viewer.replacePerformerSelection(0);

    expect(viewer.copySelectedPerformer()).toBe(true);
    source.setProp(PropType.STAFF);
    source.clearStepPlaneOverrides(2);
    source.position.x = 9;
    expect(viewer.pasteSelectedPerformer()).toBe(true);

    const copy = viewer.performerManager.performers[1]!;
    expect(copy.loadedSequence).toEqual(FALG);
    expect(copy.settings.prop).toBe(PropType.FAN);
    expect(copy.settings.effortId).toBe("glide");
    expect(copy.settings.propBuild).toEqual({ fanBuild: "fire" });
    expect(copy.customLeftPlane).toBe(Plane.WHEEL);
    expect(copy.beatPlaneOverrides.get(2)?.right).toBe(Plane.FLOOR);
    expect(copy.currentStepIndex).toBe(3);
    expect(copy.progress).toBeCloseTo(0.4);
    expect(copy.position).toMatchObject({ x: 2.75, z: -0.25 });
    expect(copy.facingAngle).toBeCloseTo(1.25);
    expect(source.position.x).toBe(9);
    expect(viewer.selectedPerformerIndices).toEqual([1]);

    copy.setProp(PropType.POI);
    expect(source.settings.prop).toBe(PropType.STAFF);
  });

  it("undoes a paste and redoes the copied state after the source and clipboard change", () => {
    const viewer = makeViewer();
    const source = viewer.performerManager.performers[0]!;
    source.loadSequence(FALG);
    source.setProp(PropType.FAN);
    source.setHandPlane("left", Plane.WHEEL);
    source.setStepHandPlane(2, "right", Plane.FLOOR);
    source.position.x = 2;
    source.snapFacingAngle(1.25);
    source.goToStep(3);
    source.setProgress(0.4);
    viewer.replacePerformerSelection(0);

    expect(viewer.copySelectedPerformer()).toBe(true);
    expect(viewer.pasteSelectedPerformer()).toBe(true);
    const copy = viewer.performerManager.performers[1]!;
    viewer.sceneUndo.withoutUndo(() => {
      copy.setProp(PropType.POI);
      source.setProp(PropType.STAFF);
    });
    viewer.replacePerformerSelection(0);
    expect(viewer.copySelectedPerformer()).toBe(true);

    expect(viewer.undo()).toBe("Paste performer");
    expect(viewer.performerManager.performers).toHaveLength(1);
    expect(viewer.selectedPerformerIndices).toEqual([0]);

    expect(viewer.redo()).toBe("Paste performer");
    const restored = viewer.performerManager.performers[1]!;
    expect(restored.loadedSequence).toEqual(FALG);
    expect(restored.settings.prop).toBe(PropType.FAN);
    expect(restored.customLeftPlane).toBe(Plane.WHEEL);
    expect(restored.beatPlaneOverrides.get(2)?.right).toBe(Plane.FLOOR);
    expect(restored.position).toMatchObject({ x: 2.75, z: 0.75 });
    expect(restored.facingAngle).toBeCloseTo(1.25);
    expect(restored.currentStepIndex).toBe(3);
    expect(restored.progress).toBeCloseTo(0.4);
    expect(viewer.selectedPerformerIndices).toEqual([1]);
  });

  it("does not paste without a copy and respects the cast limit", () => {
    const viewer = makeViewer();
    expect(viewer.pasteSelectedPerformer()).toBe(false);
    viewer.replacePerformerSelection(0);
    expect(viewer.copySelectedPerformer()).toBe(true);
    while (
      viewer.performerManager.performers.length <
      viewer.performerManager.maxPerformers
    ) {
      viewer.performerManager.addPerformer();
    }
    expect(viewer.pasteSelectedPerformer()).toBe(false);
  });

  it("does not silently choose one character from a multi-selection", () => {
    const viewer = makeViewer();
    viewer.performerManager.addPerformer();
    viewer.selectAllPerformers();
    expect(viewer.copySelectedPerformer()).toBe(false);
    viewer.replacePerformerSelection(1);
    expect(viewer.copySelectedPerformer()).toBe(true);
  });
});
