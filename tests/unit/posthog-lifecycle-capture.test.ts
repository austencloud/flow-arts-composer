import { describe, expect, it, vi } from "vitest";
import { capturePostHogLifecycleEvent } from "#lib/server/analytics/posthog-lifecycle-capture.js";

describe("PostHog lifecycle capture", () => {
  it("uses the verified UID, replay session, UUID, and original timestamp", async () => {
    const captureImmediate = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn().mockResolvedValue(undefined);

    await capturePostHogLifecycleEvent(
      {
        apiKey: "phc_test",
        distinctId: "firebase-uid",
        sessionId: "replay-session",
        isGuest: false,
        envelope: {
          event: "tunnel_save",
          eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
          occurredAt: "2026-08-21T12:00:00.000Z",
          properties: {
            tunnelId: "tunnel-1",
            source: "settings_panel",
            stepCount: 20,
            durability: "cloud",
          },
        },
      },
      () => ({ captureImmediate, shutdown })
    );

    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "firebase-uid",
      event: "tunnel_save",
      uuid: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
      timestamp: new Date("2026-08-21T12:00:00.000Z"),
      properties: {
        category: "tunnel",
        tunnel_id: "tunnel-1",
        source: "settings_panel",
        sequence_length: 20,
        durability: "cloud",
        $session_id: "replay-session",
        is_guest: false,
        delivery: "server",
        schema_version: 1,
      },
    });
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it("still shuts down when capture fails", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    await expect(
      capturePostHogLifecycleEvent(
        {
          apiKey: "phc_test",
          distinctId: "firebase-uid",
          sessionId: null,
          isGuest: true,
          envelope: {
            event: "guest_upgraded_to_account",
            eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
            occurredAt: "2026-08-21T12:00:00.000Z",
            properties: { status: "linked" },
          },
        },
        () => ({
          captureImmediate: vi.fn().mockRejectedValue(new Error("offline")),
          shutdown,
        })
      )
    ).rejects.toThrow("offline");
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
