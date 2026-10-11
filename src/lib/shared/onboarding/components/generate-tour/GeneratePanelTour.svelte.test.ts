import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import { tick } from "svelte";
import { getGeneratorPanelCards } from "#lib/shared/create/domain/card-registry.js";
import { generateTourState } from "../../state/generate-tour-state.svelte";
import GeneratePanelTour from "./GeneratePanelTour.svelte";

describe("GeneratePanelTour stop synchronization", () => {
  it("mounts and follows Level changes without recursively updating its effect", async () => {
    generateTourState.reset();
    const screen = render(GeneratePanelTour, { level: 1 });
    await tick();

    expect(generateTourState.totalStops).toBe(
      getGeneratorPanelCards({ isBeginner: true }).length
    );

    await screen.rerender({ level: 2 });
    await tick();

    expect(generateTourState.totalStops).toBe(
      getGeneratorPanelCards({ isBeginner: false }).length
    );
  });
});
