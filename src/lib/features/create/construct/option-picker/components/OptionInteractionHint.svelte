<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { calculateOptionInteractionHintPosition } from "../services/option-interaction-hint-position";
  import { safe } from "#lib/shared/attract/domain/annotations.js";

  const { containerElement, onDismiss } = $props<{
    containerElement: HTMLElement | null;
    onDismiss: () => void;
  }>();

  let hintElement = $state<HTMLElement | null>(null);
  let isPositioned = $state(false);
  let position = $state({
    top: 0,
    left: 0,
    arrowLeft: 24,
    placement: "above" as "above" | "below",
  });

  function findFirstVisibleOption(container: HTMLElement): HTMLElement | null {
    const containerBounds = container.getBoundingClientRect();
    const options = container.querySelectorAll<HTMLElement>(safe("option"));

    return (
      Array.from(options).find((option) => {
        const bounds = option.getBoundingClientRect();
        const style = getComputedStyle(option);
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          bounds.right > containerBounds.left + 1 &&
          bounds.left < containerBounds.right - 1 &&
          bounds.bottom > containerBounds.top + 1 &&
          bounds.top < containerBounds.bottom - 1
        );
      }) ?? null
    );
  }

  function findTopObstacle(
    container: HTMLElement,
    anchor: HTMLElement
  ): { element: HTMLElement | null; inset: number } {
    const containerBounds = container.getBoundingClientRect();
    const anchorBounds = anchor.getBoundingClientRect();
    const obstacles = container.querySelectorAll<HTMLElement>(
      ".utility-shell, .picker-header-slot, .compact-header-slot, .controls-corner"
    );
    let element: HTMLElement | null = null;
    let bottom = containerBounds.top;

    for (const obstacle of obstacles) {
      const bounds = obstacle.getBoundingClientRect();
      const style = getComputedStyle(obstacle);
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        style.visibility === "hidden" ||
        style.display === "none" ||
        bounds.bottom <= containerBounds.top ||
        bounds.top >= anchorBounds.top
      ) {
        continue;
      }

      if (bounds.bottom > bottom) {
        element = obstacle;
        bottom = bounds.bottom;
      }
    }

    return {
      element,
      inset: Math.max(0, bottom - containerBounds.top),
    };
  }

  $effect(() => {
    const container = containerElement;
    const hint = hintElement;
    if (!container || !hint) return;

    let frame = 0;
    let observedAnchor: HTMLElement | null = null;
    let observedTopObstacle: HTMLElement | null = null;
    let settlingTimers: number[] = [];

    const resizeObserver = new ResizeObserver(scheduleSettledPositionUpdates);
    const mutationObserver = new MutationObserver(
      scheduleSettledPositionUpdates
    );

    function updatePosition() {
      if (!hint) return;
      frame = 0;
      const anchor = findFirstVisibleOption(container);
      if (!anchor) {
        isPositioned = false;
        return;
      }

      if (anchor !== observedAnchor) {
        if (observedAnchor) resizeObserver.unobserve(observedAnchor);
        observedAnchor = anchor;
        resizeObserver.observe(anchor);
      }

      const topObstacle = findTopObstacle(container, anchor);
      if (topObstacle.element !== observedTopObstacle) {
        if (observedTopObstacle) resizeObserver.unobserve(observedTopObstacle);
        observedTopObstacle = topObstacle.element;
        if (observedTopObstacle) resizeObserver.observe(observedTopObstacle);
      }

      position = calculateOptionInteractionHintPosition({
        container: container.getBoundingClientRect(),
        anchor: anchor.getBoundingClientRect(),
        hintWidth: hint.offsetWidth,
        hintHeight: hint.offsetHeight,
        topInset: topObstacle.inset,
      });
      isPositioned = true;
    }

    function schedulePositionUpdate() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    }

    // The picker debounces its own fit calculation after a resize. Recheck the
    // anchor through that settling window so the bubble follows the first tile
    // instead of preserving its pre-resize coordinates.
    function scheduleSettledPositionUpdates() {
      schedulePositionUpdate();
      settlingTimers.forEach((timer) => clearTimeout(timer));
      settlingTimers = [120, 320, 700].map((delay) =>
        window.setTimeout(schedulePositionUpdate, delay)
      );
    }

    resizeObserver.observe(container);
    resizeObserver.observe(hint);
    mutationObserver.observe(container, { childList: true, subtree: true });
    container.addEventListener("scroll", scheduleSettledPositionUpdates, true);
    container.addEventListener(
      "transitionend",
      scheduleSettledPositionUpdates,
      true
    );
    window.addEventListener("resize", scheduleSettledPositionUpdates);
    scheduleSettledPositionUpdates();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      settlingTimers.forEach((timer) => clearTimeout(timer));
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener(
        "scroll",
        scheduleSettledPositionUpdates,
        true
      );
      container.removeEventListener(
        "transitionend",
        scheduleSettledPositionUpdates,
        true
      );
      window.removeEventListener("resize", scheduleSettledPositionUpdates);
    };
  });
