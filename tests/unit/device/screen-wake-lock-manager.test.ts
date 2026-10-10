import { afterEach, describe, expect, it, vi } from "vitest";
import { createScreenWakeLockManager } from "#lib/shared/device/services/screen-wake-lock-manager.js";

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  visibilityListenerAdds = 0;
  visibilityListenerRemovals = 0;

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    if (type === "visibilitychange") {
      this.visibilityListenerAdds += 1;
    }
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ): void {
    if (type === "visibilitychange") {
      this.visibilityListenerRemovals += 1;
    }
    super.removeEventListener(type, callback, options);
  }

  setVisibility(visibilityState: DocumentVisibilityState): void {
    this.visibilityState = visibilityState;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

class FakeWakeLockSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });

  forceRelease(): void {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function createHarness() {
  const targetDocument = new FakeDocument();
  const sentinels: FakeWakeLockSentinel[] = [];
  const requestWakeLock = vi.fn(async () => {
    const sentinel = new FakeWakeLockSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  const manager = createScreenWakeLockManager({
    document: targetDocument,
    requestWakeLock,
  });

  return {
    manager,
    requestWakeLock,
    sentinels,
    targetDocument,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScreenWakeLockManager", () => {
  it("keeps unsupported environments as a no-op", async () => {
    const targetDocument = new FakeDocument();
    const manager = createScreenWakeLockManager({
      document: targetDocument,
      requestWakeLock: null,
    });

    expect(() => manager.setActive(true)).not.toThrow();
    targetDocument.setVisibility("hidden");
    targetDocument.setVisibility("visible");
    await flushMicrotasks();
    expect(() => manager.setActive(false)).not.toThrow();

    manager.dispose();
  });

  it("requests one lock when activated", async () => {
    const { manager, requestWakeLock, sentinels } = createHarness();

    manager.setActive(true);
    await flushMicrotasks();

    expect(requestWakeLock).toHaveBeenCalledTimes(1);
    expect(sentinels).toHaveLength(1);

    manager.dispose();
  });

  it("uses the native screen request when no request dependency is supplied", async () => {
    const targetDocument = new FakeDocument();
    const sentinel = new FakeWakeLockSentinel();
    const request = vi.fn(async () => sentinel);
    vi.stubGlobal("navigator", {
      wakeLock: {
        request,
      },
    });
    const manager = createScreenWakeLockManager({
      document: targetDocument,
    });

    manager.setActive(true);
    await flushMicrotasks();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");

    manager.dispose();
  });

  it("does not duplicate a request when activated repeatedly", async () => {
    const { manager, requestWakeLock } = createHarness();

    manager.setActive(true);
    manager.setActive(true);
    await flushMicrotasks();
    manager.setActive(true);

    expect(requestWakeLock).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it("releases the held lock once when deactivated repeatedly", async () => {
    const { manager, sentinels } = createHarness();
    manager.setActive(true);
    await flushMicrotasks();

    manager.setActive(false);
    manager.setActive(false);
    await flushMicrotasks();

    expect(sentinels[0].release).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it("requests a fresh sentinel after an automatic release while active", async () => {
    const { manager, requestWakeLock, sentinels } = createHarness();
    manager.setActive(true);
    await flushMicrotasks();

    sentinels[0].forceRelease();
    await flushMicrotasks();

    expect(requestWakeLock).toHaveBeenCalledTimes(2);
    expect(sentinels).toHaveLength(2);

    manager.dispose();
  });

  it("reacquires when a request resolves with an already-released sentinel", async () => {
    const targetDocument = new FakeDocument();
    const releasedSentinel = new FakeWakeLockSentinel();
    releasedSentinel.released = true;
    const freshSentinel = new FakeWakeLockSentinel();
    const requestWakeLock = vi
      .fn<() => Promise<FakeWakeLockSentinel>>()
      .mockResolvedValueOnce(releasedSentinel)
      .mockResolvedValueOnce(freshSentinel);
    const manager = createScreenWakeLockManager({
      document: targetDocument,
      requestWakeLock,
    });

    manager.setActive(true);
    await flushMicrotasks();

    expect(requestWakeLock).toHaveBeenCalledTimes(2);
    expect(freshSentinel.released).toBe(false);

    manager.dispose();
  });

  it("releases while hidden and reacquires when the active document returns", async () => {
    const { manager, requestWakeLock, sentinels, targetDocument } =
      createHarness();
    manager.setActive(true);
    await flushMicrotasks();

    targetDocument.setVisibility("hidden");
    await flushMicrotasks();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);

    targetDocument.setVisibility("visible");
    await flushMicrotasks();
    expect(requestWakeLock).toHaveBeenCalledTimes(2);

    manager.dispose();
  });

  it("does not reacquire on visibility changes after deactivation", async () => {
    const { manager, requestWakeLock, targetDocument } = createHarness();
    manager.setActive(true);
    await flushMicrotasks();

    manager.setActive(false);
    targetDocument.setVisibility("hidden");
    targetDocument.setVisibility("visible");
    await flushMicrotasks();

    expect(requestWakeLock).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it("releases a request that resolves after the activity ends", async () => {
    const targetDocument = new FakeDocument();
    const lateSentinel = new FakeWakeLockSentinel();
    let resolveRequest!: (sentinel: FakeWakeLockSentinel) => void;
    const pendingRequest = new Promise<FakeWakeLockSentinel>((resolve) => {
      resolveRequest = resolve;
    });
    const requestWakeLock = vi.fn(() => pendingRequest);
    const manager = createScreenWakeLockManager({
      document: targetDocument,
      requestWakeLock,
    });

    manager.setActive(true);
    manager.setActive(false);
    resolveRequest(lateSentinel);
    await flushMicrotasks();

    expect(lateSentinel.release).toHaveBeenCalledTimes(1);
    expect(requestWakeLock).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it("reconciles a visibility change that occurs during a pending request", async () => {
    const targetDocument = new FakeDocument();
    const staleSentinel = new FakeWakeLockSentinel();
    const freshSentinel = new FakeWakeLockSentinel();
    let resolveFirstRequest!: (sentinel: FakeWakeLockSentinel) => void;
    const firstRequest = new Promise<FakeWakeLockSentinel>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const requestWakeLock = vi
      .fn<() => Promise<FakeWakeLockSentinel>>()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(freshSentinel);
    const manager = createScreenWakeLockManager({
      document: targetDocument,
      requestWakeLock,
    });

    manager.setActive(true);
    targetDocument.setVisibility("hidden");
    targetDocument.setVisibility("visible");
    resolveFirstRequest(staleSentinel);
    await flushMicrotasks();

    expect(staleSentinel.release).toHaveBeenCalledTimes(1);
    expect(requestWakeLock).toHaveBeenCalledTimes(2);
    expect(freshSentinel.released).toBe(false);

    manager.dispose();
  });

  it("removes listeners, releases its sentinel, and blocks work after dispose", async () => {
    const { manager, requestWakeLock, sentinels, targetDocument } =
      createHarness();
    manager.setActive(true);
    await flushMicrotasks();

    manager.dispose();
    targetDocument.setVisibility("hidden");
    targetDocument.setVisibility("visible");
    manager.setActive(true);
    await flushMicrotasks();

    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(requestWakeLock).toHaveBeenCalledTimes(1);
    expect(targetDocument.visibilityListenerAdds).toBe(1);
    expect(targetDocument.visibilityListenerRemovals).toBe(1);
  });

  it("settles a denied request without retrying or rejecting outward", async () => {
    const targetDocument = new FakeDocument();
    const requestWakeLock = vi.fn(() =>
      Promise.reject(new DOMException("Denied", "NotAllowedError"))
    );
    const manager = createScreenWakeLockManager({
      document: targetDocument,
      requestWakeLock,
    });

    manager.setActive(true);
    await flushMicrotasks();

    expect(requestWakeLock).toHaveBeenCalledTimes(1);
    expect(() => manager.setActive(false)).not.toThrow();

    manager.dispose();
  });

  it("constructs and activates safely without browser globals", async () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);

    const manager = createScreenWakeLockManager();

    expect(() => manager.setActive(true)).not.toThrow();
    await flushMicrotasks();
    expect(() => manager.dispose()).not.toThrow();
  });
});
