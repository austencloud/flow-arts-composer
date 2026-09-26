<!-- FeedbackForm - Streamlined feedback form orchestrator -->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { VoiceRecordingResult } from "$lib/shared/feedback/domain/feedback-contract-types";
  import { getVoiceRecorder } from "$lib/features/feedback/get-voice-recorder";
  import * as transcriptionClient from "$lib/features/feedback/services/transcription-client";
  import { getFormDraftPersister } from "$lib/features/feedback/get-form-draft-persister";
  import { getFeedbackTypeResolver } from "$lib/features/feedback/get-feedback-type-resolver";
  import { getAudioAnalyzer } from "$lib/features/feedback/get-audio-analyzer";
  import type { FeedbackSubmitState } from "../../state/feedback-submit-state.svelte";
  import { TYPE_CONFIG } from "$lib/shared/feedback/domain/models/feedback-models";
  import { feedbackTypePlaceholder } from "../../domain/feedback-display-labels";
  import type { FeedbackType } from "$lib/shared/feedback/domain/models/feedback-models";
  import SuccessState from "./SuccessState.svelte";
  import TypeSelector from "./TypeSelector.svelte";
  import EncouragementHint from "./EncouragementHint.svelte";
  import FeedbackTextarea from "./FeedbackTextarea.svelte";
  import SubmitButton from "./SubmitButton.svelte";
  import Toast from "./Toast.svelte";
  import MobileInputToolbar from "$lib/shared/components/MobileInputToolbar.svelte";
  import VoiceInputButton from "./VoiceInputButton.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";

  // Props
  const {
    formState,
    hideSuccessState = false,
    isInputMode = false,
    isTouchDevice: isTouchDeviceProp,
    onInputFocusChange,
    onKeyboardHeightChange,
  } = $props<{
    formState: FeedbackSubmitState;
    hideSuccessState?: boolean;
    /** When true, form enters distraction-free input mode (mobile bottom sheet) */
    isInputMode?: boolean;
    /** When true, device uses touch input (hides keyboard hints like Shift+Enter) */
    isTouchDevice?: boolean;
    /** Called when textarea focus changes - used by parent to disable backdrop dismissal */
    onInputFocusChange?: (focused: boolean) => void;
    /** Called when keyboard height changes - used by parent to adjust panel padding */
    onKeyboardHeightChange?: (height: number) => void;
  }>();

  // Services
  const hapticService = getHapticFeedback();
  const deviceDetector = getDeviceDetector();
  const voiceRecorder = getVoiceRecorder();
  const draftPersister = getFormDraftPersister();
  const typeResolver = getFeedbackTypeResolver();
  const audioAnalyzer = getAudioAnalyzer();

  // Component state
  let isMobileDevice = $state(false);
  let isIOSPlatform = $state(false);
  let isVoiceRecording = $state(false);
  let isTranscribing = $state(false);
  let transcriptionError = $state("");
  let isTextareaFocused = $state(false);
  let textareaRef = $state<{ dismissKeyboard: () => void } | null>(null);

  // BULLETPROOF APPROACH: Assume keyboard exists until proven otherwise
  let hasSeenVirtualKeyboard = $state(false);
  const isTouchDevice = $derived(isTouchDeviceProp ?? hasSeenVirtualKeyboard);

  onMount(() => {
    isMobileDevice = deviceDetector.isMobile();
    isIOSPlatform = detectPlatform() === "ios";
    const flushDraft = () => draftPersister.flushPendingSave();
    window.addEventListener("pagehide", flushDraft);

    // Restore draft if form is empty and a draft exists
    if (
      !formState.formData.description.trim() &&
      !formState.formData.title.trim()
    ) {
      const draft = draftPersister.loadDraft();
      if (draft) {
        formState.updateField("description", draft.formData.description);
        formState.updateField("title", draft.formData.title);
        formState.setType(draft.formData.type);
      }
    }

    return () => {
      window.removeEventListener("pagehide", flushDraft);
      flushDraft();
      audioAnalyzer.stop();
    };
  });

  // Auto-save draft when form data changes
  $effect(() => {
    const description = formState.formData.description;
    const type = formState.formData.type;
    const title = formState.formData.title;

    if (draftPersister) {
      draftPersister.scheduleSave(formState.formData);
    }

    return undefined;
  });

  // Clear draft after successful submission
  $effect(() => {
    if (formState.submitStatus === "success" && draftPersister) {
      draftPersister.clearDraft();
    }
    return undefined;
  });

  function handleRecordingStart(stream: MediaStream) {
    isVoiceRecording = true;
    audioAnalyzer.startWithStream(stream);
  }

  async function handleRecordingEnd(result: VoiceRecordingResult) {
    isVoiceRecording = false;
    audioAnalyzer.stop();

    // Skip transcription for very short recordings (< 500ms)
    if (result.durationMs < 500) {
      return;
    }

    isTranscribing = true;
    transcriptionError = "";

    try {
      const transcript = await transcriptionClient.transcribe(
        result.blob,
        result.mimeType
      );

      if (transcript) {
        const currentText = formState.formData.description.trim();
        const updatedText = currentText
          ? `${currentText} ${transcript}`
          : transcript;
        formState.updateField("description", updatedText);
        hapticService?.trigger("selection");
      }
    } catch (err) {
      console.error("Transcription failed:", err);
      transcriptionError = t("feedback_transcription_failed");
      hapticService?.trigger("warning");
      setTimeout(() => {
        transcriptionError = "";
      }, 5000);
    } finally {
      isTranscribing = false;
    }
  }

  function handleManualInput(value: string) {
    formState.updateField("description", value);
  }

  function handleTypeChange(type: FeedbackType) {
    hapticService?.trigger("selection");
    formState.setType(type);
  }

  // Derived: current type configuration for dynamic theming
  const feedbackType = $derived(formState.formData.type);
  const currentTypeConfig = $derived(
    feedbackType && feedbackType in TYPE_CONFIG
      ? TYPE_CONFIG[feedbackType as keyof typeof TYPE_CONFIG]
      : undefined
  );

  const currentEncouragement = $derived(
    typeResolver && feedbackType
      ? typeResolver.getEncouragementMessage(feedbackType)
      : ""
  );

  // Mobile toolbar submit button - upload state derivations
  const isToolbarUploading = $derived(
    formState.isSubmitting && formState.uploadProgress?.phase === "uploading"
  );

  const toolbarSubmitLabel = $derived.by(() => {
    if (!formState.isSubmitting) return t("feedback_submit");
    const progress = formState.uploadProgress;
    if (progress?.phase === "uploading") {
      const pct = Math.round(progress.fraction * 100);
      return t("feedback_uploading_images_pct", { pct: `${pct}%` });
    }
    return t("feedback_submit");
  });

  const toolbarProgressPercent = $derived(
    isToolbarUploading && formState.uploadProgress
      ? formState.uploadProgress.fraction * 100
      : 0
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    hapticService?.trigger("selection");
    await formState.submit();
  }

  function handleReset() {
    hapticService?.trigger("selection");
    formState.reset();
  }

  function handleClearText() {
    hapticService?.trigger("selection");
    formState.updateField("description", "");
    formState.updateField("title", "");
  }

  function handleKeydown(event: KeyboardEvent) {
    // Submit on Shift+Enter
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (formState.isFormValid && !formState.isSubmitting) {
        formState.submit();
        hapticService?.trigger("selection");
      }
    }
  }

  function handleTextareaFocusChange(focused: boolean) {
    isTextareaFocused = focused;
    onInputFocusChange?.(focused);
  }

  function handleMobileToolbarDone() {
    textareaRef?.dismissKeyboard();
    hapticService?.trigger("selection");
  }
