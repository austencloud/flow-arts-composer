import { beforeEach, describe, expect, it } from "vitest";
import { page } from "$app/state";
import { createContactInspectionState } from "../../../src/routes/test/grip-lab/contact-inspection-state.svelte";
import {
  canMoveTeachingKey,
  decodeTeachingKeys,
  defaultTeachingKeys,
  encodeTeachingKeys,
} from "../../../src/routes/test/grip-lab/isolation-teaching";

function createState(search = "") {
  page.url = new URL(`https://tkaflowarts.test/test/grip-lab${search}`);
  return createContactInspectionState();
}

describe("Grip Lab keyframe state", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("recovers an unfinished drag and its undo step after a reload", () => {
    const search = "?phase=2.000&segment=2";
    const state = createState(search);
    const original = state.selectedKey!;
    state.beginEdit();
    state.editPose({ turn: 0.3 });
    state.editPose({ turn: 0.4 });

    const reloaded = createState(search);
    reloaded.restoreDraft();
    expect(reloaded.selectedKey?.turn).toBe(0.4);
    reloaded.undo();
    expect(reloaded.selectedKey).toEqual(original);
    expect(reloaded.canUndo).toBe(false);
    reloaded.redo();
    expect(reloaded.selectedKey?.turn).toBe(0.4);
  });

  it("keeps completed edits and undo/redo history across reloads", () => {
    const state = createState("?phase=2.000&segment=2");
    state.editPose({ turn: 0.3 });
    state.setTolerance(0.08);
    state.undo();

    const reloaded = createState(new URL(state.poseLink()).search);
    reloaded.restoreDraft();
    expect(reloaded.selectedKey?.turn).toBe(0.3);
    expect(reloaded.tolerance).toBe(0.13);
    expect(reloaded.canUndo).toBe(true);
    expect(reloaded.canRedo).toBe(true);
    reloaded.redo();
    expect(reloaded.tolerance).toBe(0.08);
  });

  it("keeps staff length in the link and restores it through undo after a reload", () => {
    const state = createState("?phase=3.000&staffCm=40");
    state.beginEdit();
    state.setStaffLengthM(0.65);
    state.setStaffLengthM(0.7);
    state.endEdit();

    expect(new URL(state.poseLink()).searchParams.get("staffCm")).toBe("70");
    const reloaded = createState(new URL(state.poseLink()).search);
    reloaded.restoreDraft();
    expect(reloaded.staffLengthM).toBe(0.7);
    reloaded.undo();
    expect(reloaded.staffLengthM).toBe(0.4);
    expect(new URL(reloaded.poseLink()).searchParams.get("staffCm")).toBe("40");
    reloaded.redo();
    expect(reloaded.staffLengthM).toBe(0.7);
  });

  it("saves a newly added keyframe without an explicit save action", () => {
    const state = createState("?phase=0.500&segment=0");
    const originalCount = state.keys.length;
    expect(state.addKey()).toBe(true);

    const reloaded = createState(new URL(state.poseLink()).search);
    reloaded.restoreDraft();
    expect(reloaded.keys).toHaveLength(originalCount + 1);
    expect(reloaded.selectedKey?.phase).toBe(0.5);
    reloaded.undo();
    expect(reloaded.keys).toHaveLength(originalCount);
  });

  it("respects a different explicit pose link instead of replacing it with a tab draft", () => {
    const state = createState("?phase=2.000&segment=2");
    state.editPose({ turn: 0.3 });
    const other = createState(
      "?phase=2.000&segment=2&poses=" +
        encodeURIComponent(encodeTeachingKeys(defaultTeachingKeys()))
    );
    other.restoreDraft();
    expect(other.selectedKey?.turn).toBe(defaultTeachingKeys()[2]!.turn);
    expect(other.canUndo).toBe(false);
  });

  it("keeps keyboard additions within the URL's 100-keyframe limit", () => {
    const state = createState();
    for (let i = 0; i < 200 && state.keys.length < 100; i++) {
      state.setPhase(i * 0.02);
      state.addKey();
    }
    expect(state.keys).toHaveLength(100);
    state.setPhase(3.987);
    expect(state.canAddKey).toBe(false);
    expect(state.addKey()).toBe(false);
    expect(
      decodeTeachingKeys(new URL(state.poseLink()).searchParams.get("poses"))
    ).toHaveLength(100);
  });
  it("retimes a whole pose without changing its authored channels or overwriting another key", () => {
    const state = createState("?phase=2.000&segment=2");
    const original = state.keys.find((key) => key.phase === 2)!;

    expect(canMoveTeachingKey(state.keys, 2, 2.001)).toBe(true);
    expect(state.moveKey(2, 1.375)).toBe(true);
    expect(state.transition).toBe("1");
    expect(state.phase).toBe(1.375);
    expect(state.selectedKey).toEqual({ ...original, phase: 1.375 });
    expect(state.keys).not.toContainEqual(original);
    expect(state.keys.map((key) => key.phase)).toEqual(
      [...state.keys].sort((a, b) => a.phase - b.phase).map((key) => key.phase)
    );

    const beforeCollision = state.keys.map((key) => ({ ...key }));
    expect(state.moveKey(1.375, 1)).toBe(false);
    expect(state.keys).toEqual(beforeCollision);
    expect(state.phase).toBe(1.375);
  });

  it("batches fine-grained retimes into one undo entry", () => {
    const state = createState("?phase=2.000&segment=2");

    state.beginEdit();
    expect(state.moveKey(2, 2.001)).toBe(true);
    expect(state.moveKey(2.001, 2.002)).toBe(true);
    state.endEdit();
    expect(state.selectedKey?.phase).toBe(2.002);

    state.undo();

    expect(state.selectedKey?.phase).toBe(2);
    expect(state.phase).toBe(2);
    expect(state.transition).toBe("2");
    expect(state.canUndo).toBe(false);
  });

  it("deletes the exact .538 key from eight URL poses and restores it through redo", () => {
    const [zero, one, two, three, threeAndHalf] = defaultTeachingKeys();
    const authoredKeys = [
      zero,
      { ...zero, phase: 0.538, turn: 0.2 },
      { ...zero, phase: 0.75, lean: 0.1 },
      one,
      { ...one, phase: 1.5, pitch: 0.1 },
      two,
      three,
      threeAndHalf,
    ];
    const state = createState(
      `?phase=0.538&segment=0&drift=0.071&poses=${encodeURIComponent(
        encodeTeachingKeys(authoredKeys)
      )}`
    );
    const original = state.selectedKey!;

    expect(state.keys).toHaveLength(8);
    expect(original.phase).toBeCloseTo(0.538, 3);

    expect(state.removeKey()).toBe(true);
    expect(state.selectedKey).toBeUndefined();
    expect(state.keys).toHaveLength(7);
    expect(state.keys.some((key) => Math.abs(key.phase - 0.538) < 0.005)).toBe(
      false
    );
    expect(createState(new URL(state.poseLink()).search).keys).toHaveLength(7);

    state.undo();

    expect(state.phase).toBe(0.538);
    expect(state.transition).toBe("0");
    expect(state.tolerance).toBe(0.071);
    expect(state.selectedKey).toEqual(original);
    expect(state.canRedo).toBe(true);

    state.redo();

    expect(state.keys).toHaveLength(7);
    expect(state.canRedo).toBe(false);
    expect(
      decodeTeachingKeys(new URL(state.poseLink()).searchParams.get("poses"))
    ).toEqual(state.keys);
  });

  it("keeps redo after no-op edits, then invalidates it for a real branch", () => {
    const state = createState("?phase=2.000&segment=2");

    expect(state.removeKey()).toBe(true);
    state.undo();
    expect(state.canRedo).toBe(true);

    state.setTolerance(state.tolerance);
    state.beginEdit();
    expect(state.moveKey(2, 2)).toBe(true);
    state.endEdit();
    expect(state.canRedo).toBe(true);

    state.beginEdit();
    state.editPose({ turn: 0.2 });
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);
    state.endEdit();
    expect(state.canRedo).toBe(false);
  });

  it("treats a drag as one undoable edit and safely finishes it before undo", () => {
    const state = createState("?phase=2.000&segment=2");
    const original = state.selectedKey!;

    state.beginEdit();
    state.editPose({ turn: 0.1 });
    state.editPose({ turn: 0.2 });
    state.undo();

    expect(state.selectedKey).toEqual(original);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(true);

    state.redo();

    expect(state.selectedKey?.turn).toBe(0.2);
    expect(state.canUndo).toBe(true);
  });

  it("does not add history when removal would leave no authored keys", () => {
    const [onlyKey] = defaultTeachingKeys();
    const state = createState(
      `?phase=0&poses=${encodeURIComponent(encodeTeachingKeys([onlyKey]))}`
    );

    expect(state.removeKey()).toBe(false);
    expect(state.keys).toEqual([onlyKey]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it("keeps the latest hundred undoable changes", () => {
    const state = createState();

    for (let value = 1; value <= 102; value += 1) {
      state.setTolerance(value / 1000);
    }
    for (let count = 0; count < 100; count += 1) state.undo();

    expect(state.tolerance).toBe(0.002);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(true);
  });

  it("moves between neighboring keyframes and wraps around the loop", () => {
    const state = createState("?phase=3.500");

    state.seekKeyframe(1);
    expect(state.phase).toBe(0);
    state.seekKeyframe(-1);
    expect(state.phase).toBe(3.5);
  });

  it("treats South and zero as the same selected key with the same tolerance", () => {
    const state = createState("?phase=4.000");

    expect(state.selectedKey?.phase).toBe(0);
    expect(state.canAddKey).toBe(false);
    state.setPhase(0.0049);
    expect(state.selectedKey?.phase).toBe(0);
    state.setPhase(0.006);
    expect(state.selectedKey).toBeUndefined();
    expect(state.canAddKey).toBe(true);
  });
});
