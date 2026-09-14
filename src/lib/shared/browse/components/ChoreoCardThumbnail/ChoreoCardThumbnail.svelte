<!--
ChoreoCardThumbnail.svelte

Ultra-minimal card component for the Browse grid.
Interactive hosts can open the sequence detail viewer. Read-only hosts render
the card as static artwork.

Uses PropAwareThumbnail for cloud-cached rendering:
- First user to view a prop type renders it locally
- Rendered image is uploaded to Firebase Storage
- All subsequent users get instant loading from cloud

Variation support:
- When a sequence has variations (same word, different authors/props/turns),
  a pill shows "1/3" etc. at the bottom
- Tapping the pill cycles through variations with crossfade

-->
<script lang="ts">
  import { resolveViewingProps } from "$lib/shared/foundation/services/prop-viewing";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import { buildCardMenuSection } from "$lib/shared/choreo-card/services/card-menu-section";
  import { featureFlagService } from "$lib/shared/auth/services/post-hog-feature-flag-service.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { openSendSequenceSheetWithCard } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import { getSharer } from "$lib/shared/share/get-sharer";
  import { onDestroy, tick, untrack } from "svelte";
  import SheetMorphOverlay from "./SheetMorphOverlay.svelte";
  import {
    computeSheetRegionMap,
    type SheetRegionMap,
  } from "$lib/shared/browse/services/sheet-region-map";
  import { galleryStepCount } from "$lib/shared/browse/services/gallery-render-input";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { claimViewTransitionName } from "$lib/shared/transitions/view-transition-name-registry";
  import { ignoreViewTransitionSkip } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import VariationPill from "./VariationPill.svelte";
  import PreviewPlayChip from "./PreviewPlayChip.svelte";
  import SyncStatusBadge from "./SyncStatusBadge.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import { adminDeleteSequence } from "$lib/shared/library/services/admin-sequence-actions";
  import { notifyLibraryMutated } from "$lib/shared/library/library-events";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { openCollectionPicker } from "$lib/features/library/state/collection-picker-state.svelte";
  import { cardHoverPreview } from "$lib/shared/browse/state/card-hover-preview-state.svelte";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";

  let thumbnailRef = $state<ReturnType<typeof PropAwareThumbnail> | null>(null);

  // Cache for on-demand LOOP detection results (keyed by sequence ID)
  const {
    sequence,
    variations = [],
    onPrimaryAction,
    onHover,
    selected = false,
    collectionPropType = null,
    leftPropType = undefined,
    rightPropType = undefined,
    catDogModeEnabled = false,
    lightMode = false,
    eager = false,
    handPathMode = false,
    showLeftMotion = true,
    showRightMotion = true,
    addWord,
    addDifficultyLevel,
    allowQR = true,
    collectionContext,
    selectedIds,
    selectionMode = false,
    onSelectionStart,
    onSelectionToggle,
  }: {
    sequence: SequenceData;
    variations?: SequenceData[];
    onPrimaryAction?: (sequence: SequenceData) => void;
    /** Fires on pointer enter (debounced 150ms) for cache pre-warming */
    onHover?: (sequence: SequenceData) => void;
    selected?: boolean;
    collectionPropType?: PropType | null;
    leftPropType?: PropType;
    rightPropType?: PropType;
    catDogModeEnabled?: boolean;
    lightMode?: boolean;
    /** Skip lazy loading - load thumbnails immediately (use in modals/pickers) */
    eager?: boolean;
    handPathMode?: boolean;
    /** Show blue motion (prop + arrow) in thumbnail. Default: true */
    showLeftMotion?: boolean;
    /** Show red motion (prop + arrow) in thumbnail. Default: true */
    showRightMotion?: boolean;
    addWord?: boolean;
    addDifficultyLevel?: boolean;
    /** Allow a baked-in QR (signed-in only, gated by the user's showQRCode
     * setting + a spare grid cell). Default true so the gallery honors the
     * setting. The QR variant is its own shared cache class (deterministic
     * short code), so it still loads from static/cloud — no per-card local
     * render. Pass false for surfaces too small to scan (e.g. peeks). */
    allowQR?: boolean;
    /**
     * Set when this card renders inside one of the viewer's own collections
     * (Browse > Collections detail). Adds a "Remove from this collection"
     * menu entry. Unlike "Add to collection…" this is NOT gated on owning the
     * sequence — a collection can hold other people's public sequences, and
     * taking one out of YOUR folder is always allowed.
     */
    collectionContext?: {
      id: string;
      name: string;
      onRemove: (sequenceId: string) => void;
    };
    /** Picker hosts: ids currently selected. Checked against the DISPLAYED
     * variation (the pill cycles it), not the base card — taps act on the
     * displayed sequence, so the outline must follow it. Overrides `selected`. */
    selectedIds?: ReadonlySet<string>;
    /** Personal-library batch selection. A touch/pen long-press enters the
     * mode; once active, normal taps toggle the displayed variation. */
    selectionMode?: boolean;
    onSelectionStart?: (sequence: SequenceData) => void;
    onSelectionToggle?: (sequence: SequenceData) => void;
  } = $props();

  // Track which variation is currently displayed.
  // Initialized to this card's own position in the variations array so each card
  // starts by showing its own base sequence (prevents duplicate view-transition-names).
  let currentVariationIndex = $state(0);

  // The sequence currently being shown (either the original or a variation)
  // Always fallback to the base sequence to guarantee non-undefined
  const displayedSequence: SequenceData = $derived.by(() => {
    if (variations.length > 1) {
      const variation = variations[currentVariationIndex];
      return variation ?? sequence;
    }
    return sequence;
  });
  const previewReadOnly = $derived(userPreviewState.isActive);

  // Total count for the pill
  const variationCount = $derived(
    variations.length > 1 ? variations.length : 0
  );

  // Cycle to next variation
  function handleCycleVariation() {
    if (variations.length <= 1) return;
    const wasPlaying = previewActive;
    currentVariationIndex = (currentVariationIndex + 1) % variations.length;
    // Keep playing across the swap. The preview is keyed by sequence id, so
    // without this the new variation reads as a different card and the
    // animation stops the moment you go looking for another version.
    if (wasPlaying) cardHoverPreview.request(displayedSequence);
  }

  function handlePrimaryAction(event: MouseEvent) {
    if (longPressFired) {
      event.preventDefault();
      longPressFired = false;
      if (clickSuppressionTimer !== null) {
        clearTimeout(clickSuppressionTimer);
        clickSuppressionTimer = null;
      }
      return;
    }

    if (selectionMode && onSelectionToggle) {
      onSelectionToggle(displayedSequence);
      return;
    }

    // Desktop parity with photo galleries: a modified click can start a
    // selection without asking users to hold down a mouse button.
    if (
      onSelectionStart &&
      (event.shiftKey || event.ctrlKey || event.metaKey)
    ) {
      onSelectionStart(displayedSequence);
      return;
    }

    onPrimaryAction?.(displayedSequence);
  }

  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_TOLERANCE_SQ = 100;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let clickSuppressionTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressOrigin: { x: number; y: number } | null = null;
  let longPressFired = false;
  let isLongPressing = $state(false);
  let lastPointerType: string | undefined;

  function cancelSelectionLongPress(): void {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressOrigin = null;
    isLongPressing = false;
  }

  function handleSelectionPointerDown(event: PointerEvent): void {
    lastPointerType = event.pointerType;
    if (
      !onSelectionStart ||
      selectionMode ||
      event.button !== 0 ||
      event.pointerType === "mouse"
    ) {
      return;
    }

    // The variation pill owns its own tap. Holding it should not select the
    // whole card underneath.
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button") !== event.currentTarget
    ) {
      return;
    }

    cancelSelectionLongPress();
    longPressFired = false;
    longPressOrigin = { x: event.clientX, y: event.clientY };
    isLongPressing = true;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressOrigin = null;
      isLongPressing = false;
      longPressFired = true;
      onSelectionStart(displayedSequence);

      // Some mobile browsers suppress the compatibility click after a hold.
      // Expire the guard so the next deliberate tap is never swallowed.
      clickSuppressionTimer = setTimeout(() => {
        longPressFired = false;
        clickSuppressionTimer = null;
      }, 800);
    }, LONG_PRESS_MS);
  }

  function handleSelectionPointerMove(event: PointerEvent): void {
    if (!longPressOrigin) return;
    const dx = event.clientX - longPressOrigin.x;
    const dy = event.clientY - longPressOrigin.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_TOLERANCE_SQ) {
      cancelSelectionLongPress();
    }
  }

  // Debounced hover handler - avoids pre-warming during fast scroll-past
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  // The animated preview is chip-driven, not hover-driven: it covers the
  // card's pictograph sheet, so starting it is the reader's decision rather
  // than something that happens while the pointer passes through. Hover still
  // does its original job — warming the sequence cache, invisibly — which
  // means the data is already hydrated by the time the chip is tapped.
  const previewActive = $derived(
    cardHoverPreview.isActive(displayedSequence.id)
  );

  // The static thumbnail is one baked <img>, so its header/grid/cells can't
  // carry view-transition-names directly. SheetMorphOverlay sprite-crops the
  // same image into named regions for the frames around the transition, and
  // the preview layer carries the matching names — the browser interpolates
  // between the card's own pixels and the live player. When any precondition
  // fails (no VT support, reduced motion, image not loaded, no steps data),
  // the layer's original dissolve runs instead.
  let thumbnailContainerEl = $state<HTMLDivElement | null>(null);
  let morphStaging = $state(false);
  let morphRegions = $state<SheetRegionMap | null>(null);
  let morphSrc = $state("");
  let morphBox = $state({ w: 0, h: 0 });
  /** True while the morph owns the play/stop animation — collapses the
   * preview layer's own dissolve so only one system moves things. */
  let morphDriven = $state(false);
  let previewReadyResolve: (() => void) | null = null;

  // Where the baked sheet's header band sits, as a height fraction of the
  // card. The preview layer renders its live header in exactly this band so
  // the word never moves across the play/stop toggle. Cards whose steps
  // aren't hydrated (Community entries) get a step-count shim — the layout
  // math only needs the count.
  const sheetHeaderFrac = $derived.by(() => {
    const seq = displayedSequence;
    try {
      const layout =
        getImageCompositionManager().getStartPositionLayoutForStepCount(
          galleryStepCount(seq)
        );
      const source = seq.steps?.length
        ? seq
        : ({
            ...seq,
            steps: Array.from({ length: galleryStepCount(seq) }, () => ({})),
          } as unknown as SequenceData);
      return computeSheetRegionMap(source, layout).header?.h ?? 0;
    } catch {
      return 0;
    }
  });

  function morphCapable(): boolean {
    return (
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /** Compute crop geometry + grab the displayed raster. False → fall back. */
  function prepareMorph(): boolean {
    const el = thumbnailContainerEl;
    const img = el?.querySelector("img");
    const seq = displayedSequence;
    if (!el || !img || !img.currentSrc || !img.complete || !seq.steps?.length) {
      return false;
    }
    try {
      const layout =
        getImageCompositionManager().getStartPositionLayoutForStepCount(
          galleryStepCount(seq)
        );
      morphRegions = computeSheetRegionMap(seq, layout);
    } catch {
      return false;
    }
    morphSrc = img.currentSrc;
    morphBox = { w: el.clientWidth, h: el.clientHeight };
    return true;
  }

  const nextFrame = () =>
    new Promise<void>((r) => requestAnimationFrame(() => r()));
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Serializes toggles: a click during an in-flight morph is dropped rather
   * than letting two startViewTransition orchestrations interleave and clobber
   * each other's staging state (browser would skip one anyway). */
  let toggleInFlight = false;

  async function togglePreview(): Promise<void> {
    if (toggleInFlight) return;
    const seq = displayedSequence;
    if (!morphCapable() || !prepareMorph()) {
      morphDriven = false;
      if (previewActive) cardHoverPreview.dismiss(seq.id);
      else cardHoverPreview.request(seq);
      return;
    }
    toggleInFlight = true;
    try {
      await runMorphToggle(seq);
    } finally {
      toggleInFlight = false;
      morphStaging = false;
      previewReadyResolve = null;
    }
  }

  async function runMorphToggle(seq: SequenceData): Promise<void> {
    morphDriven = true;
    if (previewActive) {
      // Stop: old state = live preview, new state = static card + crops. The
      // crops mount inside the same mutation so the player shrinks back into
      // the exact sheet regions it grew from.
      const vt = document.startViewTransition(async () => {
        morphStaging = true;
        cardHoverPreview.dismiss(seq.id);
        await tick();
      });
      ignoreViewTransitionSkip(vt);
      try {
        await vt.finished;
      } catch {
        /* skipped transitions still applied the DOM change */
      }
    } else {
      // Play: the crops must be PAINTED before the old-state capture, so they
      // mount a frame ahead of the transition.
      morphStaging = true;
      await tick();
      await nextFrame();
      const ready = new Promise<void>((r) => (previewReadyResolve = r));
      const vt = document.startViewTransition(async () => {
        morphStaging = false;
        cardHoverPreview.request(seq);
        // The preview hydrates motion data async; capture the new state only
        // once a playable frame exists. The race keeps a stalled load from
        // freezing the page — the VT degrades to a quick fade.
        await Promise.race([ready, delay(1500)]);
        await tick();
      });
      ignoreViewTransitionSkip(vt);
      try {
        await vt.finished;
      } catch {
        /* skipped */
      }
    }
  }

  function handlePointerEnter() {
    if (!onHover) return;
    hoverTimer = setTimeout(() => {
      onHover(displayedSequence);
      hoverTimer = null;
    }, 150);
  }

  function handlePointerLeave() {
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    cancelSelectionLongPress();
  }

  // Reset to this card's own position ONLY when the base sequence identity changes
  // (e.g. the grid reuses this component for a different sequence).
  // variations access is untracked so that array reference changes (from parent
  // re-renders, virtualizer updates, etc.) don't reset the user's cycling.
  $effect(() => {
    const id = sequence.id;
    untrack(() => {
      if (variations.length > 1) {
        const ownIndex = variations.findIndex((v) => v.id === id);
        currentVariationIndex = ownIndex >= 0 ? ownIndex : 0;
      } else {
        currentVariationIndex = 0;
      }
    });
  });

  let contextMenuState: ContextMenuState = $state({ open: false });

  let removeConfirmOpen = $state(false);
  let removeTarget = $state<SequenceData | null>(null);

  // The collections picker is hosted at app level (CollectionPickerHost), not
  // here: unticking the collection being browsed unmounts this very card, and a
  // sheet owned by the card would vanish with it. See collection-picker-state.

  async function performRemove() {
    if (previewReadOnly) {
      removeConfirmOpen = false;
      removeTarget = null;
      return;
    }
    const seq = removeTarget;
    if (!seq) return;
    const myUid = authState.user?.uid;
    const isOwner = !!myUid && seq.ownerId === myUid;
    const isPersonalLibrary = !!onSelectionStart;
    try {
      if (isOwner || isPersonalLibrary) {
        await getLibraryRepository().deleteSequence(seq.id);
      } else {
        const res = await adminDeleteSequence(seq.ownerId ?? "", seq.id);
        // The callable resolves even when it deleted nothing; treat that as a
        // failure so we don't show success + drop the card for a no-op delete.
        if (!res.deleted) throw new Error("Admin delete reported no deletion");
      }
      // Drives the browse engine's onLibraryMutated listener: removes the card
      // from the reactive grid state and the loader cache immediately.
      notifyLibraryMutated(seq.id);
      toast.success("Sequence permanently deleted");
    } catch (err) {
      console.error("Permanent delete failed:", err);
      toast.error("Sequence wasn't deleted. Try again.");
    } finally {
      removeConfirmOpen = false;
      removeTarget = null;
    }
  }

  function handleSendTo() {
    const seq = displayedSequence;
    closeContextMenu();
    openSendSequenceSheetWithCard(seq, (target) =>
      getSharer().getCardImageBlob(target, { darkMode: true })
    );
  }

  const contextMenuItems: ContextMenuEntry[] = $derived.by(() => {
    const seq = displayedSequence;
    // Canonical card section (Re-render, Send to, admin image actions). No
    // pictograph section here: thumbnails are static cached images that don't
    // re-render on visibility toggles.
    const items: ContextMenuEntry[] = buildCardMenuSection({
      sequenceForLibrarySave: seq,
      onRerender: previewReadOnly
        ? undefined
        : () => {
            closeContextMenu();
            thumbnailRef?.forceRerender();
          },
      onSendTo: handleSendTo,
      isAdmin: featureFlagService.isAdmin,
      sequenceForImageActions: seq,
    });

    const myUid = authState.user?.uid;
    const isOwner = !!myUid && seq.ownerId === myUid;
    const isPersonalLibrary = !!onSelectionStart;
    // Owner-only: filing into a collection is filing YOUR sequence into YOUR
    // collection. Admins viewing someone else's card don't get this (that would
    // reference a foreign sequence id — out of scope until save-to-library-first).
    if (!previewReadOnly && (isOwner || isPersonalLibrary)) {
      items.push({ type: "separator" } as ContextMenuEntry, {
        id: "add-to-collection",
        label: "Collections…",
        icon: "fa-folder-plus",
        action() {
          closeContextMenu();
          openCollectionPicker({
            sequenceId: seq.id,
            sequenceLabel: seq.name,
            currentCollectionId: collectionContext?.id ?? null,
          });
        },
      });
    }
    if (!previewReadOnly && collectionContext) {
      const ctx = collectionContext;
      items.push({ type: "separator" } as ContextMenuEntry, {
        id: "remove-from-collection",
        label: `Remove from "${ctx.name}"`,
        icon: "fa-folder-minus",
        action() {
          closeContextMenu();
          ctx.onRemove(seq.id);
        },
      });
    }
    if (
      !previewReadOnly &&
      (isOwner || isPersonalLibrary || featureFlagService.isAdmin)
    ) {
      items.push({ type: "separator" } as ContextMenuEntry, {
        id: "remove-from-library",
        label: "Delete permanently",
        icon: "fa-trash",
        danger: true,
        action() {
          closeContextMenu();
          removeTarget = seq;
          removeConfirmOpen = true;
        },
      });
    }
    return items;
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const pointerType =
      "pointerType" in e
        ? String((e as PointerEvent).pointerType)
        : lastPointerType;
    if (
      onSelectionStart &&
      (longPressFired || (pointerType && pointerType !== "mouse"))
    ) {
      return;
    }
    contextMenuState = { open: true, x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenuState = { open: false };
  }

  const isSelected = $derived(
    selectedIds ? selectedIds.has(displayedSequence.id) : selected
  );
  const isInteractive = $derived(
    !!onPrimaryAction || !!onSelectionStart || !!onSelectionToggle
  );

  // The same sequence is on screen twice whenever an overlay stacks over a
  // grid: the variation picker modal, the "add sequences" sheet, the smart
  // collection builder. Two elements carrying `sequence-<id>` abort the next
  // view transition with InvalidStateError, so the name is claimed rather than
  // stamped. The grid card mounts first and keeps the name; the overlay copy
  // renders without one. See view-transition-name-registry.
  let morphName = $state<string | undefined>(undefined);

  $effect(() => {
    const name = `sequence-${displayedSequence.id}`;
    const release = claimViewTransitionName(name, (granted) => {
      morphName = granted ? name : undefined;
    });
    return () => {
      release();
      morphName = undefined;
    };
  });

  onDestroy(() => {
    cancelSelectionLongPress();
    if (clickSuppressionTimer !== null) {
      clearTimeout(clickSuppressionTimer);
    }
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer);
    }
    // The virtualized grid recycles cards out from under an open preview.
    cardHoverPreview.dismiss(displayedSequence.id);
  });
</script>

{#snippet cardContents()}
  {@const viewing = resolveViewingProps(
    getSettings(),
    displayedSequence,
    collectionPropType
  ).config}
  <!-- view-transition-name enables Google Photos-style morph animation to
       /sequence/[id]. Undefined on any duplicate copy of this sequence that is
       mounted at the same time (see the morph-name claim above). -->
  <div
    bind:this={thumbnailContainerEl}
    class="thumbnail-container"
    class:crossfade={variationCount > 0}
    style:view-transition-name={morphName}
  >
    <PropAwareThumbnail
      bind:this={thumbnailRef}
      sequence={displayedSequence}
      leftPropType={viewing.leftPropType}
      rightPropType={viewing.rightPropType}
      catDogModeEnabled={viewing.catDogMode}
      {lightMode}
      {eager}
      {handPathMode}
      {showLeftMotion}
      {showRightMotion}
      {addWord}
      {addDifficultyLevel}
      {allowQR}
    />

    {#if previewActive}
      {#await import("$lib/shared/browse/components/hover-preview/CardHoverPreviewLayer.svelte") then mod}
        <mod.default
          sequence={displayedSequence}
          {collectionPropType}
          instant={morphDriven}
          headerFrac={sheetHeaderFrac}
          onReady={() => previewReadyResolve?.()}
        />
      {/await}
    {/if}

    {#if morphStaging && morphRegions}
      <SheetMorphOverlay
        src={morphSrc}
        regions={morphRegions}
        boxWidth={morphBox.w}
        boxHeight={morphBox.h}
      />
    {/if}
  </div>

  <SyncStatusBadge status={displayedSequence.syncStatus} />

  {#if (displayedSequence.publicPerformanceCount ?? 0) > 0}
    <span
      class="performance-count"
      aria-label={`${displayedSequence.publicPerformanceCount} public ${displayedSequence.publicPerformanceCount === 1 ? "performance" : "performances"}`}
      title={`${displayedSequence.publicPerformanceCount} public ${displayedSequence.publicPerformanceCount === 1 ? "performance" : "performances"}`}
    >
      <i class="fas fa-play" aria-hidden="true"></i>
      {displayedSequence.publicPerformanceCount}
    </span>
  {/if}

  {#if selectionMode || isLongPressing}
    <span
      class="selection-indicator"
      class:checked={isSelected}
      class:pressing={isLongPressing}
      aria-hidden="true"
    >
      {#if isSelected}
        <i class="fas fa-check"></i>
      {/if}
    </span>
  {/if}

  <!-- One row so the chips can never land on top of each other, and so adding
       a third later doesn't need new positioning math. -->
  <div class="card-chips">
    {#if !selectionMode}
      <PreviewPlayChip playing={previewActive} onToggle={togglePreview} />
    {/if}
    <VariationPill
      currentIndex={currentVariationIndex}
      totalCount={variationCount}
      onCycle={handleCycleVariation}
    />
  </div>
{/snippet}

{#if isInteractive}
  <button
    type="button"
    class="choreo-card interactive"
    class:selected={isSelected}
    class:selection-mode={selectionMode}
    class:long-pressing={isLongPressing}
    class:light-mode={lightMode}
    style:--selection-hold-duration={`${LONG_PRESS_MS}ms`}
    data-ghost={selectionMode ? undefined : "safe"}
    data-ghost-kind={selectionMode ? undefined : "gallery-item"}
    data-ghost-linger={selectionMode ? undefined : ""}
    onclick={handlePrimaryAction}
    oncontextmenu={handleContextMenu}
    onpointerdown={handleSelectionPointerDown}
    onpointermove={handleSelectionPointerMove}
    onpointerup={cancelSelectionLongPress}
    onpointercancel={cancelSelectionLongPress}
    onpointerenter={handlePointerEnter}
    onpointerleave={handlePointerLeave}
    aria-pressed={selectionMode ? isSelected : undefined}
    aria-label={selectionMode
      ? `${isSelected ? "Deselect" : "Select"} ${displayedSequence.name || displayedSequence.word || "sequence"}`
      : undefined}
  >
    {@render cardContents()}
  </button>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="choreo-card static"
    class:light-mode={lightMode}
    oncontextmenu={handleContextMenu}
  >
    {@render cardContents()}
  </div>
{/if}

<ContextMenu
  menuState={contextMenuState}
  items={contextMenuItems}
  onClose={closeContextMenu}
/>

<ConfirmDialog
  bind:isOpen={removeConfirmOpen}
  title="Permanently delete this sequence?"
  message="This removes the sequence from your library, this device, and the community gallery. It can't be undone."
  confirmText="Delete permanently"
  cancelText="Keep"
  variant="danger"
  onConfirm={performRemove}
  onCancel={() => {
    removeConfirmOpen = false;
    removeTarget = null;
  }}
/>

<style>
  .choreo-card {
    position: relative;
    border-radius: 0;
    overflow: hidden;
    background: transparent;
    border: none;
    color: var(--theme-text);
    display: block;
    width: 100%;
    padding: 0;
    margin: 0;

    container-type: inline-size;
    container-name: choreo-card;

    touch-action: pan-y;
    -webkit-touch-callout: none;
  }

  .choreo-card.interactive {
    cursor: pointer;
    transition: transform var(--transition-fast);
  }

  .choreo-card.interactive:hover {
    transform: scale(1.02);
  }

  .choreo-card.static {
    cursor: default;
  }

  /* Active state - brief feedback on touch/mobile only */
  @media (hover: none) and (pointer: coarse) {
    .choreo-card.interactive:active {
      transform: scale(0.98);
      transition-duration: var(--duration-instant);
    }
  }

  .choreo-card.interactive:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .choreo-card.selected {
    outline: 2px solid color-mix(in srgb, var(--semantic-info) 80%, transparent);
    outline-offset: 2px;
  }

  .choreo-card.selection-mode.selected {
    outline-color: var(--theme-accent);
    box-shadow: inset 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 82%, transparent);
  }

  .choreo-card.long-pressing {
    transform: scale(0.985);
  }

  .selection-indicator {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(28px, 12cqw, 40px);
    aspect-ratio: 1;
    border: 2px solid rgba(255, 255, 255, 0.88);
    border-radius: 50%;
    background: rgba(8, 10, 16, 0.72);
    color: var(--theme-text-on-accent, #fff);
    font-size: clamp(11px, 4.5cqw, 16px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.42);
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .selection-indicator.checked {
    border-color: var(--theme-accent);
    background: var(--theme-accent);
    transform: scale(1.06);
  }

  .selection-indicator.pressing {
    animation: selection-hold var(--selection-hold-duration) linear both;
  }

  @keyframes selection-hold {
    from {
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.42),
        inset 0 0 0 0 var(--theme-accent);
    }
    to {
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.42),
        inset 0 0 0 14px var(--theme-accent);
    }
  }

  /* Light mode: transparent background, images handle their own bg */
  .choreo-card.light-mode {
    background: transparent;
  }

  /* Thumbnail container for crossfade animation */
  .thumbnail-container {
    width: 100%;
    height: 100%;
    /* Anchors the preview layer, which fills this box in place of the static
       thumbnail. */
    position: relative;
  }

  /* Bottom-right corner — centered, these sat on top of the card's beat cells
     (worst on mobile 2-col grids where a chip covered whole pictographs).
     Above the preview layer so the chips stay usable while it animates. */
  .card-chips {
    position: absolute;
    bottom: 6px;
    right: 6px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .performance-count {
    position: absolute;
    bottom: 6px;
    left: 6px;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
    color: var(--theme-text);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
    backdrop-filter: blur(8px);
  }

  .performance-count i {
    color: var(--theme-accent);
    font-size: 0.8em;
  }

  /* Smooth crossfade when cycling variations */
  .thumbnail-container.crossfade :global(img),
  .thumbnail-container.crossfade :global(.placeholder) {
    transition: opacity var(--duration-normal) ease-out;
  }

  /* On mobile, suppress the morph view-transition-name so the drawer
     slide-up animation isn't fighting with a morph animation */
  @media (max-width: 767px) {
    .thumbnail-container {
      view-transition-name: none !important;
    }
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .choreo-card {
      transition: none;
    }
    .choreo-card.interactive:hover,
    .choreo-card.interactive:active {
      transform: none;
    }
    .selection-indicator {
      transition: none;
    }
    .thumbnail-container.crossfade :global(img),
    .thumbnail-container.crossfade :global(.placeholder) {
      transition: none;
    }
    .selection-indicator.pressing {
      animation: none;
    }
  }
</style>
