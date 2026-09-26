<!--
  GenerateEmptyState.svelte

  Fills the collapsed-workspace region on the Generate tab when there is no
  sequence yet. Two states:

  1. First visit (tour not offered, not completed) → a gentle, inline opt-in
     offer to walk through the generator options. NOT a modal — it lives in the
     empty workspace slot, so it never interrupts (honors the deliberate
     "new users get zero modal interruptions" stance in onboarding-flags.ts).
  2. Otherwise → the plain "Tap Generate to create your sequence" hint.

  Accepting starts the existing GeneratePanelTour (mounted in GeneratePanel).
  The tour itself, its state, and its animations are untouched — this only
  changes how a first-time user is offered it (was: a permanent ? button).

  Offer resolution (taken OR dismissed) is per-account: generateTourState
  syncs it to Firestore, so a user who dealt with the offer on one device is
  not re-offered on another. The offer stays hidden until that FROM-cloud pull
  resolves (cloudSynced) so it never flashes for a returning user.

  The one-tap "Generate one for me" starter (SP3b) that used to render here on
  an empty Construct was removed 2026-07-29 at Austen's direction — it
  generated, loaded AND auto-saved a sequence the user never asked for.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { generateTourState } from "$lib/shared/onboarding/state/generate-tour-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    logGenerateTourAccepted,
    logGenerateTourDeclined,
    logGenerateTourOfferViewed,
  } from "$lib/shared/analytics/services/onboarding-events";

  let hapticService = $state<ReturnType<typeof getHapticFeedback> | null>(null);

  // Show the first-run offer only once the account sync has resolved, and only
  // if the offer hasn't already been taken or dismissed on any device.
  const showOffer = $derived(
    generateTourState.cloudSynced && !generateTourState.hasResolvedOffer
  );

  onMount(() => {
    try {
      hapticService = getHapticFeedback();
    } catch {
      /* optional */
    }
  });

  let offerViewRecorded = false;
  $effect(() => {
    if (!showOffer || offerViewRecorded) return;
    offerViewRecorded = true;
    logGenerateTourOfferViewed();
  });

  function acceptTour() {
    hapticService?.trigger("selection");
    logGenerateTourAccepted();
    generateTourState.markOffered();
    generateTourState.start("first_run_offer");
  }

  function declineTour() {
    hapticService?.trigger("selection");
    logGenerateTourDeclined();
    generateTourState.markOffered();
  }
</script>

