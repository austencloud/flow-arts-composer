import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
vi.mock("./BuugengPairPreview.svelte", async () => ({
  default: (await import("./__test-stubs__/BuugengPairPreviewStub.svelte"))
    .default,
}));

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

  it("names Flow DNA without a link until it has a product page", async () => {
    renderRail({ build: "sense", frameColor: "black", cover: "bare" });

    await page.getByTestId("fan-look-chip").click();

    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();
    const credit = document.querySelector(".rail-credit");
    expect(credit?.tagName).toBe("SPAN");
    expect(credit?.querySelector(".credit-long")?.textContent).toBe("Flow DNA");
    expect(document.querySelector("a.rail-credit, .rail-credit a")).toBeNull();
  });

  it("keeps the heading plain for the house DoodleGrip", async () => {
    renderRail({ build: "fire", frameColor: "black", cover: "bare" });

    expect(document.querySelector('[data-testid="prop-look-chip"]')).toBeNull();
    await page.getByTestId("fan-look-chip").click();

    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();
    expect(document.querySelector(".rail-credit")).toBeNull();
  });

  it("shows no version chip in a prop's rail", async () => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      layout: "rail",
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: /Double Staff/ }).first())
      .toBeVisible();
    expect(page.getByTestId("prop-look-chip").elements()).toHaveLength(0);
    expect(
      page.getByRole("radiogroup", { name: "Version" }).elements()
    ).toHaveLength(0);
  });

  it("lists each family style as one tile and hands the host only the prop", async () => {
    const onSelect = vi.fn();

    render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page.getByRole("button", { name: "Choose Triad style" }).last().click();
    for (const name of ["Triad prop type", "Trigeng prop type"]) {
      await expect
        .element(
          page.getByRole("button", { name: `Select ${name}`, exact: true })
        )
        .toBeVisible();
    }

    await page
      .getByRole("button", { name: "Select Trigeng prop type", exact: true })
      .click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIGENG);
    expect(onSelect.mock.lastCall).toHaveLength(1);
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

    await page.getByRole("button", { name: "Choose Mini Hoop style" }).last().click();
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

    render(PropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect,
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    expect(onSelect).toHaveBeenCalledWith(PropType.BUUGENG);
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();

    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect
      .element(page.getByRole("button", { name: "Select Buugeng prop type" }))
      .toBeVisible();
  });

  // The buugeng style is a look beside Size: every style visible at once,
  // the current one marked, and a pick reported without changing the prop.
  it("offers every buugeng style on the details page and keeps it on Big", async () => {
    const onSelect = vi.fn();
    const onBuugengStyleChange = vi.fn();
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect,
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      buugengStyle: "classic",
      onBuugengStyleChange,
    });

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    const row = page.getByTestId("buugeng-style-row");
    await expect.element(row).toBeVisible();
    const styles = row.getByRole("radiogroup", { name: "Style" });
    await expect.element(styles).toBeVisible();
    const radios = styles.getByRole("radio").elements();
    expect(radios.map((radio) => radio.textContent?.trim())).toEqual([
      "Classic",
      "Crescent",
      "Perforated",
      "Fire",
      "Filigree",
    ]);
    await expect
      .element(styles.getByRole("radio", { name: "Classic" }))
      .toHaveAttribute("aria-checked", "true");

    await styles.getByRole("radio", { name: "Fire" }).click();
    expect(onBuugengStyleChange).toHaveBeenCalledWith("fire");
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BUUGENG);

    await rerender({ buugengStyle: "fire" });
    await expect
      .element(styles.getByRole("radio", { name: "Fire" }))
      .toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Big" }).click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGBUUGENG);
    await rerender({ selectedPropType: PropType.BIGBUUGENG });
    await expect.element(page.getByTestId("buugeng-style-row")).toBeVisible();
  });

  it("hides the buugeng style where the host cannot store it", async () => {
    render(PropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();
    expect(page.getByTestId("buugeng-style-row").elements()).toHaveLength(0);
  });

  // The triad build is a look like the buugeng style: Pictograph, Fire and
  // Day side by side, a pick reported without changing the prop.
  it("offers the triad build on the details page and keeps it on Big", async () => {
    const onSelect = vi.fn();
    const onChoiceDone = vi.fn();
    const onTriadBuildChange = vi.fn();
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      onChoiceDone,
      allowedProps: [PropType.TRIAD, PropType.BIGTRIAD],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      triadBuild: "pictograph",
      onTriadBuildChange,
    });

    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD);
    expect(onChoiceDone).not.toHaveBeenCalled();
    const row = page.getByTestId("triad-build-row");
    await expect.element(row).toBeVisible();
    const builds = row.getByRole("radiogroup", { name: "Build" });
    expect(
      builds
        .getByRole("radio")
        .elements()
        .map((r) => r.textContent?.trim())
    ).toEqual(["Pictograph", "Fire", "Day"]);
    await expect
      .element(builds.getByRole("radio", { name: "Pictograph" }))
      .toHaveAttribute("aria-checked", "true");

    await builds.getByRole("radio", { name: "Fire" }).click();
    expect(onTriadBuildChange).toHaveBeenCalledWith("fire");
    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD);
    expect(onChoiceDone).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Big" }).click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGTRIAD);
    await rerender({ selectedPropType: PropType.BIGTRIAD, triadBuild: "fire" });
    await expect
      .element(
        page.getByTestId("triad-build-row").getByRole("radio", { name: "Fire" })
      )
      .toHaveAttribute("aria-checked", "true");
  });

  it("puts the triad build on the triad family page, not on Trigeng", async () => {
    const onChoiceDone = vi.fn();
    const onTriadBuildChange = vi.fn();
    const { rerender } = render(PropGrid, {
      selectedPropType: PropType.TRIGENG,
      onSelect: vi.fn(),
      onChoiceDone,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG, PropType.BIGTRIAD],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      triadBuild: "pictograph",
      onTriadBuildChange,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).last().click();
    const styles = page.getByRole("region", { name: "Triad styles" });
    await expect.element(styles).toBeVisible();
    expect(page.getByTestId("triad-build-row").elements()).toHaveLength(0);

    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();
    expect(onChoiceDone).not.toHaveBeenCalled();
    await rerender({ selectedPropType: PropType.TRIAD });
    const row = styles.getByTestId("triad-build-row");
    await expect.element(row).toBeVisible();
    await row.getByRole("radio", { name: "Day" }).click();
    expect(onTriadBuildChange).toHaveBeenCalledWith("day");
  });

  it("hides the triad build where the host cannot store it", async () => {
    render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect: vi.fn(),
      allowedProps: [PropType.TRIAD, PropType.BIGTRIAD],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();
    expect(page.getByTestId("triad-build-row").elements()).toHaveLength(0);
  });
});

