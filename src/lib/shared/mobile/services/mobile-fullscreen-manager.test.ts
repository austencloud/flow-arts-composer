import { afterEach, describe, expect, it } from "vitest";
import { MobileFullscreenManager } from "./mobile-fullscreen-manager";

describe("MobileFullscreenManager", () => {
  afterEach(() => {
    delete (window as unknown as { __tkaInstallPrompt?: unknown })
      .__tkaInstallPrompt;
  });

  it("adopts a pre-captured window.__tkaInstallPrompt set by the app.html capture script", () => {
    const fakePrompt = {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };
    (window as unknown as { __tkaInstallPrompt?: unknown }).__tkaInstallPrompt =
      fakePrompt;

    const manager = new MobileFullscreenManager();

    expect(manager.canInstallPWA()).toBe(true);
  });

  it("reports no install prompt when nothing was captured before construction", () => {
    const manager = new MobileFullscreenManager();

    expect(manager.canInstallPWA()).toBe(false);
  });

  it("clears window.__tkaInstallPrompt once the adopted prompt is consumed", async () => {
    const fakePrompt = {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };
    (window as unknown as { __tkaInstallPrompt?: unknown }).__tkaInstallPrompt =
      fakePrompt;

    const manager = new MobileFullscreenManager();
    await manager.promptInstallPWA();

    expect(
      (window as unknown as { __tkaInstallPrompt?: unknown })
        .__tkaInstallPrompt
    ).toBeNull();
    expect(manager.canInstallPWA()).toBe(false);
  });
});
