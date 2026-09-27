<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { Popover } from "bits-ui";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import ImageUpload from "$lib/shared/components/image-upload/ImageUpload.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { PendingMessageAttachment } from "../../domain/pending-message-attachment";
  import type { MessageImageSendProgress } from "$lib/shared/messaging/services/contracts/IMessageImageSender";
  import {
    MAX_IMAGE_BYTES,
    IMAGE_TYPES,
    IMAGE_ACCEPT,
  } from "../../domain/image-attachment-limits";

  interface Props {
    attachment: PendingMessageAttachment | null;
    disabled?: boolean;
    progress?: MessageImageSendProgress | null;
    onImageSelected: (file: File) => void;
    onSequenceSelected: (sequence: SequenceData) => void;
    onRemove: () => void;
  }

  let {
    attachment,
    disabled = false,
    progress = null,
    onImageSelected,
    onSequenceSelected,
    onRemove,
  }: Props = $props();

  let menuOpen = $state(false);
  let sequencePickerOpen = $state(false);
  let pickerRef: { openFilePicker(): void } | undefined = $state();
  let error = $state<string | null>(null);
  let imagePreviewUrl = $state<string | null>(null);

  $effect(() => {
    if (attachment?.type !== "image") {
      imagePreviewUrl = null;
      return undefined;
    }
    const url = URL.createObjectURL(attachment.file);
    imagePreviewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  function chooseImage() {
    menuOpen = false;
    pickerRef?.openFilePicker();
  }

  function chooseSequence() {
    menuOpen = false;
    sequencePickerOpen = true;
  }

  function selectImage(file: File) {
    error = null;
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      error = t("inbox_ui_choose_a_jpeg_png_or_webp_image");
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      error = t("inbox_ui_images_must_be_smaller_than_10_mb");
      return;
    }
    onImageSelected(file);
  }

  function handleFiles(files: File[]) {
    const first = files[0];
    if (first) selectImage(first);
  }

  function handleSequenceSelected(sequence: SequenceData) {
    error = null;
    onSequenceSelected(sequence);
  }

  const sequenceLabel = $derived.by(() => {
    if (attachment?.type !== "sequence") return "";
    const { payload } = attachment;
    // buildSequenceSharePayload already ran displayName/intendedWord/word
    // through simplifyRepeatedWord, so this is the simplified form by
    // construction (.claude/rules/simplified-word-display.md).
    return payload.sequenceWord || payload.sequenceName || payload.sequence.word || "";
  });

  const progressLabel = $derived.by(() => {
    if (!progress) return "";
    if (progress.phase === "finalizing") return t("inbox_ui_preparing_image");
    return t("inbox_upload_progress", { percent: Math.round(progress.fraction * 100) });
  });
</script>

<div class="attachment-picker">
  <Popover.Root bind:open={menuOpen}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="attach-trigger"
          disabled={disabled || attachment !== null}
          aria-label={t("inbox_ui_attach_to_message")}
        >
          <i class="fas fa-paperclip" aria-hidden="true"></i>
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        class="attachment-menu"
        aria-label={t("inbox_ui_choose_what_to_attach")}
      >
        <button type="button" class="menu-option" onclick={chooseSequence}>
          <span class="option-icon sequence-icon" aria-hidden="true">
            <i class="fas fa-wave-square"></i>
          </span>
          <span>
            <strong>{t("inbox_ui_share_sequence")}</strong>
            <small>{t("inbox_ui_choose_from_your_library_or_the_community")}</small>
          </span>
        </button>
        <button type="button" class="menu-option" onclick={chooseImage}>
          <span class="option-icon image-icon" aria-hidden="true">
            <i class="fas fa-image"></i>
          </span>
          <span>
            <strong>{t("inbox_ui_attach_image")}</strong>
            <small>{t("inbox_ui_jpeg_png_or_webp_up_to_10_mb")}</small>
          </span>
        </button>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>

  <div class="image-input-host">
    <ImageUpload
      bind:this={pickerRef}
      images={attachment?.type === "image" ? [attachment.file] : []}
      maxImages={1}
      {disabled}
      hidePreviews
      hideAttachButton
      accept={IMAGE_ACCEPT}
      allowedMimeTypes={IMAGE_TYPES}
      uploadLabel="Choose an image to send"
      onImagesAdded={handleFiles}
      onFilesRejected={() => {
        error = t("inbox_ui_choose_a_jpeg_png_or_webp_image");
      }}
    />
  </div>

  {#if attachment}
    <div class="attachment-preview" class:image={attachment.type === "image"}>
      {#if attachment.type === "image" && imagePreviewUrl}
        <img
          src={imagePreviewUrl}
          alt={attachment.file.name || t("inbox_ui_ready_to_send")}
        />
      {:else}
        <span class="sequence-preview-icon" aria-hidden="true">
          <i class="fas fa-wave-square"></i>
        </span>
      {/if}
      <div class="preview-copy">
        <strong>
          {attachment.type === "image"
            ? attachment.file.name || t("inbox_ui_pasted_image")
            : sequenceLabel}
        </strong>
        <span aria-live="polite">
          {progressLabel ||
            (attachment.type === "image" ? t("inbox_ui_image_ready") : t("inbox_ui_sequence_ready"))}
        </span>
      </div>
      <button
        type="button"
        class="remove-attachment"
        onclick={onRemove}
        {disabled}
        aria-label={t("inbox_ui_remove_attachment")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
      {#if progress}
        <div
          class="upload-progress"
          style:--attachment-progress={`${progress.fraction * 100}%`}
        ></div>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="attachment-error" role="alert">{error}</p>
  {/if}
</div>

<SequencePickerModal
  bind:open={sequencePickerOpen}
  onClose={() => (sequencePickerOpen = false)}
  onSelect={handleSequenceSelected}
  title={t("inbox_ui_share_a_sequence")}
  initialSource="my-library"
/>

<style>
  .attachment-picker {
    display: contents;
  }

  .attach-trigger {
    grid-row: 2;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      background var(--duration-fast) ease;
  }

  .attach-trigger:hover:not(:disabled) {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
    color: var(--theme-accent);
  }

  .attach-trigger:focus-visible,
  .remove-attachment:focus-visible,
  .menu-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .attach-trigger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.attachment-menu) {
    z-index: 10010;
    display: flex;
    flex-direction: column;
    width: min(300px, calc(100vw - 24px));
    padding: 6px;
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    background: var(--theme-panel-bg);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
  }

  :global(.attachment-menu .menu-option) {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 58px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
  }

  :global(.attachment-menu .menu-option:hover) {
    background: var(--theme-card-hover-bg);
  }

  :global(.attachment-menu .menu-option > span:last-child) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  :global(.attachment-menu .menu-option strong) {
    font-size: var(--font-size-sm);
  }

  :global(.attachment-menu .menu-option small) {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  :global(.attachment-menu .option-icon) {
    display: grid;
    place-items: center;
    flex: 0 0 38px;
    height: 38px;
    border-radius: 10px;
  }

  :global(.attachment-menu .sequence-icon) {
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  :global(.attachment-menu .image-icon) {
    color: var(--semantic-info);
    background: color-mix(in srgb, var(--semantic-info) 14%, transparent);
  }

  .attachment-preview {
    grid-column: 1 / -1;
    grid-row: 1;
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin-bottom: 8px;
    padding: 8px 42px 8px 8px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
  }

  .attachment-preview img,
  .sequence-preview-icon {
    width: 52px;
    height: 52px;
    flex: 0 0 52px;
    border-radius: 8px;
  }

  .attachment-preview img {
    object-fit: cover;
  }

  .sequence-preview-icon {
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
  }

  .preview-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .preview-copy strong,
  .preview-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-copy strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .preview-copy span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .remove-attachment {
    position: absolute;
    top: 50%;
    right: 4px;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    transform: translateY(-50%);
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .remove-attachment:hover:not(:disabled) {
    color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  .upload-progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--theme-stroke);
  }

  .upload-progress::after {
    content: "";
    display: block;
    width: var(--attachment-progress);
    height: 100%;
    background: var(--theme-accent);
    transition: width var(--duration-fast) ease;
  }

  .attachment-error {
    grid-column: 1 / -1;
    grid-row: 1;
    margin: 0 0 8px;
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
  }

  .image-input-host {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .attach-trigger,
    .upload-progress::after {
      transition: none;
    }
  }
</style>
