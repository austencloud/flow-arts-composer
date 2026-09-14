/**
 * Static contract test for buugeng chirality living in the prop picker.
 *
 * Chirality used to be reachable from exactly two places, both an unlabelled
 * 36px icon button: the Create step-editor row and the Settings readout. The
 * picker those surfaces open — BentoPropGrid, mounted in eleven places — had no
 * way to express chirality at all, so from the Animation Panel, Tunnel art
 * settings, the global P-key drawer and everywhere else the setting simply did
 * not exist.
 *
 * This test locks the shape that fixed it: the picker owns the control, hosts
 * pass a seam rather than growing their own toggle, and the two surfaces that
 * must NOT expose it stay that way.
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
// The picker is two files. BentoPropGrid is the app-wired entry: it reads
// settings and hands PropGrid the colours, fan appearance and premium gates.
// PropGrid is the picker itself, and every assertion about the picker's markup
// belongs there.
const GRID_PATH = `${PROP_TYPE_DIR}/BentoPropGrid.svelte`;
const GRID_BODY_PATH = `${PROP_TYPE_DIR}/PropGrid.svelte`;
const ROW_PATH = `${PROP_TYPE_DIR}/PropChiralityRow.svelte`;
const SEAM_PATH = `${PROP_TYPE_DIR}/prop-chirality-seam.ts`;
const SHEET_PATH = `${PROP_TYPE_DIR}/PropSelectionSheet.svelte`;

/** Every surface that hands the picker a chirality seam. Add new ones here. */
const HOSTS: Record<string, string> = {
  "global prop drawer (P key)":
    "src/lib/shared/application/components/MainApplication.svelte",
  "create step editor sheet":
    "src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte",
  "settings prop type tab":
    "src/lib/shared/settings/components/tabs/PropTypeTab.svelte",
  "sequence viewer props panel":
    "src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte",
  "tunnel settings panel":
    "src/lib/features/create/tunnel/components/TunnelLayout.svelte",
  "viewer tunnel art settings":
    "src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte",
  "3D viewer prop adapter":
    "src/lib/shared/3d/components/controls/ScenePropPicker.svelte",
};

/**
 * Surfaces that mount the picker and must NOT offer chirality.
 *
 * The deck releaser renders canonical print cards: image-composer takes
 * chirality from explicit overrides only, so a printed card never inherits the
 * operator's handedness. A control here would fight that boundary.
 */
