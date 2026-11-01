import { describe, expect, it } from "vitest";
import {
  CREATE_ENTRY_HOLD_CAP_MS,
  decideCreateEntrySource,
} from "../create-method-entry-gate";

const entering = {
  doorOpen: false,
  entering: true,
  panelReady: false,
  picturesReady: false,
  elapsedMs: 0,
  capMs: 560,
};

describe("decideCreateEntrySource", () => {
  it("keeps the board while its door is open, whatever is ready", () => {
    expect(
      decideCreateEntrySource({
        ...entering,
        doorOpen: true,
        panelReady: true,
        picturesReady: true,
        elapsedMs: 10_000,
      })
    ).toEqual({ source: "door", cappedOut: false });
  });

  it("holds a tap on the board while the panel or its pictures are missing", () => {
    expect(decideCreateEntrySource(entering).source).toBe("door");
    expect(
      decideCreateEntrySource({ ...entering, panelReady: true, elapsedMs: 559 })
        .source
    ).toBe("door");
    // Pictures reported without a panel do not count as a finished workspace.
    expect(
      decideCreateEntrySource({ ...entering, picturesReady: true }).source
    ).toBe("door");
  });

  it("swaps as soon as the panel and pictures are ready, before the cap", () => {
    expect(
      decideCreateEntrySource({
        ...entering,
        panelReady: true,
        picturesReady: true,
        elapsedMs: 40,
      })
    ).toEqual({ source: "workspace", cappedOut: false });
  });

  it("swaps at the cap anyway and says it capped out", () => {
    expect(
      decideCreateEntrySource({ ...entering, panelReady: true, elapsedMs: 560 })
    ).toEqual({ source: "workspace", cappedOut: true });
  });

  it("shows a workspace reached without a tap at once", () => {
    expect(decideCreateEntrySource({ ...entering, entering: false })).toEqual({
      source: "workspace",
      cappedOut: false,
    });
  });

  it("defaults the cap to two emphasis fades", () => {
    expect(CREATE_ENTRY_HOLD_CAP_MS).toBeGreaterThan(0);
    const { capMs: _ignored, ...withoutCap } = entering;
    expect(
      decideCreateEntrySource({
        ...withoutCap,
        elapsedMs: CREATE_ENTRY_HOLD_CAP_MS - 1,
      }).source
    ).toBe("door");
    expect(
      decideCreateEntrySource({
        ...withoutCap,
        elapsedMs: CREATE_ENTRY_HOLD_CAP_MS,
      }).cappedOut
    ).toBe(true);
  });
});
