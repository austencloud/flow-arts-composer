<!--
  BottomNoteCard.svelte

  The shared frame for a non-modal card that rises above the bottom bar:
  the install card and the returning-guest note. A header (picture, title,
  close), the owner's body, then a quiet and a strong button. Nothing behind
  it is blocked; the close button, the quiet button, and Escape while focus
  is inside the card put it away. It sits below drawers, sheets and modals.

  Layout: upright phone, above the bottom bar. Short window (under 480px
  tall): a compact row, text left and buttons right. Desktop sidebar layout
  (no bottom bar): the bottom-right corner of the workspace.

  `announce` is read out politely when the card opens; focus never moves.

  Owners keep when it opens and what it says; this keeps the look and the
  motion the same for every such card. Body text with class "card-text"
  gets the shared text style. Automatic owners share one card a day
  (bottom-note-day.ts) and wait for a quiet moment (idle-wait.ts).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { desktopSidebarState } from "#lib/shared/layout/desktop-sidebar-state.svelte.js";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    open: boolean;
    titleId: string;
    title: string;
    closeLabel: string;
    onClose: () => void;
    /** Defaults to onClose. */
    onEscape?: () => void;
    secondaryLabel: string;
    onSecondary: () => void;
    primaryLabel: string;
    onPrimary: () => void;
    /** Read out politely when the card opens; cleared when it closes. */
    announce?: string;
    leading?: Snippet;
    children?: Snippet;
  }

  let {
    open,
    titleId,
    title,
    closeLabel,
    onClose,
    onEscape,
    secondaryLabel,
    onSecondary,
    primaryLabel,
    onPrimary,
    announce = "",
    leading,
    children,
    class: className = "",
    ...rest
  }: Props = $props();

  // Escape closes the card only while keyboard focus is inside it, so it
  // never steals the key from a drawer or field the person is using.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") (onEscape ?? onClose)();
  }
</script>

<div class="sr-only" aria-live="polite" aria-atomic="true">
  {open ? announce : ""}
</div>

{#if open}
  <!-- A labelled aside, not a dialog: nothing behind it is blocked. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside
    {...rest}
    class="note-card {className}"
    class:desktop={desktopSidebarState.isVisible}
    aria-labelledby={titleId}
    onkeydown={handleKeydown}
    in:flyFade={{ y: 48, duration: DURATION.normal }}
    out:flyFade={{ y: 24, duration: DURATION.fast }}
  >
    <div class="card-header">
      {@render leading?.()}
      <h2 id={titleId}>{title}</h2>
      <button class="close-btn" onclick={onClose} aria-label={closeLabel}>
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    {@render children?.()}

    <div class="card-actions">
      <button class="action secondary" onclick={onSecondary}>
        {secondaryLabel}
      </button>
      <button class="action primary" onclick={onPrimary}>
        {primaryLabel}
      </button>
    </div>
  </aside>
{/if}

<style>
  .note-card {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(var(--primary-nav-height, 64px) + 6px);
    /* A phone card; on a wide window it stays phone-sized at the bottom. */
    max-width: 30rem;
    margin-inline: auto;
    /* Below drawers, sheets and modals: it never covers what they hold. */
    z-index: calc(var(--z-drawer) - 1);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px 12px 14px;
    box-sizing: border-box;
    /* --theme-panel-bg is translucent; the dark layer under it keeps the card
       opaque over a busy tool panel. */
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)), #0c0e16;
    border: 1px solid var(--theme-stroke);
    border-radius: 20px;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.55);
    color: var(--theme-text);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-header h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 700;
  }

  .close-btn {
    display: grid;
    place-items: center;
    width: var(--alt-touch-target);
    height: var(--alt-touch-target);
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .close-btn:hover {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
  }

  .note-card :global(.card-text) {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    color: color-mix(in srgb, var(--theme-text) 88%, transparent);
  }

  .card-actions {
    display: flex;
    gap: 10px;
  }

  .action {
    flex: 1;
    min-height: var(--alt-touch-target);
    border-radius: 12px;
    font-size: var(--font-size-base);
    font-weight: 650;
    cursor: pointer;
  }

  .action.secondary {
    background: none;
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text);
  }

  .action.secondary:hover {
    background: var(--theme-card-hover-bg);
  }

  .action.primary {
    border: none;
    color: #fff;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1),
      var(--theme-accent-strong, #8b5cf6)
    );
  }

  .action:focus-visible,
  .close-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  .action:active {
    transform: scale(0.98);
  }

  /* Desktop sidebar layout: no bottom bar, so the card takes the workspace's
     bottom-right corner. Toasts live at the top of the window. */
  .note-card.desktop {
    left: auto;
    right: 16px;
    bottom: 16px;
    width: 24rem;
    max-width: calc(100vw - 32px);
    margin-inline: 0;
  }

  /* Short window (phone held sideways, or 200% zoom): text on the left, the
     buttons on the right, so the card stays short without scrolling. */
  @media (max-height: 479px) {
    .note-card,
    .note-card.desktop {
      left: 8px;
      right: 8px;
      bottom: 8px;
      width: auto;
      max-width: 36rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 12px;
      row-gap: 0;
      align-items: start;
    }

    .note-card.desktop {
      left: auto;
      margin-inline: 0;
    }

    .note-card > :global(:not(.card-actions)) {
      grid-column: 1;
    }

    .note-card > :global(:not(.card-actions) ~ :not(.card-actions)) {
      margin-top: 6px;
    }

    .card-actions {
      grid-column: 2;
      grid-row: 1 / span 8;
      flex-direction: column;
      align-self: center;
      min-width: 8rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action:active {
      transform: none;
    }
  }
</style>
