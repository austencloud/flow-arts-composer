import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PropPreset } from "../../../domain/app-settings";
import PresetChip from "./PresetChip.svelte";

// The preview reads the current version from the saved settings when it gets
// no override. The test sets that current version directly, so a chip that
// ignored its own preset would draw the current version instead.
const saved = vi.hoisted(() => ({ propArtwork: "pictograph" as string }));
vi.mock("$lib/shared/application/state/app-state.svelte", () => ({
  getSettings: () => ({ propArtwork: saved.propArtwork }),
}));

const CLUB_PAIR: PropPreset = {
  leftPropType: PropType.CLUB,
  rightPropType: PropType.CLUB,
  catDogMode: false,
};

// A Version 2 chip draws its pre-lit capture from the model folder. A Version 1
// chip draws notation art, which never comes from there.
function drawsModelArt(label: string): boolean {
  const chip = page.getByRole("button", { name: label, exact: true });
  return (
    chip.element().querySelector('image[href*="/appearances/model/"]') !== null
  );
}

function renderChips(v1: PropPreset, v2: PropPreset) {
  for (const [preset, label] of [
    [v1, "Version 1 preset"],
    [v2, "Version 2 preset"],
  ] as const) {
    render(PresetChip, {
      preset,
      label,
      slotLabel: "1",
      onclick: vi.fn(),
    });
  }
}

describe("PresetChip version", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
    saved.propArtwork = "pictograph";
  });

  // Both chips share one page, so the Version 2 chip drawing its capture also
  // shows the settings have loaded. Without that, "the Version 1 chip draws no
  // capture" could pass only because nothing has loaded yet.
  it("draws each chip at its own version while the app is on Version 2", async () => {
    saved.propArtwork = "model";
    renderChips(
      { ...CLUB_PAIR, propArtwork: "pictograph" },
      { ...CLUB_PAIR, propArtwork: "model" }
    );

    await expect.poll(() => drawsModelArt("Version 2 preset")).toBe(true);
    expect(drawsModelArt("Version 1 preset")).toBe(false);
  });

  it("draws each chip at its own version while the app is on Version 1", async () => {
    saved.propArtwork = "pictograph";
    renderChips(
      { ...CLUB_PAIR, propArtwork: "pictograph" },
      { ...CLUB_PAIR, propArtwork: "model" }
    );

    await expect.poll(() => drawsModelArt("Version 2 preset")).toBe(true);
    expect(drawsModelArt("Version 1 preset")).toBe(false);
  });

  it("draws a preset saved before versions existed as Version 1", async () => {
    saved.propArtwork = "model";
    renderChips(CLUB_PAIR, { ...CLUB_PAIR, propArtwork: "model" });

    await expect.poll(() => drawsModelArt("Version 2 preset")).toBe(true);
    expect(drawsModelArt("Version 1 preset")).toBe(false);
  });
});
