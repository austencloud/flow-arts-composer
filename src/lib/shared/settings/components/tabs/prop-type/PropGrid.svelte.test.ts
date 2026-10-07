import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import PropGrid from "./PropGrid.svelte";

const FIRE_FAN = {
  build: "fire",
  frameColor: "black",
  cover: "bare",
} as const;
const DOUBLE_STAFF_FAMILY = [
  PropType.STAFF,
  PropType.CAPSULE_BATON,
  PropType.FIRE_DOUBLE_STAFF,
  PropType.ENERGY_STAFF,
  PropType.STICK,
  PropType.SIMPLESTAFF,
  PropType.STAFF2,
];

function renderRail(fanAppearance: FanAppearance) {
  const onFanAppearanceChange = vi.fn();
  render(PropGrid, {
    selectedPropType: PropType.FAN,
    onSelect: vi.fn(),
    layout: "rail",
    fanAppearance,
    onFanAppearanceChange,
  });
  return onFanAppearanceChange;
}

describe("PropGrid fan look credit", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  it.each([
    {
      build: "star",
      originator: "Renegade Juggling",
      short: "Renegade",
      sourceUrl: "https://renegadejuggling.com/products/fire-fan-star",
    },
    {
      build: "flat-grip",
      originator: "Forged Creations",
      short: "Forged",
      sourceUrl: "https://forgedfans.com/products/flat-grip-fire-fans",
    },
  ] as const)(
    "links the $build rail heading back to $originator",
    async ({ build, originator, short, sourceUrl }) => {
      renderRail({ build, frameColor: "black", cover: "bare" });

      await page.getByTestId("fan-look-chip").click();

      const credit = page.getByRole("link", { name: `${originator} source` });
      await expect.element(credit).toBeVisible();
      await expect.element(credit).toHaveAttribute("href", sourceUrl);
      expect(credit.element().querySelector(".credit-short")?.textContent).toBe(
        short
      );
      expect(credit.element().querySelector(".credit-long")?.textContent).toBe(
        originator
      );
    }
  );

  it("keeps the heading plain for the house DoodleGrip", async () => {
    renderRail({ build: "fire", frameColor: "black", cover: "bare" });

    expect(document.querySelector('[data-testid="prop-look-chip"]')).toBeNull();
    await page.getByTestId("fan-look-chip").click();

    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();
    expect(document.querySelector(".rail-credit")).toBeNull();
  });

  it("offers the Version 1 and 2 choice in a captured prop's rail", async () => {
    const onPropLookChange = vi.fn();
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      layout: "rail",
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange,
    });

    const chip = page.getByTestId("prop-look-chip");
    await expect.element(chip).toHaveTextContent("Version 1");
    await expect
      .element(chip)
      .toHaveAttribute("aria-label", "Version 1. Change");
    await chip.click();
    await expect
      .element(page.getByRole("radiogroup", { name: "Version" }))
      .toBeVisible();
    const model = page.getByRole("radio", { name: "Version 2" });
    const pictograph = page.getByRole("radio", { name: "Version 1" });
    await expect.element(model).toBeVisible();
    await expect.element(pictograph).toHaveAttribute("aria-checked", "true");

    await model.click();
    expect(onPropLookChange).toHaveBeenCalledWith("model");
  });

  it("names the chip for the version in use", async () => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      layout: "rail",
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange: vi.fn(),
    });

    const chip = page.getByTestId("prop-look-chip");
    await expect.element(chip).toHaveTextContent("Version 2");
    await expect
      .element(chip)
      .toHaveAttribute("aria-label", "Version 2. Change");
  });

  it("lists every family style in each version as its own tile", async () => {
    const onSelect = vi.fn();
    const onPropLookChange = vi.fn();

    render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG],
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    for (const name of [
      "Triad V1 prop type",
      "Trigeng V1 prop type",
      "Triad V2 prop type",
      "Trigeng V2 prop type",
    ]) {
      await expect
        .element(
          page.getByRole("button", { name: `Select ${name}`, exact: true })
        )
        .toBeVisible();
    }
    expect(
      page.getByRole("radiogroup", { name: "Version" }).elements()
    ).toHaveLength(0);

    await page
      .getByRole("button", { name: "Select Trigeng V2 prop type", exact: true })
      .click();
    expect(onSelect).toHaveBeenCalledWith(PropType.TRIGENG, "model");
    expect(onPropLookChange).toHaveBeenCalledWith("model");
  });

  // The grip once sat alone on a Triangle details page one level further
  // down. It belongs on the styles page where the Triangle is picked.
  it("keeps a picked Triangle on its styles page, with its grip there", async () => {
    const onSelect = vi.fn();
    const onTriangleGripChange = vi.fn();
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.MINIHOOP,
      onSelect,
      allowedProps: [PropType.MINIHOOP, PropType.BIGHOOP, PropType.TRIANGLE],
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      triangleGrip: "corner",
      onTriangleGripChange,
    });

    await page.getByRole("button", { name: "Choose Mini Hoop style" }).click();
    const styles = page.getByRole("region", { name: "Mini Hoop styles" });
    await expect.element(styles).toBeVisible();
    expect(
      styles.getByRole("group", { name: "Triangle grip" }).elements()
    ).toHaveLength(0);

    await page
      .getByRole("button", { name: "Select Triangle prop type", exact: true })
      .click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIANGLE);
    await rerender({ selectedPropType: PropType.TRIANGLE });

    const side = styles.getByRole("button", { name: "Side", exact: true });
    await expect.element(side).toBeVisible();
    // Past the page swap a details page would take.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(
      document.querySelector('section[aria-label="Triangle details"]')
    ).toBeNull();

    await side.click();
    expect(onTriangleGripChange).toHaveBeenCalledWith("side");
  });

  it("selects Buugeng and replaces the root grid with its persistent details", async () => {
    const onSelect = vi.fn();
    const onPropLookChange = vi.fn();

    render(PropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect,
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange,
    });

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    expect(onSelect).toHaveBeenCalledWith(PropType.BUUGENG);

    await expect
      .element(page.getByRole("radio", { name: "Version 1" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByRole("radio", { name: "Version 2" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();

    await page.getByRole("radio", { name: "Version 2" }).click();
    expect(onPropLookChange).toHaveBeenCalledWith("model");

    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect
      .element(page.getByRole("button", { name: "Select Buugeng prop type" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("radio", { name: "Version 2" }))
      .not.toBeInTheDocument();
  });
});

describe("PropGrid prop versions", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  const tile = (name: string) =>
    page.getByRole("button", { name: `Select ${name} prop type`, exact: true });
  // A V2 tile draws its pre-lit capture; a V1 tile draws notation art, which
  // arrives later as a recolored data URI and never from the model folder.
  const modelArtIn = (selector: string) =>
    document
      .querySelector(selector)
      ?.querySelector('image[href*="/appearances/model/"]') ?? null;

  it("gives only Double Staff and LED Baton a V2 tile in the Double Staff family", async () => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: DOUBLE_STAFF_FAMILY,
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Choose Double Staff style" })
      .click();
    for (const name of [
      "Double Staff V1",
      "Double Staff V2",
      "LED Baton V1",
      "LED Baton V2",
      // One version each: the plain name, no V1 or V2.
      "Simple Staff",
      "Capped Staff",
      "Fire Staff",
      "Energy Staff",
      "Stick",
    ]) {
      await expect.element(tile(name)).toBeVisible();
    }

    for (const name of [
      "Simple Staff",
      "Capped Staff",
      "Fire Staff",
      "Energy Staff",
      "Stick",
    ]) {
      for (const version of [1, 2]) {
        expect(
          tile(`${name} V${version}`).elements(),
          `${name} V${version}`
        ).toHaveLength(0);
      }
    }
    // A prop with two versions never shows a tile that hides which it is.
    expect(tile("Double Staff").elements()).toHaveLength(0);
    expect(tile("LED Baton").elements()).toHaveLength(0);
  });

  it("marks only the tile of the version in use as selected", async () => {
    render(PropGrid, {
      selectedPropType: PropType.CAPSULE_BATON,
      onSelect: vi.fn(),
      allowedProps: DOUBLE_STAFF_FAMILY,
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Choose Double Staff style" })
      .click();
    await expect
      .element(tile("LED Baton V2"))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(tile("LED Baton V1"))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("labels a V2 tile with its prop and version", async () => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: DOUBLE_STAFF_FAMILY,
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Choose Double Staff style" })
      .click();
    await expect.element(tile("LED Baton V2")).toBeVisible();
    const label = (selector: string) =>
      document.querySelector(`${selector} .prop-label`)?.textContent?.trim();
    expect(
      label('[data-prop-tile="capsule_baton"][data-prop-look="model"]')
    ).toBe("LED Baton V2");
    expect(
      label('[data-prop-tile="capsule_baton"][data-prop-look="pictograph"]')
    ).toBe("LED Baton V1");
    // Staff V2 is a display name only; the prop value is unchanged.
    expect(label('[data-prop-tile="staff_v2"]')).toBe("Capped Staff");
  });

  it("draws V1 art on every main-grid tile except the selected prop's", async () => {
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: [PropType.STAFF, PropType.CLUB],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange: vi.fn(),
    });

    await expect
      .poll(() => modelArtIn('[data-prop-tile="staff"]'))
      .not.toBeNull();
    expect(modelArtIn('[data-prop-tile="club"]')).toBeNull();

    // The version follows the selection, not the prop.
    await rerender({ selectedPropType: PropType.CLUB });
    await expect
      .poll(() => modelArtIn('[data-prop-tile="club"]'))
      .not.toBeNull();
    expect(modelArtIn('[data-prop-tile="staff"]')).toBeNull();
  });

  it("draws V1 art on a family tile unless the selected prop belongs to it", async () => {
    render(PropGrid, {
      selectedPropType: PropType.CAPSULE_BATON,
      onSelect: vi.fn(),
      allowedProps: [
        PropType.STAFF,
        PropType.CAPSULE_BATON,
        PropType.CLUB,
        PropType.TORCH,
      ],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange: vi.fn(),
    });

    // The Double Staff family tile shows the LED Baton in hand, at V2.
    await expect
      .poll(() => modelArtIn('[data-family-tile="staff"]'))
      .not.toBeNull();
    expect(modelArtIn('[data-family-tile="club"]')).toBeNull();
  });

  // Size is a setting on a prop. A family of one style folds its Big twin into
  // the single tile, so that tile is the selected prop when the twin is.
  it("lights and draws the single tile of a prop whose Big twin is selected", async () => {
    render(PropGrid, {
      selectedPropType: PropType.BIGCHICKEN,
      onSelect: vi.fn(),
      allowedProps: [PropType.CHICKEN, PropType.BIGCHICKEN, PropType.CLUB],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange: vi.fn(),
    });

    await expect
      .element(tile("Chicken"))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => modelArtIn('[data-prop-tile="chicken"]'))
      .not.toBeNull();
    // Another prop still reads V1 and stays unselected.
    await expect
      .element(tile("Club"))
      .toHaveAttribute("aria-pressed", "false");
    expect(modelArtIn('[data-prop-tile="club"]')).toBeNull();
  });

  it("reports a size change as the other size and names no version", async () => {
    const onSelect = vi.fn();
    const onPropLookChange = vi.fn();
    render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG, PropType.BIGTRIAD],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      propLook: "model",
      onPropLookChange,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await page.getByRole("button", { name: "Big", exact: true }).click();

    // The host keeps the version it holds: the grid sends the size twin with
    // no version and never writes one.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGTRIAD);
    expect(onPropLookChange).not.toHaveBeenCalled();
  });
});

// An unbounded grid's column count follows its container tier, so a short
// last row once sat at the left (Bare hands under Novelty on a phone).
describe("PropGrid short last rows", () => {
  beforeEach(() => {
    document.body.style.margin = "0";
  });

  // Each row's tile count, and how far the widest gap between a row's middle
  // and the first row's middle is, rounded to the pixel.
  function rowsOf(grid: Element) {
    const rows = new Map<number, { left: number; right: number; count: number }>();
    for (const child of grid.children) {
      const box = child.getBoundingClientRect();
      const top = Math.round(box.top);
      const row = rows.get(top);
      if (row) {
        row.left = Math.min(row.left, box.left);
        row.right = Math.max(row.right, box.right);
        row.count += 1;
      } else {
        rows.set(top, { left: box.left, right: box.right, count: 1 });
      }
    }
    const ordered = [...rows.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, row]) => row);
    const middle = (row: { left: number; right: number }) =>
      (row.left + row.right) / 2;
    const first = ordered[0];
    return {
      counts: ordered.map((row) => row.count),
      drift: first
        ? Math.round(
            Math.max(...ordered.map((row) => Math.abs(middle(row) - middle(first))))
          )
        : 0,
    };
  }

  // Seven props, one tile each, so the counts below follow the tiers alone.
  const SEVEN = [
    PropType.STAFF,
    PropType.CLUB,
    PropType.FAN,
    PropType.TRIAD,
    PropType.MINIHOOP,
    PropType.BUUGENG,
    PropType.EIGHTRINGS,
  ];

  it.each([
    { width: 340, counts: [2, 2, 2, 1] },
    { width: 420, counts: [3, 3, 1] },
    { width: 620, counts: [4, 3] },
    { width: 780, counts: [4, 3] },
  ])(
    "centres a section's short last row at $width px",
    async ({ width, counts }) => {
      await page.viewport(width, 800);
      render(PropGrid, {
        selectedPropType: PropType.STAFF,
        onSelect: vi.fn(),
        allowedProps: SEVEN,
        fanAppearance: FIRE_FAN,
        onFanAppearanceChange: vi.fn(),
      });

      await expect.element(page.getByRole("button", { name: "Select Fan prop type" })).toBeVisible();
      const grid = document.querySelector(".section-buttons");
      expect(grid).not.toBeNull();
      await expect.poll(() => rowsOf(grid!)).toEqual({ counts, drift: 0 });
    }
  );

  it.each([
    { width: 340, counts: [2, 2, 2, 2, 1] },
    { width: 780, counts: [5, 4] },
  ])(
    "centres a family's short last row at $width px",
    async ({ width, counts }) => {
      await page.viewport(width, 800);
      render(PropGrid, {
        selectedPropType: PropType.STAFF,
        onSelect: vi.fn(),
        allowedProps: DOUBLE_STAFF_FAMILY,
        fanAppearance: FIRE_FAN,
        onFanAppearanceChange: vi.fn(),
        propLook: "pictograph",
        onPropLookChange: vi.fn(),
      });

      await page.getByRole("button", { name: "Choose Double Staff style" }).click();
      const styles = page.getByRole("group", {
        name: "Double Staff styles choices",
      });
      await expect.element(styles).toBeVisible();
      await expect.poll(() => rowsOf(styles.element())).toEqual({ counts, drift: 0 });
    }
  );
});
