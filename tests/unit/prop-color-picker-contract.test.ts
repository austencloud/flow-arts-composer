/**
 * Static contract test for the prop colour control living in the prop picker.
 *
 * The primary prop colours used to be offered by whichever host remembered to
 * mount PrimaryPropColorSettings beside the grid. The global P-key drawer did,
 * the Shape Matrix Customize panel did, and the sequence viewer's props panel
 * did not, so changing your prop there gave you no way to change its colour.
 *
 * This test locks the shape that fixed it: BentoPropGrid owns the control and
 * shows it by default, hosts never mount their own copy, and a host turns it
 * off only for a stated reason. A short rail that wants the colours as a
 * toolbar button asks BentoPropGrid for it with `compactColors`; it does not
 * mount the compact PrimaryPropColorSettings itself.
 *
 * If this test fails, fix the host — do not loosen the assertions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const PROP_TYPE_DIR = "src/lib/shared/settings/components/tabs/prop-type";
const GRID_PATH = `${PROP_TYPE_DIR}/BentoPropGrid.svelte`;
const SHEET_PATH = `${PROP_TYPE_DIR}/PropSelectionSheet.svelte`;
const PANEL_PATH =
  "src/lib/shared/animation-panel/components/AnimationPanel.svelte";
const PAIR_FIELD_PATH =
  "src/lib/shared/pictograph/prop/components/PropPairField.svelte";
const VIEWING_CONTROL_PATH =
  "src/lib/shared/browse/components/PropViewingControl.svelte";
/** PropPairField hosts that pick props to save, not props on screen. */
const SAVE_PAIR_HOSTS = [
  "src/lib/features/create/shared/components/SaveToLibraryDialog.svelte",
  "src/lib/features/create/shared/components/SaveToLibraryPanel.svelte",
  "src/lib/shared/library/components/SavePropDialog.svelte",
];

/**
 * Surfaces whose picker shows the colour control. Each renders its props in
 * the account colours, so the control changes what the user is looking at.
 */
const HOSTS: Record<string, string> = {
  "global prop drawer (P key)":
    "src/lib/shared/application/components/MainApplication.svelte",
  "create step editor sheet":
    "src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte",
  "arena prop drawer":
    "src/lib/features/arena/components/battle/ArenaPropDrawer.svelte",
  "guide codex controls":
    "src/routes/(public)/guide/level-1/_components/GuideCodexControls.svelte",
  "sequence viewer props panel":
    "src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte",
  "shape matrix customize":
    "src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte",
  "shape matrix focus":
    "src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte",
  "post studio source settings":
    "src/lib/shared/share/components/post-studio/PostStudioSourceSettings.svelte",
  "motion path explorer":
    "src/routes/(public)/guide/motion-paths/_components/MotionPathExplorer.svelte",
  "landing play with it":
    "src/routes/landing/components/PlayWithItInner.svelte",
};

/**
 * Surfaces that mount the picker and must NOT offer the colour control, each
 * because its render ignores the account colours or the page already shows
 * the control beside the grid.
 */
const NON_HOSTS: Record<string, string> = {
  // Canonical print cards: the deck renders fixed card colours.
  "deck prop switcher":
    "src/lib/features/choreo-card/components/deck-releaser/DeckPropSwitcher.svelte",
  "deck loop bento board":
    "src/lib/features/choreo-card/components/deck-releaser/LoopBentoBoard.svelte",
  // Saved prop metadata, not a live render.
  "collection prop field":
    "src/lib/features/library/components/CollectionPropField.svelte",
  // Tunnel layers take performer colours; the 3D scene uses its own materials.
  "viewer tunnel art settings":
    "src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte",
  "3D viewer prop adapter":
    "src/lib/shared/3d/components/controls/ScenePropPicker.svelte",
  // The settings page shows PrimaryPropColorSettings in its own setup card.
  "settings prop type tab":
    "src/lib/shared/settings/components/tabs/PropTypeTab.svelte",
};

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("the prop colour control is owned by the prop picker", () => {
  it("the entry renders the colour control, on by default and hidden while drilled", () => {
    const entry = read(GRID_PATH);
    expect(entry).toContain("PrimaryPropColorSettings");
    expect(entry).toMatch(/showColors = true/);
    expect(entry).toMatch(/\{#if showColors && !drilled\}/);
    // The account setting is the single source; the entry writes it directly.
    expect(entry).toContain('updateSetting("primaryPropColors", colors)');
  });

  it("the shared wrappers delegate to the entry instead of mounting their own", () => {
    for (const wrapper of [SHEET_PATH, PANEL_PATH]) {
      const source = read(wrapper);
      expect(source, wrapper).not.toContain("<PrimaryPropColorSettings");
      expect(source, wrapper).toMatch(/\{showColors\}|showColors=\{/);
    }
  });

  it("the animation panel shows the control unless its host opts out", () => {
    expect(read(PANEL_PATH)).toMatch(/showPropColors = true/);
  });

  it("the prop pair field shows the control only for the props on screen", () => {
    // A saved pair is metadata; the account colours are not saved with it.
    const field = read(PAIR_FIELD_PATH);
    expect(field).toMatch(/showColors = false/);
    expect(field).toContain("{showColors}");
    for (const host of SAVE_PAIR_HOSTS) {
      expect(read(host), host).not.toMatch(/<PropPairField[^>]*showColors/);
    }
    // The viewer header and gallery "Viewing props" dialog picks the props
    // every sequence renders with, so its colours belong beside it.
    expect(read(VIEWING_CONTROL_PATH)).toMatch(/<PropPairField[^>]*showColors/);
  });

  for (const [label, file] of Object.entries(HOSTS)) {
    it(`${label} keeps the picker's colour control`, () => {
      const source = read(file);
      expect(source).not.toMatch(/showColors=\{false\}/);
      expect(source).not.toMatch(/showPropColors=\{false\}/);
      expect(source).not.toContain("<PrimaryPropColorSettings");
    });
  }

  for (const [label, file] of Object.entries(NON_HOSTS)) {
    it(`${label} turns the colour control off`, () => {
      // Each mount's attributes run to its self-closing "/>"; handlers inside
      // them contain "=>", so a "[^>]" match would stop early.
      const mounts = read(file)
        .split("<BentoPropGrid")
        .slice(1)
        .map((rest) => rest.slice(0, rest.indexOf("/>")));
      expect(mounts.length, file).toBeGreaterThan(0);
      for (const mount of mounts) {
        expect(mount, file).toContain("showColors={false}");
      }
    });
  }
});
