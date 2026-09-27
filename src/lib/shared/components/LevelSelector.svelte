<!--
  LevelSelector.svelte

  Single-select difficulty level (1/2/3) that wears the canonical level colours
  — the same DIFFICULTY_LEVELS gradients the card badges, gallery drill tiles
  and deck bento use. Level is the one control in TKA that already HAS a colour
  identity; rendering it in neutral chrome throws that away.

  Deliberately NOT a SegmentedControl (see .claude/rules/chip-primitives.md):
  SegmentedControl takes ONE `color` for the whole group, so it cannot give each
  option its own gradient. Same carve-out the per-option-coloured video filter
  bars take. Everything else about it is single-select semantics.

  Each button always shows its level's numeral in the card-badge gradient, so
  the colour language is legible before you select anything; selection adds the
  level's own tint, border and glow.
-->
<script lang="ts" generics="T extends number = LevelNumber">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    DIFFICULTY_LEVELS,
    DEFAULT_DIFFICULTY_STYLE,
  } from "$lib/shared/config/difficulty-styles";
  import {
    LEVEL_METADATA,
    type LevelNumber,
  } from "$lib/shared/domain/curriculum/level-metadata";

  interface Props {
    value: T;
    onchange: (level: T) => void;
    levels?: readonly T[];
    describe?: (level: T) => { name: string; blurb: string };
    /** Numerals only — for bars too tight to carry the level name. */
    compact?: boolean;
    ariaLabel?: string;
    disabled?: boolean;
  }

  const {
    value,
    onchange,
    levels = [1, 2, 3] as unknown as readonly T[],
    describe,
    compact = false,
    ariaLabel,
    disabled = false,
  }: Props = $props();

  function styleFor(level: T) {
    return DIFFICULTY_LEVELS[level] ?? DEFAULT_DIFFICULTY_STYLE;
  }

  function descriptionFor(level: T): { name: string; blurb: string } {
    const supplied = describe?.(level);
    if (supplied) return supplied;
    const canonical = LEVEL_METADATA[level as LevelNumber];
    if (!canonical)
      return { name: t("create_level_number", { level }), blurb: "" };
    switch (level) {
      case 1:
        return {
          name: t("create_level_base"),
          blurb: t("create_level_base_blurb"),
        };
      case 2:
        return {
          name: t("create_level_whole"),
          blurb: t("create_level_whole_blurb"),
        };
      case 3:
        return {
          name: t("create_level_half"),
          blurb: t("create_level_half_blurb"),
        };
      default:
        return canonical;
    }
  }

  /**
   * The gradient stop nearest 25% is the level's colour on a dark surface: the
   * pale end of the card gradient, bright enough to tint a border or a glow
   * where the dark end would just read as grey.
   */
  function accentFor(level: T): string {
    const stops = styleFor(level).stops;
    let best = stops[0]!;
    for (const stop of stops) {
      if (Math.abs(stop.offset - 0.25) < Math.abs(best.offset - 0.25))
        best = stop;
    }
    return best.color;
  }
</script>

<div
  class="level-selector"
  class:compact
  role="group"
  aria-label={ariaLabel ?? t("create_level_difficulty")}
>
  {#each levels as n (n)}
    {@const meta = descriptionFor(n)}
    <button
      type="button"
      class="lvl"
      class:selected={value === n}
      aria-pressed={value === n}
      aria-label={t("create_level_label", { level: n, name: meta.name })}
      {disabled}
      title={t("create_level_tooltip", {
        level: n,
        name: meta.name,
        blurb: meta.blurb,
      })}
      style="--lvl-bg: {styleFor(n).cssBg}; --lvl-ink: {styleFor(n)
        .text}; --lvl-accent: {accentFor(n)};"
      onclick={() => onchange(n)}
    >
      <span class="numeral">{n}</span>
      {#if !compact}<span class="name">{meta.name}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .level-selector {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
  }

  .lvl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    /* Fixed width per button: the three level names differ in length, and a
       content-sized button would resize the whole bar on selection. */
    width: 12.25rem;
    height: 3rem;
    padding: 0 0.9rem;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    cursor: pointer;
    transition:
      background var(--duration-fast, 0.15s) ease,
      border-color var(--duration-fast, 0.15s) ease,
      box-shadow var(--duration-fast, 0.15s) ease,
      transform var(--duration-fast, 0.15s) ease;
  }

  .level-selector.compact .lvl {
    width: auto;
    padding: 0 0.85rem;
  }

  /* The numeral IS the card badge — same gradient, same serif, same round chip
     the printed cards and gallery tiles wear. */
  .numeral {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.55);
    background: var(--lvl-bg);
    color: var(--lvl-ink);
    font-family: Cambria, Georgia, serif;
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1;
    /* Unselected levels keep their colour but sit back. */
    opacity: 0.62;
    transition:
      opacity var(--duration-fast, 0.15s) ease,
      transform var(--duration-normal, 0.2s) cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow var(--duration-fast, 0.15s) ease;
  }

  .name {
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.62);
    transition: color var(--duration-fast, 0.15s) ease;
  }

  .lvl:hover .numeral {
    opacity: 0.85;
  }

  .lvl:hover .name {
    color: rgba(255, 255, 255, 0.85);
  }

  .lvl:hover:not(.selected) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  /* Selected: the button takes on the level's own colour. */
  .lvl.selected {
    background: color-mix(in srgb, var(--lvl-accent) 18%, transparent);
    border-color: color-mix(in srgb, var(--lvl-accent) 65%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 4px 16px -6px var(--lvl-accent);
  }

  /* The badge steps forward on select — a transform, so it never moves a
     neighbour. */
  .lvl.selected .numeral {
    opacity: 1;
    transform: scale(1.1);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--lvl-accent) 55%, transparent);
  }

  .lvl.selected .name {
    color: white;
  }

  .lvl:active {
    transform: scale(0.98);
  }

  .lvl:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .lvl:disabled:active {
    transform: none;
  }

  .lvl:focus-visible {
    outline: 2px solid var(--theme-accent, #6ea8fe);
    outline-offset: 2px;
  }

  /* Construct and Generate share this control, including its big-screen scale.
     Keeping the ramp here prevents either route from growing a private version
     that jumps in size when the user switches tabs. */
  @media (min-width: 1680px) {
    .level-selector {
      gap: 0.75rem;
    }

    .lvl {
      width: 14rem;
      height: 3.5rem;
    }

    .numeral {
      width: 2.1rem;
      height: 2.1rem;
      font-size: 1.2rem;
    }

    .name {
      font-size: 0.92rem;
    }
  }

  @media (min-width: 2600px) {
    .level-selector {
      gap: 1rem;
    }

    .lvl {
      width: 18rem;
      height: 4.5rem;
      gap: 0.8rem;
      border-radius: 16px;
    }

    .numeral {
      width: 2.75rem;
      height: 2.75rem;
      font-size: 1.55rem;
    }

    .name {
      font-size: 1.15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lvl,
    .numeral,
    .name {
      transition: none;
    }
    .lvl:active {
      transform: none;
    }
  }
</style>
