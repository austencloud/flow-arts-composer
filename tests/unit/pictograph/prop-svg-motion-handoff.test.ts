/**
 * When a per-frame motion renderer hands a prop back to its still pose, the
 * prop must not spin. Since the shared edit clock (8ca7b6a531, 2026-10-15)
 * PropSvg paints exactly the angle it is given and has no transform
 * transition of its own, so the handoff cannot ease the long way round.
 * Motion between drawings belongs to the caller.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountPropSvg } from "./prop-svg-harness.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let prop: ReturnType<typeof mountPropSvg> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  prop?.destroy();
  prop = null;
  host.remove();
  document.createElement = stubbedCreateElement;
});

describe("PropSvg handoff from per-frame motion", () => {
  it("paints the angle it is given on every frame and after the handoff", () => {
    prop = mountPropSvg(host, { rotation: -89.2, directPositioning: true });
    expect(prop.rotation()).toBeCloseTo(-89.2, 6);

    prop.set({ rotation: 270, directPositioning: false });
    expect(prop.rotation()).toBe(270);

    prop.set({ rotation: 20, directPositioning: true });
    expect(prop.rotation()).toBe(20);
  });

  it("has no transform transition that could spin the prop", () => {
    const source = readFileSync(
      "src/lib/shared/pictograph/prop/components/PropSvg.svelte",
      "utf8"
    );
    const outer = source.match(/\.prop-svg\s*\{[^}]*\}/)?.[0] ?? "";
    expect(outer).toContain("transition: opacity");
    expect(outer).not.toMatch(/transition:[^;]*transform/);
  });
});
