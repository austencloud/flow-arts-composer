<!--
  PerformanceSettings.svelte

  Settings content for performance video export format.
  Rendered inside SettingsPanel when user clicks gear icon.

  Features:
  - Record/Upload mode toggle
  - Camera selection (for record mode)
  - File upload (for upload mode)
  - Camera permissions handling

  Domain: Export Panel - Settings - Performance Video Format
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getExportPanelState } from "../../state/export-panel-state.svelte";

  const hubState = getExportPanelState();
  let availableCameras = $state<MediaDeviceInfo[]>([]);
  let cameraPermissionGranted = $state(false);

  // TODO: Initialize camera list when component mounts
  // $effect(() => {
  //   initializeCameras();
  // });

  async function initializeCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableCameras = devices.filter(
        (device) => device.kind === "videoinput"
      );
      cameraPermissionGranted = true;

      // Auto-select first camera if none selected
      const firstCamera = availableCameras[0];
      if (firstCamera && !hubState.performanceSettings.cameraId) {
        hubState.performanceSettings = {
          ...hubState.performanceSettings,
          cameraId: firstCamera.deviceId,
        };
      }
    } catch (error) {
      console.error("Failed to enumerate cameras:", error);
      cameraPermissionGranted = false;
    }
  }

  function handleModeToggle() {
    const newMode =
      hubState.performanceSettings.mode === "record" ? "upload" : "record";
    hubState.performanceSettings = {
      ...hubState.performanceSettings,
      mode: newMode,
    };
  }

  function handleCameraSelect(event: Event) {
    const cameraId = (event.target as HTMLSelectElement).value;
    hubState.performanceSettings = {
      ...hubState.performanceSettings,
      cameraId,
    };
  }

  function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file && file.type.startsWith("video/")) {
      hubState.performanceSettings = {
        ...hubState.performanceSettings,
        uploadedFile: file,
      };
    }
  }

  function requestCameraPermission() {
    initializeCameras();
  }
</script>

