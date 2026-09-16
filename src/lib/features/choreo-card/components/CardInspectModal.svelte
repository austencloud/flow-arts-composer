<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Snippet } from "svelte";
  import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import CardPreviewStack from "./designer/CardPreviewStack.svelte";
  import LiveChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import CardArrowFixGrid from "./CardArrowFixGrid.svelte";
  import PictographInspectModal from "$lib/features/create/shared/components/sequence-actions/PictographInspectModal.svelte";
  import { getCatalogLayoutPolicy } from "../domain/catalog-layout-policy";
  import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { initializeSpecialOverrides } from "$lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton";
  import { initializeDefaultOverrides } from "$lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton";
  import { getClaudeCodeCopier } from "$lib/shared/browse/get-claude-code-copier";

  interface Props {
    sequence?: SequenceData | null;
    showWord?: boolean;
    includeStartPlacement?: boolean;
    onClose: () => void;
    onContextMenu?: (x: number, y: number, rerender: () => void) => void;
    frontImageUrl?: string | null;
    backImageUrl?: string | null;
    extraActions?: Snippet;
    /** Async re-bake of THIS card's front (updates the preview image). */
    onRerender?: () => Promise<void>;
    /** Card's effective prop types (default: global settings, matching the bake). */
    leftPropType?: PropType;
    rightPropType?: PropType;
    /** "live" shows the responsive notation card. "print" keeps the physical
     * front-and-back inspector used by deck production. */
    presentation?: "print" | "live";
    browseViewMode?: BrowseViewMode;
  }

  let {
    sequence,
    showWord = true,
    includeStartPlacement = true,
    onClose,
    onContextMenu,
    frontImageUrl,
    backImageUrl,
    extraActions,
    onRerender,
    leftPropType,
    rightPropType,
    presentation = "print",
    browseViewMode,
  }: Props = $props();

  let mode = $state<"preview" | "fix">("preview");
  let selectedStep = $state<StepData | null>(null);
  let rebaking = $state(false);

  // Mirror PrintPreviewPages: explicit prop types win, else global settings,
  // else staff. Keeps the edited override key identical to the baked key.
  const settings = $derived(getSettings());
  const effLeftProp = $derived(
    leftPropType ?? settings.leftPropType ?? PropType.STAFF
  );
  const effRightProp = $derived(
    rightPropType ?? settings.rightPropType ?? PropType.STAFF
  );

  async function enterFixMode(): Promise<void> {
    mode = "fix";
    // The editor writes to the Special/Default override repos and the card-front
    // re-bake reads its arrow placements through the resolver those repos
    // register on init. Opened from /choreo_card/releaser the app may never have
    // initialized them (that normally happens in Create), so a save would not
    // persist and the re-bake would read nothing — the edit would not show.
    // Initialize here; both are idempotent (no-op if already initialized).
    await Promise.all([
      initializeSpecialOverrides(),
      initializeDefaultOverrides(),
    ]);
  }

  function onCellSelected(step: StepData): void {
    selectedStep = step;
  }

  async function rebakeFront(): Promise<void> {
    if (!onRerender || rebaking) return;
    rebaking = true;
    try {
      await onRerender();
    } finally {
      rebaking = false;
    }
  }

  // Esc / backdrop out of the editor without finishing: just return to the grid
  // so another pictograph can be picked. No re-bake (nothing was committed here).
  function closeEditor(): void {
    selectedStep = null;
  }

  // The editor's "Done": the dock already persisted the edit, so go straight back
  // to the side-by-side view (skip the grid — one pictograph is the common case)
  // and re-bake the card front off the now-saved override.
  async function handleEditorDone(): Promise<void> {
    selectedStep = null;
    mode = "preview";
    await rebakeFront();
  }

  async function exitFixMode(): Promise<void> {
    await rebakeFront(); // ensure the latest fix is baked before showing preview
    mode = "preview";
  }

  let stackEl: HTMLDivElement | undefined = $state();
  let copyImageState = $state<"idle" | "copying" | "success" | "error">("idle");
  let copyDataState = $state<"idle" | "copying" | "success" | "error">("idle");

  let imageResetTimer: ReturnType<typeof setTimeout>;
  let imageErrorTimer: ReturnType<typeof setTimeout>;
  let dataResetTimer: ReturnType<typeof setTimeout>;
  onDestroy(() => {
    clearTimeout(imageResetTimer);
    clearTimeout(imageErrorTimer);
    clearTimeout(dataResetTimer);
  });

  const imageComposition = getImageCompositionManager();
  let compositionVersion = $state(0);
  function onCompositionChanged(): void {
    compositionVersion++;
  }
  onMount(() => {
    imageComposition.registerObserver(onCompositionChanged);
  });
  onDestroy(() => imageComposition.unregisterObserver(onCompositionChanged));

  const showQRCode = $derived.by(() => {
    void compositionVersion;
    return imageComposition.showQRCode;
  });

  function editSequence() {
    if (!sequence) return;
    localStorage.setItem("tka-pending-edit-sequence", JSON.stringify(sequence));
    onClose();
    toast.info("Opening for editing...", 2000);
    void handleModuleChange("create", "construct");
  }

  async function copyCardImage() {
    if (copyImageState === "copying" || !stackEl) return;
    copyImageState = "copying";
    try {
      const { domToBlob } = await import("modern-screenshot");
      const blob = await domToBlob(stackEl, { scale: 2 });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      copyImageState = "success";
      clearTimeout(imageResetTimer);
      imageResetTimer = setTimeout(() => {
        copyImageState = "idle";
      }, 2000);
    } catch {
      copyImageState = "error";
      clearTimeout(imageErrorTimer);
      imageErrorTimer = setTimeout(() => {
        copyImageState = "idle";
      }, 2000);
    }
  }

  // Copy this card's sequence as the compact, AI-friendly text the sequence
  // viewer uses (ClaudeCodeCopier) — letters, motions, turns, locations,
  // orientations, reversals. Lets two side-by-side cards be pasted for comparison.
  async function copyCardData() {
    if (copyDataState === "copying" || !sequence) return;
    copyDataState = "copying";
    try {
      const result = await getClaudeCodeCopier().copyForClaude(sequence);
      if (!result?.success) throw new Error("copy failed");
      copyDataState = "success";
    } catch {
      copyDataState = "error";
    } finally {
      clearTimeout(dataResetTimer);
      dataResetTimer = setTimeout(() => {
        copyDataState = "idle";
      }, 2000);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (selectedStep) return; // editor handles its own Esc
    if (mode === "fix") {
      void exitFixMode();
      return;
    }
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" role="presentation" onclick={handleBackdropClick}>
  <div
    class="modal-container"
    class:live-container={presentation === "live"}
    class:rendered-pair-container={Boolean(backImageUrl)}
    role="dialog"
    aria-modal="true"
    aria-label={presentation === "live"
      ? "Choreo Card viewer"
      : "Card inspector"}
  >
    <div
      class="stack-wrapper"
      class:live-preview={presentation === "live"}
      bind:this={stackEl}
      role="group"
      aria-label="Card preview"
    >
      {#if mode === "preview"}
        {#if presentation === "live"}
          {#if sequence}
            <LiveChoreoCard
              {sequence}
              {showWord}
              {includeStartPlacement}
              showDifficultyLevel={false}
              showNotes={false}
              showLoopGlyph={true}
              showQRCode={false}
              showMandala={true}
              {browseViewMode}
              darkMode={true}
              leftPropType={effLeftProp}
              rightPropType={effRightProp}
              forceContain={true}
              startPlacementLayoutOverride={getCatalogLayoutPolicy(
                sequence.steps?.length ?? 0
              )}
            />
          {/if}
        {:else}
          <CardPreviewStack
            {sequence}
            {showWord}
            {includeStartPlacement}
            startPlacementLayout={getCatalogLayoutPolicy(
              sequence?.steps?.length ?? 0
            )}
            {showQRCode}
            showInfoCard={false}
            printMode={true}
            {frontImageUrl}
            {backImageUrl}
            onCardContextMenu={onContextMenu}
          />
        {/if}
      {:else if sequence}
        <CardArrowFixGrid
          {sequence}
          leftPropType={effLeftProp}
          rightPropType={effRightProp}
          {includeStartPlacement}
          onSelect={onCellSelected}
        />
      {/if}
    </div>

    <div class="bottom-bar">
      <div class="actions">
        {#if sequence}
          <button
            class="action-btn"
            onclick={editSequence}
            aria-label="Open sequence in construct for full editing"
          >
            <i class="fas fa-pen-to-square"></i> Edit in Construct
          </button>
        {/if}
        <button
          class="action-btn"
          onclick={copyCardImage}
          disabled={copyImageState === "copying"}
          aria-label="Copy image"
        >
          {#if copyImageState === "copying"}
            <i class="fas fa-spinner fa-spin"></i> Capturing...
          {:else if copyImageState === "success"}
            <i class="fas fa-check"></i> Copied!
          {:else if copyImageState === "error"}
            <i class="fas fa-times"></i> Failed
          {:else}
            <i class="fas fa-image"></i> Copy Image
          {/if}
        </button>
        {#if sequence}
          <button
            class="action-btn"
            onclick={copyCardData}
            disabled={copyDataState === "copying"}
            aria-label="Copy sequence data in AI-friendly text"
          >
            {#if copyDataState === "copying"}
              <i class="fas fa-spinner fa-spin"></i> Copying...
            {:else if copyDataState === "success"}
              <i class="fas fa-check"></i> Copied!
            {:else if copyDataState === "error"}
              <i class="fas fa-times"></i> Failed
            {:else}
              <i class="fas fa-terminal"></i> Copy Data
            {/if}
          </button>
          {#if mode === "preview"}
            <button
              class="action-btn"
              onclick={enterFixMode}
              aria-label="Fix arrow positions on this card's pictographs"
            >
              <i class="fas fa-arrows-up-down-left-right"></i> Fix Arrows
            </button>
          {:else}
            <button
              class="action-btn done-btn"
              onclick={exitFixMode}
              disabled={rebaking}
              aria-label="Finish fixing arrows and re-render the card"
            >
              {#if rebaking}
                <i class="fas fa-spinner fa-spin"></i> Re-rendering...
              {:else}
                <i class="fas fa-check"></i> Done
              {/if}
            </button>
          {/if}
        {/if}
        {#if extraActions}
          {@render extraActions()}
        {/if}
      </div>
    </div>
  </div>

  <button class="close-btn" onclick={onClose} aria-label="Close">
    <i class="fas fa-times"></i>
  </button>
</div>

{#if selectedStep}
  <!-- The inspector fills its positioned host. This host is a fullscreen modal
       of its own, so it supplies a fixed viewport-sized box to fill. -->
  <div class="inspect-host">
    <PictographInspectModal
      show
      stepData={selectedStep}
      onClose={closeEditor}
      onDone={handleEditorDone}
    />
  </div>
{/if}

<style>
  /* Full-size positioned box for the inspector to fill. Sits above this host's
     own backdrop so it covers the card editor while it's open. */
  .inspect-host {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal) + 1);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--theme-overlay-bg, rgba(0, 0, 0, 0.88));
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 200ms ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 90vw;
    height: 90vh;
    max-width: 1600px;
  }

  .modal-container.live-container {
    width: min(90vw, calc((90vh - 150px) * 2));
    height: auto;
  }

  .modal-container.rendered-pair-container {
    max-width: none;
  }

  .stack-wrapper {
    flex: 1;
    width: 100%;
    min-height: 0;
  }

  .stack-wrapper.live-preview {
    box-sizing: border-box;
    flex: 0 1 auto;
    aspect-ratio: 2 / 1;
    padding: clamp(8px, 1.5vw, 20px);
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-lg, 18px);
    background:
      radial-gradient(
        circle at 50% 42%,
        color-mix(in srgb, var(--theme-accent, #6366f1) 7%, transparent),
        transparent 58%
      ),
      var(--theme-panel-bg, #11131a);
    box-shadow: var(--theme-shadow, 0 18px 56px rgba(0, 0, 0, 0.42));
  }

  .close-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    z-index: calc(var(--z-modal) + 1);
  }

  .close-btn:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
  }

  .bottom-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* One uniform toolbar button for every action — including the Swap Card
     button injected via the extraActions snippet from another component, which
     is why these are :global descendant rules (they out-specify that button's
     own scoped style). Token-based, 44px touch target, single hover. The green
     Done keeps its own accent below. */
  .actions :global(button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    font-family: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease;
  }

  .actions :global(button:hover:not(:disabled)) {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #6366f1);
    color: #fff;
    transform: translateY(-1px);
  }

  .actions :global(button:focus-visible) {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .actions :global(button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Primary action — the green Done in fix mode. Out-specifies the uniform
     rule via the extra class. */
  .actions :global(.done-btn) {
    background: var(--semantic-success, #238636);
    border-color: var(--semantic-success, #238636);
    color: #fff;
  }
  .actions :global(.done-btn:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--semantic-success, #238636) 85%, #fff);
    border-color: var(--semantic-success, #238636);
    color: #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-backdrop {
      animation: none;
    }
    .actions :global(button:hover:not(:disabled)) {
      transform: none;
    }
  }
</style>
