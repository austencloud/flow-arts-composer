import { describe, expect, it } from "vitest";
import { mapNotificationDocument } from "#lib/shared/feedback/services/notifier.js";

const createdAt = new Date("2026-08-09T05:26:35.592Z");

function base(type: string): Record<string, unknown> {
  return {
    userId: "admin-user",
    type,
    message: "Someone is back in the app",
    createdAt: { toDate: () => createdAt },
    read: false,
    fromUserId: "returning-user",
    fromUserName: "Someone",
  };
}

describe("notification document mapper", () => {
  it("preserves the returning-user destination used by notification clicks", () => {
    const notification = mapNotificationDocument("notification-1", {
      ...base("admin-user-returned"),
      returnedUserId: "returning-user",
      postHogSessionId: "session-123",
    });

    expect(notification).toMatchObject({
      id: "notification-1",
      type: "admin-user-returned",
      createdAt,
      returnedUserId: "returning-user",
      postHogSessionId: "session-123",
    });
  });

  it("keeps the other Pulse deep-link fields on live subscription results", () => {
    const notification = mapNotificationDocument("notification-2", {
      ...base("admin-qr-scan"),
      shortCode: "ABCD",
      scanLat: 41.8781,
      scanLng: -87.6298,
      scanCount: 3,
    });

    expect(notification).toMatchObject({
      type: "admin-qr-scan",
      shortCode: "ABCD",
      scanLat: 41.8781,
      scanLng: -87.6298,
      scanCount: 3,
    });
  });
});
