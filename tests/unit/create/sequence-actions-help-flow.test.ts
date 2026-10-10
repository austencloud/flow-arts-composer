import { describe, expect, it } from "vitest";
import { getHelpModeAfterDetailClose } from "#lib/features/create/shared/components/sequence-actions/sequence-actions-help-flow.js";

describe("Sequence Actions help return path", () => {
  it("returns a mobile long-press detail directly to the actions", () => {
    expect(getHelpModeAfterDetailClose("direct")).toBe("inactive");
  });

  it("returns the desktop detail to the Help selector", () => {
    expect(getHelpModeAfterDetailClose("selector")).toBe("selecting");
  });
});
