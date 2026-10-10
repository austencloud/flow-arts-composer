import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  captureExceptionWhenReady: vi.fn(),
  getAuthInstance: vi.fn(async () => ({ currentUser: { uid: "user-123" } })),
  getFirestoreInstance: vi.fn(async () => {
    throw new Error("stop after PostHog capture");
  }),
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureExceptionWhenReady: h.captureExceptionWhenReady,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: h.getAuthInstance,
  getFirestoreInstance: h.getFirestoreInstance,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

import { reportErrorTelemetry } from "#lib/shared/error/services/error-telemetry-reporter.js";

describe("reportErrorTelemetry", () => {
  it("queues a versioned path shape without sending the document ID", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const error = new Error("Missing or insufficient permissions");

    await reportErrorTelemetry({
      message: error.message,
      error,
      context: {
        module: "firestore",
        action: "get",
        additionalData: { path: "users/user-123" },
      },
    });

    expect(h.captureExceptionWhenReady).toHaveBeenCalledWith(error, {
      telemetry_module: "firestore",
      telemetry_action: "get",
      telemetry_schema_version: 2,
      telemetry_path_shape: "users/{id}",
      severity: "error",
    });
    expect(
      JSON.stringify(h.captureExceptionWhenReady.mock.calls)
    ).not.toContain("user-123");
    consoleWarn.mockRestore();
  });
});
