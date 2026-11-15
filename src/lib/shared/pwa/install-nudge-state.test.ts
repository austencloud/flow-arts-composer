import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOTTOM_NOTE_DAY_KEY,
  localDay,
} from "#lib/shared/components/bottom-note-day.js";

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("#lib/shared/mobile/get-mobile-fullscreen-manager.js", () => ({
  getMobileFullscreenManager: () => ({
    canInstallPWA: () => true,
    onInstallPromptAvailable: () => {},
    promptInstallPWA: async () => true,
  }),
}));
vi.mock("#lib/shared/mobile/services/platform-detector.js", () => ({
  detectPlatformAndBrowser: () => ({
    platform: "android",
    browser: "chrome",
    inAppBrowser: "none",
    isStandalone: false,
  }),
}));

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("installNudge and the shared day", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStore());
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("navigator", { userAgent: "test" });
  });

  async function load() {
    return (await import("./install-nudge-state.svelte")).installNudge;
  }

  it("shows automatically once, and marks the day", async () => {
    const nudge = await load();
    nudge.offer("first_sequence");
    expect(nudge.open).toBe(true);
    expect(localStorage.getItem(BOTTOM_NOTE_DAY_KEY)).toBe(
      localDay(new Date())
    );
  });

  it("stays away when another automatic card showed today", async () => {
    localStorage.setItem(BOTTOM_NOTE_DAY_KEY, localDay(new Date()));
    const nudge = await load();
    nudge.offer("first_sequence");
    expect(nudge.open).toBe(false);
  });

  it("opens from the menu whatever the day says, and does not mark it", async () => {
    const nudge = await load();
    nudge.openFromMenu();
    expect(nudge.open).toBe(true);
    expect(localStorage.getItem(BOTTOM_NOTE_DAY_KEY)).toBeNull();

    nudge.dismiss("close");
    localStorage.setItem(BOTTOM_NOTE_DAY_KEY, localDay(new Date()));
    nudge.openFromMenu();
    expect(nudge.open).toBe(true);
  });
});
