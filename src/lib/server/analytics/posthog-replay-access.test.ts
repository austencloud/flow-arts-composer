import { describe, expect, it } from "vitest";
import { mapPostHogRecordingLookup } from "./posthog-replay-access";

describe("mapPostHogRecordingLookup", () => {
  it("lets sharing go ahead once PostHog has the recording", () => {
    expect(mapPostHogRecordingLookup(200)).toBeNull();
  });

  it("reads a recording PostHog does not have yet as still processing", () => {
    expect(mapPostHogRecordingLookup(404)?.state).toBe("processing");
  });

  it("reports a key without recording access as configuration", () => {
    expect(mapPostHogRecordingLookup(403)?.state).toBe("configuration");
  });
});
