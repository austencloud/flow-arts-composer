import { describe, expect, it } from "vitest";
import { transitionGhostHover } from "#lib/shared/attract/services/ghost-hover.js";
import {
  chooseNavigationOption,
  readNavigationOptions,
} from "#lib/shared/attract/intentions/explore.js";
import {
  EMPTY_WORLD,
  type GhostContext,
} from "#lib/shared/attract/domain/intention.js";
import { createMemory } from "#lib/shared/attract/domain/scoring.js";
import { createRng } from "#lib/shared/attract/services/rng.js";
import { createTrail } from "#lib/shared/attract/services/trail.js";

function context(): GhostContext {
  const rng = createRng(7);
  const memory = createMemory(
    rng,
    createTrail(() => 1234)
  );
  memory.activities.current = {
    id: "browse",
    steps: [
      { intentionId: "consider-navigation", targetModuleId: "library" },
      { intentionId: "go-to-module", targetModuleId: "library" },
    ],
    stepIndex: 0,
    startedAt: 0,
  };
  return {
    ...EMPTY_WORLD,
    ...memory,
    moduleId: "create",
    reachableModules: ["create", "library", "museum"],
    available: { ...EMPTY_WORLD.available, "nav-module": 3 },
  };
}

describe("ghost navigation perception", () => {
  it("opens a hover boundary once and keeps it open while looking within it", () => {
    document.body.innerHTML = `
      <aside class="ghost-hover-boundary">
        <button id="one"></button>
        <button id="two"></button>
      </aside>
      <button id="outside"></button>
    `;
    const boundary = document.querySelector<HTMLElement>(
      ".ghost-hover-boundary"
    )!;
    const one = document.querySelector<HTMLElement>("#one")!;
    const two = document.querySelector<HTMLElement>("#two")!;
    const outside = document.querySelector<HTMLElement>("#outside")!;
    let enters = 0;
    let leaves = 0;
    boundary.addEventListener("pointerenter", () => enters++);
    boundary.addEventListener("pointerleave", () => leaves++);

    transitionGhostHover(null, one);
    transitionGhostHover(one, two);
    transitionGhostHover(two, outside);

    expect(enters).toBe(1);
    expect(leaves).toBe(1);
    expect(one.classList.contains("ghost-hover")).toBe(false);
    expect(two.classList.contains("ghost-hover")).toBe(false);
    expect(outside.classList.contains("ghost-hover")).toBe(true);
  });

  it("cannot choose a named destination until expanded labels have rendered", () => {
    document.body.innerHTML = `
      <aside class="ac-sidebar collapsed ghost-hover-boundary">
        <button class="module-button active" data-tour-module="create"></button>
        <button class="module-button" data-tour-module="library"></button>
        <button class="module-button" data-tour-module="museum"></button>
      </aside>
    `;
    const ctx = context();
    const sidebar = document.querySelector<HTMLElement>(".ac-sidebar")!;

    expect(readNavigationOptions(sidebar)).toEqual([]);

    for (const button of sidebar.querySelectorAll<HTMLElement>(
      ".module-button"
    )) {
      const text = button.getAttribute("data-tour-module") ?? "";
      button.insertAdjacentHTML(
        "beforeend",
        `<span class="module-label">${text}</span>`
      );
    }
    sidebar.classList.add("hover-expanded");

    expect(
      sidebar.querySelectorAll(".module-button[data-tour-module]")
    ).toHaveLength(3);
    expect(sidebar.querySelectorAll(".module-label")).toHaveLength(3);
    const options = readNavigationOptions(sidebar);
    expect(options.map(({ option }) => option.label)).toEqual([
      "create",
      "library",
      "museum",
    ]);
    expect(chooseNavigationOption(ctx, options)?.option).toEqual({
      kind: "module",
      id: "library",
      label: "library",
    });
  });
});
