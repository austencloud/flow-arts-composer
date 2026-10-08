import { describe, expect, it } from "vitest";
import * as core from "@austencloud/video-editor/core";
import * as timing from "$lib/shared/animation-engine/domain/constants/timing";

describe("values the package copies from tka", () => {
  it("keeps the playback BPM bounds", () => {
    expect(core.PLAYBACK_MIN_BPM).toBe(timing.PLAYBACK_MIN_BPM);
    expect(core.PLAYBACK_MAX_BPM).toBe(timing.PLAYBACK_MAX_BPM);
  });
});
