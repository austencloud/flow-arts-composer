<!-- ImageUpload - Shared image selection, paste, drop, and preview control -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";

  export interface ImageUploadState {
    status: "uploading" | "uploaded" | "failed";
    fraction: number;
  }

  const {
    images = [],
    maxImages = 5,
    disabled = false,
    hidePreviews = false,
    hideAttachButton = false,
    stagedImages = new Map(),
    accept = "image/*",
    allowedMimeTypes,
    uploadLabel,
    attachLabel,
    uploadTitle,
    onImagesAdded,
    onImageRemoved,
    onFilesRejected,
  } = $props<{
    images?: File[];
    maxImages?: number;
    disabled?: boolean;
    hidePreviews?: boolean;
    /** Hide the standalone attach button (parent provides its own trigger) */
    hideAttachButton?: boolean;
    stagedImages?: Map<File, ImageUploadState>;
    accept?: string;
    allowedMimeTypes?: readonly string[];
    uploadLabel?: string;
    attachLabel?: string;
    uploadTitle?: string;
    onImagesAdded?: (files: File[]) => void;
    onImageRemoved?: (index: number) => void;
    onFilesRejected?: (files: File[]) => void;
  }>();

  let fileInput: HTMLInputElement | undefined = $state(undefined);
  let isDragging = $state(false);
  let previews = $state<{ file: File; url: string }[]>([]);
  let previousUrls: string[] = [];

  $effect(() => {
    previousUrls.forEach((url) => URL.revokeObjectURL(url));
    const newPreviews = images.map((file: File) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    previousUrls = newPreviews.map((p: { file: File; url: string }) => p.url);
    previews = newPreviews;
    return () => {
      previousUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  });

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
      target.value = "";
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (disabled) return;
    const files = event.dataTransfer?.files;
    if (files) addFiles(Array.from(files));
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handlePaste(event: ClipboardEvent) {
    if (disabled) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      event.preventDefault();
      addFiles(imageFiles);
    }
  }

  function addFiles(newFiles: File[]) {
    const imageFiles = newFiles.filter((file) =>
      allowedMimeTypes
        ? allowedMimeTypes.includes(file.type)
        : file.type.startsWith("image/")
    );
    const rejectedFiles = newFiles.filter((file) => !imageFiles.includes(file));
    if (rejectedFiles.length > 0) onFilesRejected?.(rejectedFiles);
    const remainingSlots = maxImages - images.length;
    const filesToAdd = imageFiles.slice(0, remainingSlots);
    if (filesToAdd.length === 0) return;
    if (onImagesAdded) {
      onImagesAdded(filesToAdd);
    } else {
      images.push(...filesToAdd);
    }
  }

  function handleRemoveImage(index: number) {
    if (onImageRemoved) {
      onImageRemoved(index);
    } else {
      images.splice(index, 1);
    }
  }

  function handleOpenFilePicker(e: Event) {
    e.preventDefault();
    if (!disabled) fileInput?.click();
  }

  /** Exposed so parent can trigger file picker without owning the file input */
  export function openFilePicker() {
    if (!disabled) fileInput?.click();
  }

  onMount(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });
</script>

