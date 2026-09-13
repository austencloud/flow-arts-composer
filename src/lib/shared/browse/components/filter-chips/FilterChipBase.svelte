<!--
FilterChipBase.svelte - Shared base for all filter chips.
Renders an interactive chip with icon, label, optional count badge,
and dropdown arrow. Supports toggle and dropdown modes.
Popover uses fixed positioning to escape overflow:hidden containers.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    icon?: string;
    /** Custom leading glyph rendered in the icon slot in place of `icon`
     *  (e.g. an inline SVG mark). Takes precedence over `icon` when set. */
    iconSnippet?: Snippet;
    active?: boolean;
    count?: number | null;
    chipColor?: string;
    /** toggle = on/off switch · dropdown = opens a popover · action = momentary
     * button · display = the same chip presentation without button semantics. */
    mode?: "toggle" | "dropdown" | "action" | "display";
    /** soft (default) = active state is a translucent wash of `chipColor` ·
     *  solid = active state fills with `chipColor` + on-accent text, matching a
     *  SegmentedControl indicator (use when a toggle sits beside one). */
    emphasis?: "soft" | "solid";
    /** md = default chip · sm = denser padding for tight scrollable filter rows.
     *  Touch-target floor is preserved in both sizes. */
    size?: "sm" | "md";
    /**
     * compact (default) = 12px label, correct for a filter bar where the chip
     * qualifies content shown elsewhere · readable = 14px label and leading
     * glyph, for a chip whose label IS the primary content being read and
     * chosen between (a sequence word, a named target). Padding, radius and the
     * touch-target floor are unchanged; only the type steps up to the body-text
     * floor. Independent of `size`, which owns density.
     */
    labelScale?: "compact" | "readable";
    expanded?: boolean;
    disabled?: boolean;
    /** Accessible name when the visible label does not describe the action. */
    ariaLabel?: string;
    children?: Snippet;
    onclick?: () => void;
    /**
     * Close the dropdown. Required for keyboard dismissal in `mode="dropdown"`.
     *
     * `expanded` is a controlled input prop — the open/closed state lives in the
     * consumer — so this component cannot close its own popover by writing to
     * it. Escape therefore has to hand the decision back the same way a click
     * outside does. Without this, an expanded chip swallowed Escape entirely:
     * `aria-expanded="true"` makes the global escape owner defer to the widget
     * (escape-shortcut-target.ts LOCAL_ESCAPE_OWNER_SELECTOR), and no chip
     * implemented the handler it was deferring to, so a keyboard user had no
     * way out of the popover at all.
     */
    ondismiss?: () => void;
    /** Split-chip removal: renders a trailing × segment as its OWN control so
     * the chip body can carry a non-destructive action (edit/open) while
     * removal stays one deliberate tap away. Without it a rule chip's entire
     * surface was a delete button (audit X-7/D-9/C-7). */
    onremove?: () => void;
    /** Accessible name for the × segment (defaults to "Remove <label>"). */
    removeAriaLabel?: string;
    /**
     * Opt in to the attract presenter being able to press this chip.
     *
     * Opt-IN, and only on the main chip body — never the × segment, which
     * removes a filter and is a destructive action a presenter should not take
     * on its own. Callers that pass this are stating the chip is safe for
     * something with no judgement to press repeatedly.
     */
    ghostKind?: "browse-filter" | "option-filter";
  }

  let {
    label,
    icon,
    iconSnippet,
    active = false,
    count = null,
    chipColor = "var(--theme-accent)",
    mode = "dropdown",
    emphasis = "soft",
    size = "md",
    labelScale = "compact",
    expanded = false,
    disabled = false,
    ariaLabel,
    ghostKind,
    children,
    onclick,
    ondismiss,
    onremove,
    removeAriaLabel,
  }: Props = $props();

  /**
   * Escape closes the dropdown and returns focus to the chip that opened it,
   * so the user lands back where they were rather than at the top of the
   * document. Bound to both the trigger and the popover because they are
   * siblings, not ancestor and descendant — a key pressed on an option row
   * never bubbles through the chip button.
   *
   * `stopPropagation` keeps this one press from also reaching a Drawer or
   * modal behind the chip: escape-routing.md requires that one Escape press
   * dismiss exactly one layer.
   */
  function handleEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !expanded || mode !== "dropdown") return;
    if (!ondismiss) return;

    event.preventDefault();
    event.stopPropagation();
    ondismiss();
    chipEl?.focus();
  }

  let chipEl: HTMLButtonElement | null = $state(null);
  let popoverEl: HTMLDivElement | null = $state(null);
  let popoverTop = $state(0);
  let popoverLeft = $state(0);

  /** Keeps the menu on screen: below the chip when there is room, above it when
   * there is not, and never past either side edge. Reading `popoverEl` runs
   * this a second time once the menu exists, which is when it can be measured.
   */
  const EDGE = 8;

  /**
   * The ancestor a `position: fixed` child is actually positioned against.
   *
   * Normally that is the viewport, but a transform, perspective, filter,
   * backdrop-filter, `will-change` on either, or paint/layout containment on
   * ANY ancestor makes that element the containing block instead. The share
   * sheet's drawer carries three of them, which put this menu hundreds of
   * pixels off the chip. Returns null when the viewport really is the frame.
   */
  function containingBlock(el: HTMLElement | null): DOMRect | null {
    let node = el?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      const willChange = style.willChange ?? "";
      const contain = style.contain ?? "";
      if (
        style.transform !== "none" ||
        style.perspective !== "none" ||
        style.filter !== "none" ||
        (style.backdropFilter ?? "none") !== "none" ||
        willChange.includes("transform") ||
        willChange.includes("filter") ||
        contain.includes("paint") ||
        contain.includes("layout") ||
        contain === "strict" ||
        contain === "content"
      ) {
        return node.getBoundingClientRect();
      }
      node = node.parentElement;
    }
    return null;
  }

  function place(chip: HTMLElement) {
    const rect = chip.getBoundingClientRect();
    const menuHeight = popoverEl?.offsetHeight ?? 0;
    const menuWidth = popoverEl?.offsetWidth ?? 0;
    const below = rect.bottom + 6;

    const top =
      menuHeight && below + menuHeight > window.innerHeight - EDGE
        ? Math.max(EDGE, rect.top - 6 - menuHeight)
        : below;
    const left = menuWidth
      ? Math.max(
          EDGE,
          Math.min(rect.left, window.innerWidth - menuWidth - EDGE)
        )
      : rect.left;

    // Everything above is viewport space, which is what the edge clamps need.
    // Shift into the containing block's space only at the point of applying it.
    const frame = containingBlock(popoverEl);
    popoverTop = top - (frame?.top ?? 0);
    popoverLeft = left - (frame?.left ?? 0);
  }

  /**
   * The menu floats above the page rather than flowing under the chip, so
   * anything that moves the chip after it opens leaves the menu behind:
   * scrolling the pane the chip lives in, resizing the window, or a panel
   * whose own slide-in was still running when the chip was pressed. Placing
   * it once caught that last case as a menu sitting hundreds of pixels away
   * from the words that opened it.
   *
   * Following the chip every frame covers all three without having to
   * enumerate them. It costs one measurement per frame, only while a menu is
   * actually open, and writing the same numbers back changes nothing.
   */
  $effect(() => {
    if (!expanded || !chipEl) return;
    const chip = chipEl;
    place(chip);
    let frame = requestAnimationFrame(function tick() {
      place(chip);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#snippet chipBody()}
  {#if iconSnippet}
    {@render iconSnippet()}
  {:else if icon}
    <i class={icon} aria-hidden="true"></i>
  {/if}

  <span class="chip-label">{label}</span>

  {#if count != null}
    <span class="chip-count">{count}</span>
  {/if}

  {#if mode === "dropdown"}
    <i
      class="fas fa-chevron-down chip-arrow"
      class:rotated={expanded}
      aria-hidden="true"
    ></i>
  {/if}
{/snippet}

{#if mode === "display"}
  <span
    class="filter-chip display-only"
    class:active
    class:solid={emphasis === "solid"}
    class:size-sm={size === "sm"}
    class:scale-readable={labelScale === "readable"}
    style="--chip-color: {chipColor};"
  >
    {@render chipBody()}
  </span>
{:else if onremove}
  <span class="filter-chip-duo" style="--chip-color: {chipColor};">
    <button
      class="filter-chip duo-main"
      class:active
      class:disabled
      class:solid={emphasis === "solid"}
      class:size-sm={size === "sm"}
    class:scale-readable={labelScale === "readable"}
      type="button"
      aria-pressed={mode === "toggle" ? active : undefined}
      aria-label={ariaLabel ?? `${label}${count != null ? ` (${count})` : ""}`}
      {disabled}
      {onclick}
      data-ghost={ghostKind && !disabled ? "safe" : undefined}
      data-ghost-kind={ghostKind && !disabled ? ghostKind : undefined}
      data-ghost-label={ghostKind ? label : undefined}
      bind:this={chipEl}
    >
      {@render chipBody()}
    </button>
    <button
      class="filter-chip duo-remove"
      class:active
      class:disabled
      class:solid={emphasis === "solid"}
      class:size-sm={size === "sm"}
    class:scale-readable={labelScale === "readable"}
      type="button"
      aria-label={removeAriaLabel ?? `Remove ${label}`}
      {disabled}
      onclick={onremove}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </span>
{:else}
  <button
    class="filter-chip"
    class:active
    class:disabled
    class:expanded
    class:solid={emphasis === "solid"}
    class:size-sm={size === "sm"}
    class:scale-readable={labelScale === "readable"}
    style="--chip-color: {chipColor};"
    type="button"
    aria-pressed={mode === "toggle" ? active : undefined}
    aria-haspopup={mode === "dropdown" ? "listbox" : undefined}
    aria-expanded={mode === "dropdown" ? expanded : undefined}
    aria-label={ariaLabel ?? `${label}${count != null ? ` (${count})` : ""}`}
    {disabled}
    {onclick}
    data-ghost={ghostKind && !disabled ? "safe" : undefined}
    data-ghost-kind={ghostKind && !disabled ? ghostKind : undefined}
    data-ghost-label={ghostKind ? label : undefined}
    onkeydown={handleEscape}
    bind:this={chipEl}
  >
    {@render chipBody()}
  </button>
{/if}

{#if children && expanded}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={popoverEl}
    class="chip-popover"
    role="listbox"
    aria-label="{label} options"
    style="top: {popoverTop}px; left: {popoverLeft}px;"
    onkeydown={handleEscape}
  >
    {@render children()}
  </div>
{/if}

<style>
  .filter-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 100px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  /* Denser variant for tight scrollable filter rows. Padding/gap tighten;
     the touch-target floor (min-height) is intentionally kept for a11y. */
  .filter-chip.size-sm {
    gap: 4px;
    padding: 6px 10px;
  }

  /* Split chip: body action + separate × removal, one visual pill. */
  .filter-chip-duo {
    display: inline-flex;
    flex-shrink: 0;
  }
  .filter-chip.duo-main {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-width: 0;
  }
  .filter-chip.duo-remove {
    min-width: var(--min-touch-target, 44px);
    justify-content: center;
    padding-inline: 8px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid
      color-mix(in srgb, var(--chip-color) 30%, transparent);
  }
  @media (hover: hover) {
    .filter-chip.duo-remove:not(.disabled):hover {
      background: color-mix(
        in srgb,
        var(--semantic-error, #ef4444) 22%,
        transparent
      );
      border-color: color-mix(
        in srgb,
        var(--semantic-error, #ef4444) 45%,
        transparent
      );
      color: var(--theme-text);
    }
  }

  .filter-chip.active {
    background: color-mix(in srgb, var(--chip-color) 15%, transparent);
    border-color: color-mix(in srgb, var(--chip-color) 40%, transparent);
    color: var(--theme-text);
  }

  /* Solid emphasis: active chip fills like a SegmentedControl indicator, so a
     toggle sitting next to one reads in the same accent weight. */
  .filter-chip.solid.active {
    background: var(--chip-color);
    border-color: var(--chip-color);
    color: var(--theme-text-on-accent, #fff);
  }
  .filter-chip.solid.active i:not(.chip-arrow) {
    color: var(--theme-text-on-accent, #fff);
  }
  @media (hover: hover) {
    .filter-chip.solid.active:not(.disabled):hover {
      background: color-mix(in srgb, var(--chip-color) 88%, #000);
      border-color: color-mix(in srgb, var(--chip-color) 88%, #000);
      color: var(--theme-text-on-accent, #fff);
    }
  }

  .filter-chip.expanded {
    border-color: color-mix(in srgb, var(--chip-color) 50%, transparent);
    background: color-mix(in srgb, var(--chip-color) 20%, transparent);
  }

  .filter-chip.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  .filter-chip.display-only {
    cursor: default;
  }

  @media (hover: hover) {
    .filter-chip:not(.disabled):not(.display-only):hover {
      background: color-mix(in srgb, var(--chip-color) 10%, transparent);
      border-color: color-mix(in srgb, var(--chip-color) 30%, transparent);
      color: var(--theme-text);
    }
  }

  .filter-chip:not(.disabled):not(.display-only):active {
    transform: scale(0.97);
  }

  .filter-chip:focus-visible {
    outline: 2px solid var(--chip-color);
    outline-offset: 2px;
  }

  .filter-chip i:not(.chip-arrow) {
    font-size: var(--font-size-compact, 12px);
  }

  /* Opt-in: the label is the content, not a qualifier on content shown
     elsewhere, so it sits on the body-text floor instead of the supplementary
     one. Density (padding, gap, touch target) is untouched — that stays with
     `size`. */
  .filter-chip.scale-readable {
    font-size: var(--font-size-sm, 14px);
  }

  .filter-chip.scale-readable i:not(.chip-arrow) {
    font-size: var(--font-size-sm, 14px);
  }

  .chip-label {
    line-height: 1;
  }

  .chip-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: color-mix(in srgb, var(--chip-color) 25%, transparent);
    border-radius: 100px;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text);
  }

  .chip-arrow {
    font-size: 8px;
    transition: transform var(--duration-fast, 150ms) ease;
    opacity: 0.6;
  }

  .chip-arrow.rotated {
    transform: rotate(180deg);
  }

  .chip-popover {
    position: fixed;
    z-index: var(--z-dropdown);
    min-width: 160px;
    padding: 4px;
    /* --theme-panel-bg is a translucent wash (rgba(0,0,0,0.75) on dark
       desktop) — floating menus need an opaque surface, so paint the wash
       over a solid base. Same treatment as SortPopover. */
    background-color: #12141c;
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98)),
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.3),
      0 1px 3px rgba(0, 0, 0, 0.2);
    animation: popoverIn var(--duration-fast, 150ms)
      cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes popoverIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .filter-chip,
    .chip-arrow {
      transition: none;
    }
    .chip-popover {
      animation: none;
    }
  }
</style>
