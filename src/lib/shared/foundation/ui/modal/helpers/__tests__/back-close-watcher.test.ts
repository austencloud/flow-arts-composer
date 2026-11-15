import { describe, expect, it, vi } from "vitest";
import { watchBackOnlyToClose, watchBackToClose } from "../back-close-watcher";

function fakeCloseWatcher() {
  const instances: { fire: () => void; destroyed: boolean }[] = [];
  class FakeCloseWatcher {
    private listener: (() => void) | null = null;
    destroyed = false;
    constructor() {
      instances.push(
        this as unknown as { fire: () => void; destroyed: boolean }
      );
    }
    addEventListener(_type: "close", listener: () => void) {
      this.listener = listener;
    }
    destroy() {
      this.destroyed = true;
    }
    fire() {
      if (!this.destroyed) this.listener?.();
    }
  }
  return { scope: { CloseWatcher: FakeCloseWatcher }, instances };
}

describe("watchBackToClose", () => {
  it("closes the dialog when the system Back fires", () => {
    const { scope, instances } = fakeCloseWatcher();
    const onBack = vi.fn();
    watchBackToClose(onBack, scope);

    instances[0]!.fire();
    instances[0]!.fire();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("drops the watcher without closing when the dialog closes another way", () => {
    const { scope, instances } = fakeCloseWatcher();
    const onBack = vi.fn();
    const drop = watchBackToClose(onBack, scope);

    drop();
    instances[0]!.fire();

    expect(instances[0]!.destroyed).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("does nothing where the browser has no CloseWatcher", () => {
    const onBack = vi.fn();
    const drop = watchBackToClose(onBack, {});
    expect(() => drop()).not.toThrow();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("watchBackOnlyToClose", () => {
  it("closes on the system Back", () => {
    const { scope, instances } = fakeCloseWatcher();
    const onBack = vi.fn();
    watchBackOnlyToClose(onBack, scope, new EventTarget());

    instances[0]!.fire();

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("leaves an Escape key to the surface's own keydown handling", async () => {
    const { scope, instances } = fakeCloseWatcher();
    const onBack = vi.fn();
    const keys = new EventTarget();
    const drop = watchBackOnlyToClose(onBack, scope, keys);

    keys.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
    instances[0]!.fire();
    await Promise.resolve();

    expect(onBack).not.toHaveBeenCalled();
    // Re-armed, so the next Back still closes.
    expect(instances).toHaveLength(2);
    drop();
    expect(instances[1]!.destroyed).toBe(true);
  });
});
