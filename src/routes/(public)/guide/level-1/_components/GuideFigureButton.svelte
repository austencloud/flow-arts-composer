<script lang="ts">
  /**
   * A button that belongs to a figure card: Replay and half speed on the
   * figure's bottom corners, and the A/B answer under each opener card.
   *
   * Drawn in the guide's ink palette, the same as the screen pills and the
   * Back and Next buttons (GuideScreens .pill / .step): Inter at 0.9rem,
   * weight 600, an ink outline and a faint ink wash. It does not use
   * FilterChipBase, whose --theme-* tokens are the app's dark chrome and
   * paint as grey words on a black chip here (2026-11-12, Austen: "literally
   * unreadable"). SequenceShowcase's cycle button made the same call.
   *
   * Its type keeps one size and never reads --fit.
   *
   * glyph is the media-player idiom for a control that sits on the figure
   * itself: a small disc of the page's own ground (--guide-plate) with no
   * outline, so it reads on the canvas without boxing the figure in.
   */
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";

  let {
    label,
    ariaLabel,
    icon,
    size = "row",
    pressed,
    tone,
    disabled = false,
    waiting = false,
    onclick,
    title,
  }: {
    /** Visible words. A glyph button with an icon may leave it out; it
     *  then needs ariaLabel. */
    label?: string;
    /** Accessible name when the visible words do not say the whole action. */
    ariaLabel?: string;
    icon?: IconDefinition;
    /** row = 32px outlined · glyph = 32px disc on the figure · answer =
     *  44px (36px on a phone) in the guide's accent, an answer under a
     *  figure card. */
    size?: "row" | "glyph" | "answer";
    /** Set for a toggle: on or off. Leave unset for a plain button. */
    pressed?: boolean;
    /** An answer's verdict colour (right or wrong). */
    tone?: string;
    disabled?: boolean;
    /** Locked only for a while (an answer waiting for its figure to play):
     *  disabled, it keeps its words and outline readable and brightens as
     *  it wakes, instead of fading to a dead button. */
    waiting?: boolean;
    onclick?: () => void;
    /** Hover tooltip, for a button that shows only an icon. */
    title?: string;
  } = $props();
</script>

<button
  type="button"
  class="figure-btn"
  class:answer={size === "answer"}
  class:glyph={size === "glyph"}
  class:on={pressed === true}
  class:toned={tone !== undefined}
  class:asleep={disabled && waiting}
  class:wakes={waiting}
  style={tone ? `--tone: ${tone};` : undefined}
  aria-pressed={pressed}
  aria-label={ariaLabel}
  {title}
  {disabled}
  {onclick}
>
  {#if icon}<Icon {icon} />{/if}
  {#if label}<span class="btn-label">{label}</span>{/if}
</button>

<style>
  .figure-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    box-sizing: border-box;
    /* Inside a figure: the figure, not the button, is the reader's target,
       so the row's buttons drop the 44px floor (the answers keep it, or a
       phone's 36px). */
    min-width: 0;
    min-height: 0;
    height: 32px;
    padding: 0 0.85em;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 25%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--ink, #1a1a1a) 4%, transparent);
    color: var(--ink, #1a1a1a);
    font-family: Inter, system-ui, sans-serif;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }
  /* An answer under a figure: the guide's accent (the current screen
     pill's orange), so it reads as the thing to press, not as chrome. */
  .figure-btn.answer {
    min-width: 4.75rem;
    height: 44px;
    padding: 0 1.2em;
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 700;
    border: 2px solid #e8590c;
    background: color-mix(in oklab, #e8590c 18%, transparent);
  }
  /* A phone gives the figures the room: 36px (layout law, Tap size). */
  @media (pointer: coarse) and (max-width: 599px),
    (pointer: coarse) and (max-height: 599px) {
    .figure-btn.answer {
      height: var(--alt-touch-target, 36px);
      font-size: var(--font-size-base, 1rem);
    }
  }
  .figure-btn :global(.ve-icon) {
    width: 1em;
    color: var(--ink-dim, #555);
  }
  /* On the figure: a disc of the page's ground, no outline. Both glyphs are
     the same height, so the corners match. */
  .figure-btn.glyph {
    --glyph-plate: color-mix(
      in oklab,
      var(--guide-plate, #0b0b10) 72%,
      transparent
    );
    min-width: 32px;
    padding: 0 8px;
    border-color: transparent;
    background: var(--glyph-plate);
  }
  .figure-btn.glyph :global(.ve-icon) {
    width: 1.05em;
    color: inherit;
  }
  @media (hover: hover) and (pointer: fine) {
    .figure-btn:not(:disabled):hover {
      background: color-mix(in oklab, var(--ink, #1a1a1a) 10%, transparent);
      border-color: color-mix(in oklab, var(--ink, #1a1a1a) 45%, transparent);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .figure-btn.glyph:not(:disabled):hover {
      background: color-mix(in oklab, var(--guide-plate, #0b0b10) 92%, transparent);
      border-color: color-mix(in oklab, var(--ink, #1a1a1a) 30%, transparent);
    }
  }
  .figure-btn:not(:disabled):active {
    transform: scale(0.97);
  }
  .figure-btn:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--semantic-warning, #d4a017) 70%, transparent);
    outline-offset: 2px;
  }
  /* A toggle that is on: the guide's accent, the colour of the screen
     you are on, as a wash and an outline, so the words stay ink. */
  .figure-btn.on,
  .figure-btn.on:hover {
    background: color-mix(in oklab, #e8590c 24%, transparent);
    border-color: #e8590c;
  }
  @media (hover: hover) and (pointer: fine) {
    .figure-btn.answer:not(:disabled):hover {
      background: color-mix(in oklab, #e8590c 32%, transparent);
      border-color: #e8590c;
    }
  }
  .figure-btn.glyph.on,
  .figure-btn.glyph.on:not(:disabled):hover {
    background: color-mix(in oklab, #e8590c 34%, var(--glyph-plate));
    border-color: #e8590c;
  }
  .figure-btn.toned,
  .figure-btn.toned:hover {
    background: color-mix(in oklab, var(--tone) 20%, transparent);
    border-color: var(--tone);
  }
  .figure-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  /* Waiting, not unavailable: still a button, then it wakes. */
  .figure-btn.asleep {
    opacity: 0.72;
    cursor: default;
  }
  /* An answer waiting for its figures keeps its orange outline and fills
     in as it wakes, the cue that it is the reader's turn. */
  .figure-btn.answer.asleep:not(.toned) {
    background: transparent;
  }
  .figure-btn.wakes {
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      opacity var(--duration-emphasis) var(--ease-standard);
  }
  @media (prefers-reduced-motion: reduce) {
    .figure-btn,
    .figure-btn.wakes {
      transition: none;
    }
  }
</style>
