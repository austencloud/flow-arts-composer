/**
 * Static contract test for the GalleryDrill split.
 *
 * GalleryDrill.svelte was one 6,248-line file holding two nearly-disjoint
 * products. It is now a thin shell that dispatches to GalleryLanding (the
 * editorial front door) or GalleryWorkspace (the filter workspace). The
 * workspace then dispatches to one editor per filter category, with shared
 * layout rules owned by GalleryWorkspaceFrame. This test locks both splits at
 * the source level so the products cannot silently grow back into each other,
 * using the same anti-drift pattern as
 * `tests/unit/sequence-viewer-shell-contract.test.ts`.
 *
 * If this test fails, move the rule/markup to the product that owns it — do
 * not loosen the assertions.
 *
 * Spec: docs/superpowers/specs/2026-08-04-gallery-split-pane-workspace-design.md
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const DIR = "src/lib/features/browse/gallery-home";
const DRILL = `${DIR}/GalleryDrill.svelte`;
const LANDING = `${DIR}/GalleryLanding.svelte`;
const WORKSPACE = `${DIR}/GalleryWorkspace.svelte`;
const WORKSPACE_FRAME = `${DIR}/GalleryWorkspaceFrame.svelte`;
const WORKSPACE_STYLE_INDEX = `${DIR}/gallery-workspace.css`;
const WORKSPACE_STYLE_FILES = [
  `${DIR}/gallery-workspace-styles/01-foundations.css`,
  `${DIR}/gallery-workspace-styles/02-decision-canvas.css`,
  `${DIR}/gallery-workspace-styles/03-device-compositions.css`,
  `${DIR}/gallery-workspace-styles/04-desktop-and-collections.css`,
  `${DIR}/gallery-workspace-styles/05-split-pane.css`,
];
const CHOOSER = `${DIR}/value-editors/GalleryChooserEditor.svelte`;
const WORKSPACE_EDITORS = [
  CHOOSER,
  `${DIR}/value-editors/GalleryCollectionEditor.svelte`,
  `${DIR}/value-editors/GalleryCreatorEditor.svelte`,
  `${DIR}/value-editors/GalleryFamilyEditor.svelte`,
  `${DIR}/value-editors/GalleryGridModeEditor.svelte`,
  `${DIR}/value-editors/GalleryLengthEditor.svelte`,
  `${DIR}/value-editors/GalleryLetterEditor.svelte`,
  `${DIR}/value-editors/GalleryLevelEditor.svelte`,
  `${DIR}/value-editors/GalleryLoopEditor.svelte`,
  `${DIR}/value-editors/GalleryMaxTurnEditor.svelte`,
  `${DIR}/value-editors/GalleryPlacementEditor.svelte`,
];
const TILE = `${DIR}/CategoryTile.svelte`;

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

/** The `<style>` block's contents, or "" when the component has none. */
function styleBlock(source: string): string {
  const match = source.match(/<style[^>]*>([\s\S]*)<\/style>/);
  return match?.[1] ?? "";
}

function workspaceStyles(): string {
  return WORKSPACE_STYLE_FILES.map(read).join("\n");
}

