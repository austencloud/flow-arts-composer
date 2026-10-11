/**
 * The Generate preview scene reports ready once, when every cell it shows
 * has drawn, including when the box resizes to fewer cells before the last
 * one reported (the card would otherwise rest on its tint). On a turn, one
 * roll lands and its steps play their moves one at a time, inside the
 * turn. Its pictographs are stand-ins and its sequence source is
 * stubbed, so this checks only the bookkeeping.
 */
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import { PREVIEW_MOVE_MS } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
import { methodPreviewTurnMs } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import { fakePictograph } from "./FakeMethodPictograph.svelte";
import { mountGenerateScene } from "./generate-scene-ready-harness.svelte";

vi.mock(
  "#lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte",
  async () => ({
    default: (await import("./FakeMethodPictograph.svelte")).default,
  })
);

const drawMatrixRealization = vi.hoisted(() => vi.fn(async () => null));
vi.mock("#lib/shared/landing/data/shape-matrix-hero-pool.js", () => ({
  drawMatrixRealization,
}));

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

// 200 square holds the dice and eight cells in a 3x3; the strip holds the
// dice and three.
const SQUARE = { shape: "square", width: 200, height: 200 } as const;
const STRIP = { shape: "strip", width: 146, height: 48 } as const;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let scene: ReturnType<typeof mountGenerateScene> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
  drawMatrixRealization.mockClear();
});

afterEach(() => {
  scene?.destroy();
  scene = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  fakePictograph.reportBudget = Number.POSITIVE_INFINITY;
});

describe("Generate scene readiness", () => {
  it("reports ready once, when every cell has drawn", () => {
    const onready = vi.fn();
    scene = mountGenerateScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".cell")).toHaveLength(8);
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("starts drawing the first roll only after it is ready", async () => {
    fakePictograph.reportBudget = 3;
    scene = mountGenerateScene(host, SQUARE, vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drawMatrixRealization).not.toHaveBeenCalled();
    scene.resize(STRIP);
    await vi.waitFor(() => expect(drawMatrixRealization).toHaveBeenCalled());
  });

  it("draws no next roll under reduced motion, since no turn will play", async () => {
    document.documentElement.dataset.motionPreference = "reduce";
    try {
      const onready = vi.fn();
      scene = mountGenerateScene(host, SQUARE, onready);
      expect(onready).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(drawMatrixRealization).not.toHaveBeenCalled();
    } finally {
      delete document.documentElement.dataset.motionPreference;
    }
  });

  it("warns once when the source returns no sequence", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      scene = mountGenerateScene(host, SQUARE, vi.fn());
      await vi.waitFor(() => expect(drawMatrixRealization).toHaveBeenCalled());
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
      expect(warn).toHaveBeenCalledWith(
        "[method preview] Generate source returned no sequence; using the demo"
      );
      expect(drawMatrixRealization).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("waits while a cell is still drawing", () => {
    fakePictograph.reportBudget = 3;
    const onready = vi.fn();
    scene = mountGenerateScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".cell")).toHaveLength(8);
    expect(onready).not.toHaveBeenCalled();
  });

  it("reports ready when the box shrinks to the cells that already drew", () => {
    fakePictograph.reportBudget = 3;
    const onready = vi.fn();
    scene = mountGenerateScene(host, SQUARE, onready);
    expect(onready).not.toHaveBeenCalled();
    scene.resize(STRIP);
    expect(host.querySelectorAll(".cell")).toHaveLength(3);
    expect(onready).toHaveBeenCalledTimes(1);
  });
});

