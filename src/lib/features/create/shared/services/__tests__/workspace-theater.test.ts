import { describe, expect, it } from "vitest";
import { workspaceTheaterActive } from "../workspace-theater";

// The flag hides Undo/Redo, Save and the whole bottom bar. Getting it wrong
// looks fine in a screenshot of the running preview, so the cases that would
// strand the user without a control are pinned here.
describe("workspaceTheaterActive", () => {
  const sideways = { theaterViewport: true, preparationFailed: false };

  it("stays off when nothing is playing, so the editing chrome is untouched", () => {
    expect(
      workspaceTheaterActive({ ...sideways, playing: false, preparing: false })
    ).toBe(false);
  });

  it("covers the preview and the load before it", () => {
    expect(
      workspaceTheaterActive({ ...sideways, playing: true, preparing: false })
    ).toBe(true);
    expect(
      workspaceTheaterActive({ ...sideways, playing: false, preparing: true })
    ).toBe(true);
  });

  it("brings the bar back when loading fails, because Retry lives there", () => {
    expect(
      workspaceTheaterActive({
        theaterViewport: true,
        playing: false,
        preparing: true,
        preparationFailed: true,
      })
    ).toBe(false);
  });

  it("never applies outside the short, wide viewport", () => {
    expect(
      workspaceTheaterActive({
        theaterViewport: false,
        playing: true,
        preparing: false,
        preparationFailed: false,
      })
    ).toBe(false);
  });
});
