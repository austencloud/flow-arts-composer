<!--
  RailBentoSheet.svelte

  Slide-up sheet that opens from the bottom of the preview area when a
  primary bento tile is tapped. Shared chrome: backdrop, header with title
  + close, body slot.

  Caller is responsible for mounting this conditionally (so the transition
  fires on mount) and for providing the body content via the `children`
  snippet.
-->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    title: string;
    onClose: () => void;
    /** Optional: element to restore focus to when the sheet closes. */
    returnFocusTo?: HTMLElement | null;
    children: Snippet;
  }

  let { title, onClose, returnFocusTo = null, children }: Props = $props();

  let sheetEl: HTMLDivElement | undefined = $state();

  // CSS selector for every tab-focusable element inside the sheet.
  // Keep in sync between initial-focus (onMount) and focus-trap (onSheetKeydown).
  const FOCUSABLE_SELECTOR =
    'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"])';

  // Honor prefers-reduced-motion for the entrance / exit transitions.
  // IMPORTANT: initialize synchronously in the $state initializer - the sheet's
  // entrance transition:fly/fade is evaluated at mount time, BEFORE onMount
  // runs. If we set reduceMotion inside onMount, the first animation would
  // always use the full 240ms even for users who have the reduced-motion
  // preference enabled.
  let reduceMotion = $state(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  onMount(() => {
    // Snapshot returnFocusTo at mount so the cleanup below restores focus
    // even if the prop has since been reactively re-assigned (e.g. the
    // parent flipped `lastActivatedPillId` before the sheet finished
    // unmounting). Element is kept alive by the parent's state.
    const focusTarget = returnFocusTo;

    const mq =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const handler = (e: MediaQueryListEvent) => { reduceMotion = e.matches; };
    mq?.addEventListener("change", handler);

    // Move initial focus into the sheet so the keyboard user lands inside it.
    void tick().then(() => {
      const first = sheetEl?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });

    return () => {
      mq?.removeEventListener("change", handler);
      // Restore focus to the activating element on unmount. Only if it is
      // still connected to the DOM - otherwise focus falls silently to
      // document.body and keyboard users lose their place.
      if (focusTarget && typeof focusTarget.focus === "function" && focusTarget.isConnected) {
        focusTarget.focus();
      }
    };
  });

  function getFocusables(): HTMLElement[] {
    if (!sheetEl) return [];
    return Array.from(
      sheetEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => {
      // Visible-element filter: prefer checkVisibility() (modern), fall back
      // to offsetParent (pre-2023). The fallback misses position:fixed
      // descendants, but the sheet's content never uses fixed positioning.
      // A defensive try/catch around checkVisibility prevents an exotic
      // browser bug (Edge legacy has thrown here) from collapsing the whole
      // focus trap - a single bad element should fall back, not poison the
      // whole filter pass.
      const maybeCheckVisibility = (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility;
      if (typeof maybeCheckVisibility === "function") {
        try {
          return maybeCheckVisibility.call(el);
        } catch {
          return el.offsetParent !== null;
        }
      }
      return el.offsetParent !== null;
    });
  }

  function onBackdropClick() {
    onClose();
  }

  function onSheetKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      // Don't swallow Escape when a native dropdown / combobox / listbox is
      // open inside the sheet - the user is trying to close THAT, not the
      // sheet itself. Firefox in particular bubbles Escape from open
      // <select> elements; without this guard the sheet vanishes when the
      // user just meant to close the dropdown.
      //
      // The `instanceof Element` narrow matters: composed-path events from a
      // shadow-DOM nested component or a TextNode target would throw on
      // `.closest`, which - without a handler - bubbles to Svelte's error
      // boundary and freezes the sheet until remount.
      const target = e.target;
      if (target instanceof Element &&
          target.closest('select, [role="combobox"], [role="listbox"], [role="dialog"], [popover]')) {
        return;
      }
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    // Focus trap: keep Tab focus inside the sheet.
    const focusables = getFocusables();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !sheetEl?.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !sheetEl?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Portal action: moves the element to document.body so the fixed-positioned
  // sheet isn't trapped inside a parent stacking context. The viewer wraps
  // this panel in containers that create stacking contexts (transforms, z-index,
  // flex layouts), which would otherwise clip the "fixed" sheet to a parent's
  // height instead of the viewport.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

<div use:portal class="bento-portal">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button
    type="button"
    class="bento-backdrop"
    aria-label={t("viewer_ui_close_section", { name: title })}
    tabindex="-1"
    onclick={onBackdropClick}
    transition:fade={{ duration: reduceMotion ? 0 : 180 }}
  ></button>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={sheetEl}
    class="bento-sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    onkeydown={onSheetKeydown}
    transition:fly={{ y: reduceMotion ? 0 : 80, duration: reduceMotion ? 0 : 240, easing: cubicOut }}
  >
    <div class="bento-sheet-head">
      <span class="bento-sheet-title">{title}</span>
      <button
        type="button"
        class="bento-sheet-close"
        onclick={onClose}
        aria-label={t("viewer_ui_close_section", { name: title })}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="bento-sheet-body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .bento-portal {
    position: fixed;
    inset: 0;
    z-index: var(--z-priority);
    pointer-events: none;
  }

  .bento-portal > * {
    pointer-events: auto;
  }

  .bento-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: var(--z-priority);
    cursor: pointer;
    border: none;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .bento-sheet {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: 8px;
    max-height: 85vh;
    z-index: calc(var(--z-priority) + 1);
    background: #0d1018;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bento-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .bento-sheet-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .bento-sheet-close {
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: all 150ms ease;
  }

  .bento-sheet-close:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: rgba(255, 255, 255, 0.9);
  }

  .bento-sheet-close:focus-visible {
    /* --rail-accent is defined on .bento-sheet in rail-tile.css */
    outline: 2px solid var(--rail-accent, #4a9eff);
    outline-offset: 2px;
  }

  .bento-sheet-body {
    padding: 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* The .rt-section / .rt-section-label / .rt-chip-row / .rt-chip / .rt-row /
     .rt-row-label primitives now live in rail-tile.css so they apply equally
     in the .bento-sheet-body and the desktop .pill-body-inline contexts. */

  @media (prefers-reduced-motion: reduce) {
    .bento-sheet-close {
      transition: none;
    }
  }
</style>
