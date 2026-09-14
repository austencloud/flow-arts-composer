<!--
  PropSelectionSheet.svelte
  Bottom drawer for selecting props.
  Uses BentoPropGrid to show all variations organized by family.

  Optional cat/dog mode: pass showTabs=true to render left/right tab bar.
  Optional cat/dog toggle: pass showCatDogToggle=true to let users enable it.
  Parent controls which prop is selected and handles the selection callback.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import BentoPropGrid from "./BentoPropGrid.svelte";
  import type { PropChiralitySeam } from "./prop-chirality-seam";
  import PrimaryPropColorSettings from "./PrimaryPropColorSettings.svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import CatDogToggle from "./CatDogToggle.svelte";

  let {
    isOpen = $bindable(false),
    selectedPropType,
    color = "blue",
    title = "Select Prop",
    onSelect,
    showTabs = false,
    activeTab = $bindable<"left" | "right">("left"),
    onOpenChange,
    showCatDogToggle = false,
    catDogEnabled = false,
    onCatDogToggle,
    chirality,
    primaryPropColors,
    onPrimaryPropColorsChange,
    darkMode = true,
  } = $props<{
    primaryPropColors?: ViewerCustomColorPair | null;
    onPrimaryPropColorsChange?: (colors: ViewerCustomColorPair | null) => void;
    darkMode?: boolean;
    isOpen?: boolean;
    selectedPropType: PropType;
    color?: "blue" | "red";
    title?: string;
    onSelect: (propType: PropType) => void;
    /** Show left/right tab bar for cat/dog mode */
    showTabs?: boolean;
    /** Active tab when showTabs is true */
    activeTab?: "left" | "right";
    /** Reports drawer dismissal when the owner does not use two-way binding. */
    onOpenChange?: (open: boolean) => void;
    /** Show a cat/dog mode toggle in the drawer header */
    showCatDogToggle?: boolean;
    /** Current cat/dog mode state (read by toggle) */
    catDogEnabled?: boolean;
    /** Callback when user toggles cat/dog mode */
    onCatDogToggle?: () => void;
    /**
     * Buugeng chirality seam, forwarded to the grid. The sheet is opened per
     * hand, so hosts pass the hand this sheet is editing and it writes that
     * hand only — blue A beside red B is the pairing that nests.
     */
    chirality?: PropChiralitySeam;
  }>();

  // Desktop (side-by-side layout, i.e. nav sidebar present) opens the picker as
  // a full-height RIGHT side drawer instead of a bottom sheet — matches the
  // inbox/messages drawer for consistency. On mobile/narrow viewports it stays
  // a bottom sheet (the iOS full-height fix lives in the [data-placement="bottom"]
  // CSS override below). Driven directly off the layout manager rather than
  // Drawer's respectLayoutMode, which would also tag the overlay with
  // side-by-side-layout and clamp the backdrop to the right half.
  let isSideBySide = $state(false);
  let layoutUnsubscribe: (() => void) | null = null;

  onMount(() => {
    isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });
  });

  onDestroy(() => layoutUnsubscribe?.());

  const placement = $derived(isSideBySide ? "right" : "bottom");

  function setOpen(open: boolean) {
    if (isOpen === open) return;
    isOpen = open;
    onOpenChange?.(open);
  }

  function handlePropSelect(propType: PropType) {
    const hapticService = getHapticFeedback();
    hapticService?.trigger("selection");
    // Selection updates the live prop preview while the picker stays available
    // for comparison. Closing is always a separate action: backdrop, X,
    // Escape, or drag-dismiss.
    onSelect(propType);
  }

  function handleTabChange(tab: "left" | "right") {
    const hapticService = getHapticFeedback();
    hapticService?.trigger("selection");
    activeTab = tab;
  }

  function handleClose() {
    const hapticService = getHapticFeedback();
    hapticService?.trigger("selection");
    setOpen(false);
  }
</script>

<Drawer
  {isOpen}
  {placement}
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={true}
  ariaLabel={title}
  class="prop-selection-drawer"
  onOpenChange={(open) => {
    if (!open) setOpen(false);
  }}
