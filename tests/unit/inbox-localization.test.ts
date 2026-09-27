import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("inbox localization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T18:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
  });

  it("follows the selected app locale for relative and absolute times", async () => {
    const { setLocale } = await import("../../src/lib/shared/i18n/i18n.svelte");
    const { formatRelativeTimeVerbose, formatRelativeTime, formatTime } = await import("../../src/lib/shared/inbox/utils/format");
    const recent = new Date(Date.now() - 120_000);
    const old = new Date("2026-08-01T18:30:00Z");
    await setLocale("de");
    expect(formatRelativeTimeVerbose(recent)).toBe("vor 2 Minuten");
    expect(formatRelativeTime(old)).toBe(old.toLocaleDateString("de", { month: "short", day: "numeric" }));
    expect(formatTime(old)).toBe(old.toLocaleTimeString("de", { hour: "numeric", minute: "2-digit" }));
    await setLocale("en");
    expect(formatRelativeTimeVerbose(recent)).toBe("2 minutes ago");
    expect(formatTime(old)).toBe(old.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }));
  });

  it("localizes attachment previews without translating user text or changing persisted previews", async () => {
    const { setLocale } = await import("../../src/lib/shared/i18n/i18n.svelte");
    const display = await import("../../src/lib/shared/inbox/utils/message-preview");
    const persisted = await import("../../src/lib/shared/messaging/domain/message-preview");
    const reply = { messageId: "message", senderId: "sender", senderName: "Name", content: "", attachmentType: "image" as const };
    await setLocale("de");
    expect(display.getReplyPreviewText(reply)).toBe("Bild");
    expect(display.getMessagePreviewText(" Hello there ")).toBe("Hello there");
    expect(persisted.getReplyPreviewText(reply)).toBe("Image");
    await setLocale("en");
    expect(display.getReplyPreviewText(reply)).toBe("Image");
  });
});
