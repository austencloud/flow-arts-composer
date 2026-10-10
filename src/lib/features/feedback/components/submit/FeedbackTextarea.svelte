<script lang="ts">
  import { slide } from "svelte/transition";
  import VoiceInputButton from "./VoiceInputButton.svelte";
  import VoiceWaveform from "./VoiceWaveform.svelte";
  import ImageUpload from "#lib/shared/components/image-upload/ImageUpload.svelte";
  import type { AudioAnalyzer } from "../../services/audio-analyzer";
  import type {
    VoiceRecordingResult,
    DraftSaveStatus,
  } from "#lib/shared/feedback/domain/feedback-contract-types.js";
  import type { StagedImageState } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { VoiceRecorder } from "../../services/voice-recorder";

  let {
    value,
    error,
    placeholder,
    isTranscribing = false,
    isMobile = false,
    isTouchDevice = false,
    draftStatus = "idle",
    images = [],
    stagedImages = new Map(),
    onImagesAdded,
    onImageRemoved,
    disabled = false,
    isInputMode = false,
    isIOSInputMode = false,
    isVoiceRecording = false,
    audioAnalyzer,
    voiceRecorder,
    onInput,
    onKeydown,
    onRecordingStart,
    onRecordingEnd,
    onClearText,
    onFocusChange,
  } = $props<{
    value: string;
    error?: string;
    placeholder: string;
    /** Whether a transcription request is in flight */
    isTranscribing?: boolean;
    isMobile?: boolean;
    /** Touch device - hides keyboard shortcuts like "(Shift+Enter to submit)" */
    isTouchDevice?: boolean;
    draftStatus?: DraftSaveStatus;
    images?: File[];
    stagedImages?: Map<File, StagedImageState>;
    onImagesAdded?: (files: File[]) => void;
    onImageRemoved?: (index: number) => void;
    disabled?: boolean;
    isInputMode?: boolean;
    /** iOS keyboard mode uses the visual viewport and keeps this editor bounded */
    isIOSInputMode?: boolean;
    /** Whether voice recording is active (shows waveform) */
    isVoiceRecording?: boolean;
    /** Audio analyzer for waveform visualization */
    audioAnalyzer?: AudioAnalyzer;
    /** Voice recorder for capture button */
    voiceRecorder?: VoiceRecorder;
    onInput: (value: string) => void;
    onKeydown: (event: KeyboardEvent) => void;
    onRecordingStart: (stream: MediaStream) => void;
    onRecordingEnd: (result: VoiceRecordingResult) => void;
    onClearText: () => void;
    onFocusChange?: (focused: boolean) => void;
  }>();

  // Reduced motion: Svelte transition directives and smooth scrolling are
  // JS-driven, so the stylesheet guard can't reach them — gate them here.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let textareaElement = $state<HTMLTextAreaElement | null>(null);
  let stableUploadRef: { openFilePicker(): void } | undefined = $state();
  let isFocused = $state(false);

  function handleFocus() {
    isFocused = true;
    onFocusChange?.(true);

    // On mobile, scroll the textarea into view after keyboard animation
    if (isMobile && textareaElement) {
      setTimeout(() => {
        // The mobile drawer's input mode already owns the visible viewport and
        // scrolls the textarea internally. Scrolling the document as well moves
        // the sheet under the keyboard and hides the text the user is editing.
        if (!isInputMode) {
          textareaElement?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "center",
          });
        }
      }, 300);
    }
  }

  function handleBlur() {
    isFocused = false;
    onFocusChange?.(false);
  }

  /** Called when user taps Done on mobile keyboard or presses the Done button */
  export function dismissKeyboard() {
    textareaElement?.blur();
  }

  const minChars = 10;
  const charsNeeded = $derived(Math.max(0, minChars - value.trim().length));
  const charsMet = $derived(value.trim().length >= minChars);
</script>

<div
  class="field"
  class:input-mode={isInputMode}
  class:ios-input-mode={isIOSInputMode}
