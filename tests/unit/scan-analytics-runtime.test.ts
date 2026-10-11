import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
  const order: string[] = [];
  const instance = {
    register_for_session: vi.fn(() => order.push("register")),
    capture: vi.fn(
      (
        eventName: string,
        properties: Record<string, unknown>,
        _options?: unknown
      ) => {
        order.push(`${eventName}:${String(properties.action ?? "")}`);
      }
    ),
  };

  return {
    ready: false,
    readyListener: null as ((instance: typeof instance) => void) | null,
    order,
    instance,
    captureEvent: vi.fn(
      (
        eventName: string,
        properties: Record<string, unknown>,
        options?: unknown
      ) => instance.capture(eventName, properties, options)
    ),
    captureEventWithPostHog: vi.fn(
      (
        target: typeof instance,
        eventName: string,
        properties: Record<string, unknown>,
        options?: unknown
      ) => target.capture(eventName, properties, options)
    ),
  };
});

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/shared/foundation/services/device-id.js", () => ({
  getDeviceId: () => "device-1",
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: runtime.captureEvent,
  captureEventWithPostHog: runtime.captureEventWithPostHog,
  getPostHogInstance: () => (runtime.ready ? runtime.instance : null),
  onPostHogReady: (listener: (instance: typeof runtime.instance) => void) => {
    runtime.readyListener = listener;
    return () => {
      if (runtime.readyListener === listener) runtime.readyListener = null;
    };
  },
}));

import {
  _resetScanAnalytics,
  beginScanVisit,
  captureScanAction,
  captureScanPlaybackChanged,
  captureScanPracticeChanged,
  captureScanViewChanged,
  captureScanViewerOpened,
  endScanViewerSession,
  scanBaseProperties,
  updateScanAttribution,
} from "#lib/shared/analytics/scan-analytics.js";

