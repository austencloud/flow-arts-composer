import { beforeEach, describe, expect, it, vi } from "vitest";

const postHogMock = vi.hoisted(() => {
  const order: string[] = [];
  const instance = {
    init: vi.fn(),
    register_for_session: vi.fn(() => order.push("register")),
    reloadFeatureFlags: vi.fn(),
  };
  return { instance, order };
});

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/env/public", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule({
    PUBLIC_POSTHOG_HOST: "https://test.posthog.com",
    PUBLIC_POSTHOG_KEY: "test-key",
    PUBLIC_POSTHOG_PROJECT_ID: "test-project",
  });
});
vi.mock("#lib/shared/foundation/services/device-id.js", () => ({
  getDeviceId: () => "device-1",
}));
vi.mock("posthog-js", () => ({ default: postHogMock.instance }));

import { initPostHog } from "#lib/shared/analytics/services/posthog.js";
import {
  _resetScanAnalytics,
  beginScanVisit,
  updateScanAttribution,
} from "#lib/shared/analytics/scan-analytics.js";

describe("scan attribution at PostHog readiness", () => {
  beforeEach(() => {
    sessionStorage.clear();
    postHogMock.order.length = 0;
    postHogMock.instance.init.mockClear();
    postHogMock.instance.register_for_session.mockClear();
    postHogMock.instance.reloadFeatureFlags.mockClear();
    _resetScanAnalytics();
  });

  it("registers the latest full scan base before the initial pageview", async () => {
    postHogMock.instance.init.mockImplementation((_key, config) => {
      config.loaded(postHogMock.instance);
      postHogMock.order.push("pageview");
    });

    beginScanVisit("old-code", { isAuthenticated: () => false });
    beginScanVisit("0017", { isAuthenticated: () => true });
    updateScanAttribution({
      sequenceWord: "Σ-OY-G",
      deckId: "deck-1",
      deckName: "Choreo Cards",
      leftProp: "fan",
      rightProp: "hoop",
    });

    await initPostHog();

    expect(postHogMock.order.slice(0, 2)).toEqual(["register", "pageview"]);
    expect(postHogMock.instance.register_for_session).toHaveBeenCalledOnce();
    expect(postHogMock.instance.register_for_session).toHaveBeenCalledWith({
      short_code: "0017",
      sequence_word: "Σ-OY-G",
      deck_id: "deck-1",
      deck_name: "Choreo Cards",
      left_prop: "fan",
      right_prop: "hoop",
      mixed_props: true,
      is_authenticated: true,
      device_id: "device-1",
      scan_session_id: expect.any(String),
    });
  });
});