>
  <label for="fb-description" class="sr-only"
    >{t("feedback_description_label")}</label
  >
  <div class="textarea-wrapper">
    {#if isVoiceRecording && audioAnalyzer}
      <div
        class="waveform-strip"
        transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
      >
        <VoiceWaveform analyzer={audioAnalyzer} />
      </div>
    {:else if isTranscribing}
      <div
        class="waveform-strip transcribing"
        transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
      >
        <div class="transcribing-content">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          <span>{t("feedback_transcribing")}</span>
        </div>
      </div>
    {/if}
    <textarea
      bind:this={textareaElement}
      id="fb-description"
      class="field-textarea"
      class:has-error={!!error}
      class:focused={isFocused}
      {value}
      oninput={(e) => onInput(e.currentTarget.value)}
      onkeydown={onKeydown}
      onfocus={handleFocus}
      onblur={handleBlur}
      placeholder={`${placeholder}${isTouchDevice ? "" : t("feedback_shift_enter_submit")}`}
      rows="6"
      inputmode="text"
      enterkeyhint="done"
      aria-invalid={!!error}
      aria-describedby={error ? "fb-description-error" : undefined}
    ></textarea>

    <!-- Clear text - inside the textarea, top-right corner -->
    {#if value.trim().length > 0}
      <button
        type="button"
        class="clear-text-btn"
        onclick={onClearText}
        aria-label={t("feedback_clear_text")}
        title={t("feedback_clear_text")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}

    <!-- Attach button inside textarea when no images yet -->
    {#if images.length === 0}
      <div class="attach-wrapper">
        <!-- Dummy button that triggers the stable ImageUpload's file picker below -->
        <button
          type="button"
          class="attach-proxy"
          onclick={() => stableUploadRef?.openFilePicker()}
          {disabled}
          title={t("feedback_upload_image_title")}
        >
          <i class="fas fa-paperclip" aria-hidden="true"></i>
          <span>{t("feedback_attach_image")}</span>
        </button>
      </div>
    {/if}

    {#if voiceRecorder}
      <div class="voice-input-wrapper">
        <VoiceInputButton
          {voiceRecorder}
          {onRecordingStart}
          {onRecordingEnd}
          {disabled}
        />
      </div>
    {/if}
  </div>

  <!-- Footer: hint row + image strip when images exist -->
  <div class="field-footer">
    <div class="field-hint-row">
      <div class="field-hint">
        <span
          class="char-count"
          class:met={charsMet}
          aria-live="polite"
          aria-atomic="true"
        >
          {#if !charsMet}
            {t("feedback_chars_needed", { count: charsNeeded })}
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
          {/if}
        </span>
        {#if draftStatus === "saved"}
          <span class="draft-saved" aria-live="polite">
            <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
            {t("feedback_draft_saved")}
          </span>
        {/if}
        {#if error}
          <span class="field-error" id="fb-description-error" role="alert"
            >{error}</span
          >
        {/if}
      </div>
    </div>
    <!-- Single stable ImageUpload instance - never destroyed/recreated.
         The attach button is handled by the proxy inside the textarea,
         so we hide the component's own button when no images exist. -->
    <ImageUpload
      bind:this={stableUploadRef}
      {images}
      {disabled}
      {stagedImages}
      {onImagesAdded}
      {onImageRemoved}
      hidePreviews={isInputMode}
      hideAttachButton={true}
      uploadLabel={t("feedback_upload_images")}
      attachLabel={t("feedback_attach_image")}
      uploadTitle={t("feedback_upload_image_title")}
    />
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: clamp(4px, 1cqi, 8px);
  }

  .field-footer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: clamp(8px, 2cqi, 12px);
  }

  .field-hint-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .textarea-wrapper {
    position: relative;
    background: color-mix(in srgb, var(--theme-panel-bg) 80%, transparent);
    border: 1.5px solid
      color-mix(
        in srgb,
        var(--active-type-color) 20%,
        var(--theme-stroke, var(--theme-stroke))
      );
    border-radius: clamp(8px, 1.8cqi, 12px);
    transition:
      border-color 200ms ease,
      background 200ms ease;
  }

  .textarea-wrapper:hover {
    border-color: color-mix(
      in srgb,
      var(--active-type-color) 45%,
      rgba(255, 255, 255, 0.15)
    );
  }

  .textarea-wrapper:focus-within {
    border-color: var(
      --active-type-color,
      var(--theme-accent, var(--semantic-info))
    );
    background: color-mix(
      in srgb,
      var(--active-type-color) 5%,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
    /* Subtle glow on focus for clear visual state */
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--active-type-color, var(--theme-accent)) 20%,
        transparent
      );
  }

  .textarea-wrapper:has(.field-textarea.has-error) {
    border-color: var(--semantic-error, var(--semantic-error));
  }

  .field-textarea {
    width: 100%;
    padding: clamp(12px, 2.5cqi, 16px) clamp(14px, 3cqi, 20px);
    padding-right: clamp(48px, 10cqi, 60px); /* Room for voice button */
    padding-top: clamp(12px, 2.5cqi, 16px);
    background: transparent;
    border: none;
    color: var(--theme-text);
    font-size: 1rem;
    font-family: inherit;
    min-height: clamp(120px, 20cqi, 200px);
    resize: none;
    line-height: 1.6;
  }

  .field-textarea:focus {
    outline: none;
  }

  .field-textarea::placeholder {
    color: color-mix(in srgb, var(--theme-text-dim) 80%, transparent);
  }

  .clear-text-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    /* Expand touch target with padding */
    padding: 10px;
    box-sizing: content-box;
    margin-top: -10px;
    margin-right: -10px;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: 11px;
    cursor: pointer;
    opacity: 0.5;
    transition: all 150ms ease;
    z-index: 3;
  }

  .clear-text-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
    color: var(--semantic-error);
  }

  .clear-text-btn:active {
    transform: scale(0.9);
  }

  .clear-text-btn i {
    font-size: clamp(0.8rem, 2cqi, 0.95rem);
  }

  .waveform-strip {
    height: 40px;
    padding: 4px 12px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent)) 20%,
        transparent
      );
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent)) 5%,
      transparent
    );
    flex-shrink: 0;
  }

  .waveform-strip.transcribing {
    justify-content: center;
  }

  .transcribing-content {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-accent-strong, var(--theme-accent));
  }

  .transcribing-content i {
    font-size: 0.9em;
  }

  .attach-wrapper {
    position: absolute;
    bottom: clamp(10px, 2.5cqi, 16px);
    left: clamp(10px, 2.5cqi, 16px);
    display: flex;
    align-items: center;
    z-index: 1;
  }

  .attach-proxy {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 14px;
    background: transparent;
    border: 1.5px dashed var(--theme-stroke-strong);
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
    flex-shrink: 0;
  }

  .attach-proxy:hover:not(:disabled) {
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  }

  .attach-proxy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .attach-proxy i {
    font-size: 0.8rem;
  }

  .voice-input-wrapper {
    position: absolute;
    bottom: clamp(10px, 2.5cqi, 16px);
    right: clamp(10px, 2.5cqi, 16px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .field-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: clamp(14px, 3cqi, 18px);
  }

  .char-count {
    font-size: clamp(0.7rem, 1.8cqi, 0.8rem);
    font-weight: 500;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
    transition: color var(--duration-fast) ease;
  }

  .char-count.met {
    color: var(--semantic-success, var(--semantic-success));
  }

  .field-error {
    margin: 0;
    font-size: clamp(0.7rem, 1.8cqi, 0.8rem);
    font-weight: 500;
    color: var(--semantic-error, var(--semantic-error));
  }

  .draft-saved {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: clamp(0.7rem, 1.8cqi, 0.8rem);
    font-weight: 500;
    color: var(--semantic-success);
    animation: fadeInOut 2s ease-in-out;
  }

  .draft-saved i {
    font-size: 0.9em;
    opacity: 0.8;
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateY(-4px);
    }
    20% {
      opacity: 1;
      transform: translateY(0);
    }
    80% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .draft-saved {
      animation: none;
    }
  }

  /* Input mode - textarea expands to fill available space */
  .field.input-mode {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0; /* Allow flex shrinking */
    overflow: hidden;
  }

  .field.input-mode .textarea-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .field.input-mode .field-textarea {
    flex: 1;
    min-height: 100px;
    max-height: 100%;
    overflow-y: auto;
  }

  /* A focused textarea that fills the whole pre-keyboard sheet makes Safari
     pan it above the screen before visualViewport reports the keyboard. Keep a
     useful editor height, then let the textarea itself scroll as text grows. */
  .field.ios-input-mode .textarea-wrapper {
    flex: 0 1 clamp(100px, 50cqi, 220px);
    min-height: 100px;
    max-height: 220px;
  }

  /* Hide action buttons in textarea during input mode - they're in the toolbar */
  .field.input-mode .voice-input-wrapper,
  .field.input-mode .attach-wrapper {
    display: none;
  }

  /* Keep footer visible in input mode but compact */
  .field.input-mode .field-footer {
    margin-top: 8px;
  }

  /* Hide char count in input mode - less relevant while typing */
  .field.input-mode .field-hint .char-count {
    display: none;
  }
</style>
