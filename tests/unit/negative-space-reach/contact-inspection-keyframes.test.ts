import { describe, expect, it } from "vitest";
import { page } from "$app/state";
import { createContactInspectionState } from "../../../src/routes/test/grip-lab/contact-inspection-state.svelte";
import {
  canMoveTeachingKey,
  decodeTeachingKeys,
} from "../../../src/routes/test/grip-lab/isolation-teaching";

function createState(search = "") {
  page.url = new URL(`https://tkaflowarts.test/test/grip-lab${search}`);
  return createContactInspectionState();
}

describe("Grip Lab keyframe state", () => {
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
    expect(state.canUndo).toBe(false);
  });

  it("restores a deleted key, its selection, and its pose URL with one undo", () => {
    const state = createState("?phase=3.000&segment=3");
    const original = state.selectedKey!;

    expect(state.removeKey()).toBe(true);
    expect(state.selectedKey).toBeUndefined();
    expect(state.keys.some((key) => key.phase === 3)).toBe(false);

    state.undo();

    expect(state.phase).toBe(3);
    expect(state.transition).toBe("3");
    expect(state.selectedKey).toEqual(original);
    expect(
      decodeTeachingKeys(new URL(state.poseLink()).searchParams.get("poses"))
    ).toEqual(state.keys);
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
