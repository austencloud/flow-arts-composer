<!--
  SaveToLibraryView.svelte

  The Create tab's save mode. It replaces the tool panel (option picker,
  generator settings, ...) while the live step grid stays in the workspace as
  the preview of what gets saved, so nothing is drawn twice. The workspace
  layout slides the grid wider and fades its chrome; this view owns only the
  choices about the save and the Cancel / Save actions.
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
  import SaveProgressOverlay from "#lib/features/library/components/SaveProgressOverlay.svelte";
  import ExpandableField from "#lib/features/library/components/ExpandableField.svelte";
  import CollectionPickerContent from "#lib/features/library/components/collection-picker/CollectionPickerContent.svelte";
  import ContentAppealModal from "#lib/features/moderation/components/ContentAppealModal.svelte";
  import HallOfShameGate from "#lib/features/hall-of-shame/components/HallOfShameGate.svelte";
  import { getCreateModuleContext } from "../context/create-module-context";
  import { getLibrarySaveService } from "#lib/features/library/get-library-save-service.js";
  import { getContentModerator } from "#lib/features/moderation/get-content-moderator.js";
  import { getHallOfShameSubmitter } from "#lib/features/hall-of-shame/get-hall-of-shame-submitter.js";
  import { createSavePanelState } from "../state/save-panel-state.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getSoloPropSaveOrchestrator } from "#lib/features/library/get-solo-prop-save-orchestrator.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import { Crossfade, growFade, popIn } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import StepGrid from "../workspace-panel/sequence-display/components/StepGrid.svelte";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { collectionDisplayName } from "#lib/shared/library/domain/collection-display-name.js";
  import { createKeyboardInset } from "#lib/shared/mobile/utils/keyboard-inset.svelte.js";
  import { computeKeyboardOpenFrame } from "#lib/shared/mobile/utils/keyboard-open-frame.js";
  import { detectPlatform } from "#lib/shared/mobile/services/platform-detector.js";
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { onMount, untrack } from "svelte";
  import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";
  import { cardPresentationFromFooterSettings } from "#lib/shared/share/domain/models/card-presentation.js";

  // The saved card's footer defaults come from the same composition settings
  // the saved PNG reads (LibrarySaveService.generateAndUploadThumbnail).
  const compositionManager = getImageCompositionManager();

  interface Props {
    /** The sequence to save, when it is not the workspace's own. */
    sequence?: SequenceData | null;
    /** The workspace word, so a solo save and the duplicate check name it. */
    word?: string;
    /** When true, shows context that saving is needed before sharing */
    showShareContext?: boolean;
    /**
     * The host gave the view the whole workspace (phones and the Fold):
     * saving is a screen of its own, with the X in the top corner, the
     * sequence in the middle, one-line rows and a drill-down screen for each
     * group that needs more than a line.
     */
    screen?: boolean;
    onClose?: () => void;
    onSaveComplete?: (sequenceId: string) => void;
  }

  let {
    sequence,
    word = "",
    showShareContext = false,
    screen = false,
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
    // Decided once: a host either has its own sequence or saves the workspace's.
    getSequence: untrack(() => sequence) ? () => sequence ?? null : undefined,
  });

  // The view is mounted only while the save mode is open, so the state sees
  // it as open for as long as it exists.
  s.setPropsGetter(() => ({
    show: true,
    word,
    showShareContext,
    onClose,
    onSaveComplete,
  }));

  // DOM-bound effects that must stay in the component
  // ResizeObserver for responsive layout detection
  let viewEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!viewEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        s.panelWidth = entry.contentRect.width;
      }
    });
    observer.observe(viewEl);
    return () => observer.disconnect();
  });

  // Escape leaves the save view (the drawer used to own Escape). It goes
  // through the shared escape layers, so a dialog opened from the view (the
  // prop picker, the appeal modal, the age gate) sits above it and one press
  // closes only that dialog. With the animation showing beside the form, the
  // press flips back to the card and the form stays; the next one leaves.
  $effect(() => {
    if (!s.isOpen) return;
    return getEscapeLayerManager().register({
      id: "create:save-view",
      canDismiss: () =>
        !s.isSaving &&
        !s.showAppealModal &&
        !s.showShameGate &&
        !document.querySelector('[role="listbox"]'),
      dismiss: () => {
        if (ctx.panelState.isWorkspacePreviewChosen) {
          ctx.panelState.stopWorkspacePlayback();
          return "remains";
        }
        s.handleClose();
      },
    });
  });

  // Enter saves.
  $effect(() => {
    if (!s.isOpen) return;

    function onKeydown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      // On the phone screen a drill-down owns Enter (Done, a tile).
      if (drill !== null) return;
      if (e.key === "Enter" && !e.shiftKey && s.canSave) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
        // Enter on a dialog control (a prop tile) belongs to that dialog, and
        // on the player or the Card | Animation switch beside the form it
        // belongs to that control. Neither should save the sequence.
        if (target.closest("dialog, [data-playback-foreground]")) return;
        e.preventDefault();
        s.handleSave();
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  // Phone save screen ────────────────────────────────────────────────
  // One screen: rows that each say their current value in one line, and a
  // drill-down screen for the groups that need more than a line. The rows
  // and screens arrange the same save state; nothing here decides what is
  // saved.
  type SaveDrill = "collection" | "note";
  let drill = $state<SaveDrill | null>(null);

  $effect(() => {
    if (!screen) drill = null;
  });

  function openDrill(next: SaveDrill): void {
    drill = next;
  }

  function closeDrill(): void {
    drill = null;
    fieldFocused = false;
  }

  // Escape (and the system back) leaves a drill-down screen first; it is
  // registered after the save view's own layer, so it sits above it.
  $effect(() => {
    if (!screen || drill === null) return;
    return getEscapeLayerManager().register({
      id: "create:save-view-drill",
      canDismiss: () => !s.isSaving,
      dismiss: closeDrill,
    });
  });

  const screenTitle = $derived(
    drill === "collection"
      ? t("create_ui_add_to_a_collection")
      : drill === "note"
        ? t("create_review_notes")
        : s.headerTitle
  );

  const previewSequence = $derived(s.sequence);
  const previewStart = $derived(
    previewSequence?.startingPlacement ?? previewSequence?.startPlacement ?? null
  );
  const hasPreview = $derived(
    !!previewSequence &&
      ((previewSequence.steps?.length ?? 0) > 0 || !!previewStart)
  );

  const collectionSummary = $derived.by(() => {
    const ids = s.selectedCollectionIds;
    if (ids.length === 0) return t("library_ui_no_collection");
    const names = collectionsState.collections
      .filter((c) => ids.includes(c.id))
      .map((c) => collectionDisplayName(c));
    return names.length === ids.length
      ? names.join(", ")
      : t("create_save_collection_count", { count: ids.length });
  });

  const noteSummary = $derived(
    s.notes.trim() ? s.notes.trim() : t("create_save_note_add")
  );

  // Keyboard open (naming a new collection, writing a note): the shared
  // frame rule decides; only the field, its hint and its one button stay.
  const keyboard = createKeyboardInset(() => screen && drill !== null);
  let isIOSPlatform = $state(false);
  let isTouchDevice = $state(false);
  let fieldFocused = $state(false);
  onMount(() => {
    isIOSPlatform = detectPlatform() === "ios";
    try {
      isTouchDevice = getDeviceDetector().isTouchDevice();
    } catch {
      isTouchDevice = false;
    }
  });
  const keyboardFrame = $derived(
    screen &&
      drill !== null &&
      computeKeyboardOpenFrame({
        isInputFocused: fieldFocused,
        isSubmitting: false,
        isIOSPlatform,
        isTouchDevice,
        keyboardHeight: keyboard.height,
      })
  );

  function isTypingField(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
    );
  }

  function handleDrillFocusIn(event: FocusEvent): void {
    if (isTypingField(event.target)) fieldFocused = true;
  }

  function handleDrillFocusOut(event: FocusEvent): void {
    if (!isTypingField(event.relatedTarget)) fieldFocused = false;
  }
</script>

{#snippet statusPill()}
  {#if s.isExactDuplicate && !s.isFlagged}
    <span class="status-pill status-pill-saved" transition:popIn>
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      {t("create_review_already_saved")}
    </span>
  {:else if s.hasDuplicate && !s.isFlagged}
    <span class="status-pill status-pill-variation" transition:popIn>
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      {t("create_save_variation", { count: s.duplicateCount + 1 })}
    </span>
  {/if}
{/snippet}

{#snippet saveLabel(short: boolean)}
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
    <!-- On the screen the flagged note above the rows says why; the button
         keeps one line in every language. -->
    {short ? t("create_workspace_save") : t("create_review_cannot_publish")}
  {:else}
    <i class="fas fa-bookmark" aria-hidden="true"></i>
    {short ? t("create_workspace_save") : t("create_review_save_to_library")}
  {/if}
{/snippet}

{#snippet summaryRow(
  target: SaveDrill,
  icon: string,
  label: string,
  value: string
)}
  <!-- One control, one name: the whole row opens its own screen. -->
  <div class="screen-row">
    <PanelButton
      variant="quiet"
      fullWidth
      disabled={s.isSaving}
      onclick={() => openDrill(target)}
      ariaLabel={`${label}: ${value}`}
    >
      <span class="row-lead">
        <i class="fas {icon} row-icon" aria-hidden="true"></i>
        <span class="row-label">{label}</span>
      </span>
      <span class="row-value">
        <span class="row-value-text">{value}</span>
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </span>
    </PanelButton>
  </div>
{/snippet}

{#snippet notices()}
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
{/snippet}


{#if screen}
  <div
    class="save-view save-screen"
    class:keyboard-frame={keyboardFrame}
    bind:this={viewEl}
    role="region"
    aria-label={t("create_review_add_to_gallery")}
  >
    {#if s.isSaving}
      <SaveProgressOverlay currentStep={s.saveStep} steps={s.saveSteps} />
    {/if}

    <header class="screen-header">
      {#if drill}
        <!-- Back opens its own room beside the title, so the title slides
             over instead of being shoved sideways in one frame. -->
        <span
          class="header-back"
          transition:growFade={{ axis: "x", duration: DURATION.normal }}
        >
          <button
            type="button"
            class="close-button"
            onclick={closeDrill}
            aria-label={t("create_save_back")}
          >
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
        </span>
      {/if}
      <h2 class="screen-title">
        <Crossfade key={screenTitle} duration={DURATION.normal} mode="swap">
          {screenTitle}
        </Crossfade>
      </h2>
      <button
        type="button"
        class="close-button"
        onclick={s.handleClose}
        aria-label={t("compose_close_panel")}
        disabled={s.isSaving}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <div class="screen-body">
      <Crossfade
        key={drill ?? "main"}
        duration={DURATION.normal}
        mode="swap"
        motion="step"
        fill
      >
        {#if drill === "collection"}
          <div
            class="drill-pane collection-pane"
            onfocusin={handleDrillFocusIn}
            onfocusout={handleDrillFocusOut}
          >
            <CollectionPickerContent
              mode="select"
              noneTile
              selectedIds={s.selectedCollectionIds}
              onChange={(ids) => (s.selectedCollectionIds = ids)}
            />
          </div>
        {:else if drill === "note"}
          <div
            class="drill-pane note-pane"
            onfocusin={handleDrillFocusIn}
            onfocusout={handleDrillFocusOut}
          >
            <label class="note-label" for="save-screen-notes"
              >{t("create_review_notes")}</label
            >
            <textarea
              id="save-screen-notes"
              bind:value={s.notes}
              placeholder={s.isSolo
                ? t("create_save_notes_choreo")
                : t("create_save_notes_sequence")}
              class="textarea-field note-field"
              maxlength="500"
            ></textarea>
          </div>
        {:else}
          <div class="main-pane">
            <!-- The sequence being saved, as it stands in the workspace. It is
                 a picture here: nothing in it takes a tap. Notes about the
                 save (duplicate, flagged, a solo title) sit above it. -->
            <div class="sequence-area">
              {#if (s.isExactDuplicate || s.hasDuplicate) && !s.isFlagged}
                <div class="screen-status">
                  {@render statusPill()}
                </div>
              {/if}
              {@render notices()}
              {#if hasPreview && previewSequence && !s.isFlagged}
                <div
                  class="sequence-picture"
                  role="img"
                  aria-label={word || s.headerTitle}
                >
                  <div class="sequence-picture-content" inert>
                    <StepGrid
                      steps={previewSequence.steps ?? []}
                      startPlacement={previewStart}
                      gridJoin={sequenceGridJoin(previewSequence)}
                      sequenceWord={word}
                      sizingProfile="preview"
                      fitAllSteps={true}
                      stepIdentityPrefix="save-screen"
                      autoFocusSelectedStep={false}
                      observeScroll={false}
                    />
                  </div>
                </div>
              {/if}
            </div>

            <div class="row-group" role="group" aria-label={s.headerTitle}>
              {#if !s.isSolo}
                <div class="screen-row">
                  <PropPairField
                    bind:value={s.saveProps}
                    disabled={s.isSaving}
                    label={t("create_save_row_props")}
                    hint={t("prop_pair_saved_default_hint")}
                    row
                    picker="modal"
                  />
                </div>
              {/if}

              {#if !s.isFlagged && !s.isSolo && !s.isMixed}
                <div
                  class="screen-row public-row"
                  class:has-note={!s.canPublishToCommunity}
                >
                  <SettingToggleButton
                    label={t("create_save_row_public")}
                    description={s.canPublishToCommunity
                      ? t("create_save_row_public_hint")
                      : t("create_save_min_note", {
                          count: s.communityMinSteps,
                        })}
                    checked={s.publishToCommunity}
                    disabled={s.isSaving || !s.canPublishToCommunity}
                    onToggle={() =>
                      (s.publishToCommunity = !s.publishToCommunity)}
                    onLabel={t("settings_on")}
                    offLabel={t("settings_off")}
                    ariaLabel={!s.canPublishToCommunity
                      ? t("create_save_min_public", {
                          count: s.communityMinSteps,
                        })
                      : s.publishToCommunity
                        ? t("create_save_publish_on_save")
                        : t("create_save_private_only")}
                    surface="plain"
                    density="compact"
                  />
                </div>
              {/if}

              {#if !s.isFlagged && !s.isSolo && !s.isMixed && s.currentUser}
                {@render summaryRow(
                  "collection",
                  "fa-folder-open",
                  t("create_save_row_collection"),
                  collectionSummary
                )}
              {/if}

              {@render summaryRow(
                "note",
                "fa-note-sticky",
                t("create_review_notes"),
                noteSummary
              )}
            </div>
          </div>
        {/if}
      </Crossfade>
    </div>

    <footer
      class="screen-footer"
      class:drill-footer={drill !== null}
      class:steps-aside={keyboardFrame && drill === "collection"}
    >
      {#if drill}
        <PanelButton onclick={closeDrill} fullWidth>
          {t("create_review_done")}
        </PanelButton>
      {:else}
        <PanelButton variant="secondary" onclick={s.handleClose}>
          {t("create_review_cancel")}
        </PanelButton>
        <PanelButton
          variant="primary"
          saveShortcut
          accentColor={s.isExactDuplicate && !s.isFlagged
            ? "var(--semantic-success, #22c55e)"
            : undefined}
          onclick={s.handleSave}
          disabled={!s.canSave}
        >
          {@render saveLabel(true)}
        </PanelButton>
      {/if}
    </footer>
  </div>
{:else}
<div
  class="save-view"
  bind:this={viewEl}
  role="region"
  aria-label={t("create_review_add_to_gallery")}
>
  {#if s.isSaving}
    <SaveProgressOverlay currentStep={s.saveStep} steps={s.saveSteps} />
  {/if}

  <header class="view-header">
    <div class="view-heading">
      <h2>{s.headerTitle}</h2>
      <!-- Status pill: the slot is reserved so the title never shifts. -->
      <span class="status-slot">
        {@render statusPill()}
      </span>
    </div>
    <button
      type="button"
      class="close-button"
      onclick={s.handleClose}
      aria-label={t("compose_close_panel")}
      disabled={s.isSaving}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>

  <div class="view-body">
    {#if !s.isSolo}
      <!-- Which props the saved card shows. The grid keeps the workspace
           props, so this is a choice about the file, not about the view. -->
      <div class="save-props">
        <PropPairField
          bind:value={s.saveProps}
          disabled={s.isSaving}
          hint={t("prop_pair_saved_default_hint")}
          fill
          picker="modal"
        />
      </div>
    {/if}

    {@render notices()}

    <!-- Community visibility: one row, the whole row is the control. -->
    {#if !s.isFlagged && !s.isSolo && !s.isMixed}
      <SettingToggleButton
        label={t("create_ui_make_this_sequence_public")}
        description={s.canPublishToCommunity
          ? t("create_ui_anyone_can_find_and_view_it_in_the_community_library")
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

    <!-- Notes (optional) -->
    <div class="optional-section">
      <ExpandableField
        label={t("create_review_notes")}
        addLabel={t("create_save_add_notes")}
        removeLabel={t("create_save_remove_notes")}
        expanded={s.showNotes}
        onExpandedChange={(v) => (s.showNotes = v)}
        onCollapse={() => (s.notes = "")}
        fill
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
  </div>

  <footer class="view-footer">
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
      {@render saveLabel(false)}
    </PanelButton>
  </footer>
</div>
{/if}

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
  /* The view is the size container for its own composition: its width picks
     the gutters and footer layout, so one view serves the stacked phone column,
     a laptop side panel and the wider 4K band.

     The stack sits on the panel's vertical centre, the same axis the step
     grid sits on in the workspace beside it, so a short form (few
     collections, no notes) is a block placed next to the grid rather than a
     strip pinned to the top of a tall empty column. A tall form still
     scrolls inside the body between the pinned header and footer. */
  .save-view {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    container-type: inline-size;
    container-name: save-view;
  }

  .view-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    max-width: 720px;
    align-self: center;
    padding: 16px 24px 8px;
    flex-shrink: 0;
  }

  .view-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .view-heading h2 {
    margin: 0;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 600;
    color: var(--theme-text);
    line-height: 1.2;
  }

  /* Reserved row for the status pill, so it can come and go without moving
     the title or the body. */
  .status-slot {
    display: flex;
    align-items: center;
    min-height: 26px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
  }

  .status-pill-saved {
    color: var(--semantic-success, #22c55e);
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 45%,
      transparent
    );
  }

  .status-pill-variation {
    color: var(--theme-accent);
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
  }

  .close-button {
    flex-shrink: 0;
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

  /* One scroll region of choices. On a wide 4K panel the choices keep a
     reading width instead of stretching every toggle across the column.

     Opening a field can start the scroll mid-ease. The gutter stays reserved so
     the bar arriving doesn't narrow every row at once; where the bar takes up
     space, the right padding gives that space back so the rows line up with the
     header and footer. Touch screens have overlay bars, so no room is needed. */
  .view-body {
    --scrollbar-room: 0px;
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 720px;
    align-self: center;
    padding: 8px calc(24px - var(--scrollbar-room)) 8px 24px;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
  }

  @media (hover: hover) and (pointer: fine) {
    .view-body {
      --scrollbar-room: 10px;
    }
  }

  /* The body scrolls, so its rows keep their content height instead of
     shrinking to fit. Signed in, the Collections card overflows the body and
     squeezed the public row to its 36px floor: its second line sat on the
     card's border (two lines of Chinese, or the English description). */
  .view-body > :global(*) {
    flex-shrink: 0;
  }

  .save-props > :global(.prop-pair-field) {
    width: 100%;
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

  /* Footer: actions size to their labels and sit at the trailing edge, on
     the same band as the body. */
  .view-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    width: 100%;
    max-width: 720px;
    align-self: center;
    padding: 12px 24px 20px;
    flex-shrink: 0;
  }

  /* Phone column: tighter gutters, actions share the row. */
  @container save-view (max-width: 639px) {
    .view-header {
      padding: 12px 16px 4px;
    }

    .view-body {
      padding: 4px calc(16px - var(--scrollbar-room)) 4px 16px;
      gap: 12px;
    }

    .view-footer {
      padding: 10px 16px 16px;
    }

    .view-footer > :global(.panel-btn) {
      flex: 1 1 0;
    }
  }

  /* Phone save screen ───────────────────────────────────────────────
     The host gives the view the whole workspace. Header with the X in the
     top corner, the sequence taking the spare height, one bordered group of
     one-line rows, then Cancel and Save. No control container scrolls; only
     the collection tiles may, and they are content. */
  .save-view.save-screen {
    justify-content: flex-start;
  }

  .screen-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 56px;
    padding: 0 8px 0 16px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .header-back {
    display: flex;
    flex-shrink: 0;
    margin-inline-start: -8px;
  }

  .screen-title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    line-height: 1.2;
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .save-screen .close-button {
    width: 40px;
    height: 40px;
  }

  .screen-body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
  }

  .main-pane,
  .drill-pane {
    width: 100%;
    max-width: 560px;
    height: 100%;
    margin-inline: auto;
    padding-inline: 16px;
    box-sizing: border-box;
  }

  .main-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* At every phone size the rows fit. At 200% zoom on the smallest phones
       they outgrow the screen and would slide under Cancel and Save. */
    overflow-y: auto; /* scrolls: the rows, only when zoom makes them taller than the screen */
  }

  .sequence-area {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }

  .screen-status {
    display: flex;
    flex-shrink: 0;
  }

  .sequence-picture {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
  }

  .sequence-picture-content {
    position: absolute;
    inset: 0;
  }

  .row-group {
    flex: none;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
    overflow: hidden;
  }

  .screen-row {
    --row-height: 56px;
    display: flex;
    height: var(--row-height);
    min-width: 0;
  }

  .screen-row + .screen-row {
    border-top: 1px solid var(--theme-stroke);
  }

  .screen-row > :global(*) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .screen-row :global(.prop-pair-field) {
    height: 100%;
  }

  .row-group .screen-row :global(.ui-button.panel-btn) {
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 12px;
    justify-content: space-between;
    padding-block: 0;
    padding-inline: 14px 16px;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: var(--font-size-sm, 14px);
  }

  .screen-row :global(.setting-toggle) {
    height: 100%;
    min-height: 0;
    padding-block: 0;
  }

  .public-row :global(.setting-label),
  .public-row :global(.setting-description) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A sequence too short to post: the line under Public is a full sentence
     saying why. It wraps and the row grows to hold it, and the picture above
     gives up the height. The step count cannot change while this screen is
     open, so the row is this tall from the first paint and nothing moves. */
  .screen-row.public-row.has-note {
    height: auto;
    min-height: var(--row-height);
  }

  .public-row.has-note :global(.setting-toggle) {
    height: auto;
    min-height: var(--row-height);
    padding-block: 8px;
  }

  .public-row.has-note :global(.setting-description) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  .row-lead {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    /* The name wraps between words and gives way before the value does, but
       never gets narrower than its longest word. */
    min-width: min-content;
    flex-shrink: 99;
  }

  .row-icon {
    flex-shrink: 0;
    width: 32px;
    text-align: center;
    color: var(--theme-text-dim);
  }

  /* A long name takes a second line; the value beside it is never the part
     that gets cut. */
  .row-label {
    font-weight: 600;
    line-height: 1.15;
    white-space: normal;
    text-align: start;
    color: var(--theme-text);
  }

  .row-value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 1;
    max-width: 55%;
    min-width: 0;
    color: var(--theme-text-dim);
  }

  .row-value-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* At 200% zoom on a phone the row is too narrow for icon, name and value.
     The icon steps out so the words keep their room. */
  @container save-view (max-width: 260px) {
    .row-icon {
      display: none;
    }
  }

  .screen-footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 12px;
    width: 100%;
    max-width: 560px;
    margin-inline: auto;
    padding: 12px 16px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .screen-footer.drill-footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .screen-footer.steps-aside {
    display: none;
  }

  .screen-footer > :global(.panel-btn) {
    height: 52px;
    min-height: 52px;
    min-width: 0;
    white-space: nowrap;
  }

  /* Drill-down screens: the group's controls use the whole screen. Only the
     collection tiles may outgrow it, and only they scroll. */
  .drill-pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-block: 4px 8px;
    overflow: hidden;
  }

  .collection-pane {
    overflow-y: auto; /* scrolls: a long list of the person's collections */
    overscroll-behavior: contain;
  }

  .note-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .note-field {
    flex: 1 1 auto;
    min-height: 96px;
    resize: none;
  }

  /* Keyboard open while naming a collection: only the field and its button
     stay above the keys (the shared keyboard-open frame decides when). */
  .keyboard-frame .collection-pane :global(.collection-tile),
  .keyboard-frame .collection-pane :global(.picker-subtitle),
  .keyboard-frame .collection-pane :global(.find-row) {
    display: none;
  }

  /* The shortest phones: rows and actions give up a little height so the
     sequence keeps a readable picture. */
  @media (max-height: 640px) {
    .screen-header {
      height: 52px;
    }

    .screen-row {
      --row-height: 48px;
    }

    .screen-footer {
      padding-block: 8px 12px;
    }

    .screen-footer > :global(.panel-btn) {
      height: 44px;
      min-height: 44px;
    }
  }

  /* A phone on its side: the sequence on the left, the rows on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .main-pane {
      flex-direction: row;
      align-items: center;
      max-width: none;
    }

    .sequence-area {
      align-self: stretch;
    }

    .row-group {
      width: min(400px, 52%);
    }

    .screen-row {
      --row-height: 44px;
    }

    .screen-header {
      height: 48px;
    }

    .screen-footer {
      max-width: none;
      padding-block: 6px 8px;
    }

    .screen-footer > :global(.panel-btn) {
      height: 44px;
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .textarea-field,
    .close-button {
      transition: none;
    }
  }
</style>
