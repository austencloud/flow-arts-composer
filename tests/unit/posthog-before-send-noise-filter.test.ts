import { describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "posthog-js";

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/env/public", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule({ PUBLIC_POSTHOG_KEY: "test-key" });
});
vi.mock("#lib/shared/foundation/services/device-id.js", () => ({
  getDeviceId: () => "device-1",
}));
vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), reloadFeatureFlags: vi.fn() },
}));

import { dropKnownNoise } from "#lib/shared/analytics/services/posthog.js";

/**
 * `dropKnownNoise` is the `before_send` hook wired into `posthog.init(...)`.
 * Its return contract is the one place a bug is invisible in production: a
 * branch that returns `undefined` instead of the event is indistinguishable
 * to posthog-js from an explicit `null`, and BOTH silently drop the event
 * with no exception, no failed build, no console error a developer would
 * notice — see the contract comment above `dropKnownNoise` in posthog.ts.
 * These tests exist to make that regression visible in CI instead of in a
 * days-later "why did $exception volume flatline" investigation.
 */
function exceptionEvent(value: string): CaptureResult {
  return {
    uuid: "test-uuid",
    event: "$exception",
    properties: {
      $exception_list: [
        {
          type: "Error",
          value,
          mechanism: { type: "generic", handled: true, synthetic: false },
        },
      ],
    },
  };
}

describe("dropKnownNoise (PostHog before_send)", () => {
  it("passes null straight through — not this hook's event to judge", () => {
    expect(dropKnownNoise(null)).toBeNull();
  });

  it("passes through any non-$exception event unchanged", () => {
    const event: CaptureResult = {
      uuid: "test-uuid",
      event: "sequence_save",
      properties: { word: "ABC" },
    };
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("passes through an $exception event with no $exception_list", () => {
    const event: CaptureResult = {
      uuid: "test-uuid",
      event: "$exception",
      properties: {},
    };
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("drops the Firestore multi-tab lease election noise", () => {
    const event = exceptionEvent(
      "Failed to obtain primary lease for action 'Backfill Indexes'"
    );
    expect(dropKnownNoise(event)).toBeNull();
  });

  // Every action name that reaches runTransaction(_, "readwrite-primary") in
  // the installed @firebase/firestore 4.14.1. The filter used to list only the
  // first three, which missed the two that actually fire in normal use.
  it("drops the Firestore lease noise for every readwrite-primary action", () => {
    for (const action of [
      "Backfill Indexes",
      "Collect garbage",
      "Release target",
      "Acknowledge batch",
      "Apply remote event",
      "Reject batch",
      "maybeGarbageCollectMultiClientState",
    ]) {
      const event = exceptionEvent(
        `Failed to obtain primary lease for action '${action}'`
      );
      expect(dropKnownNoise(event)).toBeNull();
    }
  });

  it("drops a lease failure for an action name the SDK has yet to add", () => {
    // Deliberate: this message shape is only ever emitted by Firestore's own
    // background maintenance, so a new action name is more of the same noise
    // rather than new behaviour worth surfacing.
    const event = exceptionEvent(
      "Failed to obtain primary lease for action 'Something New'"
    );
    expect(dropKnownNoise(event)).toBeNull();
  });

  it("drops the ResizeObserver backpressure noise", () => {
    const event = exceptionEvent(
      "ResizeObserver loop completed with undelivered notifications."
    );
    expect(dropKnownNoise(event)).toBeNull();
  });

  it("drops the iOS Safari messaging/unsupported-browser noise", () => {
    const event = exceptionEvent(
      "FirebaseError: Messaging: This browser doesn't support the API's required to use the Firebase SDK. (messaging/unsupported-browser)."
    );
    expect(dropKnownNoise(event)).toBeNull();
  });

  it("drops Firestore's expected cache-clear shutdown messages", () => {
    expect(
      dropKnownNoise(exceptionEvent("Firestore shutting down"))
    ).toBeNull();
    expect(
      dropKnownNoise(
        exceptionEvent(
          "@firebase/firestore: Firestore (12.1.0): Uncaught Error in snapshot listener: FirebaseError: [code=aborted]: Firestore shutting down"
        )
      )
    ).toBeNull();
  });

  it("drops the browser's opaque cross-origin Script error sentinel", () => {
    expect(dropKnownNoise(exceptionEvent("Script error."))).toBeNull();
    expect(dropKnownNoise(exceptionEvent("Script error"))).toBeNull();
  });

  it("drops the expected Google One Tap FedCM cancellation", () => {
    expect(
      dropKnownNoise(
        exceptionEvent(
          "[GSI_LOGGER]: FedCM get() rejects with AbortError: signal is aborted without reason"
        )
      )
    ).toBeNull();
  });

  it("keeps actionable Google Identity configuration failures visible", () => {
    const event = exceptionEvent(
      "[GSI_LOGGER]: The given origin is not allowed for the given client ID."
    );
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("keeps actionable errors that merely mention a script error", () => {
    const event = exceptionEvent("Script error while saving a sequence");
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("keeps other Firestore aborted errors visible", () => {
    const event = exceptionEvent(
      "FirebaseError: [code=aborted]: transaction contention"
    );
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("passes through a real, unrelated exception unchanged (same object)", () => {
    const event = exceptionEvent(
      "TypeError: Cannot read properties of undefined (reading 'foo')"
    );
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("passes through an ordinary $pageview — the whole-analytics blackout guard", () => {
    const event: CaptureResult = {
      uuid: "test-uuid",
      event: "$pageview",
      properties: { $current_url: "https://tkaflowarts.com/create/construct" },
    };
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("keeps a real error that merely has noise attached as its .cause", () => {
    // posthog's convertToExceptionList flattens Error.cause into this same
    // array, root first. Testing the whole list would silently discard the
    // actionable outer report because of the SDK chatter underneath it.
    const event: CaptureResult = {
      uuid: "test-uuid",
      event: "$exception",
      properties: {
        $exception_list: [
          { type: "Error", value: "Sequence save failed" },
          {
            type: "Error",
            value:
              "Failed to obtain primary lease for action 'Collect garbage'",
          },
        ],
      },
    };
    expect(dropKnownNoise(event)).toBe(event);
  });

  it("still drops noise reported with a cause of its own", () => {
    const event: CaptureResult = {
      uuid: "test-uuid",
      event: "$exception",
      properties: {
        $exception_list: [
          {
            type: "Error",
            value:
              "ResizeObserver loop completed with undelivered notifications.",
          },
          { type: "Error", value: "some inner detail" },
        ],
      },
    };
    expect(dropKnownNoise(event)).toBeNull();
  });
});
