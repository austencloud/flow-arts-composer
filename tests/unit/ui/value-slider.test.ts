import { flushSync, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountHeldSlider } from "./value-slider-harness.svelte";

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let mounted: ReturnType<typeof mountHeldSlider> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (mounted) unmount(mounted.component);
  mounted = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

async function slide(floor: number, to: string) {
  const target = document.createElement("div");
  document.body.append(target);
  mounted = mountHeldSlider(target, floor);
  const input = target.querySelector("input")!;
  input.value = to;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  await tick();
  return { input, reading: target.querySelector(".reading")!, slider: mounted };
}

describe("ValueSlider", () => {
  it("puts the thumb back on the value its owner kept", async () => {
    const { input, reading, slider } = await slide(100, "60");

    expect(slider.value).toBe(100);
    expect(input.value).toBe("100");
    expect(reading.textContent).toBe("100");
  });

  it("leaves the thumb where the value went when the owner takes it", async () => {
    const { input, reading, slider } = await slide(50, "60");

    expect(slider.value).toBe(60);
    expect(input.value).toBe("60");
    expect(reading.textContent).toBe("60");
  });
});
