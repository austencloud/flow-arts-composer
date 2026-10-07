import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getCompositionRecipe } from "$lib/shared/pictograph/prop/domain/prop-composition-recipes";
import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import PropGrid from "./PropGrid.svelte";

// The component suite serves no static files, so each notation file is a stub
// that names itself. A tile recolors the file into a data URI for each hand,
// and the name survives the recolor.
vi.mock("$lib/shared/net/asset-fetch", () => ({
  assetFetch: async (url: string) =>
    new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" data-src="${url}"><path style="fill:#3575E2"/></svg>`
    ),
}));

const FAMILY_TILE = '[data-family-tile="staff"]';

/** The file each hand of a tile draws, left then right; null until loaded. */
function handArt(selector: string): (string | null)[] {
  const images = document.querySelectorAll(
    `${selector} svg.prop-composition-preview image`
  );
  return [...images].map((image) => {
    const href = image.getAttribute("href") ?? "";
    if (!href.startsWith("data:")) return null;
    const svg = decodeURIComponent(href.slice(href.indexOf(",") + 1));
    return new DOMParser()
      .parseFromString(svg, "image/svg+xml")
      .documentElement.getAttribute("data-src");
  });
}

function handTransforms(selector: string): (string | null)[] {
  return [
    ...document.querySelectorAll(
      `${selector} svg.prop-composition-preview > g`
    ),
  ].map((hand) => hand.getAttribute("transform"));
}

describe("PropGrid family tile art", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // The family tile stays mounted while the selection changes size. Its right
  // hand once kept the prop the tile mounted with, so Big Staff drew beside a
  // Double Staff as two short flat bars instead of a crossed pair.
  it("draws Big Staff in both hands, crossed, after the size switches to Big", async () => {
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: [PropType.STAFF, PropType.CAPSULE_BATON, PropType.BIGSTAFF],
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange: vi.fn(),
    });
    const staff = getPropTypeDisplayInfo(PropType.STAFF).image;
    const bigStaff = getPropTypeDisplayInfo(PropType.BIGSTAFF).image;
    await expect.poll(() => handArt(FAMILY_TILE)).toEqual([staff, staff]);

    await rerender({ selectedPropType: PropType.BIGSTAFF });

    await expect.poll(() => handArt(FAMILY_TILE)).toEqual([bigStaff, bigStaff]);
    const crossed = getCompositionRecipe(PropType.BIGSTAFF, true);
    expect(handTransforms(FAMILY_TILE)).toEqual([
      expect.stringContaining(`rotate(${crossed.left.rotation})`),
      expect.stringContaining(`rotate(${crossed.right.rotation})`),
    ]);
  });
});
