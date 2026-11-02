// Runs in the browser component project (tests/config/vitest.components.config.ts):
// the app needs real layout, observers and animations, which jsdom lacks.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountShapeEngine, mountElementStrip } from "@tka/shape-engine";
import type { Flower } from "@tka/shape-domain";

// The shared stub says "not a browser" for jsdom suites; this one is a real
// page, and the engine registers its keyboard shortcuts only in one.
vi.mock("$app/env", () => ({ browser: true, dev: true, building: false, version: "test" }));

const icons = {
  water: "/i/water.png", earth: "/i/earth.png", sun: "/i/sun.png",
  fire: "/i/fire.png", air: "/i/air.png", moon: "/i/moon.png",
};

// The spec's reference pair: pro-2-in over anti-2-in at level 2.
const left: Flower = { style: "pro", turns: 2, ori: "in", grid: "diamond", petals: 4 };
const right: Flower = { style: "anti", turns: 2, ori: "in", grid: "diamond", petals: 6 };

afterEach(() => {
  document.body.innerHTML = "";
});

/** Async loads (the matrix, the realizations) land over a few macrotasks. */
async function until(check: () => boolean, timeout = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("mountShapeEngine", () => {
  it("mounts the mirror variant with a Trace this action and tears down clean", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onTrace = vi.fn();
    const handle = mountShapeEngine(host, {
      variant: "mirror", icons, onTrace,
      initial: { level: 2, leftTurn: 2, rightTurn: 2, pair: { left, right }, mode: "SS" },
    });
    expect(host.querySelector("[data-shape-engine='mirror']")).not.toBeNull();
    await until(() => host.textContent?.includes("Trace this") ?? false);
    expect(host.textContent).not.toContain("Customize");
    handle.destroy();
    expect(host.childElementCount).toBe(0);
  });

  it("takes an initial state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountShapeEngine(host, {
      variant: "mirror", icons,
      initial: { level: 2, leftTurn: 2, rightTurn: 2, mode: "SS" },
    });
    await until(() => host.querySelector("[data-level='2']") !== null);
    handle.destroy();
  });
});

describe("mountElementStrip", () => {
  it("shows six chips, their letters, and reports a change", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onChange = vi.fn();
    const handle = mountElementStrip(host, { pair: { left, right }, mode: "SS", turns: [2, 2], icons, onChange });
    const chips = host.querySelectorAll("button[data-mode]");
    expect(chips.length).toBe(6);
    // The chips name the hands element, as the engine's own chip row does: SS is water.
    expect(chips[0]?.querySelector("img")?.getAttribute("src")).toBe("/i/water.png");
    await until(() => host.querySelector("button[data-mode='SO'] .choice-letter")?.textContent === "LF");
    (chips[3] as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith("SO");
    handle.update({ pair: { left, right }, mode: "SO", turns: [2, 2], icons, onChange });
    expect(host.querySelector("button[data-mode='SO']")?.getAttribute("aria-pressed")).toBe("true");
    handle.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
