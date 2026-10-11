import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

vi.mock("#lib/shared/platform/services/platform-detector.js", () => ({
  isNative: vi.fn(() => false),
}));

import { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

// vitest-setup.ts globally replaces document.createElement with a mock that
// returns plain objects (not Nodes) for canvas-capture tests. This suite needs
// real jsdom elements — the service builds and appends a live input/label pair.
// isolate:true gives each test file its own environment, so restoring the real
// createElement here cannot leak into other suites. Resolve it from document's
// own prototype chain to stay in the jsdom realm (the vitest-global Document
// constructor is a different realm).
const realCreateElement = Object.getPrototypeOf(document).createElement as
  typeof document.createElement;

function setMaxTouchPoints(value: number) {
  Object.defineProperty(navigator, "maxTouchPoints", {
    value,
    configurable: true,
  });
}

// Patch the prototype of an instance created by THIS jsdom document — the
// global HTMLInputElement in the vitest realm is a different constructor than
// the one document.createElement uses, so patching the global does nothing.
function inputProto(): object {
  return Object.getPrototypeOf(document.createElement("input"));
}

function enableSwitchAttribute() {
  Object.defineProperty(inputProto(), "switch", {
    value: false,
    writable: true,
    configurable: true,
  });
}

describe("HapticFeedback iOS switch-input fallback", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).createElement = realCreateElement.bind(document);
    document.body.innerHTML = "";
    setMaxTouchPoints(0);
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (inputProto() as any).switch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).vibrate;
  });

  it("no-ops without vibrate or switch support (desktop-like jsdom)", () => {
    const haptics = new HapticFeedback();

    expect(haptics.isSupported()).toBe(false);
    expect(haptics.impact("medium")).toBe(false);
    expect(document.getElementById("tka-haptic-switch")).toBeNull();
  });

  it("uses hidden switch toggle when WebKit switch attribute exists on a touch device", () => {
    enableSwitchAttribute();
    setMaxTouchPoints(5);
    const haptics = new HapticFeedback();

    expect(haptics.isSupported()).toBe(true);
    expect(haptics.impact("light")).toBe(true);

    const input = document.getElementById("tka-haptic-switch");
    // instanceof against the vitest-global HTMLInputElement fails across
    // realms — assert by tag instead.
    expect(input?.tagName).toBe("INPUT");
    expect(input?.getAttribute("switch")).toBe("");
    expect(input?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(document.querySelector("label[for='tka-haptic-switch']")).not.toBeNull();
  });

  it("reuses one hidden element pair across triggers", () => {
    enableSwitchAttribute();
    setMaxTouchPoints(5);
    const haptics = new HapticFeedback();
    haptics.updateConfig({ throttleTime: 0 });

    expect(haptics.impact("light")).toBe(true);
    expect(haptics.selection()).toBe(true);
    expect(haptics.notification("success")).toBe(true);

    expect(document.querySelectorAll("#tka-haptic-switch").length).toBe(1);
    expect(document.querySelectorAll("label[for='tka-haptic-switch']").length).toBe(1);
  });

  it("prefers navigator.vibrate over the switch hack when both could exist", () => {
    enableSwitchAttribute();
    setMaxTouchPoints(5);
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      writable: true,
      configurable: true,
    });
    const haptics = new HapticFeedback();

    expect(haptics.impact("heavy")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(25);
    expect(document.getElementById("tka-haptic-switch")).toBeNull();
  });
});
