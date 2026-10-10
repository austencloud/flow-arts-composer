/**
 * The Generate preview scene reports ready once, when every cell it shows
 * has drawn, including when the box resizes to fewer cells before the last
 * one reported (the card would otherwise rest on its tint). Its pictographs
 * are stand-ins and its sequence source is stubbed, so this checks only the
 * readiness bookkeeping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