describe("scan analytics runtime delivery", () => {
  beforeEach(() => {
    _resetScanAnalytics();
    sessionStorage.clear();
    runtime.ready = false;
    runtime.readyListener = null;
    runtime.order.length = 0;
    runtime.instance.register_for_session.mockClear();
    runtime.instance.capture.mockClear();
    runtime.captureEvent.mockClear();
    runtime.captureEventWithPostHog.mockClear();
  });

  it("flushes pre-ready events in order with their event-time base properties", () => {
    beginScanVisit("0017", { isAuthenticated: () => false });
    captureScanAction("first");
    updateScanAttribution({
      sequenceWord: "Σ-OY-G",
      deckId: "deck-1",
      deckName: "Choreo Cards",
    });
    captureScanAction("second");

    expect(runtime.instance.capture).not.toHaveBeenCalled();

    runtime.ready = true;
    runtime.readyListener?.(runtime.instance);

    expect(runtime.order).toEqual([
      "register",
      "qr_action:first",
      "qr_action:second",
    ]);
    expect(runtime.instance.capture).toHaveBeenNthCalledWith(
      1,
      "qr_action",
      {
        short_code: "0017",
        sequence_word: null,
        deck_id: null,
        deck_name: null,
        left_prop: null,
        right_prop: null,
        mixed_props: null,
        is_authenticated: false,
        device_id: "device-1",
        scan_session_id: expect.any(String),
        action: "first",
      },
      undefined
    );
    expect(runtime.instance.capture).toHaveBeenNthCalledWith(
      2,
      "qr_action",
      expect.objectContaining({
        short_code: "0017",
        sequence_word: "Σ-OY-G",
        deck_id: "deck-1",
        deck_name: "Choreo Cards",
        is_authenticated: false,
        device_id: "device-1",
        scan_session_id: expect.any(String),
        action: "second",
      }),
      undefined
    );
  });

  it("keeps an unresolved visit id, then retires it after a real viewer exit", () => {
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");

    beginScanVisit("0017");
    const unresolvedId = scanBaseProperties()?.scan_session_id;
    endScanViewerSession("route_unmount");

    captureScanAction("leaked_after_failed_route");
    expect(scanBaseProperties()).toBeNull();

    beginScanVisit("0017");
    expect(scanBaseProperties()?.scan_session_id).toBe(unresolvedId);

    captureScanViewerOpened("split");
    endScanViewerSession("close_button");
    expect(sessionStorage.getItem("tka:scan-session:0017")).toBeNull();

    beginScanVisit("0017");
    expect(scanBaseProperties()?.scan_session_id).toBe(
      "00000000-0000-4000-8000-000000000002"
    );
    expect(scanBaseProperties()?.scan_session_id).not.toBe(unresolvedId);

    randomUuid.mockRestore();
  });

  it("enriches an active route visit without resetting its id or progress", () => {
    let authenticated = false;
    beginScanVisit("0017", {
      sequenceWord: "Σ-OY-G",
      deckId: "deck-1",
      deckName: "Choreo Cards",
      leftProp: "fan",
      rightProp: "hoop",
    });
    const routeVisitId = scanBaseProperties()?.scan_session_id;

    captureScanViewerOpened("split");
    captureScanAction("first");
    authenticated = true;
    beginScanVisit("0017", {
      leftProp: null,
      rightProp: null,
      isAuthenticated: () => authenticated,
    });
    updateScanAttribution({ leftProp: null, rightProp: null });

    expect(scanBaseProperties()).toEqual(
      expect.objectContaining({
        scan_session_id: routeVisitId,
        sequence_word: "Σ-OY-G",
        deck_id: "deck-1",
        deck_name: "Choreo Cards",
        left_prop: "fan",
        right_prop: "hoop",
        mixed_props: true,
        is_authenticated: true,
      })
    );

    captureScanAction("second");
    endScanViewerSession("close_button");

    runtime.ready = true;
    runtime.readyListener?.(runtime.instance);

    expect(runtime.instance.capture).not.toHaveBeenCalledWith(
      "qr_action",
      expect.objectContaining({ action: "leaked_after_failed_route" }),
      undefined
    );

    expect(runtime.instance.capture).toHaveBeenCalledWith(
      "qr_action",
      expect.objectContaining({
        action: "first",
        is_authenticated: false,
      }),
      undefined
    );
    expect(runtime.instance.capture).toHaveBeenCalledWith(
      "qr_action",
      expect.objectContaining({
        action: "second",
        is_authenticated: true,
      }),
      undefined
    );
    expect(runtime.instance.capture).toHaveBeenCalledWith(
      "qr_session_summary",
      expect.objectContaining({
        interaction_count: 2,
        last_mode: "split",
      }),
      undefined
    );
  });

  it("counts composite viewer actions once while retaining each semantic event", () => {
    beginScanVisit("0017");
    captureScanViewerOpened("card");

    captureScanViewChanged("card", "animation", "card_qr_badge", {
      count: false,
    });
    captureScanPlaybackChanged({
      action: "qr_play",
      previous_value: false,
      value: true,
      source: "card_qr_badge",
    });

    captureScanAction("overflow_open");
    captureScanAction("favorite");
    captureScanAction("overflow_close", {}, { count: false });

    captureScanViewChanged("animation", "practice", "practice_enter", {
      count: false,
    });
    captureScanPracticeChanged("entered");
    endScanViewerSession("close_button");

    runtime.ready = true;
    runtime.readyListener?.(runtime.instance);

    expect(runtime.instance.capture).toHaveBeenCalledWith(
      "qr_session_summary",
      expect.objectContaining({
        interaction_count: 4,
        last_mode: "practice",
        played: true,
        practiced: true,
      }),
      undefined
    );
    expect(runtime.instance.capture).toHaveBeenCalledWith(
      "qr_action",
      expect.objectContaining({ action: "overflow_close" }),
      undefined
    );
  });
});
