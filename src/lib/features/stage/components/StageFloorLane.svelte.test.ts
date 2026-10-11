import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

import StageFloorLane from "./StageFloorLane.svelte";

const SEGMENT = {
  id: "a:set-2",
  formationId: "set-2",
  performerId: "a",
  setIndex: 1,
  label: "Set 2",
  startBeat: 4,
  endBeat: 8,
  minimumStartBeat: 0,
  maximumEndBeat: 8,
  distanceMeters: 3,
  requestedStepCount: 4,
  resolvedStepCount: 4,
  supportedStepRange: { min: 4, max: 5 },
  exact: true,
} as const;

describe("StageFloorLane", () => {
  it("exposes the trip and both timing boundaries as keyboard controls", async () => {
    const onSelect = vi.fn();
    const onKeyAdjust = vi.fn();
    render(StageFloorLane, {
      segments: [SEGMENT],
      currentBeat: 5,
      pixelsPerBeat: 24,
      selectedSegmentId: SEGMENT.id,
      onSelect,
      onKeyAdjust,
    });

    const trip = page.getByRole("button", { name: /Set 2: depart/ });
    await expect.element(trip).toHaveAttribute("aria-pressed", "true");
    await trip.click();
    expect(onSelect).toHaveBeenCalledWith(SEGMENT);

    const departure = page.getByRole("slider", {
      name: "Departure for Set 2",
    });
    await expect.element(departure).toHaveAttribute("aria-valuenow", "4");
    departure.element().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onKeyAdjust).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ArrowRight" }),
      SEGMENT,
      "departure"
    );

    const arrival = page.getByRole("slider", { name: "Arrival for Set 2" });
    expect(
      arrival.element().getBoundingClientRect().width
    ).toBeGreaterThanOrEqual(44);
    expect(
      arrival.element().getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44);
    await expectNoA11yViolations();
  });
});