>
  <div class="sheet-content">
    <DrawerHeader
      {title}
      subtitle="Pick a prop or open a family to choose its style."
      onClose={handleClose}
    />

    <div class="picker-body" class:scrolls={!!onPrimaryPropColorsChange}>
      {#if showCatDogToggle || showTabs}
        <div class="picker-toolbar">
          {#if showCatDogToggle}
            <CatDogToggle
              catDogMode={catDogEnabled}
              onToggle={() => onCatDogToggle?.()}
            />
          {/if}

          {#if showTabs}
            <div
              class="segment-control"
              role="tablist"
              aria-label="Prop hand selection"
              transition:growFade={{ axis: "y" }}
            >
              <button
                type="button"
                role="tab"
                class="segment-btn"
                class:active={activeTab === "left"}
                aria-selected={activeTab === "left"}
                onclick={() => handleTabChange("left")}
              >
                <span class="color-dot blue" aria-hidden="true"></span>
                Left
              </button>
              <button
                type="button"
                role="tab"
                class="segment-btn"
                class:active={activeTab === "right"}
                aria-selected={activeTab === "right"}
                onclick={() => handleTabChange("right")}
              >
                <span class="color-dot red" aria-hidden="true"></span>
                Right
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if onPrimaryPropColorsChange}
        <div class="color-settings">
          <PrimaryPropColorSettings
            colors={primaryPropColors}
            {darkMode}
            onchange={onPrimaryPropColorsChange}
          />
        </div>
      {/if}

      <BentoPropGrid
        {selectedPropType}
        {color}
        {title}
        variant="inline"
        scrollMode={onPrimaryPropColorsChange ? "host" : "internal"}
        fill={!onPrimaryPropColorsChange}
        onSelect={handlePropSelect}
        {chirality}
      />
    </div>
  </div>
</Drawer>

<style>
  .picker-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .picker-body.scrolls {
    overflow-y: auto;
  }
  .color-settings {
    padding: 12px 18px;
    flex-shrink: 0;
  }
  /* Bottom drawer sizing - centered with margin auto (avoids transform conflicts with drag) */
  :global(.prop-selection-drawer[data-placement="bottom"]) {
    /* DEFINITE height, not fit-content. BentoPropGrid's .grid-scroll is a
       flex:1 + overflow:auto region; under an indefinite (fit-content) parent
       iOS WebKit collapses it to its 0 min-size when computing the intrinsic
       height, so the sheet lands at the min-height floor (~half screen) while
       Blink/Android grows to full. A definite height removes the intrinsic-size
       step entirely, so both engines render the same.
       calc(100dvh - safe-area-top): iOS tucks under the notch; on Android the
       top inset is ~0 so it stays pinned to the top (matches the Fold). */
    height: 100vh;
    height: calc(100dvh - env(safe-area-inset-top, 0px));
    max-width: 480px;
    /* left:0/right:0 match the Drawer bottom defaults — dropped. */
    margin-left: auto;
    margin-right: auto;
    border-radius: var(--sheet-radius-large, 20px)
      var(--sheet-radius-large, 20px) 0 0;
  }

  /* Desktop side drawer: full-height right panel (matches the inbox/messages
     drawer). Wide enough for the grid's six-column layout, so every prop is
     on screen at laptop height instead of behind a scrollbar. Height comes
     from Drawer's right-placement rules (top:0/bottom:0). */
  :global(.prop-selection-drawer[data-placement="right"]) {
    --sheet-width: min(800px, 92vw);
  }

  :global(.prop-selection-drawer) {
    /* Theme panel colors are intentionally translucent on animated canvases.
       A picker needs an opaque reading surface, so keep the active theme wash
       while painting it over the shared solid drawer floor. */
    --sheet-bg:
      linear-gradient(
        var(--theme-panel-bg, rgb(15, 15, 20)),
        var(--theme-panel-bg, rgb(15, 15, 20))
      ),
      var(--sheet-bg-solid, rgb(15, 15, 20));
    --sheet-filter: none;
  }

  /* Content - fills drawer */
  .sheet-content {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .picker-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 18px 4px;
    flex-shrink: 0;
  }

  .segment-control {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    width: fit-content;
  }

  .segment-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    padding: 8px 20px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    min-height: 36px;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  .segment-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08)) 50%,
      transparent
    );
    color: var(--theme-text, white);
  }

  .segment-btn.active {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-text, white);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--theme-accent) 20%, transparent),
      0 2px 8px color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .segment-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .color-dot.blue {
    background: var(--prop-blue, #3b82f6);
  }

  .color-dot.red {
    background: var(--prop-red, #ef4444);
  }

  @media (prefers-reduced-motion: reduce) {
    .segment-btn {
      transition: none;
    }
  }
</style>