describe("Generate scene turn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cells = () => [
    ...host.querySelectorAll<HTMLElement>(".cell .fake-pictograph"),
  ];
  const progress = () => cells().map((cell) => cell.dataset.motionProgress);
  const arrows = () => cells().map((cell) => cell.dataset.arrowOpacity);
  const moving = (value: string | undefined) =>
    Number(value) > 0 && Number(value) < 1;

  it("holds still before its first turn", () => {
    scene = mountGenerateScene(host, STRIP, vi.fn());
    expect(progress()).toEqual(["null", "null", "null"]);
    expect(arrows()).toEqual(["1", "1", "1"]);
  });

  it("plays the roll's moves one at a time, inside the turn", async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
    scene = mountGenerateScene(host, STRIP, vi.fn());
    // Every value each cell's move passes through, in order.
    const records: MutationRecord[] = [];
    const changes = new MutationObserver((list) => records.push(...list));
    for (const cell of cells()) {
      changes.observe(cell, {
        attributeFilter: ["data-motion-progress"],
        attributeOldValue: true,
      });
    }
    scene.play(1);
    const frameMs = 16;
    /** When each cell started and finished a move. */
    const started: number[][] = [[], [], []];
    const finished: number[][] = [[], [], []];
    /** Frames where a cell's arrows did not match its move. */
    const arrowsOff: string[] = [];
    const arrowsHidden = [false, false, false];
    let before = progress();
    for (let at = 0; at < methodPreviewTurnMs("generate"); at += frameMs) {
      await vi.advanceTimersByTimeAsync(frameMs);
      flushSync();
      const now = progress();
      const shown = arrows();
      for (const [cell, value] of now.entries()) {
        if (moving(value) && !moving(before[cell])) started[cell]!.push(at);
        if (value === "1" && moving(before[cell])) finished[cell]!.push(at);
        const expected = value === "null" ? "1" : value;
        if (shown[cell] !== expected) {
          arrowsOff.push(`${at} ms cell ${cell}: ${shown[cell]}`);
        }
        if (shown[cell] === "0") arrowsHidden[cell] = true;
      }
      before = now;
    }
    // Each step's arrows come in with its move, as the step grid's arrival
    // plays one: hidden at its start, all shown once it lands.
    expect(arrowsOff).toEqual([]);
    expect(arrowsHidden).toEqual([true, true, true]);
    // Each step moves once, only after the one before it has finished, and
    // each plays out.
    expect(started.map((times) => times.length)).toEqual([1, 1, 1]);
    expect(finished.map((times) => times.length)).toEqual([1, 1, 1]);
    expect(started[1]![0]).toBeGreaterThanOrEqual(finished[0]![0]!);
    expect(started[2]![0]).toBeGreaterThanOrEqual(finished[1]![0]!);
    for (const cell of [0, 1, 2]) {
      expect(finished[cell]![0]! - started[cell]![0]!).toBeGreaterThanOrEqual(
        PREVIEW_MOVE_MS - 2 * frameMs
      );
    }
    // With no roll drawn, the roll is the demo from its twelfth step; each
    // cell moves from the pose before it.
    expect(cells().map((cell) => cell.dataset.motionStart)).toEqual([
      DEMO_SEQUENCE.steps[10]!.letter,
      DEMO_SEQUENCE.steps[11]!.letter,
      DEMO_SEQUENCE.steps[12]!.letter,
    ]);
    // A move only ever runs forward: each waits at its start, and nothing,
    // not even for one frame, jumps one to its end and back.
    records.push(...changes.takeRecords());
    changes.disconnect();
    expect(records.length).toBeGreaterThan(20);
    for (const cell of cells()) {
      const values = [
        ...records
          .filter((record) => record.target === cell)
          .map((record) => record.oldValue),
        cell.dataset.motionProgress,
      ].map((value) => (value === "null" ? null : Number(value)));
      for (const [index, value] of values.entries()) {
        const previous = values[index - 1];
        if (index === 0 || value === 0 || previous === null) continue;
        expect(value).toBeGreaterThanOrEqual(previous!);
      }
    }
    // Every move has landed before the turn ends.
    expect(progress()).toEqual(["1", "1", "1"]);
    expect(arrows()).toEqual(["1", "1", "1"]);
    scene.stop();
    expect(progress()).toEqual(["1", "1", "1"]);
    expect(arrows()).toEqual(["1", "1", "1"]);
  });
});
