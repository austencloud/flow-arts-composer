import { render } from "vitest-browser-svelte";
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";

// PropSvg's fade-on-swap logic reads only `propAssets.imageSrc`. App settings
// feed mirroring only. Stub them so the test doesn't drag in the entire app dependency graph
// (firebase, posthog, capacitor, dexie) — which would make this test slow and
// flaky under Vite's cold dep-optimize. Isolating the unit keeps it lean.
const mockSettings = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("../../../application/state/app-state.svelte", () => ({
  getSettings: () => mockSettings,
}));

import PropSvg from "./PropSvg.svelte";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "../../shared/domain/enums/pictograph-enums";
import { PropType } from "../domain/enums/prop-type";
// Minimal, static motion — turns:0 + NO_ROTATION keeps the rotation animator inert
// so the test isolates the SVG-swap fade behaviour.
const motion = (
  color: HandSide = HandSide.LEFT,
  propType: PropType = PropType.TRIAD
) =>
  ({
    color,
    propType,
    startOrientation: Orientation.IN,
    turns: 0,
    rotationDirection: RotationDirection.NO_ROTATION,
  }) as never;

const motionData = motion();

const propPosition = { x: 0, y: 0, rotation: 0 } as never;

// Each call returns a NEW object, mirroring how the parent hands down a freshly
// prepared propAssets on every (re)generation — same content, new identity.
const assets = (imageSrc: string, propType?: PropType) =>
  ({
    imageSrc,
    viewBox: "0 0 300 15.5",
    center: { x: 0, y: 0 },
    propType,
  }) as never;

const SVG_A = "<circle r='10' data-variant='a' />";
const SVG_B = "<circle r='10' data-variant='b' />";
const propGroup = () => document.querySelector(".prop-svg");
const propTransform = () => propGroup()?.getAttribute("style") ?? "";
describe("PropSvg fade-on-swap regression", () => {
  // Regression: an SVG swap starts a brief fade (opacity 0.15). If the parent
  // then re-hands a NEW propAssets object with a BYTE-IDENTICAL imageSrc while
  // the fade is still in flight (routine during generation), the tracking effect
  // re-runs. It must NOT strand `prop-fading` on the element — the fade has to
  // clear once the timeout elapses. Previously the effect teardown cancelled the
  // reset timer on that unrelated re-run and left the prop at opacity 0.15.
  it("clears the fade even when the effect re-runs with an identical imageSrc mid-fade", async () => {
    const screen = render(PropSvg, {
      motionData,
      propAssets: assets(SVG_A),
      propPosition,
    });

    // Real content swap A -> B triggers the brief fade.
    await screen.rerender({
      motionData,
      propAssets: assets(SVG_B),
      propPosition,
    });
    flushSync();
    expect(propGroup()?.classList.contains("prop-fading")).toBe(true);

    // Parent re-hands a new propAssets object with the SAME imageSrc mid-fade.
    // Re-runs the effect without a real change — the strand-inducing case.
    await screen.rerender({
      motionData,
      propAssets: assets(SVG_B),
      propPosition,
    });
    flushSync();

    // After the 150ms fade window the class must be gone (opacity restored).
    await new Promise((resolve) => setTimeout(resolve, 220));
    flushSync();
    expect(propGroup()?.classList.contains("prop-fading")).toBe(false);
  });
});

describe("PropSvg paints the prepared angle", () => {
  async function rerenderOrientation(
    fromOrientation: Orientation,
    fromRotation: number,
    toOrientation: Orientation,
    toRotation: number
  ) {
    const screen = render(PropSvg, {
      motionData: {
        ...(motionData as Record<string, unknown>),
        startOrientation: fromOrientation,
      } as never,
      propAssets: assets(SVG_A),
      propPosition: {
        ...(propPosition as Record<string, unknown>),
        rotation: fromRotation,
      } as never,
    });

    await screen.rerender({
      motionData: {
        ...(motionData as Record<string, unknown>),
        startOrientation: toOrientation,
      } as never,
      propAssets: assets(SVG_A),
      propPosition: {
        ...(propPosition as Record<string, unknown>),
        rotation: toRotation,
      } as never,
    });
    flushSync();
  }

  it("lands a center change on the prepared angle, not a wrapped one", async () => {
    await rerenderOrientation(
      Orientation.CENTER_N,
      270,
      Orientation.CENTER_NW,
      225
    );

    expect(propTransform()).toContain("rotate(225deg)");
    expect(propTransform()).not.toContain("rotate(585deg)");
  });

  it("lands a clockwise center change on the prepared angle", async () => {
    await rerenderOrientation(
      Orientation.CENTER_N,
      270,
      Orientation.CENTER_NE,
      315
    );

    expect(propTransform()).toContain("rotate(315deg)");
  });

  it("lands an interradial change on the prepared angle", async () => {
    await rerenderOrientation(Orientation.IN, 90, Orientation.CLOCK_IN, 45);

    expect(propTransform()).toContain("rotate(45deg)");
    expect(propTransform()).not.toContain("rotate(405deg)");
  });
});

describe("PropSvg mirroring follows the prop actually drawn", () => {
  const redStaff = {
    ...(motion(HandSide.RIGHT, PropType.STAFF) as Record<string, unknown>),
    hand: HandSide.RIGHT,
  } as never;

  it("ignores a saved flipped buugeng when the page draws a staff", () => {
    Object.assign(mockSettings, {
      rightPropType: PropType.BUUGENG,
      rightBuugengFlipped: true,
    });
    try {
      render(PropSvg, {
        motionData: redStaff,
        propAssets: assets(SVG_A, PropType.STAFF),
        propPosition,
      });
      expect(propTransform()).not.toContain("scaleX(-1)");
    } finally {
      for (const key of Object.keys(mockSettings)) delete mockSettings[key];
    }
  });

  it("still flips a drawn buugeng by the saved preference", () => {
    Object.assign(mockSettings, { rightBuugengFlipped: true });
    try {
      render(PropSvg, {
        motionData: redStaff,
        propAssets: assets(SVG_A, PropType.BUUGENG),
        propPosition,
      });
      expect(propTransform()).toContain("scaleX(-1)");
    } finally {
      for (const key of Object.keys(mockSettings)) delete mockSettings[key];
    }
  });
});