</script>

<aside
  class="option-interaction-hint"
  class:is-positioned={isPositioned}
  data-placement={position.placement}
  bind:this={hintElement}
  style:top={`${position.top}px`}
  style:left={`${position.left}px`}
  style:--hint-arrow-left={`${position.arrowLeft}px`}
  aria-label={t("create_ui_option_controls")}
>
  <span class="hint-copy">
    <strong>{t("create_ui_tap_to_add")}</strong>
    <span>{t("create_ui_hold_to_preview")}</span>
  </span>
  <button
    type="button"
    onclick={onDismiss}
    aria-label={t("create_ui_dismiss_option_hint")}
  >
    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
  </button>
</aside>

<style>
  .option-interaction-hint {
    position: absolute;
    z-index: 12;
    width: min(13rem, calc(100% - 1rem));
    min-height: 4.5rem;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0.7rem 3.25rem 0.7rem 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
    border-radius: 0.8rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 90%,
      var(--theme-accent) 10%
    );
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--theme-accent) 14%, transparent),
      0 0.75rem 2rem -0.75rem rgba(0, 0, 0, 0.72);
    color: var(--theme-text);
    pointer-events: none;
    opacity: 0;
    transform: translateY(0.35rem) scale(0.98);
    transform-origin: center;
    transition:
      opacity var(--duration-normal) var(--ease-out),
      transform var(--duration-normal) var(--ease-out);
  }

  .option-interaction-hint.is-positioned {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .option-interaction-hint::after {
    position: absolute;
    left: var(--hint-arrow-left);
    width: 0.75rem;
    height: 0.75rem;
    content: "";
    background: inherit;
    transform: translateX(-50%) rotate(45deg);
  }

  .option-interaction-hint[data-placement="above"]::after {
    bottom: -0.43rem;
    border-right: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
  }

  .option-interaction-hint[data-placement="below"]::after {
    top: -0.43rem;
    border-top: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
    border-left: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
  }

  .hint-copy {
    display: grid;
    gap: 0.15rem;
    line-height: 1.2;
  }

  .hint-copy strong {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
  }

  .hint-copy > span {
    color: color-mix(in srgb, var(--theme-text) 74%, var(--theme-panel-bg));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  button {
    position: absolute;
    top: 50%;
    right: 0.3rem;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--theme-text) 16%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-card-bg) 78%, transparent);
    color: color-mix(in srgb, var(--theme-text) 74%, var(--theme-panel-bg));
    cursor: pointer;
    pointer-events: auto;
    transform: translateY(-50%);
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  button:hover {
    border-color: color-mix(in srgb, var(--theme-accent) 48%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 18%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* At a native 4K workspace the option pane is much wider, while the app's
     root type stays at its desktop size. Give this one-time teaching cue enough
     physical presence to remain readable across a room. */
  @container (min-width: 96rem) {
    .option-interaction-hint {
      width: 19rem;
      min-height: 6rem;
      padding-inline: 1.25rem 4rem;
    }

    .hint-copy {
      gap: 0.25rem;
    }

    .hint-copy strong {
      font-size: 1.125rem;
    }

    .hint-copy > span {
      font-size: 0.875rem;
    }

    button {
      right: 0.5rem;
      width: 52px;
      height: 52px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .option-interaction-hint,
    button {
      transition: none;
    }
  }
</style>