<div class="image-upload" class:has-images={previews.length > 0}>
  <!-- Hidden file input -->
  <input
    type="file"
    bind:this={fileInput}
    onchange={handleFileSelect}
    {accept}
    multiple={maxImages > 1}
    {disabled}
    aria-label={uploadLabel ?? t("shared_controls_choose_images")}
    class="sr-only"
  />

  <!-- Image strip: previews + add button in one horizontal row -->
  {#if !hidePreviews && previews.length > 0}
    <div class="image-strip">
      {#each previews as { file, url }, index}
        {@const staged = stagedImages.get(file)}
        {@const isUploading = staged?.status === "uploading"}
        {@const isFailed = staged?.status === "failed"}
        {@const isUploaded = staged?.status === "uploaded"}
        <div
          class="image-chip"
          class:uploading={isUploading}
          class:failed={isFailed}
          class:uploaded={isUploaded}
        >
          <img src={url} alt={file.name} />

          <!-- Progress bar at bottom edge -->
          {#if isUploading}
            <div
              class="chip-progress"
              style:--progress="{(staged?.fraction ?? 0) * 100}%"
            ></div>
          {/if}

          <!-- Uploaded badge -->
          {#if isUploaded}
            <div class="chip-badge" aria-label={t("shared_controls_uploaded")}>
              <i class="fas fa-check" aria-hidden="true"></i>
            </div>
          {/if}

          <!-- Failed indicator -->
          {#if isFailed}
            <div
              class="chip-failed"
              aria-label={t("shared_controls_upload_failed")}
            >
              <i class="fas fa-exclamation" aria-hidden="true"></i>
            </div>
          {/if}

          <!-- Remove button -->
          <button
            type="button"
            class="chip-remove"
            onclick={() => handleRemoveImage(index)}
            {disabled}
            aria-label={t("shared_controls_remove_file", { name: file.name })}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {/each}

      <!-- Inline add button (when room for more) -->
      {#if images.length < maxImages}
        <button
          type="button"
          class="add-chip"
          class:dragging={isDragging}
          onmousedown={openFilePicker}
          ontouchstart={openFilePicker}
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          {disabled}
          aria-label={attachLabel ?? t("shared_controls_attach_image")}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  {:else if !hideAttachButton && images.length < maxImages}
    <!-- No images yet - compact attach button -->
    <button
      type="button"
      class="attach-button"
      class:dragging={isDragging}
      onmousedown={handleOpenFilePicker}
      ontouchstart={handleOpenFilePicker}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      {disabled}
      title={uploadTitle ?? t("shared_controls_choose_image")}
      aria-label={attachLabel ?? t("shared_controls_attach_image")}
    >
      <i class="fas fa-paperclip" aria-hidden="true"></i>
      <span>{attachLabel ?? t("shared_controls_attach_image")}</span>
    </button>
  {/if}
</div>

<style>
  .image-upload {
    container-type: inline-size;
    container-name: image-upload;
    display: flex;
    align-items: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ── Attach button (no images yet) ── */
  .attach-button {
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

  .attach-button:hover:not(:disabled) {
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  }

  .attach-button.dragging {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }

  .attach-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .attach-button i {
    font-size: 0.8rem;
  }

  .image-strip {
    --chip-size: 72px;
    display: flex;
    gap: 10px;
    align-items: stretch;
    flex-wrap: wrap;
    padding: 4px 0;
  }

  /* Scale chips up on wider containers */
  @container image-upload (min-width: 400px) {
    .image-strip {
      --chip-size: 100px;
      gap: 12px;
    }
  }

  @container image-upload (min-width: 600px) {
    .image-strip {
      --chip-size: 130px;
      gap: 14px;
    }
  }

  .image-chip {
    position: relative;
    flex-shrink: 0;
    width: var(--chip-size);
    height: var(--chip-size);
    border-radius: 12px;
    overflow: hidden;
    border: 1.5px solid var(--theme-stroke);
    transition: border-color 200ms ease;
  }

  .image-chip:hover {
    border-color: var(--theme-stroke-strong);
  }

  .image-chip.uploaded {
    border-color: color-mix(in srgb, var(--semantic-success) 50%, transparent);
  }

  .image-chip.failed {
    border-color: var(--semantic-error);
  }

  .image-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Dim image during upload */
  .image-chip.uploading img {
    opacity: 0.5;
  }

  .chip-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.15);
  }

  .chip-progress::after {
    content: "";
    display: block;
    height: 100%;
    width: var(--progress);
    background: var(--semantic-success, #22c55e);
    transition: width 200ms ease-out;
    border-radius: 0 2px 2px 0;
  }

  .chip-badge {
    position: absolute;
    bottom: 5px;
    right: 5px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--semantic-success, #22c55e);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .chip-badge i {
    font-size: 9px;
    color: white;
  }

  .chip-failed {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.3);
  }

  .chip-failed i {
    font-size: 1.1rem;
    color: var(--semantic-error);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .chip-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    /* Expand touch target with padding */
    padding: 6px;
    box-sizing: content-box;
    margin-top: -6px;
    margin-right: -6px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    color: white;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 150ms ease,
      background 150ms ease;
    z-index: 2;
  }

  .image-chip:hover .chip-remove {
    opacity: 1;
  }

  /* Always visible on touch devices */
  @media (hover: none) {
    .chip-remove {
      opacity: 1;
    }
  }

  .chip-remove:hover {
    background: var(--semantic-error);
  }

  .chip-remove:disabled {
    opacity: 0;
    cursor: not-allowed;
  }

  /* ── Add button (inline with chips) ── */
  .add-chip {
    flex-shrink: 0;
    width: var(--chip-size, 72px);
    height: var(--chip-size, 72px);
    border-radius: 12px;
    border: 1.5px dashed var(--theme-stroke-strong);
    background: transparent;
    color: var(--theme-text-dim);
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease;
    min-height: var(--min-touch-target, 44px);
  }

  .add-chip:hover:not(:disabled) {
    border-color: var(--theme-accent);
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  }

  .add-chip.dragging {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }

  .add-chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip-progress::after {
      transition: none;
    }

    .image-chip,
    .chip-remove,
    .attach-button,
    .add-chip {
      transition: none;
    }
  }
</style>