<div class="performance-settings">
  <!-- Mode Toggle -->
  <div class="setting-group">
    <div class="setting-header">
      <span class="setting-label">
        <i class="fas fa-video" aria-hidden="true"></i>
        Video Source
      </span>
    </div>
    <div class="mode-toggle-card">
      <button
        class="mode-option"
        class:active={hubState.performanceSettings.mode === "record"}
        aria-pressed={hubState.performanceSettings.mode === "record"}
        onclick={handleModeToggle}
      >
        <i class="fas fa-video" aria-hidden="true"></i>
        <div>
          <span class="mode-title">Record Live</span>
          <span class="mode-description"
            >Capture performance with your camera</span
          >
        </div>
      </button>
      <button
        class="mode-option"
        class:active={hubState.performanceSettings.mode === "upload"}
        aria-pressed={hubState.performanceSettings.mode === "upload"}
        onclick={handleModeToggle}
      >
        <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
        <div>
          <span class="mode-title">{t("export_ui_upload_video_title")}</span>
          <span class="mode-description">Use a pre-recorded video file</span>
        </div>
      </button>
    </div>
  </div>

  <!-- Record Mode Settings -->
  {#if hubState.performanceSettings.mode === "record"}
    <div class="setting-group">
      <div class="setting-header">
        <label for="camera-select">
          <i class="fas fa-camera" aria-hidden="true"></i>
          Camera Selection
        </label>
      </div>

      {#if !cameraPermissionGranted}
        <div class="permission-prompt">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <p>Camera access required to record performance video</p>
          <button class="permission-button" onclick={requestCameraPermission}>
            <i class="fas fa-video" aria-hidden="true"></i>
            Grant Camera Access
          </button>
        </div>
      {:else if availableCameras.length === 0}
        <div class="no-cameras-message">
          <i class="fas fa-video-slash" aria-hidden="true"></i>
          <p>No cameras detected</p>
        </div>
      {:else}
        <select
          id="camera-select"
          class="camera-select"
          value={hubState.performanceSettings.cameraId || ""}
          onchange={handleCameraSelect}
        >
          {#each availableCameras as camera}
            <option value={camera.deviceId}>
              {camera.label || `Camera ${availableCameras.indexOf(camera) + 1}`}
            </option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Upload Mode Settings -->
  {#if hubState.performanceSettings.mode === "upload"}
    <div class="setting-group">
      <div class="setting-header">
        <label for="file-upload">
          <i class="fas fa-file-video" aria-hidden="true"></i>
          Upload Video File
        </label>
      </div>

      <label for="file-upload" class="upload-area">
        <input
          id="file-upload"
          type="file"
          accept="video/*"
          onchange={handleFileUpload}
          class="sr-only"
        />
        {#if hubState.performanceSettings.uploadedFile}
          <div class="uploaded-file-info">
            <i class="fas fa-check-circle" aria-hidden="true"></i>
            <div>
              <p class="file-name">
                {hubState.performanceSettings.uploadedFile.name}
              </p>
              <p class="file-size">
                {(
                  hubState.performanceSettings.uploadedFile.size /
                  1024 /
                  1024
                ).toFixed(2)} MB
              </p>
            </div>
          </div>
        {:else}
          <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
          <p>Click to upload video</p>
          <span class="upload-hint">MP4, WebM, or MOV files accepted</span>
        {/if}
      </label>
    </div>
  {/if}
</div>

<style>
  .performance-settings {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .setting-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .setting-header label,
  .setting-header .setting-label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .setting-header i {
    font-size: var(--font-size-base);
    opacity: 0.7;
  }

  .mode-toggle-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
  }

  .mode-option i {
    font-size: var(--font-size-2xl);
    opacity: 0.6;
  }

  .mode-option > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mode-title {
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .mode-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .mode-option:hover {
    border-color: var(--theme-accent);
    transform: translateY(-2px);
  }

  .mode-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .mode-option.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
  }

  .mode-option.active i {
    opacity: 1;
    color: white; /* Icon needs to be white on accent background, not accent on accent */
  }

  .mode-option.active .mode-title,
  .mode-option.active .mode-description {
    color: white;
  }

  .camera-select {
    width: 100%;
    padding: 12px 14px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: var(--font-size-min);
    color: var(--theme-text, white);
    font-family: inherit;
    cursor: pointer;
    transition: border-color var(--duration-normal) ease;
  }

  .camera-select:hover {
    border-color: var(--theme-accent);
  }

  .camera-select:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  .permission-prompt,
  .no-cameras-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: var(--theme-card-bg);
    border: 1.5px dashed var(--theme-stroke);
    border-radius: 12px;
    text-align: center;
  }

  .permission-prompt i,
  .no-cameras-message i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .permission-prompt p,
  .no-cameras-message p {
    margin: 0;
    font-size: var(--font-size-min);
    color: var(--theme-text-dim);
  }

  .permission-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: var(--theme-accent);
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .permission-button:hover {
    background: var(--theme-accent-hover);
    transform: translateY(-2px);
  }

  .upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 150px;
    padding: 24px;
    background: var(--theme-card-bg);
    border: 2px dashed var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .upload-area:hover {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }

  .upload-area i {
    font-size: var(--font-size-3xl);
    opacity: 0.4;
  }

  .upload-area p {
    margin: 0;
    font-size: var(--font-size-min);
    color: var(--theme-text, white);
    font-weight: 500;
  }

  .upload-hint {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .uploaded-file-info {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .uploaded-file-info i {
    font-size: var(--font-size-3xl);
    color: var(--theme-accent);
    opacity: 1;
  }

  .uploaded-file-info > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  .file-name {
    margin: 0;
    font-size: var(--font-size-min);
    color: var(--theme-text, white);
    font-weight: 600;
    word-break: break-word;
  }

  .file-size {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  /* Mobile optimization */
  @media (max-width: 600px) {
    .performance-settings {
      gap: 20px;
    }

    .mode-option {
      padding: 14px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .mode-option,
    .permission-button {
      transition: none;
    }

    .mode-option:hover,
    .permission-button:hover {
      transform: none;
    }
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
</style>
