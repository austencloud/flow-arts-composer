import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it } from "vitest";
import CreateEntryFlight from "./CreateEntryFlight.svelte";

function card(): { card: HTMLElement; name: HTMLElement } {
  const element = document.createElement("div");
  Object.assign(element.style, {
    position: "fixed",
    left: "100px",
    top: "100px",
    width: "400px",
    height: "200px",
    background: "rgb(245, 158, 11)",
    borderRadius: "16px",
  });
  const name = document.createElement("span");
  name.textContent = "Generate";
  element.append(name);
  document.body.append(element);
  return { card: element, name };
}

describe("CreateEntryFlight", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows no plate from the last entry when the next name files", () => {
    const { component, container } = render(CreateEntryFlight);
    const plate = container.querySelector<HTMLElement>(".plate")!;
    const first = card();

    component.fly({
      card: first.card,
      miniature: { left: 200, top: 90, width: 150, height: 220 },
    });
    component.clear();

    // The next tap: only the name rides, so nothing of the plate shows.
    const next = card();
    component.file({
      card: next.card,
      name: next.name,
      drawer: { left: 10, top: 10, width: 40, height: 20 },
      delay: 0,
      duration: 500,
      fadeFrom: 0.6,
    });

    const box = plate.getBoundingClientRect();
    expect(box.width * box.height).toBe(0);
    expect(getComputedStyle(plate).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("lifts the preview button, then lands it on the real one", () => {
    const { component, container } = render(CreateEntryFlight);
    const rideBox = container.querySelector<HTMLElement>(".ride-box")!;
    const ride = container.querySelector<HTMLElement>(".ride")!;
    const preview = button(60, 300, 90, 24, "999px", 12);
    const real = button(400, 500, 300, 80, "20px", 24, "button-content");

    expect(
      component.lift({ button: preview, toward: { x: 500, y: 300 }, holdMs: 4000 })
    ).toBe(true);
    expect(component.isRiding()).toBe(true);
    // The copy stands where the preview was, and the preview is hidden.
    expect(near(rideBox.getBoundingClientRect(), preview.getBoundingClientRect())).toBe(true);
    expect(getComputedStyle(preview).opacity).toBe("0");

    const landing = component.morph({ to: real, duration: 280 });
    expect(landing.length).toBeGreaterThan(0);
    // At the start the real button waits behind the copy.
    expect(getComputedStyle(real).opacity).toBe("0");
    expect(getComputedStyle(ride).opacity).toBe("1");

    for (const animation of landing) animation.finish();
    expect(near(rideBox.getBoundingClientRect(), real.getBoundingClientRect())).toBe(true);
    const copyIcon = container.querySelector(".ride-content i")!;
    const realIcon = real.querySelector("i")!;
    expect(
      near(copyIcon.getBoundingClientRect(), realIcon.getBoundingClientRect())
    ).toBe(true);
    // The real button shows and the copy goes in the same frame.
    expect(getComputedStyle(real).opacity).toBe("1");
    expect(getComputedStyle(ride).opacity).toBe("0");

    component.clear();
    expect(component.isRiding()).toBe(false);
    expect(getComputedStyle(preview).opacity).toBe("1");
    const left = rideBox.getBoundingClientRect();
    expect(left.width * left.height).toBe(0);
    expect(container.querySelector(".ride-content")!.children.length).toBe(0);
  });

  it("lands nothing when the real button has no box", () => {
    const { component } = render(CreateEntryFlight);
    const preview = button(60, 300, 90, 24, "999px", 12);
    const real = document.createElement("button");
    document.body.append(real);
    real.style.display = "none";

    component.lift({ button: preview, toward: { x: 500, y: 300 }, holdMs: 4000 });
    expect(component.morph({ to: real, duration: 280 })).toEqual([]);
    expect(component.isRiding()).toBe(true);
  });
});

/** A green button with a dice icon and the word, at a fixed box. */
function button(
  left: number,
  top: number,
  width: number,
  height: number,
  radius: string,
  fontSize: number,
  contentClass?: string
): HTMLElement {
  const element = document.createElement("button");
  Object.assign(element.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: radius,
    background: "rgb(34, 197, 94)",
    fontSize: `${fontSize}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4em",
    padding: "0",
    border: "none",
  });
  const holder = contentClass ? document.createElement("div") : element;
  if (contentClass) {
    holder.className = contentClass;
    Object.assign(holder.style, {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
    });
    element.append(holder);
  }
  const icon = document.createElement("i");
  Object.assign(icon.style, {
    display: "inline-block",
    width: "1em",
    height: "1em",
  });
  const word = document.createElement("span");
  word.textContent = "Generate";
  holder.append(icon, word);
  document.body.append(element);
  return element;
}

function near(a: DOMRect, b: DOMRect, tolerance = 1.5): boolean {
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}