const NON_HOSTS: Record<string, string> = {
  "deck prop switcher":
    "src/lib/features/choreo-card/components/deck-releaser/DeckPropSwitcher.svelte",
  "deck loop bento board":
    "src/lib/features/choreo-card/components/deck-releaser/LoopBentoBoard.svelte",
};

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("buugeng chirality is owned by the prop picker", () => {
  it("the entry delegates to the picker instead of growing a second grid", () => {
    const entry = read(GRID_PATH);
    expect(entry).toContain('import PropGrid from "./PropGrid.svelte"');
    expect(entry).toContain("<PropGrid");
    // Everything the entry adds is a settings read passed down as a prop. A
    // tile, a family list or a chirality control here would be a fork.
    expect(entry).not.toContain('class="prop-tile"');
    expect(entry).not.toContain("PropChiralityRow");
  });

  it("the picker renders the chirality row behind the seam", () => {
    const grid = read(GRID_BODY_PATH);
    expect(grid).toContain("PropChiralityRow");
    expect(grid).toContain("chirality?: PropChiralitySeam");
    // Gated on the prop actually being buugeng-family, so staff users never
    // see a control that would do nothing.
    expect(grid).toMatch(
      /\{#if chirality && selectedPropType !== null && isBuugengFamilyProp\(/
    );
  });

  it("the row routes to SegmentedControl rather than a hand-rolled toggle", () => {
    const row = read(ROW_PATH);
    // .claude/rules/chip-primitives.md: exactly-one selection is
    // SegmentedControl's job, and .claude/rules/no-checkboxes.md bans the
    // other web default.
    expect(row).toContain("SegmentedControl");
    expect(row).not.toContain('type="checkbox"');
    // Colour alone is not the cue: both segments carry a label. A and B rather
    // than Standard and Mirrored — neither handedness is canonical, and the
    // pictograph-inspect readout already prints the pair as A / B.
    expect(row).toMatch(/\{ value: "a" as const, label: "A" \}/);
    expect(row).toMatch(/\{ value: "b" as const, label: "B" \}/);
  });

  it("the row gives every hand its own control", () => {
    // Chirality is a statement about the PAIR — same handedness stays apart,
    // opposite handedness nests — so a picker that governs both hands renders
    // two controls. One control writing both erases the only distinction the
    // setting makes.
    const row = read(ROW_PATH);
    expect(row).toMatch(/\{#each hands as/);
    expect(row).toContain("onChange(state.hand,");
    expect(row).toContain(
      'state.hand === "right" ? "Right prop" : "Left prop"'
    );
  });

  it("keeps the prop sheet open after every selection", () => {
    const sheet = read(SHEET_PATH);
    const selectionHandler = sheet.slice(
      sheet.indexOf("function handlePropSelect"),
      sheet.indexOf("function handleTabChange")
    );
    expect(selectionHandler).toContain("onSelect(propType)");
    expect(selectionHandler).not.toContain("isOpen = false");
    expect(sheet).not.toContain("autoClose");
  });

  it("no prop-sheet host dismisses from its selection callback", () => {
    const main = read(
      "src/lib/shared/application/components/MainApplication.svelte"
    );
    const mainHandler = main.slice(
      main.indexOf("function handleGlobalPropSelect"),
      main.indexOf("function handleCatDogToggle")
    );
    expect(mainHandler).not.toContain("propDrawerState.close()");

    const stepEditor = read(
      "src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte"
    );
    const stepHandler = stepEditor.slice(
      stepEditor.indexOf("function handlePropSelect"),
      stepEditor.indexOf("function handlePushUndoSnapshot")
    );
    expect(stepHandler).not.toContain("propSheetOpen = false");

    const arena = read(
      "src/lib/features/arena/components/battle/ArenaPropDrawer.svelte"
    );
    expect(arena).not.toContain("onClose");
  });

  it("puts chirality before the prop catalogue in compact drawers", () => {
    const grid = read(GRID_BODY_PATH);
    expect(grid).toContain("class:flat");
    expect(grid).toMatch(
      /\.prop-grid-root\.flat \.chirality-dock\s*\{\s*order: -1;/
    );
  });

  it("no seam ever writes one hand's chirality onto the other", () => {
    const seam = read(SEAM_PATH);
    expect(seam).toContain("createGlobalChiralitySeam");
    // A hand-less seam yields BOTH hands as separate entries rather than one
    // entry that writes both.
    expect(seam).toContain('[handState("left"), handState("right")]');
    // And the writer touches exactly the hand it was handed.
    const writer = seam.slice(seam.indexOf("onChange("));
    expect(writer).toMatch(
      /\{ rightBuugengFlipped: flipped \}\s*:\s*\{ leftBuugengFlipped: flipped \}/
    );
  });

  it("the settings tab keeps the hands independent too", () => {
    const tab = read(
      "src/lib/shared/settings/components/tabs/PropTypeTab.svelte"
    );
    // Its single-prop grid governs the pair, so it hands over both hands.
    expect(tab).toContain('chiralitySeam("left", "right")');
    // The old mirror — blue carries red outside cat/dog mode — is gone.
    expect(tab).not.toContain("rightBuugengFlipped = leftBuugengFlipped");
  });

  it.each(Object.entries(HOSTS))(
    "%s passes a chirality seam",
    (_name, file) => {
      expect(read(file)).toMatch(/chirality(=\{|Seam\(|\})|propChirality=\{/);
    }
  );

  it.each(Object.entries(NON_HOSTS))(
    "%s does not expose chirality",
    (_name, file) => {
      const source = read(file);
      expect(source).not.toContain("chirality");
      expect(source).not.toContain("BuugengFlipped");
    }
  );

  it("the sheet forwards the seam instead of re-deriving it", () => {
    const sheet = read(SHEET_PATH);
    expect(sheet).toContain("chirality?: PropChiralitySeam");
    expect(sheet).toContain("{chirality}");
    // Forwarding only — the sheet must not read or write settings itself.
    expect(sheet).not.toContain("BuugengFlipped");
  });

  it("the settings readout no longer carries a second flip control", () => {
    // CompactPropDisplay sits inches from the picker in the same view; keeping
    // its own toggle there put two controls for one setting on one screen.
    const compact = read(`${PROP_TYPE_DIR}/CompactPropDisplay.svelte`);
    expect(compact).not.toContain("onToggleFlip");
    // It still MIRRORS the art, so the readout keeps showing the state.
    expect(compact).toContain("class:flipped=");
  });
});
