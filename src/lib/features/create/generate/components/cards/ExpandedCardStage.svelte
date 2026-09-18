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
  that opened it on close. The {#key destination} remount on a layout flip
  (desktop <-> stacked) drops the panel's local state and focus along with it;
  acceptable for a resize or fold event, which is rare and not mid-task.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { portal } from "../modals/portal";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { getEscapeLayerManager } from "$lib/shared/keyboard/get-escape-layer-manager";
  import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import {
    generateCardMorphName,
    lastGenerateCardMorphRan,
    morphGenerateCard,
  } from "../../shared/services/generate-card-morph";
  import CustomizeExpandedOverlay from "./CustomizeExpandedOverlay.svelte";
  import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";
  import SetupsPanel from "../presets/SetupsPanel.svelte";
  import { expandedCardTitleId } from "./expanded-card-stage-props";
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
  const customize = $derived(panelState.customizeOverlayProps);

  let root = $state<HTMLElement | null>(null);

  // A morph already carried the card in (or reduced motion says skip motion
  // entirely), so the stage root just appears; otherwise it scales in on its
  // own, the same panel-covers-a-card motion GenerationSettingsOverlay used
  // to do locally. Read fresh on every open, not cached, since a morph vs.
  // plain open is decided per-call.
  function stageEntrance() {
    return lastGenerateCardMorphRan() || reducedMotion()
      ? { start: 1, duration: 0 }
      : { start: 0.95, duration: 250, easing: quintOut };
  }

  $effect(() => {
    const card = openCard;
    if (!card) return;
    void tick().then(() => root?.focus({ preventScroll: true }));
    return () => {
      // Runs when the card changes or closes. Return focus to the card that
      // opened us, but only if focus is still somewhere inside this stage.
      // If it already moved elsewhere (e.g. the user clicked into the grid
      // before the close finished), pulling it back would be a surprise.
      if (!root?.contains(document.activeElement)) return;
      const wrapper = document.querySelector<HTMLElement>(
        `.card-wrapper[data-card-id="${card}"] button, .card-wrapper[data-card-id="${card}"] [tabindex="0"]`
      );
      wrapper?.focus({ preventScroll: true });
    };
  });

  // Escape closes through the same layer manager that closes drawers and
  // modals, so a competing Escape shortcut never has to guess which layer
  // the user meant.
  $effect(() => {
    if (!openCard) return;
    return getEscapeLayerManager().register({
      id: "generate:expanded-card",
      canDismiss: () => true,
      dismiss: close,
    });
  });

  function close() {
    const card = openCard;
    if (!card) return;
    morphGenerateCard(card, () => panelState.closeGenerateCard());
  }

  // Focus inside a non-modal dialog owns the first Escape; the global
  // shortcut defers to it (see shouldDeferEscapeShortcut's role="dialog"
  // check), so it is answered here instead.
  function onKeydown(event: KeyboardEvent): void {
    if (
      event.key !== "Escape" ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    close();
  }
</script>

{#snippet body(titleId: string)}
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
      {titleId}
    />
  {:else if openCard === "loop" && panelState.loopSelectedComponents && panelState.loopOnChange && panelState.loopCurrentType}
    <LOOPExpandedOverlay
      currentType={panelState.loopCurrentType}
      selectedComponents={panelState.loopSelectedComponents}
      onChange={panelState.loopOnChange}
      onClose={close}
      entrance="none"
      onLoopDisable={loop.onLoopDisable}
      rhythm={loop.rhythm}
      sequenceLength={loop.sequenceLength}
      onRhythmChange={loop.onRhythmChange}
      guestMaxLength={loop.guestMaxLength}
      onRequestSignup={loop.onRequestSignup}
      layout="responsive"
      {titleId}
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
      {titleId}
    />
  {/if}
{/snippet}

{#key destination}
  {#if destination === "viewport"}
    {#if openCard}
      <div
        class="expanded-card-stage"
        data-destination="viewport"
        data-card-id={openCard}
        role="dialog"
        aria-labelledby={expandedCardTitleId(openCard)}
        tabindex="-1"
        bind:this={root}
        onkeydown={onKeydown}
        use:portal
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
        transition:scale={stageEntrance()}
      >
        {@render body(expandedCardTitleId(openCard))}
      </div>
    {/if}
  {:else if openCard}
    <div
      class="expanded-card-stage"
      data-destination="stage"
      data-card-id={openCard}
      role="dialog"
      aria-labelledby={expandedCardTitleId(openCard)}
      tabindex="-1"
      bind:this={root}
      onkeydown={onKeydown}
      use:claimedViewTransitionName={{
        name: generateCardMorphName(openCard),
      }}
      transition:scale={stageEntrance()}
    >
      {@render body(expandedCardTitleId(openCard))}
    </div>
  {/if}
{/key}

<style>
  .expanded-card-stage {
    /* The panels inside are absolute inset 0 (GenerationSettingsOverlay and
       LOOPExpandedOverlay both are), so this box is what sets their size. */
  }

  .expanded-card-stage:focus-visible {
    outline: 2px solid var(--primary-color, #6366f1);
    outline-offset: 2px;
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
