/**
 * Contract: the Shape Matrix tile and the detail hero are one artwork
 * primitive, and exactly one endpoint claims the shared-element name.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SHAPE_MATRIX_ACTIVE_MANDALA_NAME,
  SHAPE_MATRIX_ACTIVE_STAGE_NAME,
} from "$lib/shared/shape-matrix/services/shape-matrix-artwork";

const ROOT = resolve(process.cwd(), "src/lib/shared/shape-matrix");
const read = (relative: string) =>
  readFileSync(resolve(ROOT, relative), "utf8");
const readSrc = (relative: string) =>
  readFileSync(resolve(process.cwd(), "src", relative), "utf8");

describe("shape matrix mandala continuity", () => {
  it("uses two fixed shared-element names, stage around mandala", () => {
    expect(SHAPE_MATRIX_ACTIVE_MANDALA_NAME).toBe(
      "shape-matrix-active-mandala"
    );
    expect(SHAPE_MATRIX_ACTIVE_STAGE_NAME).toBe("shape-matrix-active-stage");
  });

  it("routes both endpoints through the artwork primitive", () => {
    const grid = read("components/ShapeMatrixGrid.svelte");
    const hero = read("components/MandalaHeroLayer.svelte");
    expect(grid).toContain("ShapeMatrixMandalaArt");
    expect(hero).toContain("ShapeMatrixMandalaArt");
    expect(grid).not.toMatch(/renderCell\(/);
    expect(hero).not.toMatch(/getContext\("2d"\)|drawAlignedMandala/);
  });

  it("paints every still with the animation canvas's own guide painter", () => {
    // One painter: the live overlay and the still image renderer both stroke
    // through paintMandalaGuide, so a tile IS the animator's guide.
    const overlay = readSrc(
      "lib/shared/mandala/services/mandala-overlay-canvas.ts"
    );
    const image = readSrc("lib/shared/mandala/services/mandala-guide-image.ts");
    expect(overlay).toContain("paintMandalaGuide(");
    expect(image).toContain("paintMandalaGuide");
    expect(overlay).not.toMatch(/paintPurpleOverlap|paintHandMask/);

    const render = read("services/shape-matrix-render.ts");
    expect(render).toContain("renderMandalaGuideImage");
    expect(render).toContain("HERO_TRAIL_PRESET.leftColor");
    expect(render).toContain("DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth");
    expect(render).not.toMatch(/renderMandalaSVG|strokeWidth:\s*2\.4/);

    // The hero floor is the tile's extent-fit picture in the engine-sized
    // box; no CSS align scale, no glow the live guide does not have.
    const hero = read("components/MandalaHeroLayer.svelte");
    const art = read("components/ShapeMatrixMandalaArt.svelte");
    expect(hero).toContain("pathsArtworkSrc(paths, sizePx, tipDx)");
    expect(hero).toContain("engineExtentBoxRatio(paths, tipDx)");
    expect(hero).toContain("calc(100% * var(--extent-ratio))");
    expect(hero).not.toMatch(/alignScale|glowColor/);
    expect(art).not.toMatch(/--art-scale|drop-shadow|glow/);
    expect(art).toContain("new ResizeObserver");
    expect(art).toMatch(/paint\(side\)/);
  });

  it("moves one picture between tile and hero: same fit, same square, no overshoot", () => {
    // Tiles fill their box (extent fit). The hero paints that same extent-fit
    // picture in a box of engineExtentBoxRatio times the animator's square,
    // so the shared-element morph scales one drawing instead of crossfading
    // two, and the tiles keep their size.
    const render = read("services/shape-matrix-render.ts");
    expect(render).toMatch(
      /export function renderCell[\s\S]*?renderExtentFit\(merged, sizePx, tipDx, options\)/
    );
    expect(render).toMatch(
      /export function renderHeader[\s\S]*?"extent", options\)/
    );
    expect(render).toContain("export function engineExtentBoxRatio");
    const artwork = read("services/shape-matrix-artwork.ts");
    expect(artwork).toMatch(/renderExtentFit\(paths, size, tipDx\)/);

    // The word header lives above the square in a drill-owned band, so the
    // hero frame IS the canvas region and both inscribed squares coincide.
    const drill = read("components/ShapeMatrixDrill.svelte");
    expect(drill).toContain("showWordHeader: false");
    expect(drill).toContain('class="hero-header"');
    expect(drill).toContain('class="hero-header-ghost"');
    expect(drill).toMatch(
      /\.hero-stage \{[^}]*grid-template-rows: auto minmax\(0, 1fr\)/s
    );

    // The hero square's box is CSS container math, present in the layout
    // pass that sizes the frame; a measured side reads 0 from a collapsed
    // pane at capture time. The morph service then re-measures every art
    // instance synchronously and waits for the endpoint's image to decode
    // before the new-state capture.
    const art = read("components/ShapeMatrixMandalaArt.svelte");
    expect(art).toContain("registerMandalaArtMeasurer(measure)");
    // The tile's box is container math as well, so the return trip lands on
    // the tile at its real size instead of a stale measured one.
    const grid = read("components/ShapeMatrixGrid.svelte");
    expect(grid).not.toMatch(/bind:clientWidth|new ResizeObserver/);
    expect(grid).toContain("(100cqw - var(--header-stroke)) / var(--cols)");
    // The player's first mount does not run inside the morph's capture window.
    expect(drill).toContain("active={!mandalaTransition.handoff}");
    const heroLayer = read("components/MandalaHeroLayer.svelte");
    expect(heroLayer).not.toContain("ResizeObserver");
    expect(heroLayer).toContain("min(100cqw, 100cqh)");
    const morph = read("app/services/shape-matrix-mandala-morph.ts");
    expect(morph).toContain("settleMandalaEndpoint");
    expect(morph).toContain("measureMandalaArt();");
    expect(morph).toMatch(/img\.decode\(\)/);
    const results = readSrc("lib/shared/transitions/results-morph.ts");
    expect(results).toMatch(/if \(settle\) await settle\(\);/);

    // The group animation settles; a spring would overshoot the square.
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).not.toContain("--ease-spring");
    expect(shell).toMatch(
      /view-transition-group\(shape-matrix-active-mandala\)[\s\S]*?--ease-in-out/
    );
  });

  it("shows the still floor at the live guide's opacity so the handoff is invisible", () => {
    const drill = read("components/ShapeMatrixDrill.svelte");
    const loop = readSrc(
      "lib/shared/animation-engine/services/animation-render-loop.ts"
    );
    expect(drill).toContain(
      "livePlayerShowsPair ? 0 : MANDALA_GUIDE_FLOOR_OPACITY"
    );
    expect(loop).toContain("opacity: MANDALA_GUIDE_FLOOR_OPACITY");
  });

  it("keeps one mandala on stage: a canvas for another pair is offstage", () => {
    // A canvas painting a different pair is hidden outright; the canvas for
    // this pair holds at zero until it is live, so the two are never both
    // on stage and neither one appears without a fade.
    const drill = read("components/ShapeMatrixDrill.svelte");
    expect(drill).toContain("class:offstage={layer.pairKey !== pairKey}");
    expect(drill).toMatch(/\.player-layer\.offstage \{\s*visibility: hidden;/);
    expect(drill).toMatch(/getLayer\(visibleSource\)\?\.pairKey === pairKey/);
  });

  it("flies the whole stage rectangle, with the mandala riding it", () => {
    // The selected tile's box and the detail stage share the stage name;
    // the mandala inside each keeps its own, so it is left out of the stage
    // snapshot and travels as a second, nested picture.
    const grid = read("components/ShapeMatrixGrid.svelte");
    expect(grid).toMatch(
      /<button[\s\S]*?use:claimedViewTransitionName=\{\{\s*name: SHAPE_MATRIX_ACTIVE_STAGE_NAME,\s*enabled: claimSelected && selectedKey === key,/
    );
    const drill = read("components/ShapeMatrixDrill.svelte");
    expect(drill).toMatch(
      /class="hero-stage"[\s\S]{0,120}?use:claimedViewTransitionName=\{\{\s*name: SHAPE_MATRIX_ACTIVE_STAGE_NAME,\s*enabled: mandalaTransition\.claim,/
    );
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).toMatch(
      /view-transition-group\(shape-matrix-active-stage\)[\s\S]*?--ease-in-out/
    );
    expect(shell).toMatch(
      /view-transition-new\(shape-matrix-active-stage\)\s*\)\s*\{[^}]*object-fit: cover/
    );
    expect(shell).not.toContain("--ease-spring");
    // The tile's hairline rings sit out the flight; the wash may travel.
    expect(grid).toMatch(
      /html\.shape-matrix-morph\) \.cell\.sel::after \{\s*opacity: 0;/
    );
  });

  it("claims the name only through the primitive, only on the active endpoint", () => {
    const art = read("components/ShapeMatrixMandalaArt.svelte");
    expect(art).toContain("use:claimedViewTransitionName");
    expect(art).toContain("SHAPE_MATRIX_ACTIVE_MANDALA_NAME");
    expect(art).toContain("enabled: claim");

    const grid = read("components/ShapeMatrixGrid.svelte");
    expect(grid).toContain("claim={claimSelected && selectedKey === key}");

    const hero = read("components/MandalaHeroLayer.svelte");
    expect(hero).toMatch(/<ShapeMatrixMandalaArt[\s\S]*?\{claim\}/);

    const matrixPane = read("app/components/ShapeMatrixMatrixPane.svelte");
    expect(matrixPane).toContain(
      'claimSelected={state.compact && state.activeView === "matrix"}'
    );
    const detailPane = read("app/components/ShapeMatrixDetailPane.svelte");
    expect(detailPane).toContain(
      'claim: state.compact && state.activeView === "detail"'
    );

    // No file stamps the name as a literal style: the registry owns it.
    for (const relative of [
      "components/ShapeMatrixGrid.svelte",
      "components/MandalaHeroLayer.svelte",
      "components/ShapeMatrixDrill.svelte",
      "app/components/ShapeMatrixAppShell.svelte",
    ]) {
      expect(read(relative)).not.toMatch(/view-transition-name\s*:/);
    }
  });

  it("keeps the compact detail turn editor on the detail pane", () => {
    const popover = read("app/components/ShapeMatrixTurnPopover.svelte");
    expect(popover).toContain("stayOnDetail: true");
    expect(popover).toContain("ShapeMatrixTurnControls");
    // An anchored popover sized to its controls, not a full-width drawer.
    expect(popover).toContain("<Popover.Root");
    expect(popover).toMatch(/\.turn-popover \{[^}]*width: max-content/);
    expect(popover).not.toMatch(/Drawer/);
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    // The axis values are edited from the recipe bar the grid owns, on both
    // surfaces; the header keeps no turn ribbon of its own. Each axis has its
    // own control, so no Apply-to target and no "Mixed" placeholder exist.
    expect(shell).not.toContain("ShapeMatrixTurnControls");
    expect(shell).not.toContain("ShapeMatrixAxisControl");
    expect(shell).toContain("<ShapeMatrixTurnPopover");
    const matrixPane = read("app/components/ShapeMatrixMatrixPane.svelte");
    const theoryPane = read("app/components/ShapeMatrixTheoryPane.svelte");
    // Wide hosts: the grid's corner cell owns Surprise and both axis values;
    // the strip above the grid takes over only on compact hosts.
    expect(matrixPane).toContain('<ShapeMatrixGridCorner surface="level"');
    expect(theoryPane).toContain("<ShapeMatrixGridCorner");
    expect(matrixPane).toMatch(
      /\{#if state\.compact\}\s*<ShapeMatrixRecipeStrip/
    );
    const corner = read("app/components/ShapeMatrixGridCorner.svelte");
    expect(corner).toContain('<ShapeMatrixAxisStepper hand="left"');
    expect(corner).toContain('<ShapeMatrixAxisStepper hand="right"');
    // Columns (red) sit on the column-header band above Rows (blue), and
    // both axes point with icon arrows rather than thin text glyphs.
    expect(corner.indexOf('class="axis columns"')).toBeLessThan(
      corner.indexOf('class="axis rows"')
    );
    expect(corner).toContain("fa-arrow-right");
    expect(corner).toContain("fa-arrow-down");
    expect(corner).not.toMatch(/>\s*[↓→]\s*</);
    expect(corner).toContain("Surprise me");
    expect(corner).not.toContain("Mixed");
    // The relationship is named by the detail pane, not repeated up here.
    expect(corner).not.toContain("relationship-dot");
    const strip = read("app/components/ShapeMatrixRecipeStrip.svelte");
    expect(strip).not.toContain("relationship-dot");
    // One notation at a time: the stepper shows no secondary label.
    const stepper = read("app/components/ShapeMatrixAxisStepper.svelte");
    expect(stepper).not.toContain("secondary");
    const controls = read("app/components/ShapeMatrixTurnControls.svelte");
    expect(controls).not.toContain("Apply to");
    expect(controls).not.toContain("mixed");
    // The tray edits a named axis and stays on the detail pane.
    expect(popover).toContain(
      "appState.setTurnFor(hand, turn, { stayOnDetail: true })"
    );
    // Surprise lives with the grid; the header shows a dice only while a
    // compact detail view has hidden the bar.
    expect(shell).toMatch(
      /activeView === "detail"\}\s*\{@render compactSurpriseAction\(\)\}/
    );
    expect(shell).toContain("runMandalaMorph");
  });

  it("keeps the carousel out of the flying rectangle", () => {
    // The canvas box is the stage; the strip is its own card with its own
    // shared name, so it rises in after the stage lands instead of riding
    // inside the travelling rectangle or popping in with the page.
    const drill = read("components/ShapeMatrixDrill.svelte");
    expect(drill).toMatch(
      /class="strip-zone"[\s\S]*?use:claimedViewTransitionName=\{\{\s*name: SHAPE_MATRIX_STRIP_NAME/
    );
    expect(drill).toMatch(/\.hero-stage \{[^}]*border-radius: 16px/);
    expect(drill).not.toMatch(/\.media-stage \{[^}]*border-radius/);
    expect(drill).not.toMatch(/\.strip-zone \{[^}]*border-top/);
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).toContain("::view-transition-new(shape-matrix-strip)");
    expect(shell).toContain("::view-transition-old(shape-matrix-strip)");
  });

  it("settles every frame around the stage instead of popping it in", () => {
    // Anything left unnamed rides the page's single root snapshot, which is
    // painted complete for the whole flight and then swapped for the live
    // DOM. The chips, the carousel and the control bar each carry a name so
    // they can settle into their landed positions on a staggered wave.
    const drill = read("components/ShapeMatrixDrill.svelte");
    const regionClaims = (region: string, name: string) => {
      const at = drill.indexOf(`data-drill-region="${region}"`);
      return at >= 0 && drill.slice(at, at + 280).includes(`name: ${name},`);
    };
    expect(regionClaims("modes", "SHAPE_MATRIX_MODES_NAME")).toBe(true);
    expect(regionClaims("strip", "SHAPE_MATRIX_STRIP_NAME")).toBe(true);
    expect(regionClaims("controls", "SHAPE_MATRIX_CONTROLS_NAME")).toBe(true);
    // A frame is named only while a morph is in flight, and only on the side
    // that owns the detail view, so it is new-only arriving and old-only
    // leaving and never a containing block for its own popovers at rest.
    expect(drill).toContain(
      "mandalaTransition.claim && mandalaTransition.handoff"
    );
    expect(drill.match(/enabled: morphingFrames,/g)).toHaveLength(3);

    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).toContain("@keyframes -global-shape-matrix-settle-in");
    expect(shell).toContain("@keyframes -global-shape-matrix-settle-out");
    // Every leg of the wave is delayed, and each frame travels from the side
    // it sits on, so the page assembles outward from the landing stage.
    expect(
      shell.match(/animation-delay: calc\(var\(--duration-dramatic\)/g)
    ).toHaveLength(3);
    expect(shell).toContain("--settle-from: -0.9rem;");
    for (const name of [
      "shape-matrix-modes",
      "shape-matrix-strip",
      "shape-matrix-controls",
    ]) {
      expect(shell).toContain(`::view-transition-new(${name})`);
      expect(shell).toContain(`::view-transition-old(${name})`);
    }
    // The page under the flight dissolves rather than summing both sides at
    // full strength for the whole flight and vanishing at teardown.
    expect(shell).toContain("shape-matrix-page-out var(--duration-emphasis)");
    expect(shell).toContain("shape-matrix-page-in var(--duration-emphasis)");
    expect(shell).toContain("mix-blend-mode: plus-lighter;");
  });

  it("fades the live player up instead of flipping it visible", () => {
    // The stage glyph and the step number belong to the player, which is not
    // mounted while the stage flies. A visibility flip on release lands them
    // at full strength the instant the morph ends: the pop this removes.
    const drill = read("components/ShapeMatrixDrill.svelte");
    expect(drill).toContain("class:settling={!livePlayerShowsPair}");
    expect(drill).not.toContain("|| mandalaTransition.handoff}");
    expect(drill).toContain(".player-layer.settling {");
    expect(drill).toContain(".player-layer:not(.settling) {");
    expect(drill).toContain(
      "transition: opacity var(--duration-emphasis) var(--ease-out);"
    );
  });

  it("lets the compact popover pick the level, shown as the difficulty badge", () => {
    const popover = read("app/components/ShapeMatrixTurnPopover.svelte");
    expect(popover).toContain("<LevelSelector");
    expect(popover).toContain("<DifficultyBadge level={appState.level}");
    expect(popover).not.toMatch(/L\{appState\.level\}/);
    expect(popover).toContain(
      "appState.setLevel(level, { stayOnDetail: true })"
    );
    // One list of levels and blurbs, read by everything that names a level:
    // the popover, the difficulty strip beside the grid, and About. The strip
    // is where the shell's level control went, so the shell no longer reads it.
    expect(popover).toContain("SHAPE_MATRIX_LEVEL_DESCRIPTIONS");
    const strip = read("app/components/ShapeMatrixDifficultyStrip.svelte");
    expect(strip).toContain("SHAPE_MATRIX_LEVEL_DESCRIPTIONS");
    const about = read("app/components/ShapeMatrixAboutModal.svelte");
    expect(about).toContain("SHAPE_MATRIX_LEVEL_DESCRIPTIONS");
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).not.toContain("const LEVEL_DESCRIPTIONS");
  });

  it("keeps the compact topbar as the only chrome row on the detail view", () => {
    // The shell still owns the animation state (so every consumer shares one
    // scope), but the way back off a section moved out of the shell's topbar
    // in two later passes: the 2026-09-06 demo-layout rewrite (31a3411642)
    // dropped the topbar's relationships-action button, and the 2026-09-07
    // canvas-transport pass (e485f1d861) replaced it with a wide-only stage
    // gear (ShapeMatrixStageActions) and a compact settings sheet. The sheet
    // itself is gone again: 38bd0bf493 dropped the overlay, its header and its
    // close button in favour of focus mode, where every chrome element the
    // drill marks is taken out of flow while the controls are in use. Nothing
    // in that chain adds a second persistent row beside the topbar.
    const shell = read("app/components/ShapeMatrixAppShell.svelte");
    expect(shell).toContain("setShapeMatrixAnimationContext(");
    const drill = read("components/ShapeMatrixDrill.svelte");
    // The drill declares which of its rows are chrome; it does not build a
    // surface to hide them behind.
    expect(drill).toContain("data-focus-mode-chrome");
    expect(drill).not.toContain("compact-settings");
    expect(drill).not.toContain('aria-label="Close settings"');
    // And the shell is the single owner of what marked chrome does, so a row
    // cannot opt out and stand while the rest step aside.
    expect(shell).toMatch(
      /\.focus-mode :global\(\[data-focus-mode-chrome\]\) \{[^}]*visibility: hidden/s
    );
    const stageActions = read("components/ShapeMatrixStageActions.svelte");
    expect(stageActions).toContain("animationState.showRelationships();");
    // ShapeMatrixDetailPane's own pane-heading (and the animation-context
    // read it needed) was retired in the same 31a3411642 rewrite: the pane
    // is nothing but the drill now, so it owns no heading or back-navigation
    // chrome of its own — a stronger guarantee than a wide-only heading that
    // the compact topbar is the sole standing chrome row.
    const detailPane = read("app/components/ShapeMatrixDetailPane.svelte");
    expect(detailPane).toContain("<ShapeMatrixDrill");
    expect(detailPane).not.toContain("<header");
    expect(detailPane).not.toContain("pane-heading");
    // The toggle never borrows the back arrow the Matrix button owns.
    expect(detailPane).not.toContain("fa-arrow-left");
    const controls = read("app/components/ShapeMatrixTurnControls.svelte");
    expect(controls).not.toMatch(
      /\.turn-editor\.tray[^{]*\{[^}]*(?<![-\w])width: 100%/
    );
  });
});
