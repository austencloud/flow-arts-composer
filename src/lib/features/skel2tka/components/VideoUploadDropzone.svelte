<!--
  VideoUploadDropzone - Drag-and-drop video file picker

  Accepts video files via drag-and-drop or file picker button.
  Shows the selected file name and size. Emits the File object.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onFileSelected: (file: File) => void;
    disabled?: boolean;
  }

  const { onFileSelected, disabled = false }: Props = $props();

  let isDragOver = $state(false);
  let selectedFile = $state<File | null>(null);
  let fileInputRef = $state<HTMLInputElement | null>(null);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!disabled) isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    if (disabled) return;

    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("video/")) {
      selectedFile = file;
      onFileSelected(file);
    }
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      selectedFile = file;
      onFileSelected(file);
    }
  }

  function openFilePicker() {
    fileInputRef?.click();
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div
  class="dropzone"
  class:drag-over={isDragOver}
  class:disabled
  class:has-file={selectedFile !== null}
  role="button"
  tabindex="0"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={openFilePicker}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFilePicker(); }}
>
  <input
    bind:this={fileInputRef}
    type="file"
    accept="video/*"
    class="hidden-input"
    onchange={handleFileInput}
  />

  {#if selectedFile}
    <i class="fas fa-check-circle file-icon"></i>
    <span class="file-name">{selectedFile.name}</span>
    <span class="file-size">{formatFileSize(selectedFile.size)}</span>
    <span class="hint">{t('skel2tka_drop_change')}</span>
  {:else}
    <i class="fas fa-cloud-arrow-up upload-icon"></i>
    <span class="primary-text">{t('skel2tka_drop_video')}</span>
    <span class="hint">{t('skel2tka_drop_hint')}</span>
  {/if}
</div>

<style>
  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 24px;
    border: 2px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    min-height: 140px;
  }

  .dropzone:hover,
  .dropzone:focus-visible {
    border-color: var(--theme-accent, #3b82f6);
    background: rgba(59, 130, 246, 0.06);
    outline: none;
  }

  .dropzone:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .drag-over {
    border-color: var(--theme-accent, #3b82f6);
    background: rgba(59, 130, 246, 0.1);
    border-style: solid;
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .has-file {
    border-color: var(--semantic-success, #22c55e);
    border-style: solid;
  }

  .hidden-input {
    display: none;
  }

  .upload-icon {
    font-size: 32px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .file-icon {
    font-size: 28px;
    color: var(--semantic-success, #22c55e);
  }

  .primary-text {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #ffffff);
    font-weight: 500;
  }

  .file-name {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #ffffff);
    font-weight: 500;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }
</style>
