/**
 * The Fuse preview scene reports ready once, when every fused cell and every
 * one-hand source it shows has drawn: six reports in all. A cell that is
 * still drawing holds the announcement back, a resize neither announces early
 * nor strands it, and a box with no layout announces nothing. Fuse's path
 * maker loads only after that report. Every cell draws its arrows at full,
 * the halves included. Its pictographs and maker are stand-ins, so this
 * checks only that bookkeeping and the arrow opacity each cell is given.
 */
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePictograph } from "./FakeMethodPictograph.svelte";
import { mountFuseScene } from "./fuse-scene-ready-harness.svelte";

// The next pair never arrives, so the scene keeps the demo's hands.
const swap = vi.hoisted(() => ({
  demoFusePair: vi.fn(() => ({})),
  swapFuseHand: vi.fn(() => new Promise(() => {})),
}));
vi.mock(
  "#lib/features/create/shared/components/method-previews/method-preview-fuse-swap.js",
  () => swap
);

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

// Both shapes show two fused cells and four sources.
const SQUARE = { shape: "square", width: 144, height: 144 } as const;
const STRIP = { shape: "strip", width: 146, height: 48 } as const;
const NO_BOX = { shape: "strip", width: 0, height: 0 } as const;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let scene: ReturnType<typeof mountFuseScene> | null = null;

beforeEach(() => {
  swap.swapFuseHand.mockClear();
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

describe("Fuse scene readiness", () => {
  it("reports ready once, when every fused cell and source has drawn", () => {
    const onready = vi.fn();
    scene = mountFuseScene(host, STRIP, onready);
    expect(host.querySelectorAll(".fused .cell")).toHaveLength(2);
    expect(host.querySelectorAll(".source")).toHaveLength(4);
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("shows every half's arrows from the start, as Fuse's source cards do", () => {
    scene = mountFuseScene(host, STRIP, vi.fn());
    const opacities = (selector: string) =>
      [
        ...host.querySelectorAll<HTMLElement>(`${selector} .fake-pictograph`),
      ].map((cell) => cell.dataset.arrowOpacity);
    expect(opacities(".source")).toEqual(["1", "1", "1", "1"]);
    expect(opacities(".fused .cell")).toEqual(["1", "1"]);
  });

  it("marks each source with its key, which a turn finds it by", () => {
    scene = mountFuseScene(host, STRIP, vi.fn());
    const keys = [...host.querySelectorAll<HTMLElement>(".source")].map(
      (source) => source.dataset.key
    );
    expect(keys).toEqual(["left:0", "left:1", "right:0", "right:1"]);
  });

  it("waits while a cell is still drawing, then reports once", () => {
    fakePictograph.reportBudget = 4;
    const onready = vi.fn();
    scene = mountFuseScene(host, STRIP, onready);
    expect(fakePictograph.deferred).toHaveLength(2);
    expect(onready).not.toHaveBeenCalled();
    fakePictograph.deferred[0]?.();
    flushSync();
    expect(onready).not.toHaveBeenCalled();
    fakePictograph.deferred[1]?.();
    flushSync();
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("announces nothing while the box has no layout, then reports once", () => {
    const onready = vi.fn();
    scene = mountFuseScene(host, NO_BOX, onready);
    expect(host.querySelectorAll(".cell")).toHaveLength(0);
    expect(onready).not.toHaveBeenCalled();
    scene.resize(STRIP);
    expect(host.querySelectorAll(".cell")).toHaveLength(6);
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting through a resize, then reports when the last cells draw", () => {
    fakePictograph.reportBudget = 4;
    const onready = vi.fn();
    scene = mountFuseScene(host, SQUARE, onready);
    scene.resize(STRIP);
    expect(onready).not.toHaveBeenCalled();
    for (const report of [...fakePictograph.deferred]) report();
    flushSync();
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("makes its next pair only once it has drawn, red first", async () => {
    fakePictograph.reportBudget = 4;
    scene = mountFuseScene(host, STRIP, vi.fn());
    await vi.dynamicImportSettled();
    expect(swap.swapFuseHand).not.toHaveBeenCalled();
    for (const report of [...fakePictograph.deferred]) report();
    flushSync();
    await vi.waitFor(() => expect(swap.swapFuseHand).toHaveBeenCalledTimes(1));
    expect(swap.swapFuseHand).toHaveBeenCalledWith(expect.anything(), "right");
  });

  it("does not report again when the box resizes afterwards", () => {
    const onready = vi.fn();
    scene = mountFuseScene(host, SQUARE, onready);
    scene.resize(STRIP);
    scene.resize(SQUARE);
    expect(onready).toHaveBeenCalledTimes(1);
  });
});
