import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const homeHero = readSource(
  "src/lib/shared/landing/components/HomeHero.svelte"
);
const sequenceHero = readSource(
  "src/lib/shared/landing/components/SequenceHeroDemo.svelte"
);
const stepStrip = readSource("src/lib/shared/timeline/StepStrip.svelte");
const inlinePlayer = readSource(
  "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
);
const animatorCanvas = readSource(
  "src/lib/shared/animation-engine/components/AnimatorCanvas.svelte"
);
const landingPage = readSource("src/routes/+page.svelte");
const launchpadGrid = readSource(
  "src/lib/shared/landing/components/launchpad/LaunchpadGrid.svelte"
);
const launchpadTile = readSource(
  "src/lib/shared/landing/components/launchpad/LaunchpadTile.svelte"
);
const glossaryCard = readSource(
  "src/lib/shared/landing/components/launchpad/GlossaryDictionaryCard.svelte"
);

describe("homepage hero notation rail contract", () => {
  it("makes opening Composer the primary hero action", () => {
    expect(homeHero).toContain('class="composer-cta"');
    expect(homeHero).toContain('href="/create"');
    expect(homeHero).toContain("data-sveltekit-reload");
    expect(homeHero).toContain("<span>Open Flow Arts Composer</span>");
    expect(homeHero).toContain('cta_type: "open_composer"');
    expect(homeHero).toContain("white-space: nowrap");
    expect(homeHero).toContain("onReroll={handleReroll}");
    expect(homeHero).toContain("rerolling={heroAct.rerolling}");
    expect(homeHero).toContain('trackDemoInteraction("try_another")');
    expect(homeHero).toContain("void heroAct.advanceNow()");
    expect(homeHero).toContain('class="hero-actions"');
    expect(homeHero).not.toContain("fa-rocket");
  });

  it("reuses the shared StepStrip through the hero's lazy stage seam", () => {
    expect(homeHero).toContain("showNotationStrip={true}");
    expect(sequenceHero).toContain(
      'import("$lib/shared/timeline/StepStrip.svelte")'
    );
    expect(sequenceHero).toContain('density: "compact"');
    expect(sequenceHero).toContain(
      "active={active && !!sequence && !isNamedRouteMorphActive()}"
    );
    expect(sequenceHero).toMatch(
      /active=\{active &&\s*canvasReady &&\s*!!sequence &&\s*shouldMountNotationRail &&\s*!isNamedRouteMorphActive\(\)\}/
    );
    expect(stepStrip).toContain(
      "const resolvedCells = $derived(cells ?? buildNotationCells(sequence))"
    );
    expect(stepStrip).toContain('orientation?: "horizontal" | "vertical"');
    expect(stepStrip).toContain("translateY(${trackOffset}px)");
  });

  it("keys live step reports to the sequence actually loaded in the player", () => {
    expect(inlinePlayer).toContain(
      "onStepChange?: (currentStep: number, sequenceId: string | null) => void"
    );
    expect(inlinePlayer).toContain(
      "const sequenceId = animationState.sequenceData?.id ?? null"
    );
    expect(sequenceHero).toContain(
      "reportedSequenceId === (sequence?.id ?? null) ? reportedStep : 0"
    );
  });

  it("shows the shared whole-word header with the engine's live step highlight", () => {
    expect(homeHero).toContain("showWordHeader={true}");
    expect(sequenceHero).toContain("showWordHeader,");
    expect(sequenceHero).toContain("visibilityManagerOverride: showWordHeader");
    expect(inlinePlayer).toContain(
      "word={animationState.sequenceData?.word ?? sequence.word}"
    );
    expect(inlinePlayer).toContain("hideHeader={fill && !showWordHeader}");
    expect(animatorCanvas).toContain(
      "activeStepNumber={headerActiveStepNumber}"
    );
  });

  it("uses the animation renderer's canonical elemental glyph", () => {
    expect(homeHero).toContain("element={heroAct.element}");
    expect(sequenceHero).toContain(
      "syncHeroElementalGlyphVisibility(heroVisibilityManager, element !== null)"
    );
    expect(sequenceHero).not.toContain('class="element-badge"');
    expect(sequenceHero).not.toContain("shownElement.iconPath");
    expect(animatorCanvas).toContain(
      "elementalGlyphVisible={effectiveElementalGlyphVisible}"
    );
  });

  it("routes the prefetched sequence through the player's clock-preserving boundary handoff", () => {
    expect(homeHero).toContain(
      "onSequenceBoundary={heroAct.offerSequenceBoundary}"
    );
    expect(sequenceHero).toContain("onSequenceBoundary,");
    expect(inlinePlayer).toContain(
      "playbackController.onSequenceBoundary(() =>"
    );
    expect(inlinePlayer).toContain(
      "lastLoadedSequenceId = getSequenceLoadId(handoff.sequence)"
    );
  });

  it("reserves the compact rail and scales it continuously inside the wide stage budget", () => {
    expect(sequenceHero).toMatch(
      /\.notation-strip\s*\{[\s\S]*?height: 4\.125rem/
    );
    expect(sequenceHero).toContain("height: 4.375rem");
    expect(sequenceHero).toContain("height: 4.6875rem");
    expect(sequenceHero).not.toContain("@media (min-width: 2200px)");
    expect(homeHero).toContain(
      "--hero-demo-wide-max-width: min(calc(48svh - 3rem), 31rem)"
    );
    expect(homeHero).not.toContain("@media (min-width: 2200px)");
  });

  it("keeps the wide launchpad on the shared composition band", () => {
    expect(landingPage).toContain(
      "max-width: var(--shell-w, min(1720px, 92vw))"
    );
    expect(launchpadGrid).toContain(
      "grid-auto-rows: clamp(10.625rem, 21.5svh, 21.25rem)"
    );
    expect(launchpadTile).toContain("width: 10.625rem");
    expect(launchpadTile).toContain("width: 8.75rem");

    for (const source of [launchpadGrid, launchpadTile, glossaryCard]) {
      expect(source).not.toContain("@media (min-width: 2200px)");
    }
  });

  it("gives tablet viewports a complete four-band destination bento", () => {
    const tabletQuery =
      "@media (width >= 42rem) and (width < 105rem) and (height >= 500px)";
    const foldLandscapeQuery =
      "@media (min-width: 42rem) and (max-width: 1180px) and (min-height: 500px) and (max-height: 44rem)";
    const shortSplitQuery =
      "@media (width >= 42rem) and (width < 105rem) and (height >= 500px) and (height < 44rem)";

    expect(landingPage).toContain(tabletQuery);
    expect(homeHero).toContain(tabletQuery);
    expect(launchpadGrid).toContain(tabletQuery);
    expect(launchpadTile).toContain(tabletQuery);
    expect(launchpadGrid).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
    expect(launchpadGrid).toContain('class="launchpad-group"');
    expect(launchpadGrid).toContain("grid-template-rows: auto auto");
    expect(launchpadGrid).toContain("align-content: center");
    expect(launchpadGrid).toContain(".t-composer),");
    expect(launchpadGrid).toContain(".t-notation)");
    expect(launchpadGrid).toContain("@container launchpad (max-width: 22rem)");
    expect(launchpadTile).toContain("@container launchpad (max-width: 32rem)");
    expect(launchpadGrid).toContain(
      "grid-template-rows: repeat(6, minmax(0, 1fr))"
    );
    expect(launchpadTile).toContain("max-height: 850px");

    for (const source of [landingPage, launchpadGrid]) {
      expect(source).toContain(foldLandscapeQuery);
    }
    for (const source of [homeHero, sequenceHero]) {
      expect(source).toContain(shortSplitQuery);
    }
    expect(homeHero).toContain("--hero-demo-max-width: min(100%, 40svh)");
    expect(sequenceHero).toMatch(
      /\.with-notation-strip \.notation-strip\s*\{\s*display: none/
    );
    expect(launchpadGrid).toContain("row-gap: 0.5rem");
    expect(launchpadGrid).toContain(
      "grid-template-rows: repeat(3, minmax(0, 1fr))"
    );
    expect(launchpadGrid).not.toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))"
    );
  });

  it("lets portrait phones scroll through a ranked launchpad instead of compressing the whole page", () => {
    const shortWideQuery = "(width >= 35rem) and (height < 500px)";
    const compactPageQuery = "(width < 42rem) and (height >= 500px)";
    const verticalRailQuery = "(width < 42rem) and (height >= 500px)";
    const roomyPortraitQuery =
      "@media (width < 42rem) and (min-height: 56rem) and (orientation: portrait)";

    for (const source of [landingPage, homeHero]) {
      expect(source).toContain(shortWideQuery);
      expect(source).toContain(compactPageQuery);
    }
    expect(sequenceHero).toContain("(height < 500px)");
    expect(sequenceHero).toContain(verticalRailQuery);
    for (const source of [launchpadGrid, launchpadTile]) {
      expect(source).toContain("(width < 42rem)");
      expect(source).toContain("(height < 500px)");
      expect(source).toContain("(width >= 105rem) and (height < 56.25rem)");
    }
    for (const source of [
      landingPage,
      homeHero,
      sequenceHero,
      launchpadGrid,
      launchpadTile,
    ]) {
      expect(source).not.toContain("max-height: 499px");
    }
    for (const source of [landingPage, homeHero, sequenceHero, launchpadGrid]) {
      expect(source).toContain("(width >= 105rem) and (height >= 56.25rem)");
    }
    for (const source of [launchpadGrid, launchpadTile]) {
      expect(source).toContain(
        "@media (width < 35rem), (width < 42rem) and (height >= 500px)"
      );
    }
    for (const source of [homeHero, launchpadGrid, launchpadTile]) {
      expect(source).toContain(roomyPortraitQuery);
    }

    expect(sequenceHero).toContain(
      "grid-template-columns: minmax(0, 1fr) 5.25rem"
    );
    expect(sequenceHero).toContain("orientation: notationOrientation");
    expect(launchpadGrid).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(homeHero).toContain("--hero-demo-max-width: min(100%, 36svh)");
    expect(homeHero).toContain("--hero-demo-max-width: min(100%, 21rem)");
    expect(homeHero).toContain("--hero-demo-max-width: min(100%, 22rem)");
    expect(homeHero).toContain("min-height: calc(100svh - 4.25rem)");
    expect(homeHero).toContain("min-height: var(--min-touch-target, 44px)");
    expect(homeHero).toContain("font-size: var(--font-size-min, 0.875rem)");
    expect(landingPage).not.toContain(
      "--settings-home-compact-launchpad-min-height"
    );
    expect(landingPage).toContain("display: block");
    expect(launchpadGrid).toContain("grid-template-rows: repeat(4, auto)");
    expect(launchpadGrid).toContain(
      ".launchpad.variant-home .bento :global(.tile.t-composer),\n    .launchpad.variant-home .bento :global(.tile.t-notation)"
    );
    expect(launchpadGrid).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
    expect(launchpadGrid).toContain("--settings-home-tall-gap");
    expect(launchpadTile).toContain(
      "--settings-home-mobile-tile-height: 6.5rem"
    );
    expect(launchpadTile).toContain("--settings-home-mobile-tile-height: 8rem");
    expect(launchpadTile).toContain(
      ".tile.variant-home .card {\n      display: grid;\n      flex: 1 1 auto;\n      height: auto;"
    );
    expect(launchpadTile).toContain(
      ".tile.variant-home .tile-link {\n      position: relative;\n      inset: auto;\n      display: block;\n      min-height: var(--settings-home-mobile-tile-height);"
    );
    expect(launchpadTile).toContain(
      ".tile.variant-home .body,\n    .tile.variant-home .card:has(.chips) .body {\n      position: relative;"
    );
    expect(launchpadTile).toContain("-webkit-line-clamp: unset");
    expect(launchpadTile).not.toContain("-webkit-line-clamp: 3");
    expect(launchpadTile).not.toContain("font-size: 0.7rem");
    expect(launchpadTile).toContain("@container launchpad (min-width: 24rem)");
  });
});
