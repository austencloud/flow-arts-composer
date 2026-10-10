import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: vi.fn(),
}));

vi.mock("#lib/shared/analytics/analytics-context.js", () => ({
  withRoute: (properties: Record<string, unknown>) => ({
    page: "/browse/gallery",
    ...properties,
  }),
}));

import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";
import {
  trackSequenceRemixStarted,
  trackSequenceViewed,
  trackViewerAction,
  trackViewerSettingChanged,
  trackViewerViewChanged,
} from "#lib/shared/sequence-viewer/analytics/viewer-events.js";

const context = {
  sequenceId: "sequence-1",
  source: "browse_gallery",
} as const;

describe("general sequence viewer events", () => {
  beforeEach(() => vi.mocked(captureWhenReady).mockClear());

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures viewer entry, actions, and remix intent with one source vocabulary", () => {
    trackSequenceViewed(context);
    trackViewerAction(context, "favorite", { value: true });
    trackSequenceRemixStarted(context);
    trackViewerViewChanged(context, "card", "animation", "content_rail");

    expect(vi.mocked(captureWhenReady).mock.calls).toEqual([
      [
        "sequence_view",
        {
          page: "/browse/gallery",
          viewer_source: "browse_gallery",
          sequence_id: "sequence-1",
        },
      ],
      [
        "viewer_action",
        {
          page: "/browse/gallery",
          viewer_source: "browse_gallery",
          sequence_id: "sequence-1",
          action: "favorite",
          value: true,
        },
      ],
      [
        "sequence_remix_started",
        {
          page: "/browse/gallery",
          viewer_source: "browse_gallery",
          sequence_id: "sequence-1",
        },
      ],
      [
        "viewer_view_changed",
        {
          page: "/browse/gallery",
          viewer_source: "browse_gallery",
          sequence_id: "sequence-1",
          from_mode: "card",
          to_mode: "animation",
          source: "content_rail",
        },
      ],
    ]);
  });

  it("coalesces continuous settings without losing the original value", () => {
    vi.useFakeTimers();

    trackViewerSettingChanged(context, {
      group: "playback",
      setting: "bpm",
      previous_value: 60,
      value: 61,
      source: "slider",
      coalesce: true,
      count: true,
    });
    trackViewerSettingChanged(context, {
      group: "playback",
      setting: "bpm",
      previous_value: 61,
      value: 72,
      source: "slider",
      coalesce: true,
      count: true,
    });

    expect(captureWhenReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);

    expect(captureWhenReady).toHaveBeenCalledTimes(1);
    expect(captureWhenReady).toHaveBeenCalledWith("viewer_setting_changed", {
      page: "/browse/gallery",
      viewer_source: "browse_gallery",
      sequence_id: "sequence-1",
      group: "playback",
      setting: "bpm",
      previous_value: 60,
      value: 72,
      source: "slider",
    });
  });

  it("omits scalar and view transitions that did not change state", () => {
    trackViewerSettingChanged(context, {
      group: "playback",
      setting: "bpm",
      previous_value: 60,
      value: 60,
      source: "slider",
    });
    trackViewerViewChanged(context, "card", "card", "content_rail");

    expect(captureWhenReady).not.toHaveBeenCalled();
  });
});