describe("GalleryDrill split contract", () => {
  it("GalleryDrill is a thin shell — no product CSS, no product markup", () => {
    const source = read(DRILL);
    const css = styleBlock(source);

    // Landing-owned selectors
    for (const selector of [".hero-", ".choice-tile", ".peek-", ".more-head"]) {
      expect(css, `GalleryDrill still styles ${selector}`).not.toContain(
        selector
      );
    }
    // Workspace-owned selectors
    for (const selector of [
      ".unified-choice-grid",
      ".value-list",
      ".level-tile",
      ".length-row",
      ".letter-chip",
      ".turn-picker",
    ]) {
      expect(css, `GalleryDrill still styles ${selector}`).not.toContain(
        selector
      );
    }
    // Tile-owned selectors
    for (const selector of [".mini-tile", ".mini-art", ".element-dot"]) {
      expect(css, `GalleryDrill still styles ${selector}`).not.toContain(
        selector
      );
    }

    // The shell owns the drill root, the search field, the band and the split
    // pane's two columns — plus a ~130-line documented prop seam and (since
    // 2026-08-05) the show-all pane state and the workspace's unified panel
    // surface. It was 6,248 lines; anything approaching that again means the
    // split leaked.
    expect(source.split("\n").length).toBeLessThan(900);
  });

  it("landing and workspace CSS do not overlap", () => {
    const landing = styleBlock(read(LANDING));
    const workspace = workspaceStyles();

    // Workspace-only selectors must not appear on the landing.
    for (const selector of [
      ".unified-",
      ".desktop-filter-",
      ".value-list",
      ".level-tile",
      ".length-row",
      ".turn-picker",
    ]) {
      expect(
        landing,
        `GalleryLanding styles workspace selector ${selector}`
      ).not.toContain(selector);
    }
    // Landing-only selectors must not appear in the workspace.
    for (const selector of [".hero-grid", ".choice-tile", ".more-head"]) {
      expect(
        workspace,
        `GalleryWorkspace styles landing selector ${selector}`
      ).not.toContain(selector);
    }
  });

  it("both products render the one shared CategoryTile", () => {
    for (const rel of [LANDING, CHOOSER]) {
      const source = read(rel);
      expect(source, `${rel} does not import CategoryTile`).toContain(
        rel === LANDING
          ? 'from "./CategoryTile.svelte"'
          : 'from "../CategoryTile.svelte"'
      );
      expect(source, `${rel} does not render CategoryTile`).toContain(
        "<CategoryTile"
      );
    }
  });

  it("the tile owns every composition — hosts never restyle its box", () => {
    const tile = styleBlock(read(TILE));
    for (const variant of [".mini-tile.unified", ".mini-tile.rail"]) {
      expect(
        tile,
        `CategoryTile is missing the ${variant} composition`
      ).toContain(variant);
    }
    // A host reaching into the tile's own box is the drift this kills.
    const workspace = workspaceStyles();
    expect(
      workspace.includes(":global(.mini-title)") ||
        workspace.includes(":global(.mini-art)"),
      "GalleryWorkspace restyles CategoryTile internals"
    ).toBe(false);
  });

  it("GalleryWorkspace stays a thin dispatcher with one editor per section", () => {
    const source = read(WORKSPACE);

    expect(styleBlock(source), "GalleryWorkspace owns product CSS").toBe("");
    expect(source.split("\n").length).toBeLessThan(250);
    expect(WORKSPACE_EDITORS).toHaveLength(11);

    for (const editor of WORKSPACE_EDITORS) {
      const component = path.basename(editor, ".svelte");
      expect(source, `GalleryWorkspace does not import ${component}`).toContain(
        `import ${component} from "./value-editors/${component}.svelte"`
      );
      expect(source, `GalleryWorkspace does not render ${component}`).toContain(
        `<${component}`
      );
    }
  });

  it("the frame owns one ordered workspace cascade outside the editors", () => {
    const frame = read(WORKSPACE_FRAME);
    const index = read(WORKSPACE_STYLE_INDEX);

    expect(frame).toContain('import "./gallery-workspace.css"');
    expect(styleBlock(frame), "GalleryWorkspaceFrame embeds CSS").toBe("");

    let previousImport = -1;
    for (const rel of WORKSPACE_STYLE_FILES) {
      const filename = path.basename(rel);
      const importIndex = index.indexOf(filename);
      expect(
        importIndex,
        `${filename} is absent from the style index`
      ).toBeGreaterThan(previousImport);
      previousImport = importIndex;
    }

    for (const editor of WORKSPACE_EDITORS) {
      expect(styleBlock(read(editor)), `${editor} embeds CSS`).toBe("");
    }
  });

  it("GalleryDrill keeps its public prop seam (consumers untouched)", () => {
    const source = read(DRILL);
    for (const prop of [
      "pool",
      "getCount",
      "onApply",
      "onShowAll",
      "onSearch",
      "showAll",
      "chooserTitle",
      "chooserHint",
      "activeLoopValues",
      "onToggleLoop",
      "loopConnective",
      "onLoopConnectiveChange",
      "activeFamilyValues",
      "onToggleFamily",
      "familyConnective",
      "onFamilyConnectiveChange",
      "variant",
      "persistSection",
      "showCollections",
      "fluidWideCanvas",
      "unifiedFilterChooser",
      "adaptiveValueLayout",
      "persistentDesktopCatalog",
      "initialSection",
      "onSectionChange",
      "isValueApplied",
      "onToggleValue",
    ]) {
      expect(source, `GalleryDrill dropped the ${prop} prop`).toMatch(
        new RegExp(`^\\s*${prop}[?]?:`, "m")
      );
    }
  });
});
