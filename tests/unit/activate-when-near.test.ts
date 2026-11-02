// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateWhenNear } from "../../src/lib/actions/activate-when-near";

class ObserverStub {
  static instances: ObserverStub[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit
  ) {
    ObserverStub.instances.push(this);
  }

  intersect(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

afterEach(() => {
  ObserverStub.instances = [];
  vi.unstubAllGlobals();
});

describe("activateWhenNear", () => {
  it("activates once when the observed node enters the preload margin", () => {
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    const node = document.createElement("div");
    const activate = vi.fn();

    const action = activateWhenNear(node, {
      activate,
      rootMargin: "300px",
    });
    const observer = ObserverStub.instances[0];

    expect(observer?.options?.rootMargin).toBe("300px");
    expect(observer?.observe).toHaveBeenCalledWith(node);
    expect(activate).not.toHaveBeenCalled();

    observer?.intersect(node);
    observer?.intersect(node);

    expect(activate).toHaveBeenCalledOnce();
    expect(observer?.disconnect).toHaveBeenCalled();
    action.destroy();
  });

  it("cancels pending activation when its component unmounts", () => {
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    const node = document.createElement("div");
    const activate = vi.fn();
    const action = activateWhenNear(node, { activate });

    action.destroy();
    ObserverStub.instances[0]?.intersect(node);

    expect(activate).not.toHaveBeenCalled();
  });

  it("can defer a near activation until a browser idle turn", () => {
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    let idleCallback: (() => void) | undefined;
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => {
        idleCallback = callback;
        return 1;
      })
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const node = document.createElement("div");
    const activate = vi.fn();

    activateWhenNear(node, { activate, deferUntilIdle: true });
    ObserverStub.instances[0]?.intersect(node);

    expect(activate).not.toHaveBeenCalled();
    idleCallback?.();
    expect(activate).toHaveBeenCalledOnce();
  });
});