// Austen removed the Version 1 / Version 2 prop versions on 2026-10-27. Each
// prop has one tile and draws its notation art.
describe("PropGrid one look per prop", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  const tile = (name: string) =>
    page.getByRole("button", { name: `Select ${name} prop type`, exact: true });

  it("gives every Double Staff style one tile, with no version", async () => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: DOUBLE_STAFF_FAMILY,
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Choose Double Staff style" }).last()
      .click();
    for (const name of [
      "Double Staff",
      "LED Baton",
      "Simple Staff",
      "Capped Staff",
      "Fire Staff",
      "Energy Staff",
      "Stick",
    ]) {
      await expect.element(tile(name)).toBeVisible();
      for (const version of [1, 2]) {
        expect(
          tile(`${name} V${version}`).elements(),
          `${name} V${version}`
        ).toHaveLength(0);
      }
    }
    expect(document.querySelector("[data-prop-look]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Version/);
    // Staff V2 is a display name only; the prop value is unchanged.
    expect(
      document
        .querySelector('[data-prop-tile="staff_v2"] .prop-label')
        ?.textContent?.trim()
    ).toBe("Capped Staff");
  });

  // Size is a setting on a prop. A family of one style folds its Big twin into
  // the single tile, so that tile is the selected prop when the twin is.
  it("lights the single tile of a prop whose Big twin is selected", async () => {
    render(PropGrid, {
      selectedPropType: PropType.BIGCHICKEN,
      onSelect: vi.fn(),
      allowedProps: [PropType.CHICKEN, PropType.BIGCHICKEN, PropType.CLUB],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await expect
      .element(tile("Chicken"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(tile("Club")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a size change as the other size", async () => {
    const onSelect = vi.fn();
    render(PropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG, PropType.BIGTRIAD],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page.getByRole("button", { name: "Choose Triad style" }).last().click();
    await page.getByRole("button", { name: "Big", exact: true }).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGTRIAD);
  });
});

// A details page whose only setting is Size draws it as two picture tiles, not
// one text line on a black page.
describe("PropGrid size-only details page", () => {
  beforeEach(async () => {
    await page.viewport(344, 640);
    document.body.style.margin = "0";
  });

  it("draws Size as two picture tiles, Standard smaller than Big", async () => {
    const onSelect = vi.fn();
    render(PropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect,
      allowedProps: [PropType.CLUB, PropType.BIGCLUB],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await page.getByRole("button", { name: "Select Club prop type" }).click();
    await expect.element(page.getByTestId("prop-size-row")).toBeVisible();

    const standard = page.getByRole("button", { name: "Standard" });
    const big = page.getByRole("button", { name: "Big", exact: true });
    await expect.element(standard).toHaveAttribute("aria-pressed", "true");
    await expect.element(big).toHaveAttribute("aria-pressed", "false");
    const scaleOf = (id: string) =>
      Number(
        document
          .querySelector(`[data-testid="prop-size-${id}"] .size-pair`)
          ?.getAttribute("data-size-scale")
      );
    expect(scaleOf("standard")).toBeLessThan(scaleOf("big"));
    expect(scaleOf("big")).toBe(1);

    await big.click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGCLUB);
  });

  it("keeps the compact text row where Size shares the page", async () => {
    render(PropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      onBuugengStyleChange: vi.fn(),
    });

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    expect(document.querySelector('[data-testid="prop-size-row"]')).toBeNull();
  });
});

// The contact ball family is deactivated: a person who still has one chosen
// opens a switcher with no contact ball tile, nothing lit, and no Size row.
describe("PropGrid with a saved contact ball", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  it("lists no contact ball, lights no tile and offers no size control", async () => {
    render(PropGrid, {
      selectedPropType: PropType.CONTACTBALL,
      onSelect: vi.fn(),
      allowedProps: [
        PropType.CONTACTBALL,
        PropType.BIGCONTACTBALL,
        PropType.DOUBLECONTACTBALL,
        PropType.BIGDOUBLECONTACTBALL,
        PropType.CLUB,
        PropType.STAFF,
      ],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    await expect
      .element(
        page.getByRole("button", {
          name: "Select Club prop type",
          exact: true,
        })
      )
      .toBeVisible();
    expect(document.body.textContent).not.toMatch(/Contact Ball/);
    expect(
      document.querySelector('[data-prop-tile*="contactball"]')
    ).toBeNull();
    expect(
      document.querySelectorAll('[data-prop-tile][aria-pressed="true"]').length
    ).toBe(0);
    expect(document.querySelector('[data-testid="prop-size-row"]')).toBeNull();
    expect(document.querySelector(".size-toggle")).toBeNull();
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
    const rows = new Map<
      number,
      { left: number; right: number; count: number }
    >();
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
            Math.max(
              ...ordered.map((row) => Math.abs(middle(row) - middle(first)))
            )
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

      await expect
        .element(page.getByRole("button", { name: "Select Fan prop type" }))
        .toBeVisible();
      const grid = document.querySelector(".section-buttons");
      expect(grid).not.toBeNull();
      await expect.poll(() => rowsOf(grid!)).toEqual({ counts, drift: 0 });
    }
  );

  it.each([
    { width: 340, counts: [2, 2, 2, 1] },
    { width: 780, counts: [4, 3] },
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
      });

      await page
        .getByRole("button", { name: "Choose Double Staff style" }).last()
        .click();
      const styles = page.getByRole("group", {
        name: "Double Staff styles choices",
      });
      await expect.element(styles).toBeVisible();
      await expect
        .poll(() => rowsOf(styles.element()))
        .toEqual({ counts, drift: 0 });
    }
  );
});

// A Both / Left / Right choice above the grid names the hand every tile
// draws. Unset (no choice above the grid) keeps the pair.
describe("PropGrid previewHand", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // Each hand's prop sits in its own scale group inside the tile's svg.
  const handsDrawn = () =>
    document.querySelectorAll(
      '[data-prop-tile="staff"] svg.prop-composition-preview g[transform^="scale"]'
    ).length;

  it.each([
    { previewHand: undefined, hands: 2 },
    { previewHand: "left", hands: 1 },
    { previewHand: "right", hands: 1 },
  ] as const)("draws $hands prop(s) per tile for $previewHand", async ({
    previewHand,
    hands,
  }) => {
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      allowedProps: [PropType.STAFF, PropType.CLUB],
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
      ...(previewHand ? { previewHand } : {}),
    });
    await expect
      .poll(() => document.querySelector('[data-prop-tile="staff"]'))
      .not.toBeNull();
    await expect.poll(handsDrawn).toBe(hands);
  });
});

