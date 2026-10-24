<!--
  ExpandedCardStage: the grown generate card.

  Renders whichever of Customize, LOOP and Setups is open (panelState.
  openGenerateCard) and claims that card's view-transition name, so the morph
  in generate-card-morph.ts carries the card wrapper's box here and back.

  Two destinations for one component:
  - side-by-side (isDesktopLayout): in place, absolute inside .card-grid,
    which the container renders this into through its expandedCard snippet.
    The grid is the cards' footprint (centered, capped per breakpoint), so
    the grown card never overhangs it. The Level toolbar above stays.
  - stacked: portaled to <body> and fixed to the viewport, bottom nav included.
    It cannot stay inside the settings container: `container-type: size`
    applies layout containment, which makes the container the containing
    block for fixed descendants. Three ways to present there:
    - fill: on a phone held upright, Customize, Setups and Timing take the
      whole screen. LOOP stays a bottom panel even there.
    - float: on a window wider than a phone and at least 760px tall (an
      unfolded foldable, a tablet held upright, a tall browser pane), the
      grown card floats centered over a dimmed backdrop. A full-screen panel
      there was mostly empty space and hid the sequence it was configuring,
      and a panel on the bottom edge left most of the screen empty above it.
    - sheet: on a shorter window wider than a phone, the grown card is a
      panel along the bottom edge over the same backdrop.

  No backdrop beside the desktop stage: the workspace beside the grown card
  stays live. On desktop, a click outside closes the card without consuming
  the interaction, so the workspace control underneath still works; the Level
  strip is the exception, since the card follows the level. A tap on
  the backdrop behind a bottom or floating panel closes it. X and Escape
  close everywhere.
  Focus moves in on open and back to the card that opened it on close. The
  {#key destination} remount on a layout flip (desktop <-> stacked) drops the
  panel's local state and focus along with it; acceptable for a resize or fold
  event, which is rare and not mid-task.

  Customize stays built between opens. Its thirty-two pictograph tiles took
  several times longer to build than any other panel, and building them inside
  the tap's morph held the motion back. The panel is built once, while the page
  is idle, in a hidden parking spot; an open moves the built panel into the
  stage root and a close moves it back.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";
  import { portal } from "../modals/portal";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    opaqueFade,
    popIn,
    reducedMotion,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import { isEditableKeyboardTarget } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";
  import type { PanelCoordinationState } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import {
    generateCardMorphName,
    lastGenerateCardMorphRan,
    morphGenerateCard,
  } from "../../shared/services/generate-card-morph";
  import CustomizeExpandedOverlay from "./CustomizeExpandedOverlay.svelte";
  import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";
  import SetupsPanel from "../presets/SetupsPanel.svelte";
  import TnDPanel from "./TnDPanel.svelte";
  import { expandedCardTitleId } from "./expanded-card-stage-props";
  import type { CustomizeOverlayProps } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import type {
    LoopStageProps,
    SetupsStageProps,
    TnDStageProps,
  } from "./expanded-card-stage-props";

  let {
    panelState,
    isDesktopLayout,
    loop,
    setups,
    tnd,
  }: {
    panelState: PanelCoordinationState;
    isDesktopLayout: boolean;
    loop: LoopStageProps;
    setups: SetupsStageProps;
    tnd: TnDStageProps;
  } = $props();

  const openCard = $derived(panelState.openGenerateCard);
  // Read on demand: only an open card needs the viewport. A window binding
  // read it as the stage mounted, forcing a layout of the half-built panel
  // every time Generate came back.
  const viewportHeight = $derived(innerHeight.current ?? 1000);
  const viewportWidth = $derived(innerWidth.current ?? 1000);
  const destination = $derived(
    isDesktopLayout && !(openCard === "loop" && viewportHeight < 700)
      ? "stage"
      : "viewport"
  );
  // Widths up to this are a phone held upright, where a settings panel needs
  // the whole screen.
  const PHONE_MAX_WIDTH = 600;
  // From this height a stacked window has more room than a bottom panel uses,
  // so the panel floats centered instead of resting on the bottom edge with
  // most of the screen empty above it.
  const FLOAT_MIN_HEIGHT = 760;
  // How the viewport destination presents on a stacked layout. A phone fills
  // the screen, except LOOP, which stays a bottom panel there whatever the
  // height. Anything wider floats on a tall window and rests on the bottom
  // edge on a short one. A desktop window too short for the LOOP stage keeps
  // its centered panel.
  const presentation = $derived(
    destination !== "viewport"
      ? "stage"
      : isDesktopLayout
        ? "centered"
        : viewportWidth <= PHONE_MAX_WIDTH
          ? openCard === "loop"
            ? "sheet"
            : "fill"
          : viewportHeight >= FLOAT_MIN_HEIGHT
            ? "float"
            : "sheet"
  );
  const customize = $derived(panelState.customizeOverlayProps);

  // The props the kept Customize panel is built from: the open snapshot while
  // open, otherwise the card's latest. Held, never cleared, so a close leaves
  // the panel built.
  let retainedCustomize = $state<CustomizeOverlayProps | null>(null);
  $effect.pre(() => {
    const next = customize ?? panelState.customizeOverlayPrimer;
    if (next) retainedCustomize = next;
  });
  let customizeParking = $state<HTMLElement | null>(null);
  let customizeHost = $state<HTMLElement | null>(null);

  // Moves the built Customize panel into a stage root while Customize is
  // open, and back to its parking spot otherwise. On teardown the root has
  // already left the document, so the panel goes with it and is returned to
  // the parking spot from there.
  function holdCustomize(
    node: HTMLElement,
    params: { held: boolean; host: HTMLElement | null }
  ) {
    let current = params;
    const place = ({ held, host }: typeof params) => {
      if (!host) return;
      if (held) {
        if (host.parentNode !== node) node.append(host);
      } else if (host.parentNode === node) {
        customizeParking?.append(host);
      }
    };
    place(params);
    return {
      update(next: typeof params) {
        current = next;
        place(next);
      },
      destroy() {
        place({ ...current, held: false });
      },
    };
  }

  let root = $state<HTMLElement | null>(null);
  let editorHandoffInFlight = false;

  // A morph already carried the card in (or reduced motion says skip motion
  // entirely), so the stage root just appears; otherwise it scales in on its
  // own, the same panel-covers-a-card motion GenerationSettingsOverlay used
  // to do locally. Read fresh on every open, not cached, since a morph vs.
  // plain open is decided per-call. Svelte reads it again for the outro once
  // the intro has ended, so a close reflects the most recent morph call: a
  // close that went through morphGenerateCard is instant, and an external
  // plain close (closeAllPanels from another panel opener) inherits whatever
  // the previous call decided. That is a zero or a 250ms scale-out, never a
  // flicker, so it is left alone.
  function stageEntrance() {
    return lastGenerateCardMorphRan() || reducedMotion()
      ? { start: 1, duration: 0 }
      : { start: 0.95, duration: DURATION.normal };
  }

  // The bottom panel's backdrop fades on a plain open. A morph's own
  // crossfade of the page already brings it in, so it does not fade twice.
  function backdropMotion() {
    return {
      duration:
        lastGenerateCardMorphRan() || reducedMotion() ? 0 : DURATION.normal,
    };
  }

  // Svelte's scale and fade read the node's computed style before they start,
  // even at zero duration. After a morph that read lands inside the view
  // transition callback and lays out the panel it just mounted, so a
  // motionless entrance or exit skips the transition outright.
  function stageScale(
    node: HTMLElement,
    params: { duration: number; start: number }
  ) {
    return params.duration === 0 ? { duration: 0 } : popIn(node, params);
  }

  function backdropFade(node: Element, params: { duration: number }) {
    return params.duration === 0 ? { duration: 0 } : opaqueFade(node, params);
  }

  // A pre-effect, not $effect: its teardown has to run before the {#if}
  // below detaches the root. A morph close gives the root a zero-length
  // outro, so the block removes it synchronously, and Chrome moves focus to
  // <body> the moment a focused element leaves the DOM. A plain $effect
  // teardown runs after that and finds nothing inside the root to hand back.
  $effect.pre(() => {
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
      if (card !== "loop") {
        wrapper?.focus({ preventScroll: true });
      }
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

  // The side-by-side stage is intentionally non-modal: the workspace around
  // it remains actionable. Close after the click bubbles through its target,
  // so the outside control receives its normal interaction before the stage
  // changes the grid geometry. Never prevent or stop the event. If that
  // interaction requested the shared editor drawer, hold the drawer closed
  // until the card has visibly returned to its tile. The selected step still
  // highlights immediately, so the click is acknowledged while the two major
  // surfaces trade the right-hand workspace in a readable order.
  // The viewport destination fills the screen, so it keeps the explicit X
  // and Escape routes instead of manufacturing an unreachable click-away.
  $effect(() => {
    if (!openCard || destination !== "stage") return;

    const card = openCard;
    const dismissFromOutside = (event: MouseEvent): void => {
      if (!root || event.composedPath().includes(root)) return;
      // Controls the grown card reads from (the Level strip): changing one
      // changes what the card shows, so the card stays open to show it.
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLElement &&
              target.dataset.keepsGenerateCard !== undefined
          )
      )
        return;

      // Svelte delegates component click handlers above the native document
      // listener. Defer to the next task so every delegated selection effect
      // has settled before deciding whether this was an editor handoff, a card
      // replacement, or only a plain dismissal.
      setTimeout(() => {
        // An outside card can replace this one in its own click handler. Do not
        // let the old stage's listener immediately close the new card.
        if (panelState.openGenerateCard !== card) return;

        if (panelState.pendingGenerateCardEditorHandoff) {
          startEditorHandoff();
        } else {
          close();
        }
      }, 0);
    };

    document.addEventListener("click", dismissFromOutside);
    return () => {
      document.removeEventListener("click", dismissFromOutside);
    };
  });

  // Most editor requests originate from a click outside the grown card and
  // are handled by the bubbling listener above. Keep this reactive fallback
  // for keyboard/programmatic selection paths so they receive the same
  // choreography instead of leaving a request waiting behind the card.
  $effect(() => {
    if (!openCard || !panelState.pendingGenerateCardEditorHandoff) return;
    startEditorHandoff();
  });

  function startEditorHandoff() {
    if (
      editorHandoffInFlight ||
      !openCard ||
      !panelState.pendingGenerateCardEditorHandoff
    ) {
      return;
    }

    editorHandoffInFlight = true;
    close(() => {
      panelState.completeGenerateCardEditorHandoff();
      editorHandoffInFlight = false;
    });
  }

  function close(onSettled?: () => void) {
    const card = openCard;
    if (!card) return;
    const returnLoopFocus =
      card === "loop" && !onSettled && !!root?.contains(document.activeElement);
    morphGenerateCard(card, () => panelState.closeGenerateCard(), {
      onSettled:
        onSettled || returnLoopFocus
          ? () => {
              onSettled?.();
              // The LOOP tile stays hidden through the card morph. A Svelte
              // tick lands too early, so focus it only after morph settlement.
              // Leave any newer focus target alone.
              if (
                !returnLoopFocus ||
                panelState.openGenerateCard ||
                document.activeElement !== document.body
              ) {
                return;
              }
              document
                .querySelector<HTMLElement>(
                  '.card-wrapper[data-card-id="loop"] button, .card-wrapper[data-card-id="loop"] [tabindex="0"]'
                )
                ?.focus({ preventScroll: true });
            }
          : undefined,
    });
  }

  // Focus inside a non-modal dialog owns the first Escape; the global
  // shortcut defers to it (see shouldDeferEscapeShortcut's role="dialog"
  // check), so it is answered here instead.
  //
  // Two ways a nested field can keep this Escape for itself: it already
  // handled the key (defaultPrevented), such as SavedSetupRow's rename input
  // canceling its own rename, or it is an editable target that has not called
  // preventDefault but still owns the first press by the escape-routing
  // contract. Either way the stage defers instead of closing on top of it.
  //
  // The stage checks only editable targets and defaultPrevented rather than
  // the shared shouldDeferEscapeShortcut owner list, because its own root is
  // already a non-modal role="dialog" answering the first Escape; applying
  // that list again here would have the stage defer to itself. LOOP's
  // selected component button does carry aria-expanded="true", one of the
  // list's other owners, and the stage intentionally still closes on top of
  // it: that button owns no Escape press of its own. [role='tree'],
  // [data-escape-shortcut-local] owners, and fullscreen are likewise not
  // deferred here, and none of Customize, LOOP, or Setups mounts something
  // that actually handles Escape itself.
  function onKeydown(event: KeyboardEvent): void {
    if (
      event.key !== "Escape" ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      event.defaultPrevented ||
      isEditableKeyboardTarget(event.target)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    close();
  }
</script>

{#snippet body(titleId: string)}
  {#if openCard === "customize"}
    <!-- The kept panel, moved in by holdCustomize. -->
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
      handRelationship={loop.handRelationship}
      layout="responsive"
      {titleId}
    />
  {:else if openCard === "tnd"}
    <TnDPanel
      handRelationship={tnd.handRelationship}
      propRelationship={tnd.propRelationship}
      matchHandTurns={tnd.matchHandTurns}
      level={tnd.level}
      blockedHandModes={tnd.blockedHandModes}
      startFeasibility={tnd.startFeasibility}
      section={panelState.tndPanelSection}
      onHandRelationshipChange={tnd.onHandRelationshipChange}
      onPropRelationshipChange={tnd.onPropRelationshipChange}
      onMatchHandTurnsChange={tnd.onMatchHandTurnsChange}
      onClose={close}
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
      onRequestSaveAccount={setups.onRequestSaveAccount}
      onRequestSignIn={setups.onRequestSignIn}
      onClose={close}
      {titleId}
    />
  {/if}
{/snippet}

{#if retainedCustomize}
  {@const kept = retainedCustomize}
  <div class="customize-parking" bind:this={customizeParking}>
    <div class="customize-host" bind:this={customizeHost}>
      <CustomizeExpandedOverlay
        constraintPreset={kept.constraintPreset}
        handPathMode={kept.handPathMode}
        motionTypeFilter={kept.motionTypeFilter}
        startEndOptions={kept.startEndOptions}
        level={kept.level}
        gridMode={kept.gridMode}
        isFreeformMode={kept.isFreeformMode}
        styleBaseline={kept.styleBaseline}
        onConstraintPresetChange={kept.onConstraintPresetChange}
        onHandPathModeChange={kept.onHandPathModeChange}
        onMotionTypeFilterChange={kept.onMotionTypeFilterChange}
        onStartEndChange={kept.onStartEndChange}
        onResetAll={kept.onResetAll}
        onClose={close}
        entrance="none"
        active={openCard === "customize"}
        session={kept}
        titleId={expandedCardTitleId("customize")}
      />
    </div>
  </div>
{/if}

{#key destination}
  {#if destination === "viewport"}
    {#if openCard && (presentation === "sheet" || presentation === "float")}
      <!-- Pointer-only: X and Escape are the keyboard and screen reader
           routes to the same close. -->
      <div
        class="expanded-card-backdrop"
        aria-hidden="true"
        onclick={() => close()}
        use:portal
        transition:backdropFade={backdropMotion()}
      ></div>
    {/if}
    {#if openCard}
      <div
        class="expanded-card-stage"
        data-destination="viewport"
        data-presentation={presentation}
        data-card-id={openCard}
        role="dialog"
        aria-labelledby={expandedCardTitleId(openCard)}
        tabindex="-1"
        bind:this={root}
        onkeydown={onKeydown}
        use:holdCustomize={{
          held: openCard === "customize",
          host: customizeHost,
        }}
        use:portal
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
        transition:stageScale={stageEntrance()}
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
      use:holdCustomize={{
        held: openCard === "customize",
        host: customizeHost,
      }}
      use:claimedViewTransitionName={{
        name: generateCardMorphName(openCard),
      }}
      transition:stageScale={stageEntrance()}
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

  .customize-parking {
    display: none;
  }

  /* No box of its own: the panel inside sizes to the stage root. The
     presentation rules below reach through it with :global, since it is
     moved into the root at runtime where the compiler cannot see it. */
  .customize-host {
    display: contents;
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

  .expanded-card-stage[data-destination="stage"][data-card-id="loop"] {
    /* Use the card area as the height limit, including for a long Combo. */
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(100%, 880px);
    height: 100%;
    margin-inline: auto;
  }

  .expanded-card-stage[data-destination="stage"][data-card-id="loop"]
    > :global(.loop-expanded-overlay) {
    position: relative;
    inset: auto;
    width: 100%;
    min-height: 0;
    max-height: 100%;
  }

  /* A phone held upright: the whole screen, bottom nav included. */
  .expanded-card-stage[data-presentation="fill"] {
    position: fixed;
    inset: 0;
    z-index: var(--z-drawer, 400);
    background: var(--theme-surface, #101018);
  }

  /* Edge to edge: the overlay chrome's rounded border is for the in-grid
     case. */
  .expanded-card-stage[data-presentation="fill"]
    > :global(.generation-settings-overlay),
  .expanded-card-stage[data-presentation="fill"]
    > :global(.customize-host)
    > :global(.generation-settings-overlay) {
    border-radius: 0;
    border: none;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }

  /* A desktop window too short for the LOOP stage: centered over the dimmed
     workspace. */
  .expanded-card-stage[data-presentation="centered"] {
    position: fixed;
    inset: 0;
    z-index: var(--z-drawer, 400);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(
      in srgb,
      var(--theme-surface, #101018) 76%,
      transparent
    );
  }

  .expanded-card-stage[data-presentation="centered"]
    > :global(.loop-expanded-overlay) {
    position: relative;
    inset: auto;
    width: min(100%, 880px);
    max-height: calc(100dvh - 32px);
  }

  .expanded-card-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-drawer, 400);
    background: color-mix(
      in srgb,
      var(--theme-surface, #101018) 76%,
      transparent
    );
  }

  /* The bottom panel. The stage root is the panel's own box, not a full-screen
     layer around it, so the card morph carries the card into the panel. The
     height fits Timing and direction (460px), Setups and LOOP without
     scrolling at an unfolded foldable's 707px width. Customize gets a taller
     box below, and its overview fits whatever box it gets. */
  .expanded-card-stage[data-presentation="sheet"] {
    position: fixed;
    inset: auto 0 0;
    z-index: calc(var(--z-drawer, 400) + 1);
    width: min(100%, 880px);
    height: min(30rem, calc(100dvh - 16px));
    margin-inline: auto;
  }

  /* Customize draws its sixteen-cell placement previews as large as its box
     allows (customize-overview-layout.ts). In a 30rem box they dropped to
     plain rows, so it takes up to 46rem wherever the window has it. */
  .expanded-card-stage[data-presentation="sheet"][data-card-id="customize"] {
    height: min(46rem, calc(100dvh - 16px));
  }

  /* LOOP's content has a height of its own (a Combo is taller than a Single),
     so it sizes its panel. */
  .expanded-card-stage[data-presentation="sheet"][data-card-id="loop"] {
    height: auto;
  }

  .expanded-card-stage[data-presentation="sheet"][data-card-id="loop"]
    > :global(.loop-expanded-overlay) {
    position: relative;
    inset: auto;
    max-height: calc(100dvh - 16px);
  }

  /* The panel rests on the bottom edge: only its top corners round. */
  .expanded-card-stage[data-presentation="sheet"]
    > :global(.generation-settings-overlay),
  .expanded-card-stage[data-presentation="sheet"]
    > :global(.customize-host)
    > :global(.generation-settings-overlay),
  .expanded-card-stage[data-presentation="sheet"]
    > :global(.loop-expanded-overlay) {
    border-bottom: none;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }

  /* A stacked window with room to spare: the panel floats centered over the
     dimmed workspace. The root is still the panel's own box, so the card
     morph lands in it, and the panel keeps its full rounded border. */
  .expanded-card-stage[data-presentation="float"] {
    position: fixed;
    inset: 0;
    margin: auto;
    z-index: calc(var(--z-drawer, 400) + 1);
    width: min(100% - 32px, 880px);
    height: min(30rem, calc(100dvh - 32px));
  }

  /* 46rem fits Customize's two placement previews at their width-capped size
     beside the Style controls, up to the 880px width. */
  .expanded-card-stage[data-presentation="float"][data-card-id="customize"] {
    height: min(46rem, calc(100dvh - 32px));
  }

  /* LOOP's content sizes its panel (a Combo is taller than a Single). */
  .expanded-card-stage[data-presentation="float"][data-card-id="loop"] {
    height: fit-content;
    max-height: calc(100dvh - 32px);
  }

  .expanded-card-stage[data-presentation="float"][data-card-id="loop"]
    > :global(.loop-expanded-overlay) {
    position: relative;
    inset: auto;
    max-height: calc(100dvh - 32px);
  }
</style>
