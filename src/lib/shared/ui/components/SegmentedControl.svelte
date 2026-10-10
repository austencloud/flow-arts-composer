<script lang="ts" generics="T extends string">
  /**
   * Generic segmented button group shared across app and public surfaces.
   * Uses shared theme and motion-color variables for consistent theming.
   *
   * The option LIST may change at runtime (the construct picker swaps the turn
   * palette when the level changes: 4 buttons at L2, 8 at L3). Segments are
   * keyed and FLIPped so survivors glide + scale into their new geometry
   * instead of the row snapping, and arrivals pop in. Static option lists —
   * most consumers — never trigger either.
   *
   * Options that represent a prop or hand carry their own tone. This keeps
   * Blue / Left and Red / Right identifiable even when neither is selected,
   * while the visible label remains the cue for anyone who cannot read color.
   */
  import { flip } from "svelte/animate";
  import { flipDuration, popIn } from "#lib/shared/transitions/motion.js";
  import type { Snippet } from "svelte";

  interface Option {
    value: T;
    label: string;
    /** Compact visible label; the full label remains the accessible name. */
    shortLabel?: string;
    /** More descriptive accessible name, such as a label plus result count. */
    ariaLabel?: string;
    icon?: string; // FontAwesome class
    /** Optional trailing count badge (e.g. number of items in this group). */
    count?: number | null;
    /** Not selectable (e.g. a "coming soon" size). Still rendered, dimmed. */
    disabled?: boolean;
    /** Semantic option color. Use blue/red/both when the option means those props. */
    tone?: "blue" | "red" | "both" | "accent";
    /** Tab ID and controlled panel ID when semantics="tabs". */
    id?: string;
    controls?: string;
  }

  interface Props {
    /** Available options */
    options: Option[];
    /** Currently selected value */
    value: T;
    /** Callback when selection changes */
    onchange: (value: T) => void;
    /** Color for accent indicator */
    color?: "blue" | "red" | "accent";
    /** Size variant */
    size?: "sm" | "md";
    /** Compact changes height; tight only trims horizontal padding for narrow rails. */
    density?: "standard" | "compact" | "tight";
    /**
     * Wrap the options into a grid of this many columns instead of one row.
     * A long palette — the Level 4 turn list is fourteen ratios — is easier to
     * read and to press on two rows than in one long horizontal scroller. The
     * indicator tracks the selected cell on both axes. Omit for a single row.
     */
    columns?: number;
    /** Accessible name for the option group. */
    ariaLabel?: string;
    /** ID of a visible label that names the option group. */
    ariaLabelledby?: string;
    /** Tabs and radio groups add roving focus and arrow-key selection. */
    semantics?: "button-group" | "tabs" | "radiogroup";
    /** Custom visible content. The option's label still owns its accessible name. */
    optionContent?: Snippet<[T]>;
    /**
     * A two-option mode switcher where every activation selects the other mode,
     * including the currently selected segment and the control's padded surface.
     */
    toggleOnActivate?: boolean;
    /**
     * Opt this control into the attract presenter's allowlist
     * (.claude/rules/, spec 2026-08-04-ghost-mind-design.md §Safety). Only
     * UNSELECTED segments are annotated: pressing the already-selected value
     * moves nothing, which reads as a misclick rather than a decision. Absent
     * by default — the presenter cannot see a control that has not opted in.
     */
    ghostKind?: "turn" | "option-filter" | "tempo" | "curio" | "step-edit";
  }

  let {
    options,
    value,
    onchange,
    color = "blue",
    size = "md",
    density = "standard",
    columns,
    ariaLabel,
    ariaLabelledby,
    semantics = "button-group",
    optionContent,
    toggleOnActivate = false,
    ghostKind,
  }: Props = $props();

  function toggleTarget(): T | undefined {
    const enabledOptions = options.filter((option) => !option.disabled);
    if (enabledOptions.length !== 2) return undefined;
    return enabledOptions.find((option) => option.value !== value)?.value;
  }

  function handleSelect(val: T) {
    onchange(toggleOnActivate ? (toggleTarget() ?? val) : val);
  }

  function handleSurfacePointerUp(event: PointerEvent) {
    if (!toggleOnActivate) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button.segment")) return;

    const nextValue = toggleTarget();
    if (nextValue !== undefined) onchange(nextValue);
  }

  // Find selected index for indicator position
  const selectedIndex = $derived(options.findIndex((o) => o.value === value));
  const focusIndex = $derived(
    selectedIndex >= 0
      ? selectedIndex
      : options.findIndex((option) => !option.disabled)
  );
  const selectedTone = $derived(options[selectedIndex]?.tone ?? color);

  // A column count that would leave one row is the same as no wrap at all.
  const gridColumns = $derived(
    columns && columns > 0 && columns < options.length ? columns : null
  );
  const rowCount = $derived(
    gridColumns ? Math.ceil(options.length / gridColumns) : 1
  );
  const selectedRow = $derived(
    gridColumns ? Math.floor(selectedIndex / gridColumns) : 0
  );
  const selectedColumn = $derived(
    gridColumns ? selectedIndex - selectedRow * gridColumns : selectedIndex
  );

  /**
   * Nearest selectable option one grid row away. Disabled options are stepped
   * over in the direction of travel, so a row whose cell is disabled still
   * moves the user forward rather than trapping them.
   */
  function optionOneRowAway(optionIndex: number, delta: number): number | null {
    if (!gridColumns) return null;
    let target = optionIndex + delta * gridColumns;
    while (target >= 0 && target < options.length) {
      if (!options[target]?.disabled) return target;
      target += delta;
    }
    return null;
  }

  function handleSingleSelectKeydown(
    event: KeyboardEvent,
    optionIndex: number
  ) {
    if (semantics === "button-group") return;

    const enabledIndexes = options.flatMap((option, index) =>
      option.disabled ? [] : [index]
    );
    const currentEnabledIndex = enabledIndexes.indexOf(optionIndex);
    if (currentEnabledIndex === -1) return;

    if (gridColumns && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const target = optionOneRowAway(
        optionIndex,
        event.key === "ArrowDown" ? 1 : -1
      );
      if (target === null) return;
      event.preventDefault();
      event.stopPropagation();
      const targetOption = options[target];
      if (!targetOption) return;
      const currentTarget = event.currentTarget as HTMLButtonElement;
      currentTarget.parentElement
        ?.querySelectorAll<HTMLButtonElement>("button.segment")
        ?.[target]?.focus();
      handleSelect(targetOption.value);
      return;
    }

    let nextEnabledIndex: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        nextEnabledIndex =
          (currentEnabledIndex - 1 + enabledIndexes.length) %
          enabledIndexes.length;
        break;
      case "ArrowRight":
        nextEnabledIndex = (currentEnabledIndex + 1) % enabledIndexes.length;
        break;
      case "Home":
        nextEnabledIndex = 0;
        break;
      case "End":
        nextEnabledIndex = enabledIndexes.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (nextEnabledIndex === null) return;
    const nextOptionIndex = enabledIndexes[nextEnabledIndex];
    if (nextOptionIndex === undefined) return;
    const nextOption = options[nextOptionIndex];
    if (!nextOption) return;

    const currentTarget = event.currentTarget as HTMLButtonElement;
    const segments =
      currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        "button.segment"
      );
    segments?.[nextOptionIndex]?.focus();
    handleSelect(nextOption.value);
  }
