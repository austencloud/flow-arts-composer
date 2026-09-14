import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MATRIX_ROOT = resolve("src/lib/shared/shape-matrix");
const APP_ROOT = resolve("src/lib/shared/shape-matrix/app");

function readTree(directory: string): string {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = resolve(directory, name);
      return statSync(path).isDirectory()
        ? readTree(path)
        : readFileSync(path, "utf8");
    })
    .join("\n");
}

function svelteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return name.endsWith(".svelte") ? [relative(MATRIX_ROOT, path)] : [];
  });
}

describe("Shape Matrix app boundary", () => {
  it("never shadows the $state rune with a binding named state", () => {
    // Svelte reads `$state` as a subscription to a variable called `state`
    // when one is in scope, so a component holding its context in
    // `const state` compiles and boots happily until the day someone adds a
    // rune to it, and then throws store_invalid_shape in the user's face. The
    // About modal did exactly that the moment it needed one node reference.
    const offenders = svelteFiles(MATRIX_ROOT).filter((file) => {
      const source = readFileSync(resolve(MATRIX_ROOT, file), "utf8");
      return (
        /(?:const|let|var)\s+state\s*=/.test(source) &&
        source.includes("$state")
      );
    });

    expect(offenders).toEqual([]);
  });

  it("keeps route navigation and viewport ownership outside the embeddable app", () => {
    const appSource = readTree(APP_ROOT);

    expect(appSource).not.toContain('href="/notation"');
    expect(appSource).not.toContain("$app/");
    expect(appSource).not.toContain("window.location");
    expect(appSource).not.toMatch(/position:\s*fixed/);
    expect(appSource).toContain("ResizeObserver");
    expect(appSource).toContain("container: shape-matrix-app / size");
  });

  it("keeps URL persistence in the public route host", () => {
    const pageSource = readFileSync(
      resolve("src/routes/(public)/shape-engine/+page.svelte"),
      "utf8"
    );

    expect(pageSource).toContain(
      "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"
    );
    expect(pageSource).toContain("mutateCurrentUrl");
    expect(pageSource).toContain("<ShapeMatrixApp {persistence} />");
  });

  it("reuses the canonical animation menu and pictograph carousel", () => {
    const drillSource = readFileSync(
      resolve("src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte"),
      "utf8"
    );

    expect(drillSource).toContain("disableContextMenu: false");
    // The drill lets the animator pick sidecar vs stacked from its host box.
    expect(drillSource).toContain('disassemblyLayout: "auto"');
    expect(drillSource).toContain(
      'import("$lib/shared/timeline/StepStrip.svelte")'
    );
    expect(drillSource).toContain("includeStartPosition: false");
    expect(drillSource).toContain("currentStep: visibleStep");
    expect(drillSource).toContain("propElementalType: railPropElementalType");
    expect(drillSource).toContain(
      "propElementalType: propElementalTypeOf(layer.realization)"
    );
    expect(drillSource).toContain("initialQualityTier: QualityTier.LOW");
    expect(drillSource).toContain("resolveRealizationEntryStep");
    expect(drillSource).toContain("initialStep: layer.initialStep");
    expect(drillSource).toContain("onsettled={finishCrossfade}");
    expect(drillSource).not.toContain("fadeSettlementTimer");
    expect(drillSource).toContain("retryPlayerLoad");
    expect(drillSource).toContain("railLoadError");
    // The Hands -> Props derivation lives in the shared relationship bridge.
    const bridgeSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/components/PropRelationshipChipRow.svelte"
      ),
      "utf8"
    );
    expect(drillSource).toContain("PropRelationshipChipRow");
    expect(bridgeSource).toContain(
      '<i class="fas fa-arrow-right bridge-arrow" aria-hidden="true"></i>'
    );
    expect(bridgeSource).toContain('<span class="sr-only">produces</span>');
  });

  it("threads the optional prop element through the canonical animation overlay", () => {
    const inlinePlayerSource = readFileSync(
      resolve(
        "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
      ),
      "utf8"
    );
    const animatorSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/components/AnimatorCanvas.svelte"
      ),
      "utf8"
    );
    const surfaceSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/components/CanvasSurface.svelte"
      ),
      "utf8"
    );
    const overlaySource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/components/layers/GlyphOverlay.svelte"
      ),
      "utf8"
    );

    expect(inlinePlayerSource).toContain("{propElementalType}");
    expect(animatorSource).toContain("{propElementalType}");
    expect(surfaceSource).toContain("{propElementalType}");
    expect(overlaySource).toContain('corner="top-right"');
    expect(overlaySource).toContain("Prop timing and direction element:");
  });

  it("keeps embedded disassembly inside the Shape Matrix atmosphere", () => {
    const inlinePlayerSource = readFileSync(
      resolve(
        "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
      ),
      "utf8"
    );
    const animatorSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/components/AnimatorCanvas.svelte"
      ),
      "utf8"
    );
    const splitSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/components/SplitCanvasView.svelte"
      ),
      "utf8"
    );
    const frameSystemSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/services/managers/frame-system.ts"
      ),
      "utf8"
    );
    const playbackSyncSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/services/managers/playback-sync.ts"
      ),
      "utf8"
    );
    const renderLoopSource = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/services/animation-render-loop.ts"
      ),
      "utf8"
    );

    expect(inlinePlayerSource).toContain("{disassemblyLayout}");
    expect(animatorSource).toContain(
      "data-disassembly-layout={resolvedDisassemblyLayout}"
    );
    expect(animatorSource).toContain("layout={resolvedDisassemblyLayout}");
    expect(animatorSource).toContain("{backgroundAlpha}");
    expect(splitSource.match(/\{backgroundAlpha\}/g)).toHaveLength(2);
    expect(splitSource).not.toContain("backgroundAlpha={1}");
    expect(splitSource.match(/mandalaVisibleOverride=\{true\}/g)).toHaveLength(
      2
    );
    expect(frameSystemSource).toContain(
      "props.mandalaVisibleOverride ?? this.state.visibilityState.mandala"
    );
    expect(playbackSyncSource).toContain(
      "props.mandalaVisibleOverride ?? this.state.visibilityState.mandala"
    );
    expect(playbackSyncSource).toContain(
      "this._lastPropsRef?.mandalaVisibleOverride ?? state.mandala"
    );
    expect(renderLoopSource).toContain("const show: MandalaHandVisibility");
    expect(renderLoopSource).toContain(
      'showLeft && showRight ? "both" : showLeft ? "left" : "right"'
    );
  });

  it("does not reserve an empty hand-path row for ordinary prop relationships", () => {
    const propPickerSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/components/PropRelationshipChipRow.svelte"
      ),
      "utf8"
    );

    // No reserved hand-path row and no in-flow slot that could reflow the
    // stage. The result crossfade is content-sized with an eased height: the
    // branching phase variant is taller than the one-line result, and `fill`
    // made its absolute layers spill out over the animation below.
    expect(propPickerSource).not.toContain("hand-choice-slot");
    expect(propPickerSource).toContain(
      "<Crossfade key={resultKey} animateHeight"
    );
    expect(propPickerSource).not.toContain("<Crossfade key={resultKey} fill");
    expect(propPickerSource).not.toContain("transition:growFade");
  });

  it("customizes the animation over the grid, in one workspace", () => {
    const read = (path: string) => readFileSync(resolve(path), "utf8");
    const drillSource = read(
      "src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte"
    );
    const theoryDetailSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryDetail.svelte"
    );
    const matrixPaneSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixMatrixPane.svelte"
    );
    const theoryPaneSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryPane.svelte"
    );
    const workspaceSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte"
    );
    const shellSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte"
    );
    const stateSource = read(
      "src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts"
    );
    const dockSource = read(
      "src/lib/shared/sequence-viewer/components/ControlDock.svelte"
    );

    // The catalogue left the animation stage. Nothing on the drill or the
    // theory detail shrinks to make room for it any more.
    expect(drillSource).not.toContain("BentoPropGrid");
    expect(drillSource).not.toContain("prop-catalogue");
    expect(theoryDetailSource).not.toContain("BentoPropGrid");

    // Wide hosts: one workspace over the grid pane carries every ability.
    // You are not choosing a shape while you tune its animation, so that is
    // the one region that can be covered while the hero, the relationships,
    // the carousel and the dock stay put.
    // Once, in the shell, beside the crossfading grids: switching surfaces
    // with it open keeps the same workspace rather than swapping it for a
    // second instance.
    expect(shellSource).toContain("<ShapeMatrixCustomizeWorkspace />");
    expect(matrixPaneSource).not.toContain("ShapeMatrixCustomizeWorkspace");
    expect(theoryPaneSource).not.toContain("ShapeMatrixCustomizeWorkspace");
    // One split and one pair of panes for both surfaces; the grids and the
    // details crossfade inside the panes, not two whole workspaces.
    expect(shellSource.match(/<PanelGroup/g)).toHaveLength(1);
    expect(shellSource).toContain("first={matrixGrid}");
    expect(shellSource).toContain("first={matrixDetail}");
    expect(shellSource).not.toContain("theorySizes");
    expect(matrixPaneSource).toContain("inert={workspaceOpen}");
    expect(theoryPaneSource).toContain("inert={workspaceOpen}");
    for (const pane of [matrixPaneSource, theoryPaneSource]) {
      expect(pane).not.toContain("ShapeMatrixPropOverlay");
      expect(pane).not.toContain("ShapeMatrixSettingsOverlay");
    }

    // The canonical rail inspector, one sidebar-sized page at a time, not
    // the dock tray's strips stretched across a pane built for a grid.
    expect(workspaceSource).toContain('layout="sidebar"');
    expect(workspaceSource).not.toContain('layout="bottom"');
    expect(workspaceSource).not.toContain('presentation="content"');
    // The dock and the rail are two views of one section.
    expect(workspaceSource).toContain("controlledSection={section}");
    expect(workspaceSource).toContain("onActiveSectionChange={selectSection}");
    // Whether it is open is decided once, for the workspace, the panes that
    // go inert under it and the shell that rebalances the split for it.
    const customizeSource = read(
      "src/lib/shared/shape-matrix/app/state/shape-matrix-customize.ts"
    );
    expect(customizeSource).toContain(
      'animation.activeSection ?? (app.propPickerOpen ? "props" : null)'
    );
    expect(customizeSource).toContain(
      "if (app.compact || !surfaceHasPair(app)) return null;"
    );
    // The gear waits for a pair rather than answering Customize with a
    // workspace that closes at once.
    const stageActionsSource = read(
      "src/lib/shared/shape-matrix/components/ShapeMatrixStageActions.svelte"
    );
    expect(stageActionsSource).toContain(
      "const hasPair = $derived(surfaceHasPair(appState));"
    );
    expect(stageActionsSource.match(/disabled=\{!hasPair\}/g)).toHaveLength(1);
    expect(workspaceSource).toContain(
      "customizeSection(appState, animationState)"
    );
    expect(matrixPaneSource).toContain(
      "customizeSection(state, animationState)"
    );
    expect(theoryPaneSource).toContain(
      "customizeSection(appState, animationState)"
    );
    // A labelled way back, and Escape through the shared layer manager.
    expect(workspaceSource).toContain("Back to grid");
    expect(workspaceSource).toContain('role="dialog"');
    expect(workspaceSource).toContain('id: "shape-matrix:customize"');

    // A wide host has no control band under the animation at all. The band
    // used to carry one Customize button and a hand-rolled play button pushed
    // to the far end of it; the canvas already toggles on a click, so the
    // transport is the canvas and Customize is a gear in its corner. Compact
    // hosts keep the AnimationPanel, since the grid pane is off screen there:
    // each pill opens a sheet, and Props routes to the canonical prop sheet.
    const animationStateSource = read(
      "src/lib/shared/shape-matrix/app/state/shape-matrix-animation-state.svelte.ts"
    );
    expect(drillSource).toMatch(
      /\{#if !appState \|\| appState\.compact\}[\s\S]*?<AnimationPanel/
    );
    expect(drillSource).toContain("<ShapeMatrixStageActions />");
    // The canvas says what a click will do. It owns the four hint styles; the
    // engine must not answer this with a button of its own.
    expect(drillSource).toContain('hoverHint: "badge"');
    expect(drillSource).not.toContain('hoverHint: "none"');
    expect(drillSource).toContain("onPropPickerRequest={onproppickertoggle}");
    expect(theoryDetailSource).toMatch(
      /\{#if app\.compact\}\s*<div[\s\S]{0,200}?class="animation-controls"[\s\S]*?<AnimationPanel/
    );
    expect(theoryDetailSource).toContain("<ShapeMatrixStageActions />");
    // The theory stage is its own button rather than an AnimatorCanvas, so it
    // carries the same affordance in its own terms.
    expect(theoryDetailSource).toContain('class="stage-hint"');
    // One owner for the key, and it is the app's registry rather than a
    // listener of this feature's own.
    const shortcutSource = read(
      "src/lib/shared/shape-matrix/app/services/shape-matrix-playback-shortcut.ts"
    );
    expect(shortcutSource).toContain("getKeyboardShortcutManager()");
    // Registering is not listening. Nothing on a public route or a standalone
    // embed calls initialize, so the service does it itself.
    expect(shortcutSource).toContain("manager.initialize();");
    expect(shortcutSource).toContain("manager.register({");
    // Both detail views are mounted at once, so they cannot share one id:
    // the registry keys by id and the later registration wins outright.
    expect(shortcutSource).toContain(
      "id: `shape-matrix.play-pause.${surface}`"
    );
    expect(drillSource).toMatch(
      /registerShapeMatrixPlaybackShortcut\(\s*"matrix"/
    );
    expect(theoryDetailSource).toMatch(
      /registerShapeMatrixPlaybackShortcut\(\s*"theory"/
    );
    // ...and each refuses the key while the other surface is the one showing.
    expect(drillSource).toContain('appState.surface === "matrix"');
    expect(theoryDetailSource).toContain('app.surface === "theory"');
    // The registry matches the normalized key name. A raw " " registers
    // cleanly, type-checks, and then never fires.
    expect(shortcutSource).toContain('key: "Space"');
    expect(shortcutSource).not.toMatch(/key: " ",/);
    for (const source of [drillSource, theoryDetailSource]) {
      expect(source).toContain("registerShapeMatrixPlaybackShortcut(");
      expect(source).not.toContain('window.addEventListener("keydown"');
    }
    expect(theoryDetailSource).toContain(
      "onPropPickerRequest={app.togglePropPicker}"
    );
    // Compact hosts compose the picker beside the canvas rather than covering
    // it: same focus mode the section controls use, same canonical grid.
    expect(shellSource).toMatch(
      /\{#if focusMode\}[\s\S]{0,200}?<ShapeMatrixFocusWorkspace/
    );
    expect(shellSource).toMatch(
      /focusMode = \$derived\(\s*appState\.compact &&\s*\(appState\.propPickerOpen \|\| animationState\.activeSection !== null\)/
    );
    expect(shellSource).not.toContain("PropSelectionSheet");
    const focusWorkspaceSource = read(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixFocusWorkspace.svelte"
    );
    expect(focusWorkspaceSource).toContain("<BentoPropGrid");
    expect(stageActionsSource).toContain("aria-pressed={open}");
    expect(stageActionsSource).toContain("animationState.openCustomize()");
    expect(stageActionsSource).not.toContain("ControlDock");
    // The gear is the settings icon, not a labelled bar button: it sits over
    // the animation it settles.
    expect(stageActionsSource).toContain("fa-sliders");
    expect(stageActionsSource).toContain("position: absolute;");
    // Opening resumes on the page the rail last showed, never on a page this
    // host does not have.
    expect(animationStateSource).toContain("function openCustomize");
    expect(animationStateSource).toContain(
      "CUSTOMIZE_SECTIONS.includes(remembered)"
    );

    // Customizing rebalances the split toward the animation: the workspace
    // pane takes what its pages use and never more than 45% of the room, and
    // the split the user had comes back on the way out.
    expect(shellSource).toContain("function customizeSplit");
    expect(shellSource).toContain(
      "Math.min(need, width * 0.45, width - STAGE_MIN)"
    );
    expect(shellSource).toContain("restingSizes = [...sizes]");
    expect(shellSource).toMatch(
      /if \(customizeApplied && restingSizes\) sizes = restingSizes;/
    );

    // The Props pill shows pressed while the sheet is open, without a tray
    // of its own, so the way back is visible.
    expect(drillSource).toContain("propPickerActive={propPickerOpen}");
    expect(theoryDetailSource).toContain(
      "propPickerActive={app.propPickerOpen}"
    );
    expect(drillSource).toContain("data-shape-matrix-dock");
    expect(theoryDetailSource).toContain("data-shape-matrix-dock");
    expect(dockSource).toContain(
      "aria-pressed={activeTab === t.id || !!t.pressed}"
    );

    // Choosing keeps the workspace open, so the change can be watched: pick a
    // prop, see the pair traced by it, pick the next one.
    expect(stateSource).toContain("async function setPropType");
    expect(stateSource).toContain("The picker stays open.");
  });

  it("offers prop choice once, under the animation", () => {
    const overflowSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/app/components/ShapeMatrixOverflowMenu.svelte"
      ),
      "utf8"
    );

    // The Props control under the canvas owns the choice; a second entry in
    // the overflow menu pointed at the same catalogue.
    expect(overflowSource).not.toContain("Choose prop");
    expect(overflowSource).not.toContain("getPropTypeDisplayInfo");
  });

  it("marks the chosen relationship with more than a colour", () => {
    const chipSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte"
      ),
      "utf8"
    );

    // Six element accents, several of them dark: a tint difference alone did
    // not answer "which one did I pick?" at a glance.
    expect(chipSource).toContain('class="choice-check"');
    expect(chipSource).toContain("aria-pressed={active}");
    expect(chipSource).toContain(".relationship-choice.active .choice-check {");
    // Whole-surface treatment, never a decorative edge strip.
    expect(chipSource).toContain("inset 0 0 0 2px var(--choice-accent)");
    expect(chipSource).not.toMatch(/border-(left|right|top|bottom):\s*\d/);
  });

  it("wraps a long value palette instead of scrolling it sideways", () => {
    // The scroller owns the long-band behaviour wherever a surface picks from
    // an ordered palette. That is the Matrix turn band. Theory types its ratio
    // instead, so it is checked below for the entry rather than the scroller.
    const scrollerSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/app/components/ShapeMatrixValueScroller.svelte"
      ),
      "utf8"
    );
    const turnSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/app/components/ShapeMatrixTurnControls.svelte"
      ),
      "utf8"
    );
    const theorySource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/app/components/ShapeMatrixTheoryControls.svelte"
      ),
      "utf8"
    );
    const ratioEntrySource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/app/components/ShapeMatrixRatioEntry.svelte"
      ),
      "utf8"
    );
    const segmentedSource = readFileSync(
      resolve("src/lib/shared/ui/components/SegmentedControl.svelte"),
      "utf8"
    );

    // Level 4 lists fourteen ratios. The tray splits them over two rows and
    // spends the saved room on full-size segments.
    expect(scrollerSource).toContain("columns={trayColumns}");
    expect(scrollerSource).toContain(
      ".scroller-host:not(.tray) .value-control :global(.segmented-control)"
    );
    // The turn ribbon may not fork it back into a local palette.
    expect(turnSource).toContain("<ShapeMatrixValueScroller");
    expect(turnSource).not.toContain("trayColumns");
    // The 0–15 ratio square is a field, not a ladder, so Theory takes the two
    // numbers directly and must not grow a palette of its own.
    expect(theorySource).toContain("<ShapeMatrixRatioEntry");
    expect(theorySource).not.toContain("<ShapeMatrixValueScroller");
    expect(theorySource).not.toContain("SegmentedControl");
    expect(theorySource).toContain("Link ratios");
    expect(theorySource).toContain("Which ratio should both use?");
    expect(theorySource).toContain('hand="both"');
    expect(ratioEntrySource).toContain('onclick={() => nudge("hand", -1)}');
    expect(ratioEntrySource).toContain('onclick={() => nudge("prop", 1)}');
    // The indicator tracks the chosen cell on both axes.
    expect(segmentedSource).toContain(".grid .indicator {");
    expect(segmentedSource).toContain("--row: {selectedRow}");
  });

  it("plays a header on its own, with one prop and no hand pickers", () => {
    // A red or blue header is one hand. Clicking it opens that hand's own
    // mandala with the other prop hidden, so the pickers that only mean
    // something for a pair are gone rather than left inert.
    const gridSource = readFileSync(
      resolve("src/lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte"),
      "utf8"
    );
    const drillSource = readFileSync(
      resolve("src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte"),
      "utf8"
    );
    const shellSource = readFileSync(
      resolve(APP_ROOT, "components/ShapeMatrixAppShell.svelte"),
      "utf8"
    );
    // The headers become buttons only where a host asked for the behavior.
    expect(gridSource).toContain("{#if onsolo}");
    expect(gridSource).toContain('class="head-button"');
    expect(gridSource).toContain('onsolo("right", rf)');
    expect(gridSource).toContain('onsolo("left", bf)');
    // The hero draws only the soloed hand's own paths.
    expect(drillSource).toMatch(/solo === "right"\s*\?\s*\[\]/);
    expect(drillSource).toMatch(/solo === "left"\s*\?\s*\[\]/);
    expect(drillSource).toContain("{#if !solo}");
    // The quiet prop is the canonical per-hand motion visibility, not a
    // second way of hiding a prop.
    expect(shellSource).toContain("new SequenceViewerVisibilityState(true)");
    expect(shellSource).toContain(
      "setViewerVisibilityContext(motionVisibility)"
    );
    expect(shellSource).toContain("appState.soloHand");
  });

  it("shares the view on the press, with no sheet of its own", () => {
    // Share is the action, not a menu that offers it: one press reaches the
    // phone's share sheet or the clipboard. The address bar already carries
    // every setting, the notation included, so there is nothing to choose.
    const shellSource = readFileSync(
      resolve(APP_ROOT, "components/ShapeMatrixAppShell.svelte"),
      "utf8"
    );
    const popoverSource = readFileSync(
      resolve(APP_ROOT, "components/ShapeMatrixTurnPopover.svelte"),
      "utf8"
    );
    const stateSource = readFileSync(
      resolve(APP_ROOT, "state/shape-matrix-app-state.svelte.ts"),
      "utf8"
    );
    const pageSource = readFileSync(
      resolve("src/routes/(public)/shape-engine/+page.svelte"),
      "utf8"
    );
    const linkShareSource = readFileSync(
      resolve("src/lib/shared/share/services/link-share.ts"),
      "utf8"
    );
    // The button acts; nothing opens first.
    expect(shellSource).toContain("onclick={shareThisView}");
    expect(shellSource).toContain("appState.shareLink()");
    expect(shellSource).toContain("shareOrCopyLink({");
    expect(shellSource).not.toContain("ShapeMatrixShareButton");
    // Handing a link on has one owner: platform sheet, then clipboard.
    expect(linkShareSource).toContain("platform.share(payload)");
    expect(linkShareSource).toContain("copyTextToClipboard(link.url)");
    // No second clipboard path anywhere in the embeddable app.
    expect(readTree(APP_ROOT)).not.toContain("navigator.clipboard");
    // The route host writes the address; the app only asks for it.
    expect(stateSource).toContain("dependencies.link?.(snapshot())");
    expect(pageSource).toContain("writeShapeMatrixRouteState(url, snapshot);");
    expect(shellSource).toContain("{#if appState.canShare}");
    // The level is a difficulty to whoever opens the link.
    expect(shellSource).not.toContain("Kinetic Alphabet level");
    expect(popoverSource).not.toContain("Kinetic Alphabet level");
  });

  it("opens every value of the level from the corner's own value", () => {
    // The corner shows the current rows and columns value; pressing a value
    // opens the level's whole palette, so a far value is one press away.
    const stepperSource = readFileSync(
      resolve(APP_ROOT, "components/ShapeMatrixAxisStepper.svelte"),
      "utf8"
    );
    expect(stepperSource).toContain("<Popover.Root bind:open>");
    expect(stepperSource).toContain("options={choices}");
    expect(stepperSource).toContain(
      "appState.setTurnFor(hand, keyToTurnValue(key))"
    );
    // Every value of the level, wrapped past six as the compact palette is.
    expect(stepperSource).toContain(
      "turns.length > 6 ? Math.ceil(turns.length / 2) : undefined"
    );
    // Arrow keys still step in place.
    expect(stepperSource).toContain(
      'event.key === "ArrowUp" || event.key === "ArrowRight"'
    );
  });

  it("keeps each elemental button's visible mode and name in its accessible name", () => {
    const elementChipSource = readFileSync(
      resolve("src/lib/shared/shape-matrix/components/ElementChipRow.svelte"),
      "utf8"
    );

    expect(elementChipSource).toContain(
      "ariaLabel={`${c.mode} ${elementName(c.el.element)} (${c.label})${"
    );
  });

  it("loads public base words from the checked-in snapshot, not Firebase", () => {
    const flowerSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/services/rotation-style-archetypes.ts"
      ),
      "utf8"
    );
    const realizationSource = readFileSync(
      resolve(
        "src/lib/shared/shape-matrix/services/build-realization-sequence.ts"
      ),
      "utf8"
    );
    const snapshot = JSON.parse(
      readFileSync(resolve("static/data/hero/tnd-base-words.json"), "utf8")
    ) as unknown[];

    expect(flowerSource).toContain("loadTndBaseWords");
    expect(flowerSource).not.toContain("loadCatalogSequences");
    expect(realizationSource).toContain("loadTndBaseWords");
    expect(realizationSource).not.toContain("loadCatalogSequences");
    expect(snapshot).toHaveLength(22);
  });
});
