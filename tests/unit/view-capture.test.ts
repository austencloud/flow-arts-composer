// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildReplayUrl,
  encodeViewParam,
  isViewCaptureKeypress,
  parseViewParam,
  VIEW_CAPTURE_KEY_CODE,
  VIEW_PARAM,
  type ViewCaptureKeypress,
  type ViewPose,
} from "#lib/shared/review/view-capture.js";

const POSE: ViewPose = {
  x: -14.2371,
  y: 1.7205,
  z: -9.4008,
  yaw: 2.3611,
  pitch: -0.1842,
};

describe("view capture pose encoding", () => {
  it("round-trips a pose through a query parameter", () => {
    const parsed = parseViewParam(`?${VIEW_PARAM}=${encodeViewParam(POSE)}`);
    expect(parsed).toEqual(POSE);
  });

  it("round-trips alongside other parameters", () => {
    const search = `?shell=bare&${VIEW_PARAM}=${encodeViewParam(POSE)}&proof=2`;
    expect(parseViewParam(search)).toEqual(POSE);
  });

  it("survives negative and zero angles", () => {
    const pose: ViewPose = { x: 0, y: 0, z: 0, yaw: -Math.PI, pitch: 0 };
    const parsed = parseViewParam(`?${VIEW_PARAM}=${encodeViewParam(pose)}`);
    // Encoding rounds to four decimals, which is 0.01mm of position.
    expect(parsed?.yaw).toBeCloseTo(-Math.PI, 3);
    expect(parsed?.pitch).toBe(0);
  });

  it("produces a URL-safe parameter", () => {
    const encoded = encodeViewParam(POSE);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("replaces a named review shot with the replayable pose", () => {
    const replay = new URL(
      buildReplayUrl(
        POSE,
        new URL("https://localhost/test/autumn-scene?view=walk&quality=high")
      )
    );
    expect(parseViewParam(replay.search)).toEqual(POSE);
    expect(replay.searchParams.get("quality")).toBe("high");
  });

  // A mistyped or truncated URL must drop the visitor at spawn, not throw.
  it.each([
    ["absent", "?shell=bare"],
    ["empty", `?${VIEW_PARAM}=`],
    ["not base64", `?${VIEW_PARAM}=@@@@`],
    ["base64 but not JSON", `?${VIEW_PARAM}=aGVsbG8`],
    [
      "JSON but not a pose",
      `?${VIEW_PARAM}=${encodeURIComponent(btoa('{"a":1}'))}`,
    ],
    [
      "non-finite values",
      `?${VIEW_PARAM}=${encodeURIComponent(btoa('{"x":null,"y":0,"z":0,"yaw":0,"pitch":0}'))}`,
    ],
  ])("returns null for %s input", (_label, search) => {
    expect(parseViewParam(search)).toBeNull();
  });
});

describe("view capture key press matching", () => {
  function keypress(overrides: Partial<ViewCaptureKeypress> = {}): ViewCaptureKeypress {
    return {
      code: VIEW_CAPTURE_KEY_CODE,
      repeat: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: null,
      ...overrides,
    };
  }

  it("fires on a bare press of the chosen key", () => {
    expect(isViewCaptureKeypress(keypress())).toBe(true);
  });

  it("ignores every other key", () => {
    expect(isViewCaptureKeypress(keypress({ code: "KeyP" }))).toBe(false);
  });

  it("ignores a held-down repeat, so it fires once per press", () => {
    expect(isViewCaptureKeypress(keypress({ repeat: true }))).toBe(false);
  });

  // The listener used to check ctrl/meta/alt but never shift, so Shift+P
  // (the registry's own "cycle prop type" shortcut) copied the view as well
  // as cycling the prop. Each modifier gets its own case so a regression in
  // any one of them fails on its own line, not just "some modifier broke".
  it.each([
    ["shift", { shiftKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["alt", { altKey: true }],
  ] as const)("ignores the key with %s held", (_label, overrides) => {
    expect(isViewCaptureKeypress(keypress(overrides))).toBe(false);
  });

  it("leaves a text input free to receive the letter", () => {
    const input = document.createElement("input");
    expect(isViewCaptureKeypress(keypress({ target: input }))).toBe(false);
  });

  it("leaves a contenteditable element free to receive the letter", () => {
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isViewCaptureKeypress(keypress({ target: editable }))).toBe(false);
  });

  it("still fires when the target is an ordinary, non-editable element", () => {
    const div = document.createElement("div");
    expect(isViewCaptureKeypress(keypress({ target: div }))).toBe(true);
  });
});
