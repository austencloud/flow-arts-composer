import { describe, it, expect } from "vitest";
import { SequenceViewerVisibilityState } from "#lib/shared/sequence-viewer/state/viewer-visibility-state.svelte.js";

describe("SequenceViewerVisibilityState", () => {
  it("starts with both motions visible", () => {
    const s = new SequenceViewerVisibilityState();
    expect(s.leftMotion).toBe(true);
    expect(s.rightMotion).toBe(true);
  });

  it("setLeftMotion(false) hides left when right is visible", () => {
    const s = new SequenceViewerVisibilityState();
    s.setLeftMotion(false);
    expect(s.leftMotion).toBe(false);
    expect(s.rightMotion).toBe(true);
  });

  it("setRightMotion(false) hides right when left is visible", () => {
    const s = new SequenceViewerVisibilityState();
    s.setRightMotion(false);
    expect(s.leftMotion).toBe(true);
    expect(s.rightMotion).toBe(false);
  });

  it("hiding the last visible motion flips the other on", () => {
    const s = new SequenceViewerVisibilityState();
    s.setLeftMotion(false);
    // Right is the only visible one, so hiding it flips left back on.
    s.setRightMotion(false);
    expect(s.leftMotion).toBe(true);
    expect(s.rightMotion).toBe(false);
  });

  it("toggleLeft flips left visibility", () => {
    const s = new SequenceViewerVisibilityState();
    s.toggleLeft();
    expect(s.leftMotion).toBe(false);
    s.toggleLeft();
    expect(s.leftMotion).toBe(true);
  });

  it("reset restores both motions to visible", () => {
    const s = new SequenceViewerVisibilityState();
    s.setLeftMotion(false);
    s.reset();
    expect(s.leftMotion).toBe(true);
    expect(s.rightMotion).toBe(true);
  });

  it("isSolo is true when exactly one motion is visible", () => {
    const s = new SequenceViewerVisibilityState();
    expect(s.isSolo).toBe(false);
    s.setLeftMotion(false);
    expect(s.isSolo).toBe(true);
    s.setLeftMotion(true);
    expect(s.isSolo).toBe(false);
  });

  it("soloHand returns the visible performer hand when solo", () => {
    const s = new SequenceViewerVisibilityState();
    expect(s.soloHand).toBeUndefined();
    s.setLeftMotion(false);
    expect(s.soloHand).toBe("right");
    s.setLeftMotion(true);
    s.setRightMotion(false);
    expect(s.soloHand).toBe("left");
  });

  describe("allowNone (landing spinner — prop existence is a free variable)", () => {
    it("permits hiding the last visible motion (both off)", () => {
      const s = new SequenceViewerVisibilityState(true);
      s.setLeftMotion(false);
      s.setRightMotion(false);
      expect(s.leftMotion).toBe(false);
      expect(s.rightMotion).toBe(false);
    });

    it("toggles each hand independently with both able to be off", () => {
      const s = new SequenceViewerVisibilityState(true);
      s.toggleLeft(); // left off
      s.toggleRight(); // right off, not flipped back on
      expect(s.leftMotion).toBe(false);
      expect(s.rightMotion).toBe(false);
      s.toggleLeft(); // left back on
      expect(s.leftMotion).toBe(true);
      expect(s.rightMotion).toBe(false);
    });

    it("default (allowNone=false) still flips the other on", () => {
      const s = new SequenceViewerVisibilityState();
      s.setLeftMotion(false);
      s.setRightMotion(false);
      expect(s.rightMotion).toBe(false);
      expect(s.leftMotion).toBe(true);
    });
  });
});