<!--
  The offer↔hint swap is a true in-place crossfade with zero layout shift, via
  the shared Crossfade primitive (grid-stack + {#key}). The 120ms in-delay is a
  deliberate gentle stagger; reduced-motion is handled inside the primitive.
-->
<div class="empty-state">
  <Crossfade key={showOffer} duration={DURATION.emphasis} delay={120}>
    {#if showOffer}
      <div class="tour-offer">
        <div class="offer-copy">
          <p class="offer-title">{t("create_ui_first_time_generating")}</p>
          <p class="offer-sub">
            {t("create_ui_a_quick_tour_shows_what_each_option_does")}
          </p>
        </div>
        <div class="offer-actions">
          <PanelButton variant="primary" onclick={acceptTour}>
            Show tour
          </PanelButton>
          <PanelButton variant="secondary" onclick={declineTour}>
            Explore options
          </PanelButton>
        </div>
      </div>
    {:else}
      <p class="workspace-hint">
        {t("create_ui_tap_generate_to_create_your_sequence")}
      </p>
    {/if}
  </Crossfade>
</div>

<style>
  /* Centers the Crossfade (which owns the offer↔hint stack internally) and
     holds the upper-region spacing once. The in-place crossfade itself lives in
     the shared primitive now, not here. */
  .empty-state {
    flex-shrink: 0;
    display: grid;
    justify-items: center;
    margin-top: clamp(2.5rem, 11vmin, 6.5rem);
    padding: 0 1rem;
  }

  /* Keep the hint above the centered settings without putting it back in flow.
     The band is defined by both edges rather than by a single bottom anchor:

     - top    = the Level toolbar's own height. That toolbar is PINNED to the
                panel top, so this is a hard floor. The old single-anchor rule
                had no floor, and the taller tour offer grew straight up
                through the level selector.
     - bottom = the card grid's top edge. The grid is centered in the stage
                BELOW the toolbar, so its center sits half a toolbar under the
                panel midpoint — that half-toolbar was the other half of the
                old miss. Its own max-height is the panel's minus the toolbar
                allowance the settings container subtracts (~1.75rem once the
                grid gap is halved).

     align-content: end hugs the cards, so the offer and the hint share one
     baseline and swapping between them moves nothing. */
  @media (min-width: 1024px) {
    .empty-state {
      position: absolute;
      z-index: 1;
      right: 0;
      left: 0;
      top: calc(
        var(--generate-level-toolbar-height, 4.75rem) + clamp(8px, 1.5cqh, 20px)
      );
      bottom: calc(
        50cqh - var(--generate-level-toolbar-height, 4.75rem) / 2 +
          var(--settings-generate-panel-half-max-height, min(32.5cqh, 375px)) -
          1.75rem + clamp(16px, 2.5cqh, 34px)
      );
      align-content: end;
      margin-top: 0;
    }
  }

  /* Hint — preserved verbatim from StandardWorkspaceLayout so the non-first-run
     empty state is visually unchanged. cqi tracks the .tool-panel-container
     (container-type: size), this component's parent, so it still scales to one
     line at any width. */
  .workspace-hint {
    margin: 0;
    text-align: center;
    font-family: "Playfair Display", Georgia, serif;
    font-size: clamp(1rem, 4.6cqi, 2rem);
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    color: var(--theme-text, #fff);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  }

  /* Offer — occupies the same upper region as the hint so swapping between
     them moves nothing below (the cards keep their position). */
  .tour-offer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: 30rem;
    text-align: center;
  }

  .offer-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .offer-title {
    margin: 0;
    font-family: "Playfair Display", Georgia, serif;
    font-size: clamp(1.05rem, 4.4cqi, 1.9rem);
    font-weight: 600;
    line-height: 1.2;
    color: var(--theme-text, #fff);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  }

  .offer-sub {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
  }

  .offer-actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Anything wide enough to hold the row gets one compact line instead of a
     four-line slab: copy on the left, actions on the right, the whole unit
     centered and barely taller than the plain hint it replaces. The threshold
     is the row's own width, not the desktop layout seam — a folded-landscape
     phone is 412px tall and wants the height back most of all. */
  @media (min-width: 720px) {
    .tour-offer {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: clamp(0.75rem, 1.5cqi, 1.75rem);
      /* rem, not a percentage: this row's containing block is itself
         shrink-to-fit, so a % cap feeds back on its own content width and
         wraps the row against itself. */
      max-width: 58rem;
      text-align: left;
    }

    .offer-title {
      font-size: clamp(1.15rem, 1.15vw, 1.75rem);
    }

    .offer-sub {
      font-size: clamp(0.85rem, 0.65vw, 1.1rem);
    }

    .offer-actions {
      margin-top: 0;
      flex-wrap: nowrap;
    }
  }

  @media (min-width: 1680px) {
    .workspace-hint {
      font-size: clamp(2rem, 1.5vw, 2.5rem);
    }
  }

  @media (min-width: 2600px) {
    .workspace-hint {
      font-size: clamp(2.5rem, 1.25vw, 3.5rem);
    }

    /* Nothing scales for you at 4K@100% or across a room on a TV, so the offer
       steps with the cards instead of shrinking into punctuation. */
    .offer-title {
      font-size: clamp(1.75rem, 1.05vw, 2.5rem);
    }

    .offer-sub {
      font-size: clamp(1.05rem, 0.6vw, 1.5rem);
    }

    .offer-actions :global(.panel-btn) {
      font-size: clamp(1rem, 0.55vw, 1.35rem);
      padding: 0.9rem 1.75rem;
      border-radius: 12px;
    }
  }
</style>
