/**
 * The Construct preview scene reports ready once every slot it shows has
 * drawn, including when the box resizes to fewer slots before the last one
 * reported (the card would otherwise rest on its tint).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePictograph } from "./FakeMethodPictograph.svelte";
import { mountConstructScene } from "./construct-scene-ready-harness.svelte";

vi.mock(
  "$lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte",
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
});

describe("Construct scene readiness", () => {
  it("reports ready once every slot has drawn", () => {
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".slot")).toHaveLength(4);
    expect(onready).toHaveBeenCalled();
  });

  it("waits while a slot is still drawing", () => {
    fakePictograph.reportBudget = 3;
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(host.querySelectorAll(".slot")).toHaveLength(4);
    expect(onready).not.toHaveBeenCalled();
  });

  it("reports ready when the box shrinks to the slots that already drew", () => {
    fakePictograph.reportBudget = 3;
    const onready = vi.fn();
    scene = mountConstructScene(host, SQUARE, onready);
    expect(onready).not.toHaveBeenCalled();
    scene.resize(STRIP);
    expect(host.querySelectorAll(".slot")).toHaveLength(3);
    expect(onready).toHaveBeenCalled();
  });
});
