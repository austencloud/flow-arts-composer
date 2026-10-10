import { describe, it, expect, beforeEach } from "vitest";
import { createCovenHubState } from "#lib/features/coven-hub/state/coven-hub-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const seq = { id: "s1", word: "CAKE", steps: [], isCircular: true } as unknown as SequenceData;

describe("createCovenHubState", () => {
  let s: ReturnType<typeof createCovenHubState>;
  beforeEach(() => (s = createCovenHubState()));

  it("starts empty with the picker open", () => {
    expect(s.activeSequence).toBeNull();
    expect(s.pickerOpen).toBe(true);
  });

  it("loading a sequence sets it active and closes the picker", () => {
    s.setSequence(seq);
    expect(s.activeSequence?.id).toBe("s1");
    expect(s.pickerOpen).toBe(false);
  });

  it("can reopen the picker without clearing the active sequence", () => {
    s.setSequence(seq);
    s.openPicker();
    expect(s.pickerOpen).toBe(true);
    expect(s.activeSequence?.id).toBe("s1");
  });

  it("defaults nav mode to orbit and can switch it", () => {
    expect(s.navMode).toBe("orbit");
    s.setNavMode("fly");
    expect(s.navMode).toBe("fly");
  });
});
