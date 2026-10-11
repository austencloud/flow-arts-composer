/**
 * The Construct preview scene reports ready once every slot it shows has
 * drawn, including through a resize before the last one reported (the card
 * would otherwise rest on its tint). On a turn, each picked step plays its
 * move from the pose before it, one after the other, inside the turn, its
 * arrows fading in as it travels, and the finger is gone before the last
 * one plays.
 */
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METHOD_PREVIEW_TIMING } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import { fakePictograph } from "./FakeMethodPictograph.svelte";
import { mountConstructScene } from "./construct-scene-ready-harness.svelte";

vi.mock(
  "#lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte",
  async () => ({
    default: (await import("./FakeMethodPictograph.svelte")).default,
  })
);

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

const SQUARE = { shape: "square", width: 144, height: 144 } as const;
const STRIP = { shape: "strip", width: 146, height: 48 } as const;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let scene: ReturnType<typeof mountConstructScene> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  scene?.destroy();
  scene = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  fakePictograph.reportBudget = Number.POSITIVE_INFINITY;
  fakePictograph.deferred.length = 0;
});

describe("Construct scene readiness", () => {
  it("reports ready once every slot has drawn", () => {
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".slot")).toHaveLength(3);
    expect(onready).toHaveBeenCalled();
  });

  it("waits while a slot is still drawing", () => {
    fakePictograph.reportBudget = 2;
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".slot")).toHaveLength(3);
    expect(onready).not.toHaveBeenCalled();
  });

  it("mounts each box's other moves only once every slot has drawn", () => {
    fakePictograph.reportBudget = 2;
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".choice")).toHaveLength(0);
    for (const report of fakePictograph.deferred.splice(0)) report();
    flushSync();
    expect(onready).toHaveBeenCalled();
    const slots = host.querySelectorAll(".slot");
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.querySelectorAll(".choice")).toHaveLength(2);
    }
  });

  it("keeps waiting through a resize, then reports when the last slot draws", () => {
    fakePictograph.reportBudget = 2;
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    scene.resize(STRIP);
    expect(onready).not.toHaveBeenCalled();
    for (const report of fakePictograph.deferred.splice(0)) report();
    flushSync();
    expect(onready).toHaveBeenCalled();
  });
});

describe("Construct scene turn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const steps = () => [
    ...host.querySelectorAll<HTMLElement>(".slot .art .fake-pictograph"),
  ];
  const progress = () => steps().map((cell) => cell.dataset.motionProgress);
  const arrows = () => steps().map((cell) => cell.dataset.arrowOpacity);

  it("moves each step's props from the pose before it", () => {
    scene = mountConstructScene(host, STRIP, vi.fn());
    expect(steps().map((cell) => cell.dataset.motionStart)).toEqual([
      "null",
      "γ",
      "M",
    ]);
    expect(progress()).toEqual(["null", "null", "null"]);
    expect(arrows()).toEqual(["1", "1", "1"]);
  });

  it("plays the two moves one after the other, both inside the turn, each one's arrows fading in with it", async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
    scene = mountConstructScene(host, STRIP, vi.fn());
    scene.play(1);
    const frameMs = 16;
    /** When each slot was first seen mid-move, and when it reached the end. */
    const started: (number | null)[] = [null, null, null];
    const finished: (number | null)[] = [null, null, null];
    let fingerSeen = false;
    let fingerOnLastMove = false;
    /** The faintest arrows each slot showed. */
    const faintest = [1, 1, 1];
    for (let at = 0; at < METHOD_PREVIEW_TIMING.turnMs; at += frameMs) {
      await vi.advanceTimersByTimeAsync(frameMs);
      flushSync();
      const fingerShown = host.querySelector(".ghost.visible") !== null;
      fingerSeen ||= fingerShown;
      // A step's arrows track its move; a still one shows them all.
      const shown = arrows();
      for (const [slot, value] of progress().entries()) {
        expect(shown[slot]).toBe(value === "null" ? "1" : value);
        faintest[slot] = Math.min(faintest[slot]!, Number(shown[slot]));
      }
      for (const [slot, value] of progress().entries()) {
        const travel = Number(value);
        if (started[slot] === null && travel > 0 && travel < 1) {
          started[slot] = at;
        }
        if (slot === 2 && travel > 0 && travel < 1 && fingerShown) {
          fingerOnLastMove = true;
        }
        if (started[slot] !== null && finished[slot] === null && travel >= 1) {
          finished[slot] = at;
        }
      }
    }
    // The start position has no move; each step moves after the one before.
    expect(started[0]).toBeNull();
    expect(started[1]).not.toBeNull();
    expect(started[2]).toBeGreaterThan(started[1]!);
    expect(finished[1]).not.toBeNull();
    expect(finished[2]).not.toBeNull();
    // Each picked step lands without its arrows, here within a frame of its
    // move's start; the start position keeps its own.
    expect(faintest[0]).toBe(1);
    expect(faintest[1]).toBeLessThan(0.05);
    expect(faintest[2]).toBeLessThan(0.05);
    // The finger taps, then lifts away before the last move plays.
    expect(fingerSeen).toBe(true);
    expect(fingerOnLastMove).toBe(false);

    // When the turn ends, each step rests on its move's last frame.
    scene.stop();
    expect(progress()).toEqual(["null", "1", "1"]);
    expect(arrows()).toEqual(["1", "1", "1"]);
  });
});