</script>

<div
  class="segmented-control"
  class:grid={gridColumns !== null}
  class:sm={size === "sm"}
  class:compact={density === "compact"}
  class:tight={density === "tight"}
  class:blue={color === "blue"}
  class:red={color === "red"}
  class:accent={color === "accent"}
  role={semantics === "tabs"
    ? "tablist"
    : semantics === "radiogroup"
      ? "radiogroup"
      : ariaLabel || ariaLabelledby
        ? "group"
        : undefined}
  aria-orientation={semantics === "button-group" || gridColumns
    ? undefined
    : "horizontal"}
  aria-label={ariaLabel}
  aria-labelledby={ariaLabelledby}
  style="--count: {options.length}; --cols: {gridColumns ??
    options.length}; --rows: {rowCount}"
  onpointerup={handleSurfacePointerUp}
>
  <div
    class="indicator"
    style:visibility={selectedIndex < 0 ? "hidden" : "visible"}
    data-tone={selectedTone}
    style="--index: {selectedIndex}; --col: {selectedColumn}; --row: {selectedRow}"
  ></div>

  {#each options as option (option.value)}
    <button
      type="button"
      class="segment"
      class:selected={value === option.value}
      data-tone={option.tone}
      data-ghost={ghostKind && value !== option.value && !option.disabled
        ? "safe"
        : undefined}
      data-ghost-kind={ghostKind && value !== option.value && !option.disabled
        ? ghostKind
        : undefined}
      onclick={() => handleSelect(option.value)}
      onkeydown={(event) =>
        handleSingleSelectKeydown(event, options.indexOf(option))}
      id={option.id}
      role={semantics === "tabs"
        ? "tab"
        : semantics === "radiogroup"
          ? "radio"
          : undefined}
      aria-controls={semantics === "tabs" ? option.controls : undefined}
      aria-selected={semantics === "tabs" ? value === option.value : undefined}
      aria-checked={semantics === "radiogroup"
        ? value === option.value
        : undefined}
      tabindex={semantics !== "button-group"
        ? options.indexOf(option) === focusIndex
          ? 0
          : -1
        : 0}
      aria-label={option.ariaLabel ?? option.label}
      title={option.label}
      aria-pressed={semantics === "button-group"
        ? value === option.value
        : undefined}
      disabled={option.disabled}
      in:popIn
      animate:flip={{ duration: flipDuration() }}
    >
      {#if optionContent}
        <span class="segment-label">
          {@render optionContent(option.value)}
        </span>
      {:else if option.icon}
        <i class={option.icon} aria-hidden="true"></i>
      {:else}
        <span class="segment-label">{option.shortLabel ?? option.label}</span>
      {/if}
      {#if option.count != null}
        <span class="segment-count">{option.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    --segmented-selected-ink: var(--theme-text, white);
    --segmented-motion-blue: var(--dm-motion-blue, #3575e2);
    --segmented-motion-red: var(--dm-motion-red, #ed1c24);
    --segmented-motion-both: var(
      --dm-motion-both,
      color-mix(
        in srgb,
        var(--segmented-motion-blue) 50%,
        var(--segmented-motion-red)
      )
    );
    display: flex;
    position: relative;
    /* Fallbacks: this control also renders on marketing-chrome pages (shop
       configurator) where the app theme pipeline may not have run. */
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    width: 100%;
  }

  /* Dense toolbars need less visible chrome without making the targets harder
     to tap. The buttons stay 32px tall on screen and extend their hit area to
     48px, matching the established mobile hand-selector pattern. */
  .segmented-control.compact {
    gap: 1px;
    padding: 2px;
  }

  .indicator {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: calc(3px + (100% - 6px) / var(--count) * var(--index));
    width: calc((100% - 6px) / var(--count) - 2px);
    border-radius: 6px;
    /* Width too, not just position: when the option count changes the segments
       resize, and an un-animated indicator would snap while they glide. */
    transition:
      left var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      width var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      background-color var(--duration-normal, 200ms) ease;
    z-index: 0;
  }

  .indicator[data-tone="blue"] {
    background: var(
      --dm-motion-blue-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--segmented-motion-blue) 30%, transparent),
        color-mix(in srgb, var(--segmented-motion-blue) 16%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--segmented-motion-blue) 52%, transparent);
  }

  .indicator[data-tone="red"] {
    background: var(
      --dm-motion-red-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--segmented-motion-red) 16%, transparent),
        color-mix(in srgb, var(--segmented-motion-red) 30%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--segmented-motion-red) 52%, transparent);
  }

  .indicator[data-tone="both"] {
    background: var(
      --dm-motion-both-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--segmented-motion-blue) 30%, transparent),
        color-mix(in srgb, var(--segmented-motion-red) 30%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--segmented-motion-both) 52%, transparent);
  }

  .indicator[data-tone="accent"] {
    background: color-mix(in srgb, var(--theme-accent, #8b6cff) 45%, black);
  }

  .compact .indicator {
    top: 2px;
    bottom: 2px;
    left: calc(2px + (100% - 4px) / var(--count) * var(--index));
    width: calc((100% - 4px) / var(--count) - 1px);
  }

  /* Wrapped layout. Equal tracks on both axes keep the indicator's cell math
     the same as the single-row case, one dimension at a time. */
  .segmented-control.grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    align-items: stretch;
  }

  .grid .indicator {
    bottom: auto;
    left: calc(3px + (100% - 6px) / var(--cols) * var(--col));
    width: calc((100% - 6px) / var(--cols) - 2px);
    top: calc(3px + (100% - 6px) / var(--rows) * var(--row));
    height: calc((100% - 6px) / var(--rows) - 2px);
    transition:
      left var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      top var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      width var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      height var(--duration-normal, 200ms) cubic-bezier(0.22, 1, 0.36, 1),
      background-color var(--duration-normal, 200ms) ease;
  }

  .grid.compact .indicator {
    left: calc(2px + (100% - 4px) / var(--cols) * var(--col));
    width: calc((100% - 4px) / var(--cols) - 1px);
    top: calc(2px + (100% - 4px) / var(--rows) * var(--row));
    height: calc((100% - 4px) / var(--rows) - 1px);
  }

  .segment {
    flex: 1;
    min-height: var(--min-touch-target, 44px); /* WCAG AA touch target */
    min-width: 0;
    padding: 0.5rem 0.5rem;
    background: none;
    border: none;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--duration-fast);
    position: relative;
    z-index: 1;
    /* Long labels wrap instead of clipping — narrow screens were silently
       truncating "coming soon" options mid-word. Equal-width segments keep
       the sliding indicator honest; the control just grows taller. */
    white-space: normal;
    text-align: center;
    line-height: 1.25;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    overflow: hidden;
  }

  .segment:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
    border-radius: 6px;
    z-index: 2;
  }

  .segment:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .indicator,
    .grid .indicator,
    .segment {
      transition: none;
    }
  }

  .segment-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    padding: 0.05rem 0.3rem;
    border-radius: 9999px;
    background: color-mix(in srgb, currentColor 14%, transparent);
    font-size: var(--font-size-compact, 0.7rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
  }

  .sm .segment {
    /* Touch target uses var(--min-touch-target) for WCAG AA */
    padding: 0.45rem 0.7rem;
    font-size: var(--font-size-compact, 0.75rem);
  }

  .compact .segment {
    box-sizing: border-box;
    height: 32px;
    min-height: 32px;
    padding: 0 0.5rem;
    overflow: visible;
  }

  /* A narrow persistent rail still needs full-size text and touch targets.
     Tight density gives the labels that room without shrinking either one. */
  .tight .segment {
    padding-inline: 0.25rem;
  }

  .compact .segment::before {
    content: "";
    position: absolute;
    inset: -8px 0;
  }

  .segment:hover {
    color: var(--theme-text);
  }

  .segment[data-tone="blue"]:not(.selected) {
    color: color-mix(
      in srgb,
      var(--segmented-motion-blue) 72%,
      var(--theme-text, #fff)
    );
  }

  .segment[data-tone="red"]:not(.selected) {
    color: color-mix(
      in srgb,
      var(--segmented-motion-red) 72%,
      var(--theme-text, #fff)
    );
  }

  .segment[data-tone="both"]:not(.selected) {
    color: color-mix(
      in srgb,
      var(--segmented-motion-both) 72%,
      var(--theme-text, #fff)
    );
  }

  .segment[data-tone="accent"]:not(.selected) {
    color: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 68%,
      var(--theme-text, #fff)
    );
  }

  .segment[data-tone]:hover:not(.selected) {
    filter: brightness(1.18);
  }

  .segment.selected {
    /* The wash keeps its host surface visible, so the theme's contrast-aware
       text color remains the reliable ink in both light and dark themes. */
    color: var(--segmented-selected-ink);
  }

  .segment i {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .sm .segment i {
    font-size: var(--font-size-compact, 0.75rem);
  }
</style>
