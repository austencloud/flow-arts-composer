<script lang="ts">
  /**
   * GuideCompanionHost - the click-a-strip-to-animate wiring shared by every
   * guide host (level-1's GuidePageHost, level-2's chapter routes). Extracted
   * from GuidePageHost (never-hand-roll: one wiring, many hosts) so level-2
   * gets the same companion affordance level-1 already has, instead of a
   * second hand-rolled copy.
   *
   * Owns: the GuideActiveStep + SequenceSelection contexts, the
   * setGuideSequenceClick handler (strip → playable SequenceData via
   * stripToSequence + ensureMotionData), and the browser-gated dynamic-import
   * GuideCompanion bottom drawer. Renders `children` unwrapped (no extra DOM
   * node - `display: contents` - so it never disturbs a host's own grid/flex
   * layout, e.g. level-2's `.guide-content` subgrid where each direct child of
   * a section matters for the prose-column confinement rule).
   */
  import { browser } from "$app/environment";
  import type { Snippet } from "svelte";
  import {
    setGuideSequenceClick,
    type GuideSequenceClick,
  } from "../level-1/_data/guide-data-context";
  import { GuideActiveStep, setGuideActiveStep } from "../level-1/_data/guide-active-step.svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "$lib/shared/selection/sequence-selection.svelte";
  import "$lib/shared/selection/selection.css";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    pageTitle,
    levelLabel,
    children,
  }: {
    pageTitle: string;
    levelLabel: string;
    children: Snippet;
  } = $props();

  // Companion wiring - mirrors GuideReader exactly (tap a strip → animate it).
  const activeStep = new GuideActiveStep();
  setGuideActiveStep(activeStep);
  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  let clicked = $state<SequenceData | null>(null);
  let companionOpen = $state(false);
  let clickedPropType = $state<"hand" | "staff" | PropType>("hand");
  let clickedKey = $state<string | null>(null);
  let clickedShowPlacementGlyph = $state(false);

  async function handleSequenceClick(payload: GuideSequenceClick) {
    activeStep.begin(payload.key ?? "");
    selection.select(payload.key ?? "");
    clickedPropType = payload.propType ?? "hand";
    const isHand = String(clickedPropType).toLowerCase() === "hand";
    clickedShowPlacementGlyph = payload.showPlacementGlyph ?? isHand;
    clickedKey = payload.key ?? null;
    const seq = stripToSequence(payload.strip, { word: payload.word });
    clicked = (await ensureMotionData(seq)) ?? seq;
    companionOpen = true;
  }
  setGuideSequenceClick(handleSequenceClick);

  function closeCompanion() {
    companionOpen = false;
    activeStep.clear();
    selection.clear();
  }
</script>

{@render children()}

{#if browser && companionOpen}
  {#await import("../level-1/_components/GuideCompanion.svelte") then Comp}
    <div class="companion-drawer" role="dialog" aria-label="Animation companion">
      <Comp.default
        sequence={clicked}
        propType={clickedPropType}
        stripKey={clickedKey}
        {pageTitle}
        {levelLabel}
        showPlacementGlyph={clickedShowPlacementGlyph}
        isCodexMode={false}
        isMobile={true}
        onStep={(s: number) => activeStep.report(s)}
        onClose={closeCompanion}
      />
    </div>
  {/await}
{/if}

<style>
  /* Companion appears on strip-click as a fixed bottom drawer - an overlay, so
     it never shifts page layout (no-layout-shift). Same palette as
     GuidePageHost's original drawer (dark chrome, independent of host theme). */
  .companion-drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    max-height: 92svh;
    background: #14141b;
    color: #ececf2;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.4);
  }
</style>
