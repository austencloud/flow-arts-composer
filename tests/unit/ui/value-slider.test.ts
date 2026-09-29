import { flushSync, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mountHeldSlider,
  mountSpeedSlider,
} from "./value-slider-harness.svelte";

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let mounted: { component: Record<string, unknown> } | null = null;

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

function host(): HTMLElement {
  const target = document.createElement("div");
  document.body.append(target);
  return target;
}

async function slide(floor: number, to: string) {
  const target = host();
  const slider = mountHeldSlider(target, floor);
  mounted = slider;
  const input = target.querySelector<HTMLInputElement>("input[type=range]")!;
  input.value = to;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  await tick();
  return { input, reading: readingOf(target), slider };
}

function readingOf(target: HTMLElement): HTMLButtonElement {
  return target.querySelector<HTMLButtonElement>(".typeable button")!;
}

function fieldOf(target: HTMLElement): HTMLInputElement | null {
  return target.querySelector<HTMLInputElement>(".typeable input");
}

/** Presses the reading and types into the field it opens. */
function typeInto(target: HTMLElement, typed: string): HTMLInputElement {
  if (!fieldOf(target)) readingOf(target).click();
  flushSync();
  const field = fieldOf(target)!;
  field.value = typed;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  return field;
}

async function press(field: HTMLInputElement, key: string) {
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
  flushSync();
  await tick();
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

describe("ValueSlider typed values", () => {
  it("opens the reading as a field holding its number, focused", () => {
    const target = host();
    mounted = mountHeldSlider(target, 50);
    readingOf(target).click();
    flushSync();

    const field = fieldOf(target)!;
    expect(field.value).toBe("100");
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-label")).toBe("Zoom");
  });

  it("sets a typed value on Enter, kept inside the slider's range", async () => {
    const target = host();
    const slider = mountHeldSlider(target, 50);
    mounted = slider;

    await press(typeInto(target, "250"), "Enter");
    expect(slider.value).toBe(250);
    expect(fieldOf(target)).toBeNull();
    expect(readingOf(target).textContent).toBe("250");
    expect(document.activeElement).toBe(readingOf(target));

    await press(typeInto(target, "900"), "Enter");
    expect(slider.value).toBe(400);
  });

  it("shows the value its owner kept after a typed one", async () => {
    const target = host();
    const slider = mountHeldSlider(target, 100);
    mounted = slider;

    await press(typeInto(target, "60"), "Enter");
    expect(slider.value).toBe(100);
    expect(readingOf(target).textContent).toBe("100");
  });

  it("keeps a field with no number open and marked, and Escape keeps the value", async () => {
    const target = host();
    const slider = mountHeldSlider(target, 50);
    mounted = slider;

    const field = typeInto(target, "abc");
    await press(field, "Enter");
    expect(fieldOf(target)).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(slider.changes).toBe(0);

    await press(field, "Escape");
    expect(fieldOf(target)).toBeNull();
    expect(slider.value).toBe(100);
    expect(slider.changes).toBe(0);
  });

  it("sets nothing when the number is left as it was", async () => {
    const target = host();
    const slider = mountHeldSlider(target, 50);
    mounted = slider;

    readingOf(target).click();
    flushSync();
    await press(fieldOf(target)!, "Enter");
    expect(fieldOf(target)).toBeNull();
    expect(slider.changes).toBe(0);
  });

  it("sets a typed value when the field is left", async () => {
    const target = host();
    const slider = mountHeldSlider(target, 50);
    mounted = slider;

    const field = typeInto(target, "150 %");
    field.dispatchEvent(new FocusEvent("blur"));
    flushSync();
    await tick();
    expect(slider.value).toBe(150);
    expect(fieldOf(target)).toBeNull();
  });

  it("reads a typed speed in × and sets the track's doublings", async () => {
    const target = host();
    const slider = mountSpeedSlider(target);
    mounted = slider;
    expect(readingOf(target).textContent).toBe("1×");

    readingOf(target).click();
    flushSync();
    expect(fieldOf(target)!.value).toBe("1");
    expect(target.querySelector(".typeable .unit")?.textContent).toBe("×");

    await press(typeInto(target, "2"), "Enter");
    expect(slider.value).toBe(1);
    expect(readingOf(target).textContent).toBe("2×");

    // No speed is below nothing: the field stays open for another try.
    const field = typeInto(target, "-1");
    await press(field, "Enter");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(slider.value).toBe(1);
  });
});
