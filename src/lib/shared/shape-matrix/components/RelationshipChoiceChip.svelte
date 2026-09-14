<script lang="ts">
  let {
    accent,
    icon = null,
    code,
    compactCode = code,
    label,
    active = false,
    disabled = false,
    compact = false,
    ariaLabel,
    onpick,
  }: {
    accent: string;
    icon?: string | null;
    code: string;
    compactCode?: string;
    label: string;
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
  <span class="choice-copy">
    <strong>
      <span class="code-compact">{compactCode}</span>
      <span class="code-wide">{code}</span>
    </strong>
    <small>{label}</small>
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
     one through its icon and code, but the surface stays near the panel. The
     chosen chip then advances on four axes at once — ring, fill, glow, mark. */
  .relationship-choice {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.5rem 0.35rem;
    border: 1px solid color-mix(in srgb, var(--choice-accent) 22%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--choice-accent) 5%, transparent);
    color: var(--theme-text, #fff);
    font: inherit;
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

  .choice-icon {
    width: 1.55rem;
    height: 1.55rem;
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
    text-align: center;
  }

  .choice-copy strong,
  .choice-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .relationship-choice.compact {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.4rem;
    padding: 0.3rem 0.45rem;
  }
  .compact .choice-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
  .compact .choice-copy {
    text-align: left;
  }

  .choice-copy strong {
    color: color-mix(in srgb, var(--choice-accent) 80%, white);
    font-size: var(--font-size-compact, 0.75rem);
    letter-spacing: 0.035em;
    transition: color var(--duration-fast, 150ms) ease;
  }

  .relationship-choice.active .choice-copy strong {
    color: color-mix(in srgb, var(--choice-accent) 30%, white);
  }

  .relationship-choice.active .choice-copy small {
    color: color-mix(in srgb, var(--choice-accent) 22%, white);
  }

  .code-wide {
    display: none;
  }

  /* Six choices are tighter at ordinary desktop split widths than they are on
     a full-width phone row. Spell the relationship out only when the drill has
     enough room for every family; otherwise the shared VTG code stays intact. */
  @container shape-matrix-drill (min-width: 48rem) {
    .code-compact {
      display: none;
    }

    .code-wide {
      display: inline;
    }
  }

  .choice-copy small {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.64));
    font-size: var(--font-size-compact, 0.75rem);
  }

  @container shape-matrix-drill (max-width: 30rem) {
    .relationship-choice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.4rem;
      justify-content: start;
      padding: 0.3rem 0.45rem;
    }

    .choice-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .choice-copy {
      text-align: left;
    }
  }

  @container shape-matrix-drill (min-width: 42rem) and (max-height: 24rem) {
    .relationship-choice {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.4rem;
      justify-content: start;
      padding: 0.3rem 0.45rem;
    }

    .choice-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .choice-copy {
      text-align: left;
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
