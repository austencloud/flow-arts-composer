import { beforeEach, describe, expect, it } from "vitest";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import {
  applySequencePathPreview,
  countPathOverrides,
  savedSequencePathPolicy,
} from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";

const arc = { pathShape: "arc", motionAwarePaths: false } as const;
const hybrid = { pathShape: "arc", motionAwarePaths: true } as const;
const concave = { pathShape: "concave", motionAwarePaths: false } as const;
function fixture() {
  return createSequenceData({
    id: "paths",
    metadata: { pathShape: "concave" },
    steps: [
      {
        id: "step-1",
        stepNumber: 1,
        duration: 1,
        letter: null,
        startPosition: null,
        endPosition: null,
        leftReversal: false,
        rightReversal: false,
        isBlank: false,
        motions: {
          left: createMotionData({
            motionType: MotionType.PRO,
            pathShape: "concave",
          }),
          right: createMotionData({
            motionType: MotionType.ANTI,
            pathShape: "linear",
          }),
        },
      } as StepData,
    ],
  });
}

describe("viewer motion paths", () => {
  beforeEach(() => localStorage.clear());

  it("previews over saved exceptions without mutating the original", () => {
    const sequence = fixture();
    const preview = applySequencePathPreview(sequence, arc)!;
    expect(countPathOverrides(sequence)).toBe(1);
    expect(preview.steps[0]!.motions.left.pathShape).toBe("arc");
    expect(preview.steps[0]!.motions.right.pathShape).toBe("arc");
    expect(sequence.steps[0]!.motions.right.pathShape).toBe("linear");
    expect(applySequencePathPreview(sequence, null)).toBe(sequence);
    expect(hashSequenceContent(preview)).not.toBe(
      hashSequenceContent(sequence)
    );
  });

  it("materializes Hybrid per hand so exported motion data retains the choice", () => {
    const preview = applySequencePathPreview(fixture(), hybrid)!;
    expect(preview.steps[0]!.motions.left.pathShape).toBe("arc");
    expect(preview.steps[0]!.motions.right.pathShape).toBe("concave");
    expect(
      savedSequencePathPolicy(JSON.parse(JSON.stringify(preview)), arc)
    ).toEqual(hybrid);
  });

  it("honors saved Concave and clears a remembered Hybrid for saved Arc", () => {
    expect(savedSequencePathPolicy(fixture(), hybrid)).toEqual(concave);
    expect(
      savedSequencePathPolicy(
        createSequenceData({ metadata: { pathShape: "arc" } }),
        hybrid
      )
    ).toEqual(arc);
    expect(savedSequencePathPolicy(null, hybrid)).toEqual(hybrid);
  });

  it("restores authored paths and leaves future viewers and disk defaults unchanged", () => {
    const vm = new AnimationVisibilityStateManager();
    vm.setPathPolicy(hybrid);
    const storage = localStorage.getItem("animation-visibility-settings");
    const close = vm.beginPathSession(concave, 2);
    vm.setPathPolicy(arc);
    expect(vm.getPathSession()?.preview).toEqual(arc);
    expect(vm.getSettings().motionAwarePaths).toBe(false);
    expect(localStorage.getItem("animation-visibility-settings")).toBe(storage);
    vm.restoreSavedPaths();
    expect(vm.getPathPolicy()).toEqual(concave);
    expect(vm.getPathSession()?.preview).toBeNull();
    close();
    expect(vm.getPathPolicy()).toEqual(hybrid);
    expect(vm.getPathSession()).toBeNull();
  });

  it("explicit defaults preserve unrelated stored preferences in a view-only link", () => {
    const vm = new AnimationVisibilityStateManager();
    vm.setGridMode("8point");
    const original = vm.snapshot();
    vm.setPersistenceSuspended(true);
    vm.setGridMode("none");
    const close = vm.beginPathSession(arc, 0);
    vm.setPathPolicy(concave);
    vm.makePathsDefault();
    const stored = JSON.parse(
      localStorage.getItem("animation-visibility-settings")!
    );
    expect(stored.pathShape).toBe("concave");
    expect(stored.gridMode).toBe("8point");
    close();
    vm.replaceAll(original, true);
    expect(vm.getPathPolicy()).toEqual(concave);
    vm.replaceAll({ ...original, ...hybrid });
    expect(vm.getPathPolicy()).toEqual(hybrid);
  });

  it("does not clear a newer preview when an earlier save finishes", () => {
    const vm = new AnimationVisibilityStateManager({ ephemeral: true });
    vm.beginPathSession(concave, 1);
    vm.setPathPolicy(arc);
    vm.setPathPolicy(hybrid);
    vm.acceptSavedPaths(arc);
    expect(vm.getPathSession()?.preview).toEqual(hybrid);
    vm.restoreSavedPaths();
    expect(vm.getPathPolicy()).toEqual(arc);
    expect(
      countPathOverrides(applySequencePathPreview(fixture(), hybrid))
    ).toBe(0);
  });

  it("restores the most recently saved paths after another preview", () => {
    const vm = new AnimationVisibilityStateManager({ ephemeral: true });
    vm.beginPathSession(concave, 1);
    vm.setPathPolicy(arc);
    vm.acceptSavedPaths(arc);
    vm.setPathPolicy(hybrid);
    vm.restoreSavedPaths();
    expect(vm.getPathPolicy()).toEqual(arc);
    expect(vm.getPathSession()).toEqual({
      preview: null,
      applied: arc,
      overrideCount: 0,
    });
  });
});
