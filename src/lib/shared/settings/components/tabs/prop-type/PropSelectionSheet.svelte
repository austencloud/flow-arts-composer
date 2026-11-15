<!--
  PropSelectionSheet.svelte
  Bottom drawer for selecting props.
  Uses BentoPropGrid to show all variations organized by family.

  Optional per-hand picking: pass handProps to put the Both / Left / Right
  choice at the top (HandPropToolbar).
  Parent controls which prop is selected and handles the selection callback.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, onDestroy } from "svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { responsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import BentoPropGrid from "./BentoPropGrid.svelte";
  import type { PropChiralitySeam } from "./prop-chirality-seam";
  import HandPropToolbar, {
    type HandPropToolbarProps,
  } from "./HandPropToolbar.svelte";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

  let {
    isOpen = $bindable(false),
    selectedPropType,
    color = "blue",
    title,
    onSelect,
    handProps,
    onOpenChange,
    onclosed,
    subtitle,
    chirality,
    showColors = true,
    fanAppearance,
    onFanAppearanceChange,
  } = $props<{
    isOpen?: boolean;
    selectedPropType: PropType;
    color?: "blue" | "red";
    title?: string;
    onSelect: (propType: PropType) => void;
    /** Both / Left / Right choice at the top; omit for one shared prop. */
    handProps?: HandPropToolbarProps;
    /** Reports drawer dismissal when the owner does not use two-way binding. */
    onOpenChange?: (open: boolean) => void;
    /** After the sheet has closed, once focus can move back to the host. */
    onclosed?: () => void;
    /** The line under the title; defaults to the standard help line. */
    subtitle?: string;
    /**
     * Buugeng chirality seam, forwarded to the grid. The sheet is opened per
     * hand, so hosts pass the hand this sheet is editing and it writes that
     * hand only — blue A beside red B is the pairing that nests.
     */
    chirality?: PropChiralitySeam;
    /** The picker's own prop-colour control; see BentoPropGrid. */
    showColors?: boolean;
    /** Host-owned appearance; unset edits the global settings. */
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
  }>();

  const displayTitle = $derived(title ?? t("settings_props_select_prop"));
  const displaySubtitle = $derived(subtitle ?? t("settings_prop_sheet_help"));

  // The close can come from the sheet (X, backdrop, Escape, drag) or from a
  // host that turns isOpen off; either way the host hears it once.
  let wasOpen = false;
  $effect(() => {
    const open = isOpen;
    if (wasOpen && !open) onclosed?.();
    wasOpen = open;
  });

  // Desktop (side-by-side layout, i.e. nav sidebar present) opens the picker as
  // a full-height RIGHT side drawer instead of a bottom sheet — matches the
  // inbox/messages drawer for consistency. On mobile/narrow viewports it stays
  // a bottom sheet (the iOS full-height fix lives in the [data-placement="bottom"]
  // CSS override below). Driven directly off the layout manager rather than
  // Drawer's respectLayoutMode, which would also tag the overlay with
  // side-by-side-layout and clamp the backdrop to the right half.
  let isSideBySide = $state(false);
  let isDrilled = $state(false);
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
    if (!open) isDrilled = false;
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
  ariaLabel={displayTitle}
  class="prop-selection-drawer"
  onOpenChange={(open) => {
    if (!open) setOpen(false);
  }}
>
  <div class="sheet-content">
    <DrawerHeader
      title={displayTitle}
      subtitle={displaySubtitle}
      onClose={handleClose}
    />

    <div class="picker-body">
      {#if !isDrilled && handProps}
        <div class="picker-toolbar" transition:growFade={{ axis: "y" }}>
          <HandPropToolbar {handProps} />
        </div>
      {/if}

      <BentoPropGrid
        {selectedPropType}
        previewHand={handProps?.hand === "left" || handProps?.hand === "right"
          ? handProps.hand
          : undefined}
        alsoSelectedPropType={handProps?.hand === "both" &&
        handProps.leftPropType !== handProps.rightPropType
          ? handProps.rightPropType
          : null}
        {color}
        title={displayTitle}
        variant="inline"
        flat
        scrollMode="internal"
        fill
        isActive={isOpen}
        onDrillChange={(drilled) => (isDrilled = drilled)}
        onSelect={handlePropSelect}
        {chirality}
        {showColors}
        {fanAppearance}
        {onFanAppearanceChange}
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
  /* Bottom drawer sizing. Drawer.css caps the sheet at --sheet-max-width and
     centers it with auto margins (no transform, so drag is unaffected). */
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
    --sheet-max-width: 480px;
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
    flex-shrink: 0;
    padding: 4px 2px 0;
  }
</style>
