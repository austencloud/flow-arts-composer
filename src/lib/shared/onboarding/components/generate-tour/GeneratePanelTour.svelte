<!--
  GeneratePanelTour - Modal wizard that walks through generator settings.

  Purpose-built mini card grid that visually matches the real cards
  (same gradients, same layout) but is pure CSS - no container queries,
  no services, no responsive complexity. Works at any size.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { untrack } from "svelte";
  import { fly, fade } from "svelte/transition";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalFooter from "$lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import {
    generateTourState,
    type GenerateTourStop,
  } from "../../state/generate-tour-state.svelte";
  import type { GeneratorHelpItem } from "$lib/shared/create/domain/generator-help-content";
  import {
    getGeneratorCardHelp,
    getGeneratorCardSpan,
    getGeneratorCardTourLabel,
    getGeneratorPanelCards,
    type GeneratorCardId,
  } from "$lib/shared/create/domain/card-registry";
  import { getCardColor } from "$lib/shared/create/domain/card-colors";
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { getLocale } from "$lib/shared/i18n/i18n.svelte.js";
  import { generatorTourText } from "$lib/shared/create/domain/generator-tour-display";

  let { level = 2 } = $props<{ level?: number }>();

  // Mini card definition - derived from the card registry
  interface MiniCard {
    id: GeneratorCardId;
    header: string;
    value: string;
    gradient: string;
    span: number;
    help: GeneratorHelpItem;
  }

  // Derive mini cards from the shared registry so they stay in sync
  // with the real generator panel automatically.
  const miniCards = $derived.by((): MiniCard[] => {
    getLocale();
    return getGeneratorPanelCards({ isBeginner: level === 1 }).map((entry) => {
      const { header, value } = getGeneratorCardTourLabel(entry);
      return {
        id: entry.id,
        header,
        value,
        gradient: getCardColor(entry.colorKey, BackgroundType.COSMIC),
        span: getGeneratorCardSpan(entry, level === 1),
        help: getGeneratorCardHelp(entry),
      };
    });
  });

  $effect(() => {
    const stops = miniCards.map((card) => card.id);
    // Changing Level refreshes the tour's card list. The state also checks
    // which card the user was viewing; keep that preservation step from
    // turning one refresh into a repeating update.
    untrack(() => generateTourState.setStops(stops));
  });

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  const currentContent = $derived.by((): GeneratorHelpItem | undefined => {
    return miniCards.find((card) => card.id === generateTourState.currentStop)
      ?.help;
  });

  let isOpen = $derived(generateTourState.isActive);

  function handleNext() {
    hapticService?.trigger("selection");
    generateTourState.advance();
  }

  function handleSkip() {
    hapticService?.trigger("selection");
    generateTourState.skip();
  }

  function handleClose() {
    hapticService?.trigger("selection");
    generateTourState.skip();
  }

  function handleCardTap(stop: GenerateTourStop) {
    hapticService?.trigger("selection");
    generateTourState.goToStop(stop);
  }

  function handleRetreat() {
    hapticService?.trigger("selection");
    generateTourState.retreat();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleRetreat();
    }
    // Escape is already handled by BaseModal
  }

  // Card pulse: track which card just became active so it gets a bounce animation
  let pulsingCard = $state<string | null>(null);

  $effect(() => {
    const stop = generateTourState.currentStop;
    pulsingCard = stop;
    const timer = setTimeout(() => (pulsingCard = null), 400);
    return () => clearTimeout(timer);
  });

  // Respect reduced motion preference for content transitions
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Custom transition wrappers that respect reduced motion
  function slideIn(node: Element) {
    return prefersReducedMotion
      ? fade(node, { duration: 150 })
      : fly(node, { x: 30, duration: 250, delay: 200 });
  }

  function slideOut(node: Element) {
    return prefersReducedMotion
      ? fade(node, { duration: 100 })
      : fly(node, { x: -30, duration: 200 });
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseModal
  open={isOpen}
  onclose={handleClose}
  size="md"
  class="tour-modal"
  animation="pop"
  labelledBy="tour-modal-title"
>
  {#if currentContent}
    <button
      class="close-btn"
      onclick={handleClose}
      aria-label={generatorTourText("close_tour", "Close tour")}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>

    <!-- Mini card grid -->
    <div
      class="card-grid"
      role="img"
      aria-label={generatorTourText(
        "cards_highlighted",
        "Generator cards - {name} highlighted"
      ).replace("{name}", currentContent.name)}
    >
      {#each miniCards as card}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="mini-card"
          class:active={card.id === generateTourState.currentStop}
          class:dim={card.id !== generateTourState.currentStop}
          class:pulse={card.id === pulsingCard}
          class:generate-btn={card.id === "generate-button"}
          style:grid-column="span {card.span}"
          style:background={card.gradient}
          onclick={() => handleCardTap(card.id)}
          role="button"
          tabindex="0"
          aria-label={generatorTourText(
            "view_card_help",
            "View {name} help"
          ).replace("{name}", card.header || card.value)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardTap(card.id);
            }
          }}
        >
          {#if card.header}
            <span class="card-header">{card.header}</span>
          {/if}
          <span
            class="card-value"
            class:generate-value={card.id === "generate-button"}
            >{card.value}</span
          >
        </div>
      {/each}
    </div>

    <!-- Info section - outer container holds layout, inner content transitions.
         aria-live is on this stable wrapper (not the {#key}'d child, which
         gets destroyed/recreated) so screen readers announce each stop swap
         without focus moving, per the tours' announcement convention. -->
    <div class="tour-info" aria-live="polite">
      {#key generateTourState.currentStop}
        <div class="tour-info-content" in:slideIn out:slideOut>
          <div class="info-header">
            <div class="info-icon" style:background={currentContent.color}>
              <i class="fas {currentContent.icon}" aria-hidden="true"></i>
            </div>
            <div class="info-titles">
              <h2 id="tour-modal-title" class="info-title">
                {currentContent.name}
              </h2>
              <p class="info-subtitle">{currentContent.shortDesc}</p>
            </div>
          </div>

          <div class="info-body">
            <p class="description">{currentContent.fullDesc}</p>

            {#if currentContent.images && currentContent.images.length > 0}
              <div class="image-grid">
                {#each currentContent.images as image}
                  <figure class="image-item">
                    <img src={image.src} alt={image.label} />
                    <figcaption>{image.label}</figcaption>
                  </figure>
                {/each}
              </div>
            {/if}

            {#if currentContent.bullets && currentContent.bullets.length > 0}
              <ul class="bullet-list">
                {#each currentContent.bullets as bullet}
                  <li>{bullet}</li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {/key}
    </div>
  {/if}

  {#snippet footer()}
    <ModalFooter align="between">
      <div
        class="tour-dots"
        aria-label={generatorTourText("step_count", "Step {current} of {total}")
          .replace("{current}", String(generateTourState.currentStopIndex + 1))
          .replace("{total}", String(generateTourState.totalStops))}
      >
        {#each Array(generateTourState.totalStops) as _, i}
          <div
            class="dot"
            class:active={i === generateTourState.currentStopIndex}
            class:completed={i < generateTourState.currentStopIndex}
          ></div>
        {/each}
      </div>
      <div class="tour-actions">
        <!-- data-ghost-kind="dismiss": an auto-opening tour is a blocker for the
             presentation-mode ghost, whose whole world reads as empty behind an
             overlay. Skip is always the safe way out. -->
        <button
          class="ghost"
          data-ghost="safe"
          data-ghost-kind="dismiss"
          data-ghost-label={generatorTourText("skip", "Skip")}
          onclick={handleSkip}>{generatorTourText("skip", "Skip")}</button
        >
        <button
          class="primary"
          onclick={handleNext}
          aria-label={generateTourState.isLastStop
            ? generatorTourText("finish_tour", "Finish tour")
            : generatorTourText("next_step", "Next step")}
        >
          {generateTourState.isLastStop
            ? generatorTourText("got_it", "Got it")
            : generatorTourText("next", "Next")}
          {#if !generateTourState.isLastStop}
            <i class="fas fa-arrow-right next-arrow" aria-hidden="true"></i>
          {/if}
        </button>
      </div>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  /*
   * Dialog sizing: viewport-proportional, never overflows.
   * Uses size="md" from BaseModal which gives us flex column layout
   * with modal-body { flex: 1 }. We override width/height here.
   *
   * Layout stack (all flex):
   *   dialog  →  modal-content-wrapper  →  modal-body
   *     ├─ card-grid      (flex-shrink: 0 - always fully visible)
   *     ├─ tour-info       (flex: 1 - fills remaining space)
   *     │   ├─ info-header (flex-shrink: 0)
   *     │   └─ info-body   (flex: 1, overflow-y: auto - scrolls if needed)
   *     └─ footer          (flex-shrink: 0 - always visible, handled by BaseModal)
   */
  :global(dialog.tour-modal) {
    width: min(92vw, 560px) !important;
    height: min(82vh, 650px) !important;
    max-height: 82vh !important;
    position: relative;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
    padding: 14px 16px;
    background: var(--theme-surface-overlay, rgba(0, 0, 0, 0.25));
    flex-shrink: 0;
  }

  .mini-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 10px 6px;
    border-radius: 10px;
    transition:
      opacity 0.25s ease,
      box-shadow 0.25s ease;
    position: relative;
    min-height: 65px;
    cursor: pointer;
  }

  .mini-card.generate-btn {
    min-height: 65px;
  }

  .card-header {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    line-height: 1;
    transform: scale(0.75);
    transform-origin: center;
  }

  .card-value {
    font-size: 16px;
    font-weight: 700;
    color: white;
    line-height: 1.2;
  }

  .generate-value {
    font-size: 14px;
  }

  .mini-card.active {
    box-shadow:
      0 0 0 2px var(--semantic-info, #3b82f6),
      0 0 14px var(--semantic-info-glow, rgba(59, 130, 246, 0.35));
    z-index: 1;
  }

  .mini-card.dim {
    opacity: 0.3;
  }

  @keyframes cardPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
    }
  }

  .mini-card.pulse {
    animation: cardPulse 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Outer container holds layout space; inner content transitions in/out */
  .tour-info {
    position: relative;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }

  .tour-info-content {
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
  }

  .info-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .info-icon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: white;
    flex-shrink: 0;
  }

  .info-titles {
    flex: 1;
    min-width: 0;
  }

  .info-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--theme-text, white);
    line-height: 1.2;
  }

  .info-subtitle {
    margin: 2px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: var(--theme-surface-overlay, rgba(0, 0, 0, 0.5));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .close-btn:hover {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  /* Scrollable content area - only this part scrolls */
  .info-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .description {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .image-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .image-item {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .image-item img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .image-item figcaption {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
    line-height: 1.3;
  }

  .bullet-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bullet-list li {
    position: relative;
    padding-left: 16px;
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.85));
  }

  .bullet-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--theme-accent, #3b82f6);
  }

  .tour-dots {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    transition: all 0.2s ease;
  }

  .dot.active {
    background: var(--semantic-info, #3b82f6);
    transform: scale(1.25);
  }

  .dot.completed {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.4));
  }

  .tour-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .next-arrow {
    font-size: 12px;
    margin-left: 4px;
  }

  @media (max-width: 520px) {
    :global(dialog.tour-modal) {
      width: calc(100% - 24px) !important;
      height: min(88vh, 680px) !important;
    }

    .card-grid {
      gap: 4px;
      padding: 10px 12px;
    }

    .mini-card {
      padding: 6px 4px;
      min-height: 40px;
    }

    .card-value {
      font-size: 13px;
    }

    .card-header {
      transform: scale(0.65);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot,
    .mini-card,
    .close-btn {
      transition: none;
    }
    .mini-card.pulse {
      animation: none;
    }
  }
</style>
