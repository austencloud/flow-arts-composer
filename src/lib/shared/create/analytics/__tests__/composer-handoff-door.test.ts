// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  markComposerHandoffDoor,
  takeComposerHandoffDoor,
} from "../composer-handoff-door";

describe("composer hand-over door", () => {
  beforeEach(() => localStorage.clear());

  it("carries the door and arrival to Create once", () => {
    markComposerHandoffDoor({ door: "composer_line", arrival: "cold_scan" }, 1000);
    expect(takeComposerHandoffDoor(2000)).toEqual({
      door: "composer_line",
      arrival: "cold_scan",
    });
    expect(takeComposerHandoffDoor(2000)).toBeNull();
  });

  // A later, unrelated hand-over (Browse's Edit) must not claim a door that
  // Create never loaded.
  it("drops a door that went stale", () => {
    markComposerHandoffDoor({ door: "close" }, 0);
    expect(takeComposerHandoffDoor(11 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem("tka-pending-edit-door")).toBeNull();
  });
});
