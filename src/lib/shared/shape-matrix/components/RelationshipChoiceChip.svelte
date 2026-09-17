<!-- src/lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte
  One timing-and-direction choice. The element icon carries the family's code
  in its art, so it is the identifier and is drawn large; beside it (or under
  it, in a narrow drill) the family is spelled out as two stacked words,
  timing over direction, which is what the code abbreviates. The element's
  name (Water, Air) is not repeated in the box: the icon and accent already
  say it, and the words a learner is choosing between are the timing and the
  direction. -->
<script lang="ts">
  let {
    accent,
    icon = null,
    timing,
    direction,
    active = false,
    disabled = false,
    compact = false,
    ariaLabel,
    onpick,
  }: {
    accent: string;
    icon?: string | null;
    timing: string;
    direction: string;
    active?: boolean;
    disabled?: boolean;
    compact?: boolean;
    ariaLabel: string;
    onpick: () => void;
  } = $props();
</script>

<button
  type="button"
  class="relationship-choice"
  class:active
  class:compact
  style="--choice-accent: {accent}"
  aria-pressed={active}
  aria-label={ariaLabel}
  {disabled}
  onclick={onpick}
>
  {#if icon}
    <img class="choice-icon" src={icon} alt="" />
  {:else}
    <span class="choice-dot" aria-hidden="true"></span>
  {/if}
  <!-- Timing and direction are the two halves of one name, so they share
       one weight and colour; a dimmer second line read as a caption. -->
  <span class="choice-copy">
    <strong>{timing}</strong>
    <strong>{direction}</strong>
  </span>
  <!-- Colour alone did not answer "which one did I pick?" across six element
       accents, several of them dark. The mark is always in the box and sits on
       the corner, outside the content area, so choosing one moves nothing. -->
  <span class="choice-check" aria-hidden="true">
    <i class="fas fa-check"></i>
  </span>
</button>

<style>
  /* Unchosen chips are a quiet set: the element accent still identifies each
     one through its icon and words, but the surface stays near the panel. The
     chosen chip then advances on four axes at once — ring, fill, glow, mark.

     Shape: the icon carries the family's code in its art, so it is the thing
     to enlarge. A narrow drill stacks the icon over the two centred words; a
     wide one (55rem and up, where six chips are about 8.5rem or more each)
     puts the icon on the left and the words on the right, timing over
     direction. The short-wide split stays in the row shape at a smaller
     scale because it is height-bound. */
  .relationship-choice {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.45rem 0.35rem;
    border: 1px solid color-mix(in srgb, var(--choice-accent) 22%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--choice-accent) 5%, transparent);
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: center;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .relationship-choice:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--choice-accent) 55%, transparent);
    background: color-mix(in srgb, var(--choice-accent) 14%, transparent);
    transform: translateY(-1px);
  }

  .relationship-choice.active {
    border-color: var(--choice-accent);
    background: color-mix(in srgb, var(--choice-accent) 30%, transparent);
    /* The ring is drawn inside the existing 1px border, so weight changes
       nothing about the box the row measures. */
    box-shadow:
      inset 0 0 0 2px var(--choice-accent),
      0 0 18px color-mix(in srgb, var(--choice-accent) 42%, transparent);
  }

  .choice-check {
    position: absolute;
    top: -0.35rem;
    inset-inline-end: -0.35rem;
    display: grid;
    place-items: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    /* A light tint of the element colour, so the glyph reads at this size.
       The accent at full strength is mid-dark for water, fire and moon, and a
       9px mark on it was a coloured dot rather than a check. */
    background: color-mix(in srgb, var(--choice-accent) 32%, white);
    box-shadow: 0 0 0 2px var(--theme-panel-bg, #101721);
    color: #06090d;
    font-size: 0.68rem;
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .relationship-choice.active .choice-check {
    opacity: 1;
    transform: scale(1);
  }

  .relationship-choice:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .relationship-choice:focus-visible {
    outline: 2px solid var(--choice-accent);
    outline-offset: 2px;
  }

  /* The baked-in code (SS, TO…) was illegible at 1.55rem. */
  .choice-icon {
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 auto;
    object-fit: contain;
    opacity: 0.68;
    transition: opacity var(--duration-fast, 150ms) ease;
  }

  .relationship-choice.active .choice-icon,
  .relationship-choice:hover:not(:disabled) .choice-icon {
    opacity: 1;
  }

  .choice-dot {
    width: 0.72rem;
    height: 0.72rem;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--choice-accent);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--choice-accent) 42%, transparent);
  }

  .choice-copy {
    display: grid;
    width: 100%;
    min-width: 0;
    line-height: 1.2;
  }

  .choice-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: color-mix(in srgb, var(--choice-accent) 80%, white);
    font-size: var(--font-size-compact, 0.75rem);
    letter-spacing: 0.02em;
    transition: color var(--duration-fast, 150ms) ease;
  }

  .relationship-choice.active .choice-copy strong {
    color: color-mix(in srgb, var(--choice-accent) 30%, white);
  }

  /* A host outside the drill (the guide's explorer) asks for the row shape
     outright at a smaller scale. */
  .relationship-choice.compact {
    flex-direction: row;
    gap: 0.45rem;
    padding: 0.3rem 0.5rem;
    text-align: left;
  }
  .compact .choice-icon {
    width: 2.1rem;
    height: 2.1rem;
  }
  .compact .choice-copy {
    width: auto;
    flex: 0 1 auto;
  }

  @container shape-matrix-drill (min-width: 55rem) {
    .relationship-choice {
      flex-direction: row;
      gap: 0.5rem;
      padding: 0.45rem 0.55rem;
      text-align: left;
    }

    .choice-icon {
      width: 2.75rem;
      height: 2.75rem;
    }

    .choice-copy {
      width: auto;
      flex: 0 1 auto;
    }

    .choice-copy strong {
      font-size: var(--font-size-min, 0.875rem);
    }
  }

  @container shape-matrix-drill (min-width: 42rem) and (max-height: 24rem) {
    .relationship-choice {
      flex-direction: row;
      justify-content: start;
      gap: 0.45rem;
      padding: 0.3rem 0.5rem;
      text-align: left;
    }

    .choice-icon {
      width: 2.1rem;
      height: 2.1rem;
    }

    .choice-copy {
      width: auto;
      flex: 0 1 auto;
    }

    .choice-copy strong {
      font-size: var(--font-size-compact, 0.75rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .relationship-choice,
    .choice-icon,
    .choice-check,
    .choice-copy strong {
      transition: none;
    }

    .relationship-choice:hover:not(:disabled) {
      transform: none;
    }

    .choice-check {
      transform: none;
    }
  }
</style>