// The phone sheet bounds the rail to a fixed height (AnimationPanel's
// .bottom-prop-picker); the rail's screens fill it.
function sheetHost(): HTMLElement {
  document.querySelectorAll("[data-sheet-host]").forEach((el) => el.remove());
  const host = document.createElement("div");
  host.dataset.sheetHost = "";
  host.style.cssText =
    "display:flex;flex-direction:column;width:100%;height:340px;overflow:hidden";
  document.body.append(host);
  return host;
}

// Austen, 2026-11-15, on the phone sheet with Club picked: "there's no clear
// way to select the variations of clubs from this screen, unless I already
// know that I have to tap the club icon itself." The Styles button is a
// second, visible door to the same screen the family tile opens.
describe("PropGrid Styles button", () => {
  beforeEach(async () => {
    await page.viewport(387, 775);
    document.body.style.margin = "0";
  });

  const CLUB_FAMILY = [PropType.CLUB, PropType.CLASSIC_CLUB, PropType.TORCH];

  it("opens a picked family's styles from the rail and returns focus to it", async () => {
    const { rerender } = render(PropGrid, {
      target: sheetHost(),
      props: {
        selectedPropType: PropType.CLUB,
        onSelect: vi.fn(),
        layout: "rail",
        variant: "inline",
        allowedProps: [...CLUB_FAMILY, PropType.BUUGENG],
        fanAppearance: FIRE_FAN,
        onFanAppearanceChange: vi.fn(),
      },
    });

    const chip = page.getByTestId("prop-styles-chip");
    await expect.element(chip).toBeVisible();
    await expect.element(chip).toHaveAccessibleName("Choose Club style");
    // A phone-wide rail has no room beside the toolbar's controls: the button
    // takes its own row under the toolbar, with the room to name the family.
    expect(chip.element().textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Club styles 3"
    );
    expect(chip.element().closest(".rail-toolbar")).toBeNull();
    expect(chip.element().closest(".styles-own-row")).not.toBeNull();

    await chip.click();
    await expect
      .element(page.getByRole("region", { name: "Club styles" }))
      .toBeVisible();
    await expect
      .element(
        page.getByRole("button", { name: "Select Torch prop type", exact: true })
      )
      .toBeVisible();

    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect
      .poll(() => document.activeElement?.getAttribute("data-testid"))
      .toBe("prop-styles-chip");

    // A prop with one style has nothing for the button to open.
    await rerender({ selectedPropType: PropType.BUUGENG });
    await expect
      .poll(() => page.getByTestId("prop-styles-chip").elements().length)
      .toBe(0);
    // The family tile still opens the styles on its own.
    expect(document.querySelector('[data-family-tile="club"]')).not.toBeNull();
  });

  it("sits in the toolbar with the short label on a Fold-wide rail", async () => {
    await page.viewport(707, 772);
    render(PropGrid, {
      target: sheetHost(),
      props: {
        selectedPropType: PropType.CLUB,
        onSelect: vi.fn(),
        layout: "rail",
        variant: "inline",
        allowedProps: CLUB_FAMILY,
        fanAppearance: FIRE_FAN,
        onFanAppearanceChange: vi.fn(),
      },
    });

    const chip = page.getByTestId("prop-styles-chip");
    await expect.element(chip).toBeVisible();
    expect(chip.element().textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Styles 3"
    );
    expect(chip.element().closest(".rail-toolbar")).not.toBeNull();
    expect(document.querySelector(".styles-own-row")).toBeNull();
  });

  it("names the family in the grid and sits above the tiles", async () => {
    await page.viewport(1440, 900);
    render(PropGrid, {
      selectedPropType: PropType.TORCH,
      onSelect: vi.fn(),
      allowedProps: CLUB_FAMILY,
      fanAppearance: FIRE_FAN,
      onFanAppearanceChange: vi.fn(),
    });

    const chip = page.getByTestId("prop-styles-chip");
    await expect.element(chip).toBeVisible();
    expect(chip.element().textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Club styles 3"
    );
    const tile = document.querySelector('[data-family-tile="club"]');
    expect(
      chip.element().compareDocumentPosition(tile!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await chip.click();
    await expect
      .element(page.getByRole("region", { name: "Club styles" }))
      .toBeVisible();
  });
});

// On the phone and Fold sheet the buugeng details page is a short list that
// fits: a group of tiles that would not fit is a box naming its current value.
describe("PropGrid rail details boxes", () => {
  beforeEach(async () => {
    await page.viewport(387, 775);
    document.body.style.margin = "0";
  });

  function renderBuugengRail() {
    const onChange = vi.fn();
    const onBuugengStyleChange = vi.fn();
    render(PropGrid, {
      target: sheetHost(),
      props: {
        selectedPropType: PropType.BUUGENG,
        onSelect: vi.fn(),
        layout: "rail",
        variant: "inline",
        allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
        fanAppearance: FIRE_FAN,
        onFanAppearanceChange: vi.fn(),
        buugengStyle: "crescent",
        onBuugengStyleChange,
        chirality: {
          hands: [
            { hand: "left", flipped: false },
            { hand: "right", flipped: true },
          ],
          onChange,
        },
      },
    });
    return { onChange, onBuugengStyleChange };
  }

  it("shows the pair as a box with no separate What's this? button", async () => {
    renderBuugengRail();
    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();

    const details = page.getByRole("region", { name: "Buugeng details" });
    await expect.element(details).toBeVisible();
    await expect
      .element(details.getByRole("button", { name: "Big", exact: true }))
      .toBeVisible();
    const pairBox = page.getByTestId("buugeng-pair-box");
    await expect.element(pairBox).toHaveTextContent("Buugeng pair");
    await expect
      .element(pairBox)
      .toHaveTextContent("Mirrored, Left A, right B");
    expect(
      pairBox.element().querySelector(".row-media .pair-preview-stub")
    ).not.toBeNull();
    await expect
      .element(page.getByTestId("buugeng-style-box"))
      .toHaveTextContent("Crescent");
    expect(
      page.getByRole("button", { name: "What's this?" }).elements()
    ).toHaveLength(0);
    expect(page.getByTestId("buugeng-style-row").elements()).toHaveLength(0);

    await pairBox.click();
    await expect
      .element(page.getByRole("region", { name: "Buugeng pairs" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect
      .poll(() => document.activeElement?.getAttribute("data-testid"))
      .toBe("buugeng-pair-box");
  });

  it("opens the Style screen from its box and returns to the details", async () => {
    const { onBuugengStyleChange } = renderBuugengRail();
    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    await page.getByTestId("buugeng-style-box").click();

    const row = page.getByTestId("buugeng-style-row");
    await expect.element(row).toBeVisible();
    await row.getByRole("radio", { name: "Fire" }).click();
    expect(onBuugengStyleChange).toHaveBeenCalledWith("fire");

    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect
      .element(page.getByRole("region", { name: "Buugeng details" }))
      .toBeVisible();
    await expect
      .poll(() => document.activeElement?.getAttribute("data-testid"))
      .toBe("buugeng-style-box");
  });
});
