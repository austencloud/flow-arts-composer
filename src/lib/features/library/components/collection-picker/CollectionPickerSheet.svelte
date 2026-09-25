<!--
CollectionPickerSheet.svelte

Drawer-hosted collections picker for a saved sequence. Bottom sheet on
mobile, right-side drawer on desktop (matches PropSelectionSheet / the inbox
drawer). The picker body and all membership writes live in
CollectionPickerContent; this file is only the sheet chrome.

Mounted once by CollectionPickerHost at app level, never by a card — see
collection-picker-state for why.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import CollectionPickerContent from "./CollectionPickerContent.svelte";

  let {
    isOpen = false,
    sequenceIds,
    isBulk = false,
    sequenceLabel,
    currentCollectionId = null,
    onClose,
    onBulkComplete,
  }: {
    isOpen?: boolean;
    sequenceIds: string[];
    isBulk?: boolean;
    sequenceLabel?: string;
    /** Collection being browsed, marked "Currently here" in the list. */
    currentCollectionId?: string | null;
    onClose: () => void;
    onBulkComplete: () => void;
  } = $props();

  // Desktop opens a full-height right drawer; mobile stays a bottom sheet.
  // Driven off the layout manager directly, mirroring PropSelectionSheet.
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

  function handleClose(): void {
    getHapticFeedback()?.trigger("selection");
    onClose();
  }
</script>

<Drawer
  {isOpen}
  {placement}
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={true}
  ariaLabel="Collections"
  class="collection-picker-drawer"
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <div class="sheet-content">
    <button
      type="button"
      class="close-button"
      onclick={handleClose}
      aria-label="Close collection picker"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>

    <h2 class="sheet-title">Collections</h2>

    <div class="sheet-body">
      <CollectionPickerContent
        mode={isBulk ? "bulk" : "live"}
        sequenceId={isBulk ? undefined : sequenceIds[0]}
        {sequenceIds}
        {sequenceLabel}
        {currentCollectionId}
        {onBulkComplete}
      />
    </div>
  </div>
</Drawer>

<style>
  /* Drawer.css caps the bottom sheet at --sheet-max-width and centers it. */
  :global(.collection-picker-drawer[data-placement="bottom"]) {
    --sheet-max-width: 480px;
    border-radius: var(--sheet-radius-large, 20px)
      var(--sheet-radius-large, 20px) 0 0;
  }

  :global(.collection-picker-drawer[data-placement="right"]) {
    --sheet-width: min(420px, 92vw);
  }

  .sheet-content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    max-height: 70vh;
    overflow: hidden;
  }

  .close-button {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 18px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .sheet-title {
    margin: 0;
    padding-right: 44px;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .sheet-body::-webkit-scrollbar {
    width: 6px;
  }

  .sheet-body::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .sheet-body::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  /* The right drawer is 100dvh. Its old 70vh inner cap clipped the collection
	   list early and left the bottom third of the panel unused. Keep the header
	   fixed and give the list the full remaining height. */
  :global(.collection-picker-drawer[data-placement="right"]) .sheet-content {
    height: 100%;
    max-height: none;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button {
      transition: none;
    }
  }
</style>
