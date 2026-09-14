<!--
  SaveToLibraryPanel.svelte

  Side panel (desktop) / bottom sheet (mobile) for saving sequences to library.
  Uses CreatePanelDrawer for responsive layout matching other Create panels.
-->
<script lang="ts" module>
  export interface SaveMetadata {
    name: string;
    tags: string[];
    collectionIds: string[];
    notes: string;
  }
</script>

<script lang="ts">
  import PropPairField from "$lib/shared/pictograph/prop/components/PropPairField.svelte";
  import CreatePanelDrawer from "./CreatePanelDrawer.svelte";
  import SaveProgressOverlay from "$lib/features/library/components/SaveProgressOverlay.svelte";
  import ExpandableField from "$lib/features/library/components/ExpandableField.svelte";
  import CollectionPickerContent from "$lib/features/library/components/collection-picker/CollectionPickerContent.svelte";
  import ContentAppealModal from "$lib/features/moderation/components/ContentAppealModal.svelte";
  import HallOfShameGate from "$lib/features/hall-of-shame/components/HallOfShameGate.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { getCreateModuleContext } from "../context/create-module-context";
  import { getLibrarySaveService } from "$lib/features/library/get-library-save-service";
  import { getContentModerator } from "$lib/features/moderation/get-content-moderator";
  import { getHallOfShameSubmitter } from "$lib/features/hall-of-shame/get-hall-of-shame-submitter";
  import { createSavePanelState } from "../state/save-panel-state.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { getSoloPropSaveOrchestrator } from "$lib/features/library/get-solo-prop-save-orchestrator";
  import CardFooterEditor from "$lib/shared/share/components/CardFooterEditor.svelte";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
  } from "$lib/shared/share/domain/models/card-presentation";

  // The preview must mirror the artifact the save will actually generate. Both
  // the saved thumbnail (LibrarySaveService.generateAndUploadThumbnail) and this
  // preview now read every card toggle from the same composition settings +
  // app-settings prop type, so prop / QR / mandala / footer all agree with the
  // saved PNG instead of drifting (they used to share only includeStartPosition).
  const compositionManager = getImageCompositionManager();

  interface Props {
    show: boolean;
    word?: string;
    /** When true, shows context that saving is needed before sharing */
    showShareContext?: boolean;
    onClose?: () => void;
    onSaveComplete?: (sequenceId: string) => void;
  }

  let {
    show,
    word = "",
    showShareContext = false,
    onClose,
    onSaveComplete,
  }: Props = $props();

  // Context
  const ctx = getCreateModuleContext();

  // Resolve services (once, at component init)
  let librarySaveService: ReturnType<typeof getLibrarySaveService> | null =
    null;
  try {
    librarySaveService = getLibrarySaveService();
  } catch {
    /* optional */
  }

  let contentModerator: ReturnType<typeof getContentModerator> | null = null;
  try {
    contentModerator = getContentModerator();
  } catch {
    /* optional */
  }

  let soloPropSaveOrchestrator: ReturnType<
    typeof getSoloPropSaveOrchestrator
  > | null = null;
  try {
    soloPropSaveOrchestrator = getSoloPropSaveOrchestrator();
  } catch {
    /* optional until an authenticated save */
  }

  let hallOfShameSubmitter: ReturnType<typeof getHallOfShameSubmitter> | null =
    null;
  try {
    hallOfShameSubmitter = getHallOfShameSubmitter();
  } catch {
    /* optional */
  }

  // Create the reactive state object
  const s = createSavePanelState({
    ctx,
    librarySaveService,
    soloPropSaveOrchestrator,
    contentModerator,
    hallOfShameSubmitter,
    getDefaultCardPresentation: () =>
      cardPresentationFromFooterSettings(
        compositionManager.showNotes,
        compositionManager.customNotesText
      ),
  });
  const resolvedCardFooter = $derived(resolveCardFooter(s.cardPresentation));

  // Bind props reactively so the state factory can read them
  s.setPropsGetter(() => ({
    show,
    word,
    showShareContext,
    onClose,
    onSaveComplete,
  }));

  // DOM-bound effects that must stay in the component
  // ResizeObserver for responsive layout detection
  let panelInnerEl: HTMLDivElement | null = null;

  $effect(() => {
    if (!panelInnerEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        s.panelWidth = entry.contentRect.width;
      }
    });
    observer.observe(panelInnerEl);
    return () => observer.disconnect();
  });

  // Enter key submits the panel when it's open
  $effect(() => {
    if (!s.isOpen) return;

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey && s.canSave) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
        e.preventDefault();
        s.handleSave();
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<CreatePanelDrawer
  bind:isOpen={s.isOpen}
  panelName="save-library"
  fullHeightOnMobile={true}
  showHandle={true}
  closeOnBackdrop={true}
  onClose={s.handleClose}
  ariaLabel="Add to Gallery"
>
  <div class="panel-inner" bind:this={panelInnerEl}>
    {#if s.isSaving}
      <SaveProgressOverlay currentStep={s.saveStep} steps={s.saveSteps} />
    {/if}

    <button
      class="close-button"
      onclick={s.handleClose}
      aria-label="Close panel"
      disabled={s.isSaving}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>

    <div class="panel-header">
      <h2>{s.headerTitle}</h2>
    </div>

    <div class="panel-body">
      {#if !s.isSolo}
        <PropPairField bind:value={s.saveProps} disabled={s.isSaving} />
        <p>Used when someone chooses As saved.</p>
      {/if}
      <!-- Sequence Preview — WYSIWYG: the same card the save will produce.
           Every toggle comes from the composition manager / app settings (the
           same sources buildCardRenderOptions reads for the saved PNG), so the
           prop, QR, mandala, LOOP glyph and footer match the saved file on every
           screen size (desktop included). -->
      {#if s.sequence}
        <div class="choreo-group">
          <div class="choreo-preview">
            <ChoreoCard
              sequence={{
                ...s.sequence,
                name: s.isSolo ? s.title : s.sequence.name,
                displayName: s.isSolo ? s.title : s.sequence.displayName,
                word: s.isSolo ? "" : s.tkaName,
              }}
              darkMode={s.darkMode}
              forceContain={true}
              leftPropType={s.saveProps.leftPropType}
              rightPropType={s.saveProps.rightPropType}
              showWord={s.isSolo ? false : compositionManager.addWord}
              showStepNumbers={compositionManager.addStepNumbers}
              showDifficultyLevel={compositionManager.addDifficultyLevel}
              includeStartPosition={compositionManager.includeStartPosition}
              showNotes={resolvedCardFooter.show}
              customNotesText={resolvedCardFooter.text}
              showLoopGlyph={compositionManager.showLoopGlyph}
              showQRCode={compositionManager.showQRCode}
              showMandala={compositionManager.showMandala}
              columnCount={compositionManager.getColumnCountForStepCount(
                s.sequence.steps?.length ?? 0
              )}
              browseViewMode={s.isSolo && s.soloHand
                ? {
                    subject: "props",
                    granularity: "solo",
                    hand: s.soloHand,
                  }
                : undefined}
            />
          </div>
        </div>

        <!-- Compact info row: variation / saved status (fixed-height slot) -->
        <div class="info-row">
          {#if s.isExactDuplicate && !s.isFlagged}
            <span class="info-tag info-tag-saved">
              <i class="fas fa-check-circle" aria-hidden="true"></i>
              Already saved
            </span>
          {:else if s.hasDuplicate && !s.isFlagged}
            <span class="info-tag info-tag-variation">
              <i class="fas fa-layer-group" aria-hidden="true"></i>
              Variation {s.duplicateCount + 1}
            </span>
          {/if}
        </div>
      {/if}

      {#if s.isSolo}
        <div class="form-group">
          <label for="solo-title">
            Title <span class="required">*</span>
          </label>
          <input
            id="solo-title"
            type="text"
            bind:value={s.title}
            placeholder="Name this choreography"
            class="input-field"
            maxlength="100"
            disabled={s.isSaving}
          />
          <p class="field-note">
            Saved as {s.authoredHand}-hand choreography. It can still be
            assigned to either hand when composing.
          </p>
        </div>
      {:else if s.isMixed}
        <div class="format-warning" role="alert">
          <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
          <div>
            <strong
              >This choreography mixes paired and single-hand beats.</strong
            >
            <p>
              Keep editing until every beat uses both hands or the same single
              hand.
            </p>
          </div>
        </div>
      {/if}

      <!-- Content Moderation Warning -->
      {#if s.isFlagged && s.moderationResult}
        <div class="moderation-warning">
          <div class="warning-header">
            <i class="fas fa-shield-alt" aria-hidden="true"></i>
            <span>Content flagged by moderation</span>
          </div>
          <p class="warning-text">
            This sequence contains content that cannot be published to the
            public gallery. You can still save it privately or share via link.
          </p>
          <div class="flagged-terms">
            {#each s.moderationResult.flaggedTerms as term}
              <span class="flagged-term">
                {term.category}: "{term.matchedPattern}"
              </span>
            {/each}
          </div>
          <div class="moderation-actions">
            <button
              type="button"
              class="appeal-button"
              onclick={s.handleOpenAppeal}
            >
              <i class="fas fa-gavel" aria-hidden="true"></i>
              Appeal
            </button>
            <button
              type="button"
              class="shame-button"
              onclick={s.handleSubmitToShame}
              disabled={s.isSubmittingToShame}
            >
              {#if s.isSubmittingToShame}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                Submitting to Hall of Shame...
              {:else}
                <i class="fas fa-skull" aria-hidden="true"></i>
                Hall of Shame
              {/if}
            </button>
          </div>
          {#if s.shameSubmitError}
            <div class="shame-error" role="alert">
              <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
              <span>{s.shameSubmitError}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Community visibility section -->
      {#if !s.isFlagged && !s.isSolo && !s.isMixed}
        <div
          class="community-section"
          class:disabled={!s.canPublishToCommunity}
        >
          <label class="toggle-row">
            <div class="toggle-label">
              <i class="fas fa-globe" aria-hidden="true"></i>
              <div class="toggle-label-text">
                <span class="toggle-label-main">Make this sequence public</span>
                <span class="toggle-label-sub"
                  >Anyone can find and view it in the community library</span
                >
              </div>
            </div>
            <button
              type="button"
              class="toggle-button"
              class:toggle-on={s.publishToCommunity}
              onclick={() => (s.publishToCommunity = !s.publishToCommunity)}
              disabled={s.isSaving || !s.canPublishToCommunity}
              aria-pressed={s.publishToCommunity}
              aria-label={!s.canPublishToCommunity
                ? `Needs at least ${s.communityMinSteps} steps to make public`
                : s.publishToCommunity
                  ? "Will publish to community on save"
                  : "Will save to personal library only"}
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </label>
          {#if !s.canPublishToCommunity}
            <p class="community-note">
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              Needs at least {s.communityMinSteps} steps to post to the community.
              Saves to your library.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Collections — file into your library's named collections -->
      {#if !s.isFlagged && !s.isSolo && !s.isMixed && s.currentUser}
        <div class="collections-section">
          <div class="section-heading">
            <i class="fas fa-folder-open" aria-hidden="true"></i>
            <div class="section-heading-text">
              <span class="section-heading-main">Add to a collection</span>
              <span class="section-heading-sub"
                >Keep it organized in your library</span
              >
            </div>
          </div>
          <CollectionPickerContent
            mode="select"
            selectedIds={s.selectedCollectionIds}
            onChange={(ids) => (s.selectedCollectionIds = ids)}
          />
        </div>
      {/if}

      {#if !s.isSolo && !s.isMixed}
        <div class="card-presentation-section">
          <CardFooterEditor
            value={s.cardPresentation}
            onchange={(value) => (s.cardPresentation = value)}
            description="Saved with this card. Private notes stay private."
            idBase="save-card-footer"
          />
        </div>
      {/if}

      <!-- Notes (optional) -->
      <div class="optional-section">
        <ExpandableField
          label="Notes"
          expanded={s.showNotes}
          onExpandedChange={(v) => (s.showNotes = v)}
          onCollapse={() => (s.notes = "")}
        >
          <textarea
            id="notes"
            bind:value={s.notes}
            placeholder={s.isSolo
              ? "Add personal notes about this choreography"
              : "Add personal notes about this sequence"}
            class="textarea-field"
            rows="3"
            maxlength="500"
          ></textarea>
        </ExpandableField>
      </div>
    </div>

    <div class="panel-footer">
      <button
        type="button"
        class="button button-secondary"
        onclick={s.handleClose}
      >
        Cancel
      </button>
      <button
        data-save-shortcut
        type="button"
        class="button button-primary"
        class:button-saved={s.isExactDuplicate && !s.isFlagged}
        onclick={s.handleSave}
        disabled={!s.canSave}
      >
        {#if s.isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Saving...
        {:else if s.requiresAccount}
          <i class="fas fa-user-plus" aria-hidden="true"></i>
          Create account to save
        {:else if s.isExactDuplicate && !s.isFlagged}
          <i class="fas fa-check" aria-hidden="true"></i>
          Saved
        {:else if s.isFlagged}
          <i class="fas fa-ban" aria-hidden="true"></i>
          Cannot Publish
        {:else}
          <i class="fas fa-bookmark" aria-hidden="true"></i>
          Save to Library
        {/if}
      </button>
    </div>
  </div>
</CreatePanelDrawer>

<!-- Content Appeal Modal -->
{#if s.showAppealModal && s.moderationResult && s.tkaName}
  <ContentAppealModal
    word={s.tkaName}
    contentId={s.savedSequenceIdForAppeal || "pending"}
    contentType="sequence"
    flaggedTerms={s.moderationResult.flaggedTerms}
    onClose={s.handleCloseAppeal}
    onAppealSubmitted={s.handleAppealSubmitted}
  />
{/if}

<!-- Hall of Shame Age Gate -->
{#if s.showShameGate}
  <HallOfShameGate
    onVerified={s.handleShameVerified}
    onCancel={s.handleShameCanceled}
  />
{/if}

<style>
  .panel-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding-bottom: env(safe-area-inset-bottom);
    overflow: hidden;
  }

  .close-button {
    position: absolute;
    top: 16px;
    right: 16px;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: none;
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
    z-index: 10;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    transform: scale(1.05);
  }

  .close-button:active {
    transform: scale(0.95);
  }

  .close-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Header - compact title only */
  .panel-header {
    padding: 24px 32px 12px;
    flex-shrink: 0;
    text-align: center;
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--font-size-2xl, 1.5rem);
    font-weight: 600;
    color: var(--theme-text);
  }

  /* Body - content flows from top */
  .panel-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 24px 32px;
    overflow-y: auto;
    overscroll-behavior: contain;
    gap: 20px;
  }

  .choreo-group {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .choreo-preview {
    flex: 1;
    min-height: 0;
    border-radius: 12px;
    overflow: hidden;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .required {
    color: var(--semantic-error, #ef4444);
  }

  .input-field {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
  }

  .input-field:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .field-note {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }

  .format-warning {
    display: flex;
    gap: 12px;
    padding: 14px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 45%, transparent);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 12%,
      transparent
    );
    color: var(--theme-text);
  }

  .format-warning > i {
    margin-top: 2px;
    color: var(--semantic-warning, #f59e0b);
  }

  .format-warning strong,
  .format-warning p {
    margin: 0;
  }

  .format-warning p {
    margin-top: 4px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }

  /* Content Moderation Warning */
  .moderation-warning {
    padding: 16px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .moderation-warning .warning-header {
    color: var(--semantic-error, #ef4444);
  }

  .flagged-terms {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .flagged-term {
    padding: 4px 10px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-family: var(--font-mono, monospace);
    color: var(--theme-text-dim);
  }

  .moderation-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .appeal-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 50%, transparent);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .appeal-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border-color: var(--semantic-error, #ef4444);
  }

  .appeal-button i {
    color: var(--semantic-error, #ef4444);
  }

  .shame-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 50%, transparent);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .shame-button:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    border-color: var(--semantic-error, #ef4444);
  }

  .shame-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .shame-button i {
    color: var(--semantic-error, #ef4444);
  }

  .shame-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    font-size: var(--font-size-sm, 14px);
    color: #fca5a5;
  }

  .shame-error i {
    color: var(--semantic-error, #ef4444);
  }

  /* Fixed-height slot so duplicate/saved status doesn't cause layout shift */
  /* Compact info row - prop type + variation/saved status as inline tags */
  .info-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    min-height: 28px;
  }

  .info-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
  }

  .info-tag i {
    font-size: 10px;
    opacity: 0.7;
  }

  .info-tag-saved {
    color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 30%,
      transparent
    );
  }

  .info-tag-saved i {
    opacity: 1;
  }

  .info-tag-variation {
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .info-tag-variation i {
    opacity: 1;
  }

  /* Saved state button - green checkmark instead of purple gradient */
  .button-saved {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    ) !important;
    box-shadow: none !important;
    color: var(--semantic-success, #22c55e) !important;
    cursor: default !important;
  }

  /* Optional fields - collapsed by default */
  .optional-section {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .card-presentation-section {
    padding: 16px;
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
  }

  .textarea-field {
    width: 100%;
    padding: 14px 18px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text);
    font-size: var(--font-size-base, 16px);
    font-family: inherit;
    transition: all var(--duration-normal) ease;
    box-sizing: border-box;
  }

  .textarea-field:focus {
    outline: none;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .textarea-field::placeholder {
    color: color-mix(in srgb, var(--theme-text-dim) 70%, transparent);
  }

  .textarea-field {
    resize: vertical;
    min-height: 80px;
  }

  /* Footer - anchored at bottom with breathing room */
  .panel-footer {
    display: flex;
    gap: 12px;
    padding: 24px 32px;
    flex-shrink: 0;
  }

  .button {
    flex: 1;
    min-height: 56px; /* Slightly larger for prominence */
    padding: 16px 24px;
    border: none;
    border-radius: 14px;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .button-secondary {
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    border: 1.5px solid var(--theme-stroke);
  }

  .button-secondary:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .button-primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong) 0%,
      color-mix(in srgb, var(--theme-accent-strong) 80%, #000) 100%
    );
    color: white;
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent-strong) 50%, transparent);
  }

  .button-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px
      color-mix(in srgb, var(--theme-accent-strong) 60%, transparent);
  }

  .button-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .button-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Mobile adjustments */
  @media (max-width: 640px) {
    .panel-header {
      padding: 24px 24px 16px;
    }

    .panel-header h2 {
      font-size: var(--font-size-xl, 1.25rem);
    }

    .panel-body {
      padding: 16px 24px;
      gap: 16px;
    }

    .panel-footer {
      padding: 20px 24px;
    }

    .button {
      min-height: 52px;
      font-size: var(--font-size-base, 16px);
    }
  }

  /* Collections section — mirrors the community-section card language */
  .collections-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-heading > i {
    color: var(--theme-accent);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .section-heading-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-heading-main {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text);
  }

  .section-heading-sub {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  /* Community section */
  .community-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
  }

  /* Under the community minimum: dim the label (the toggle dims via :disabled). */
  .community-section.disabled .toggle-label {
    opacity: 0.5;
  }

  .community-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .community-note i {
    color: var(--theme-accent);
    flex-shrink: 0;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    gap: 12px;
    user-select: none;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text);
  }

  .toggle-label i {
    color: var(--theme-accent);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .toggle-label-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label-main {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text);
  }

  .toggle-label-sub {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .toggle-button {
    appearance: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .toggle-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toggle-track {
    display: block;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: var(--theme-stroke);
    position: relative;
    transition: background var(--duration-normal) ease;
  }

  .toggle-on .toggle-track {
    background: var(--theme-accent);
  }

  .toggle-thumb {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform var(--duration-normal) ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .toggle-on .toggle-thumb {
    transform: translateX(20px);
  }

  @media (prefers-reduced-motion: reduce) {
    .button,
    .textarea-field,
    .close-button,
    .toggle-track,
    .toggle-thumb {
      transition: none;
    }
  }
</style>
