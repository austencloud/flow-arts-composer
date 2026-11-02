// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createRenderActivityGate,
  createAlwaysActiveGate,
  __resetRenderGatingSharedState,
} from "../render-activity-gate";

// ─────────────────────────────────────────────────────────────────────────────
// A controllable IntersectionObserver. jsdom does not implement one, so without
// this stub the gate takes its fail-open path — which is itself one of the
// behaviours under test below.

type ObserverRecord = {
  rootMargin: string;
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
  disconnected: boolean;
};

let observers: ObserverRecord[] = [];

function installObserverStub(): void {
  class StubObserver {
    private readonly record: ObserverRecord;
    constructor(
      callback: IntersectionObserverCallback,
      init?: IntersectionObserverInit
    ) {
      this.record = {
        rootMargin: String(init?.rootMargin ?? ""),
        callback,
        targets: new Set(),
        disconnected: false,
      };
      observers.push(this.record);
    }
    observe(node: Element): void {
      this.record.targets.add(node);
    }
    unobserve(node: Element): void {
      this.record.targets.delete(node);
    }
    disconnect(): void {
      this.record.disconnected = true;
      this.record.targets.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal(
    "IntersectionObserver",
    StubObserver as unknown as typeof IntersectionObserver
  );
}

/** Deliver an intersection change to every observer watching `node`. */
function reportIntersection(node: Element, isIntersecting: boolean): void {
  for (const record of observers) {
    if (record.disconnected || !record.targets.has(node)) continue;
    record.callback(
      [{ target: node, isIntersecting } as unknown as IntersectionObserverEntry],
      null as unknown as IntersectionObserver
    );
  }
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  observers = [];
  __resetRenderGatingSharedState();
  setDocumentHidden(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetRenderGatingSharedState();
});

describe("createRenderActivityGate — viewport arm", () => {
  it("is closed until the observer reports the element on screen", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");

    expect(gate.active).toBe(false);

    gate.attach(node);
    expect(gate.active).toBe(false);

    reportIntersection(node, true);
    expect(gate.active).toBe(true);
  });

  it("closes again when the element scrolls away", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    gate.attach(node);
    reportIntersection(node, true);

    reportIntersection(node, false);
    expect(gate.active).toBe(false);
  });

  it("notifies subscribers only on transition, never per event", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    const seen: boolean[] = [];
    gate.subscribe((active) => seen.push(active));

    gate.attach(node);
    reportIntersection(node, true);
    reportIntersection(node, true);
    reportIntersection(node, true);
    reportIntersection(node, false);

    expect(seen).toEqual([true, false]);
  });

  it("shares one observer between gates asking for the same rootMargin", () => {
    installObserverStub();
    const a = createRenderActivityGate({ rootMargin: "200px" });
    const b = createRenderActivityGate({ rootMargin: "200px" });
    const c = createRenderActivityGate({ rootMargin: "0px" });
    a.attach(document.createElement("div"));
    b.attach(document.createElement("div"));
    c.attach(document.createElement("div"));

    expect(observers).toHaveLength(2);
    expect(observers.map((o) => o.rootMargin).sort()).toEqual(["0px", "200px"]);
  });

  it("stops observing on detach and reports itself closed", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    gate.attach(node);
    reportIntersection(node, true);

    gate.detach();
    expect(gate.active).toBe(false);
    const [observer] = observers;
    if (!observer) throw new Error("attach should have created an observer");
    expect(observer.targets.has(node)).toBe(false);
  });

  it("fails OPEN when the platform has no IntersectionObserver (SSR, old browsers)", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const gate = createRenderActivityGate();

    // Not rendering a surface the user IS looking at is a broken page; the
    // cheaper failure is to render one nobody can see.
    expect(gate.active).toBe(true);
    gate.attach(document.createElement("div"));
    expect(gate.active).toBe(true);
  });

  it("ignoreViewport tracks document visibility alone", () => {
    installObserverStub();
    const gate = createRenderActivityGate({ ignoreViewport: true });

    expect(gate.active).toBe(true);
    expect(observers).toHaveLength(0);

    setDocumentHidden(true);
    expect(gate.active).toBe(false);

    setDocumentHidden(false);
    expect(gate.active).toBe(true);
  });
});

describe("createRenderActivityGate — document visibility arm", () => {
  it("closes an on-screen gate when the tab is hidden and reopens it on return", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    gate.attach(node);
    reportIntersection(node, true);
    expect(gate.active).toBe(true);

    setDocumentHidden(true);
    expect(gate.active).toBe(false);

    setDocumentHidden(false);
    expect(gate.active).toBe(true);
  });

  it("installs exactly one shared listener no matter how many gates exist", () => {
    installObserverStub();
    const addSpy = vi.spyOn(document, "addEventListener");
    createRenderActivityGate();
    createRenderActivityGate();
    createRenderActivityGate();

    const visibilityInstalls = addSpy.mock.calls.filter(
      ([type]) => type === "visibilitychange"
    );
    expect(visibilityInstalls).toHaveLength(1);
    addSpy.mockRestore();
  });

  it("stops notifying a disposed gate", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    const seen: boolean[] = [];
    gate.subscribe((active) => seen.push(active));
    gate.attach(node);
    reportIntersection(node, true);
    expect(seen).toEqual([true]);

    gate.dispose();
    setDocumentHidden(true);
    reportIntersection(node, false);
    expect(seen).toEqual([true]);
  });
});

describe("createRenderActivityGate — holds", () => {
  it("forces the gate open while a key is held, off screen and hidden alike", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    gate.attach(node);
    expect(gate.active).toBe(false);

    gate.hold("export");
    expect(gate.active).toBe(true);

    setDocumentHidden(true);
    expect(gate.active).toBe(true);

    gate.release("export");
    expect(gate.active).toBe(false);
  });

  it("is keyed, so one caller releasing cannot resume the loop for another", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    gate.attach(document.createElement("div"));
    gate.hold("export");
    gate.hold("recording");

    gate.release("export");
    expect(gate.active).toBe(true);
    expect(gate.snapshot().holds).toEqual(["recording"]);

    gate.release("recording");
    expect(gate.active).toBe(false);
  });

  it("is idempotent per key", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    gate.attach(document.createElement("div"));
    gate.hold("export");
    gate.hold("export");
    gate.release("export");
    expect(gate.active).toBe(false);
  });

  it("reports its inputs through snapshot()", () => {
    installObserverStub();
    const gate = createRenderActivityGate();
    const node = document.createElement("div");
    gate.attach(node);
    reportIntersection(node, true);

    expect(gate.snapshot()).toEqual({
      active: true,
      intersecting: true,
      documentVisible: true,
      holds: [],
      attached: true,
    });
  });
});

describe("createAlwaysActiveGate", () => {
  it("never closes — the shape a deterministic export driver needs", () => {
    const gate = createAlwaysActiveGate();
    expect(gate.active).toBe(true);
    gate.attach(document.createElement("div"));
    gate.detach();
    setDocumentHidden(true);
    expect(gate.active).toBe(true);
  });
});
