<!--
  ExpandedCardStage: the grown generate card.

  Renders whichever of Customize, LOOP and Setups is open (panelState.
  openGenerateCard) and claims that card's view-transition name, so the morph
  in generate-card-morph.ts carries the card wrapper's box here and back.

  Two destinations for one component:
  - side-by-side (isDesktopLayout): in place, absolute inside .card-grid-stage,
    which the container renders this into through its expandedCard snippet.
    The Level toolbar above the grid stays.
  - stacked: portaled to <body> and fixed to the viewport, bottom nav included.
    It cannot stay inside the settings container: `container-type: size`
    applies layout containment, which makes the container the containing
    block for fixed descendants.

  No backdrop, no outside-click dismissal: the workspace beside the grown card
  stays live. X and Escape close. Focus moves in on open and back to the card
  that opened it on close.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { portal } from "../modals/portal";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import type {
    GenerateCardPanelId,
    PanelCoordinationState,
  } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import {
    generateCardMorphName,
    lastGenerateCardMorphRan,
    morphGenerateCard,
  } from "../../shared/services/generate-card-morph";
  import CustomizeExpandedOverlay from "./CustomizeExpandedOverlay.svelte";
  import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";
  import SetupsPanel from "../presets/SetupsPanel.svelte";
  import type {
    LoopStageProps,
    SetupsStageProps,
  } from "./expanded-card-stage-props";

  let {
    panelState,
    isDesktopLayout,
    loop,
    setups,
  }: {
    panelState: PanelCoordinationState;
    isDesktopLayout: boolean;
    loop: LoopStageProps;
    setups: SetupsStageProps;
  } = $props();

  const openCard = $derived(panelState.openGenerateCard);
  const destination = $derived(isDesktopLayout ? "stage" : "viewport");

  // Decided once per open. A transition (or reduced motion) is the entrance;
  // only a plain open on a browser without View Transitions scales in.
  let entrance = $state<"scale" | "none">("none");
  let root = $state<HTMLElement | null>(null);
  let openedFrom: GenerateCardPanelId | null = null;

  $effect(() => {
    const card = openCard;
    if (!card) return;
    openedFrom = card;
    entrance = lastGenerateCardMorphRan() || reducedMotion() ? "none" : "scale";
    void tick().then(() => root?.focus({ preventScroll: true }));
    return () => {
      // Runs when the card changes or closes. Return focus to the card that
      // opened us; it is still in the grid on both destinations.
      const wrapper = document.querySelector<HTMLElement>(
        `.card-wrapper[data-card-id="${card}"] button, .card-wrapper[data-card-id="${card}"] [tabindex]`
      );
      wrapper?.focus({ preventScroll: true });
    };
  });

  function close() {
    const card = openedFrom;
    if (!card) return;
    morphGenerateCard(card, () => panelState.closeGenerateCard());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented || !openCard) return;
    event.preventDefault();
    close();
  }

  const customize = $derived(panelState.customizeOverlayProps);
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet body()}
  {#if openCard === "customize" && customize}
    <CustomizeExpandedOverlay
      constraintPreset={customize.constraintPreset}
      handPathMode={customize.handPathMode}
      motionTypeFilter={customize.motionTypeFilter}
      handRelationship={customize.handRelationship}
      handRelationshipInverted={customize.handRelationshipInverted}
      onHandRelationshipChange={customize.onHandRelationshipChange}
      onHandRelationshipInvertedChange={customize.onHandRelationshipInvertedChange}
      matchHandTurns={customize.matchHandTurns}
      onMatchHandTurnsChange={customize.onMatchHandTurnsChange}
      startEndOptions={customize.startEndOptions}
      level={customize.level}
      gridMode={customize.gridMode}
      isFreeformMode={customize.isFreeformMode}
      styleBaseline={customize.styleBaseline}
      onConstraintPresetChange={customize.onConstraintPresetChange}
      onHandPathModeChange={customize.onHandPathModeChange}
      onMotionTypeFilterChange={customize.onMotionTypeFilterChange}
      onStartEndChange={customize.onStartEndChange}
      onResetAll={customize.onResetAll}
      onClose={close}
      {entrance}
    />
  {:else if openCard === "loop" && panelState.loopSelectedComponents && panelState.loopOnChange && panelState.loopCurrentType}
    <LOOPExpandedOverlay
      currentType={panelState.loopCurrentType}
      selectedComponents={panelState.loopSelectedComponents}
      onChange={panelState.loopOnChange}
      onClose={close}
      onLoopDisable={loop.onLoopDisable}
      rhythm={loop.rhythm}
      sequenceLength={loop.sequenceLength}
      onRhythmChange={loop.onRhythmChange}
      guestMaxLength={loop.guestMaxLength}
      onRequestSignup={loop.onRequestSignup}
      layout="responsive"
      {entrance}
    />
  {:else if openCard === "preset"}
    <SetupsPanel
      favoriteState={setups.favoriteState}
      isSignedOut={setups.isSignedOut}
      isPreview={setups.isPreview}
      isAnonymous={setups.isAnonymous}
      onApply={setups.onApply}
      onRequestCommunityAccount={setups.onRequestCommunityAccount}
      onRequestShareAccount={setups.onRequestShareAccount}
      onRequestSignIn={setups.onRequestSignIn}
      onClose={close}
      {entrance}
    />
  {/if}
{/snippet}

{#if openCard}
  {#key destination}
    {#if destination === "viewport"}
      <div
        class="expanded-card-stage"
        data-destination="viewport"
        data-card-id={openCard}
        tabindex="-1"
        bind:this={root}
        use:portal
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
      >
        {@render body()}
      </div>
    {:else}
      <div
        class="expanded-card-stage"
        data-destination="stage"
        data-card-id={openCard}
        tabindex="-1"
        bind:this={root}
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
      >
        {@render body()}
      </div>
    {/if}
  {/key}
{/if}

<style>
  .expanded-card-stage {
    outline: none;
    /* The panels inside are absolute inset 0 (GenerationSettingsOverlay and
       LOOPExpandedOverlay both are), so this box is what sets their size. */
  }

  .expanded-card-stage[data-destination="stage"] {
    position: absolute;
    inset: 0;
    z-index: 100;
  }

  .expanded-card-stage[data-destination="viewport"] {
    position: fixed;
    inset: 0;
    z-index: var(--z-drawer, 400);
    background: var(--theme-surface, #101018);
  }

  /* The overlay chrome rounds its corners and draws a border for the in-grid
     case. Edge to edge on the viewport. */
  .expanded-card-stage[data-destination="viewport"]
    > :global(.generation-settings-overlay),
  .expanded-card-stage[data-destination="viewport"]
    > :global(.loop-expanded-overlay) {
    border-radius: 0;
    border: none;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
</style>
