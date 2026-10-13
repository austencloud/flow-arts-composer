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
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PropPairField from "#lib/shared/pictograph/prop/components/PropPairField.svelte";
  import CreatePanelDrawer from "./CreatePanelDrawer.svelte";
  import SaveProgressOverlay from "#lib/features/library/components/SaveProgressOverlay.svelte";
  import ExpandableField from "#lib/features/library/components/ExpandableField.svelte";
  import CollectionPickerContent from "#lib/features/library/components/collection-picker/CollectionPickerContent.svelte";
  import ContentAppealModal from "#lib/features/moderation/components/ContentAppealModal.svelte";
  import HallOfShameGate from "#lib/features/hall-of-shame/components/HallOfShameGate.svelte";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { getCreateModuleContext } from "../context/create-module-context";
  import { getLibrarySaveService } from "#lib/features/library/get-library-save-service.js";
  import { getContentModerator } from "#lib/features/moderation/get-content-moderator.js";
  import { getHallOfShameSubmitter } from "#lib/features/hall-of-shame/get-hall-of-shame-submitter.js";
  import { createSavePanelState } from "../state/save-panel-state.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getSoloPropSaveOrchestrator } from "#lib/features/library/get-solo-prop-save-orchestrator.js";
  import CardFooterEditor from "#lib/shared/share/components/CardFooterEditor.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import { popIn } from "#lib/shared/transitions/motion.js";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
  } from "#lib/shared/share/domain/models/card-presentation.js";

  // The preview must mirror the artifact the save will actually generate. Both
  // the saved thumbnail (LibrarySaveService.generateAndUploadThumbnail) and this
  // preview now read every card toggle from the same composition settings +
  // app-settings prop type, so prop / QR / mandala / footer all agree with the
  // saved PNG instead of drifting (they used to share only includeStartPlacement).
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

  // The card preview letterboxes inside its stage, so the overlay badge
  // follows the card's own top-left corner instead of the stage corner.
  let stageEl = $state<HTMLDivElement | null>(null);
  let cardInset = $state({ top: 0, left: 0 });
  $effect(() => {
    const stage = stageEl;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const cardEl = () =>
      stage.querySelector<HTMLElement>(".choreo-card-root > *");
    const measure = () => {
      const card = cardEl();
      if (!card) return;
      const s = stage.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      cardInset = {
        top: Math.max(0, Math.round(c.top - s.top)),
        left: Math.max(0, Math.round(c.left - s.left)),
      };
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const card = cardEl();
    if (card) observer.observe(card);
    measure();
    return () => observer.disconnect();
  });
</script>

<CreatePanelDrawer
  bind:isOpen={s.isOpen}
  panelName="save-library"
  fullHeightOnMobile={true}
  showHandle={true}
  closeOnBackdrop={true}
  onClose={s.handleClose}
  ariaLabel={t("create_review_add_to_gallery")}
>
  <div class="panel-inner" bind:this={panelInnerEl}>
    {#if s.isSaving}
      <SaveProgressOverlay currentStep={s.saveStep} steps={s.saveSteps} />
    {/if}

    <button
      class="close-button"
      onclick={s.handleClose}
      aria-label={t("compose_close_panel")}
      disabled={s.isSaving}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>

    <div class="panel-header">
      <h2>{s.headerTitle}</h2>
    </div>

    <!-- Two regions: the card the save will produce, and the choices about it.
         Stacked when the panel is narrow; side by side once it has the room
         (a 4K side drawer, or 1920 and up). The card keeps a definite box in
         both so it never shrinks to make room for the options. -->
    <div class="panel-layout">
      <section class="card-column" aria-label={t("create_save_preview_label")}>
        {#if s.sequence}
          <!-- WYSIWYG: the same card the save will produce. Every toggle comes
               from the composition manager / app settings (the same sources
               buildCardRenderOptions reads for the saved PNG), so the prop, QR,
               mandala, LOOP glyph and footer match the saved file. -->
          <div
            class="card-stage"
            bind:this={stageEl}
            style:--card-top="{cardInset.top}px"
            style:--card-left="{cardInset.left}px"
          >
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
              includeStartPlacement={compositionManager.includeStartPlacement}
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
            <!-- Status rides on the preview instead of taking a row under it. -->
            {#if s.isExactDuplicate && !s.isFlagged}
              <span class="card-badge card-badge-saved" transition:popIn>
                <i class="fas fa-check-circle" aria-hidden="true"></i>
                {t("create_review_already_saved")}
              </span>
            {:else if s.hasDuplicate && !s.isFlagged}
              <span class="card-badge card-badge-variation" transition:popIn>
                <i class="fas fa-layer-group" aria-hidden="true"></i>
                {t("create_save_variation", { count: s.duplicateCount + 1 })}
              </span>
            {/if}
          </div>
        {/if}

        {#if !s.isSolo}
          <div class="card-settings">
            <PropPairField
              bind:value={s.saveProps}
              disabled={s.isSaving}
              hint={t("prop_pair_saved_default_hint")}
            />
          </div>
        {/if}
      </section>

      <section class="options-column">
        {#if s.isSolo}
          <div class="form-group">
            <label for="solo-title">
              {t("create_review_title")} <span class="required">*</span>
            </label>
            <input
              id="solo-title"
              type="text"
              bind:value={s.title}
              placeholder={t("create_ui_name_this_choreography")}
              class="input-field"
              maxlength="100"
              disabled={s.isSaving}
            />
            <p class="field-note">
              {t("create_save_solo_hand", {
                hand:
                  s.authoredHand === "left"
                    ? t("create_save_hand_left")
                    : t("create_save_hand_right"),
              })}
            </p>
          </div>
        {:else if s.isMixed}
          <div class="format-warning" role="alert">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            <div>
              <strong
                >{t(
                  "create_review_this_choreography_mixes_paired_and_single_hand_beats"
                )}</strong
              >
              <p>
                {t(
                  "create_review_keep_editing_until_every_beat_uses_both_hands_or_the_same_single_hand"
                )}
              </p>
            </div>
          </div>
        {/if}

        <!-- Content Moderation Warning -->
        {#if s.isFlagged && s.moderationResult}
          <div class="moderation-warning">
            <div class="warning-header">
              <i class="fas fa-shield-alt" aria-hidden="true"></i>
              <span>{t("create_review_content_flagged_by_moderation")}</span>
            </div>
            <p class="warning-text">
              {t(
                "create_review_this_sequence_contains_content_that_cannot_be_published_to_the_public_gallery_you_can_stil"
              )}
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
                {t("create_review_appeal")}
              </button>
              <button
                type="button"
                class="shame-button"
                onclick={s.handleSubmitToShame}
                disabled={s.isSubmittingToShame}
              >
                {#if s.isSubmittingToShame}
                  <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  {t("create_review_submitting_to_hall_of_shame")}
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

        <!-- Community visibility: one row, the whole row is the control. -->
        {#if !s.isFlagged && !s.isSolo && !s.isMixed}
          <SettingToggleButton
            label={t("create_ui_make_this_sequence_public")}
            description={s.canPublishToCommunity
              ? t(
                  "create_ui_anyone_can_find_and_view_it_in_the_community_library"
                )
              : t("create_save_min_note", { count: s.communityMinSteps })}
            checked={s.publishToCommunity}
            disabled={s.isSaving || !s.canPublishToCommunity}
            onToggle={() => (s.publishToCommunity = !s.publishToCommunity)}
            onLabel={t("create_save_state_public")}
            offLabel={t("create_save_state_private")}
            ariaLabel={!s.canPublishToCommunity
              ? t("create_save_min_public", { count: s.communityMinSteps })
              : s.publishToCommunity
                ? t("create_save_publish_on_save")
                : t("create_save_private_only")}
            surface="card"
            density="compact"
          />
        {/if}

        <!-- Collections: file into your library's named collections -->
        {#if !s.isFlagged && !s.isSolo && !s.isMixed && s.currentUser}
          <div class="collections-section">
            <div class="section-heading">
              <i class="fas fa-folder-open" aria-hidden="true"></i>
              <span class="section-heading-main"
                >{t("create_ui_add_to_a_collection")}</span
              >
              <span class="section-heading-sub"
                >{t("create_ui_keep_it_organized_in_your_library")}</span
              >
            </div>
            <CollectionPickerContent
              mode="select"
              selectedIds={s.selectedCollectionIds}
              onChange={(ids) => (s.selectedCollectionIds = ids)}
            />
          </div>
        {/if}

        <!-- Card footer: a one-row setting, not a section of its own. -->
        {#if !s.isSolo && !s.isMixed}
          <div class="card-footer-row">
            <CardFooterEditor
              layout="inline"
              value={s.cardPresentation}
              onchange={(value) => (s.cardPresentation = value)}
              idBase="save-card-footer"
            />
          </div>
        {/if}

        <!-- Notes (optional) -->
        <div class="optional-section">
          <ExpandableField
            label={t("create_review_notes")}
            expanded={s.showNotes}
            onExpandedChange={(v) => (s.showNotes = v)}
            onCollapse={() => (s.notes = "")}
          >
            <textarea
              id="notes"
              bind:value={s.notes}
              placeholder={s.isSolo
                ? t("create_save_notes_choreo")
                : t("create_save_notes_sequence")}
              class="textarea-field"
              rows="3"
              maxlength="500"
            ></textarea>
          </ExpandableField>
        </div>
      </section>
    </div>

    <div class="panel-footer">
      <PanelButton variant="secondary" onclick={s.handleClose}>
        {t("create_review_cancel")}
      </PanelButton>
      <PanelButton
        saveShortcut
        accentColor={s.isExactDuplicate && !s.isFlagged
          ? "var(--semantic-success, #22c55e)"
          : undefined}
        onclick={s.handleSave}
        disabled={!s.canSave}
      >
        {#if s.isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t("create_review_saving")}
        {:else if s.requiresAccount}
          <i class="fas fa-user-plus" aria-hidden="true"></i>
          {t("create_review_create_account_to_save")}
        {:else if s.isExactDuplicate && !s.isFlagged}
          <i class="fas fa-check" aria-hidden="true"></i>
          {t("create_review_saved")}
        {:else if s.isFlagged}
          <i class="fas fa-ban" aria-hidden="true"></i>
          {t("create_review_cannot_publish")}
        {:else}
          <i class="fas fa-bookmark" aria-hidden="true"></i>
          {t("create_review_save_to_library")}
        {/if}
      </PanelButton>
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
  :global(.drawer-content.save-library-panel-container) {
    /* A form full of toggles, collection tiles and a card preview needs a
       matte reading surface. The shared translucent gradient let the live
       workspace (undo/redo, the card, the button row) bleed through, so
       resolve the theme panel color against the solid sheet base, like the
       sequence actions panel does. */
    --sheet-bg:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      var(--sheet-bg-solid, rgb(15, 15, 20));
    --sheet-filter: none;
  }

  /* The panel is the size container: its width picks the composition and its
     height sizes the card stage, so the same drawer composes itself for a
     phone sheet, a laptop drawer and a 4K side panel. */
  .panel-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding-bottom: env(safe-area-inset-bottom);
    overflow: hidden;
    container-type: size;
    container-name: save-panel;
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
    transition:
      background var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
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

  .panel-header {
    padding: 20px 32px 8px;
    flex-shrink: 0;
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 600;
    color: var(--theme-text);
  }

  /* Stacked composition: one scroll region, card first at a definite height. */
  .panel-layout {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 12px 32px 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .card-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-shrink: 0;
    min-width: 0;
  }

  .card-stage {
    position: relative;
    height: clamp(180px, 42cqh, 640px);
    border-radius: 12px;
    overflow: hidden;
  }

  .card-badge {
    position: absolute;
    top: calc(var(--card-top, 0px) + 10px);
    left: calc(var(--card-left, 0px) + 10px);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-panel-bg) 88%, transparent);
    border: 1px solid var(--theme-stroke);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    z-index: 2;
  }

  .card-badge-saved {
    color: var(--semantic-success, #22c55e);
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 45%,
      transparent
    );
  }

  .card-badge-variation {
    color: var(--theme-accent);
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
  }

  .card-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-settings > :global(.prop-pair-field) {
    width: 100%;
  }

  .options-column {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  /* Side-by-side composition: the card owns the left, the choices scroll on
     the right. The options keep a reading width; the card takes the rest. */
  @container save-panel (min-width: 840px) {
    .panel-layout {
      flex-direction: row;
      align-items: stretch;
      gap: 32px;
      padding: 12px 32px 8px;
      overflow: hidden;
    }

    .card-column {
      flex: 1 1 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      container-type: size;
      container-name: card-column;
      padding-right: 2px;
    }

    /* Fill the column minus the settings row, so the open prop picker scrolls
       under the card instead of squeezing it. */
    .card-stage {
      flex: 0 0 auto;
      height: calc(100cqh - 68px);
    }

    .options-column {
      flex: 0 1 clamp(360px, 42cqw, 640px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
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
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
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
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
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

  /* Collections */
  .collections-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .section-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .section-heading > i {
    color: var(--theme-accent);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    align-self: center;
  }

  .section-heading-main {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .section-heading-sub {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .card-footer-row {
    padding: 10px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .optional-section {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
    transition:
      outline var(--duration-normal) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
    box-sizing: border-box;
    resize: vertical;
    min-height: 80px;
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

  /* Footer: actions size to their labels and sit at the trailing edge. */
  .panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 32px 24px;
    flex-shrink: 0;
  }

  /* Phone sheet: tighter gutters, actions share the row. */
  @container save-panel (max-width: 639px) {
    .panel-header {
      padding: 20px 20px 8px;
    }

    .panel-layout {
      padding: 8px 20px;
      gap: 16px;
    }

    .panel-footer {
      padding: 12px 20px 20px;
    }

    .panel-footer > :global(.panel-btn) {
      flex: 1 1 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .textarea-field,
    .close-button {
      transition: none;
    }
  }
</style>
