import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POPUP_NO_RESULT, settleOnAbandonedPopup } from "../popup-return-watch";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: coarse }) as MediaQueryList)
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("settleOnAbandonedPopup", () => {
  it("ends a phone popup that never reports back once the visitor returns", async () => {
    stubPointer(true);
    const watched = settleOnAbandonedPopup(new Promise<never>(() => {}));
    const outcome = watched.catch((error: { code?: string }) => error.code);

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(9_999);
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toBe(POPUP_NO_RESULT);
  });

  it("waits while the popup tab is still in front", async () => {
    stubPointer(true);
    let settled = false;
    void settleOnAbandonedPopup(new Promise<never>(() => {})).catch(() => {
      settled = true;
    });

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(5_000);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(settled).toBe(false);
  });

  it("passes a result through when it lands during the grace", async () => {
    stubPointer(true);
    let finish!: (value: string) => void;
    const watched = settleOnAbandonedPopup(
      new Promise<string>((resolve) => (finish = resolve))
    );

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(4_000);
    finish("signed-in");

    await expect(watched).resolves.toBe("signed-in");
  });

  it("leaves desktop popups to Firebase's own closed-window check", () => {
    stubPointer(false);
    const operation = new Promise<never>(() => {});
    expect(settleOnAbandonedPopup(operation)).toBe(operation);
  });
});
