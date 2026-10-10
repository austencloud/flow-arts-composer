import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import LOOPIconStrip from "./LOOPIconStrip.svelte";

const cases: Array<{
  axis: ReflectionAxis;
  component: LOOPComponent;
  rotation: number;
  label: string;
}> = [
  {
    axis: "north-south",
    component: LOOPComponent.MIRRORED,
    rotation: 0,
    label: "Mirrored (north-south axis)",
  },
  {
    axis: "east-west",
    component: LOOPComponent.FLIPPED,
    rotation: 90,
    label: "Flipped (east-west axis)",
  },
  {
    axis: "northeast-southwest",
    component: LOOPComponent.MIRRORED,
    rotation: 45,
    label: "Northeast-southwest reflection",
  },
  {
    axis: "northwest-southeast",
    component: LOOPComponent.MIRRORED,
    rotation: -45,
    label: "Northwest-southeast reflection",
  },
];

describe("LOOPIconStrip Reflection glyph", () => {
  it.each(cases)(
    "renders $axis as the shared purple glyph at $rotation degrees",
    ({ axis, component, rotation, label }) => {
      const view = render(LOOPIconStrip, {
        activeComponents: new Set([component]),
        reflectionAxis: axis,
      });

      const strip = document.querySelector(".loop-icon-strip") as HTMLElement;
      const cell = document.querySelector(".icon-cell") as HTMLElement;
      const icon = document.querySelector(".loop-icon-strip i") as HTMLElement;
      expect(icon.classList.contains("fa-left-right")).toBe(true);
      expect(icon.style.color).toBe("rgb(111, 45, 168)");
      expect(icon.style.transform).toContain(`rotate(${rotation}deg)`);
      expect(strip.getAttribute("aria-label")).toBe(`LOOP: ${label}`);
      expect(cell.getBoundingClientRect().width).toBe(16);
      expect(cell.getBoundingClientRect().height).toBe(16);

      view.unmount();
    }
  );
});
