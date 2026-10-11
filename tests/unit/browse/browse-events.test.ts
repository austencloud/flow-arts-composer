import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: vi.fn(),
}));

vi.mock("#lib/shared/analytics/analytics-context.js", () => ({
  withRoute: (properties: Record<string, unknown>) => ({
    page: "/browse/[section]",
    ...properties,
  }),
}));

import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";
import {
  trackBrowseCollectionOpened,
  trackBrowseDestinationEntered,
  trackBrowseVisualTypeOpened,
  trackPerformancePlaybackIntent,
  trackTunnelEditStarted,
} from "#lib/shared/analytics/browse-events.js";

describe("browse decision events", () => {
  beforeEach(() => vi.mocked(captureWhenReady).mockClear());

  it("uses one bounded destination event", () => {
    trackBrowseDestinationEntered("library");

    expect(captureWhenReady).toHaveBeenCalledWith(
      "browse_destination_entered",
      { page: "/browse/[section]", destination: "library" }
    );
  });

  it("keeps collection, visual, edit, and playback intents distinct", () => {
    trackBrowseCollectionOpened("community-card");
    trackBrowseVisualTypeOpened("tunnel");
    trackTunnelEditStarted("gallery-card");
    trackPerformancePlaybackIntent();

    expect(vi.mocked(captureWhenReady).mock.calls).toEqual([
      [
        "browse_collection_opened",
        { page: "/browse/[section]", entry: "community-card" },
      ],
      [
        "browse_visual_type_opened",
        { page: "/browse/[section]", type: "tunnel" },
      ],
      [
        "browse_tunnel_edit_started",
        { page: "/browse/[section]", entry: "gallery-card" },
      ],
      [
        "browse_performance_playback_intent",
        { page: "/browse/[section]", subject_type: "sequence" },
      ],
    ]);
  });
});