</script>

{#if formState.submitStatus === "success" && !hideSuccessState}
  <SuccessState onSubmitAnother={handleReset} />
{:else}
  <form
    class="feedback-form"
    class:input-mode={isInputMode}
    onsubmit={handleSubmit}
    style="--active-type-color: {currentTypeConfig?.color ??
      'var(--theme-accent)'}"
  >
    <TypeSelector
      selectedType={formState.formData.type}
      onTypeChange={handleTypeChange}
      {isInputMode}
    />

    <EncouragementHint message={currentEncouragement} {isInputMode} />

    <FeedbackTextarea
      bind:this={textareaRef}
      value={formState.formData.description}
      error={formState.formErrors.description}
      placeholder={feedbackType
        ? feedbackTypePlaceholder(feedbackType)
        : t("feedback_default_placeholder")}
      {isTranscribing}
      isMobile={isMobileDevice}
      {isTouchDevice}
      draftStatus={draftPersister?.saveStatus}
      images={formState.images}
      stagedImages={formState.stagedImages}
      onImagesAdded={(files) => formState.addImages(files)}
      onImageRemoved={(index) => formState.removeImage(index)}
      disabled={formState.isSubmitting}
      {isInputMode}
      isIOSInputMode={isInputMode && isIOSPlatform}
      {isVoiceRecording}
      {audioAnalyzer}
      {voiceRecorder}
      onInput={handleManualInput}
      onKeydown={handleKeydown}
      onRecordingStart={handleRecordingStart}
      onRecordingEnd={handleRecordingEnd}
      onClearText={handleClearText}
      onFocusChange={handleTextareaFocusChange}
    />

    <!-- Full submit button - hidden in input mode -->
    {#if !isInputMode}
      <SubmitButton
        isSubmitting={formState.isSubmitting}
        disabled={formState.isSubmitting || !formState.isFormValid}
        uploadProgress={formState.uploadProgress}
      />
    {/if}

    <!-- Status announcements for screen readers -->
    <div role="status" aria-live="assertive" aria-atomic="true">
      {#if formState.submitStatus === "error"}
        <Toast
          type="error"
          title={t("feedback_submission_failed")}
          message={t("feedback_check_connection")}
          icon="fa-exclamation"
        />
      {/if}

      {#if transcriptionError}
        <Toast
          type="error"
          title={t("feedback_transcription_failed_title")}
          message={transcriptionError}
          icon="fa-microphone-slash"
        />
      {/if}
    </div>
  </form>

  <!-- Touch device keyboard toolbar - rendered outside form to position above keyboard -->
  {#if deviceDetector.isTouchDevice() && !isIOSPlatform}
    <MobileInputToolbar
      visible={isTextareaFocused}
      disabled={formState.isSubmitting}
      doneLabel={t("feedback_done")}
      onDone={handleMobileToolbarDone}
      onKeyboardHeightChange={(height) => {
        if (height > 0) {
          hasSeenVirtualKeyboard = true;
        }
        onKeyboardHeightChange?.(height);
      }}
    >
      {#snippet leftContent()}
        <VoiceInputButton
          {voiceRecorder}
          onRecordingStart={handleRecordingStart}
          onRecordingEnd={handleRecordingEnd}
          disabled={formState.isSubmitting}
        />
        <button
          type="button"
          class="toolbar-submit-button"
          class:uploading={isToolbarUploading}
          onmousedown={(e) => {
            // Prevent blur from textarea so submit completes before keyboard dismisses
            e.preventDefault();
            formState.submit();
          }}
          ontouchstart={(e) => {
            // Same for touch - prevent blur, then submit
            e.preventDefault();
            formState.submit();
          }}
          disabled={formState.isSubmitting || !formState.isFormValid}
          aria-label={t("feedback_submit")}
          style:--progress="{toolbarProgressPercent}%"
        >
          {#if isToolbarUploading}
            <div class="toolbar-progress-fill" aria-hidden="true"></div>
          {/if}
          <span class="toolbar-btn-content">
            {#if formState.isSubmitting}
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-paper-plane" aria-hidden="true"></i>
            {/if}
            <span>{toolbarSubmitLabel}</span>
          </span>
        </button>
      {/snippet}
    </MobileInputToolbar>
  {/if}
{/if}

<style>
  .feedback-form {
    /* Establish as container */
    container-type: inline-size;
    container-name: feedback-form;

    /* Layout - Fluid */
    position: relative;
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 3cqi, 20px);
    width: 100%;
    padding: clamp(16px, 4cqi, 28px);
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: clamp(12px, 2.5cqi, 16px);
    transition: border-color var(--duration-normal) ease;
  }

  .feedback-form:hover {
    border-color: var(--theme-stroke-strong);
  }

  /* Input mode - form expands to fill available space */
  .feedback-form.input-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0; /* Allow flex shrinking */
    overflow: hidden;
    border: none;
    background: transparent;
    padding: clamp(8px, 2cqi, 12px);
  }

  /* Landscape phones: wide + short - side-by-side type selector and textarea */
  @container feedback-form (min-width: 500px) {
    .feedback-form:not(.input-mode) {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto 1fr auto;
      gap: 8px 12px;
    }
  }

  /* Submit button inside the mobile toolbar's leftContent snippet */
  .toolbar-submit-button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    min-height: var(--min-touch-target); /* WCAG AAA touch target */

    background: var(--theme-accent, #4a9eff);
    border: none;
    border-radius: 8px;

    color: white;
    font-size: 15px;
    font-weight: 600;

    cursor: pointer;
    transition: all 150ms ease;
    touch-action: manipulation;
    overflow: hidden;
  }

  /* During upload, dim the base so the progress fill is visible */
  .toolbar-submit-button.uploading {
    background: color-mix(in srgb, var(--theme-accent, #4a9eff) 40%, black);
  }

  /* Progress fill for mobile toolbar button */
  .toolbar-progress-fill {
    position: absolute;
    inset: 0;
    background: var(--theme-accent, #4a9eff);
    transform-origin: left center;
    transform: scaleX(calc(var(--progress) / 100));
    transition: transform 200ms ease-out;
    border-radius: inherit;
  }

  /* Content sits above the progress fill */
  .toolbar-btn-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toolbar-submit-button:hover:not(:disabled) {
    background: var(--theme-accent-strong, #5aafff);
    transform: translateY(-1px);
  }

  .toolbar-submit-button.uploading:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #4a9eff) 40%, black);
  }

  .toolbar-submit-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .toolbar-submit-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-submit-button i {
    font-size: 14px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }

    .toolbar-submit-button {
      transition: none;
    }

    .toolbar-progress-fill {
      transition: none;
    }
  }
</style>
