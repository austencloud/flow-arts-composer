<!--
CameraSettingsDialog.svelte

Settings dialog for camera configuration including mirror toggle and camera source selection.
Built on Bits UI Dialog (same primitive as ConfirmDialog.svelte) for role=dialog,
aria-modal, focus trapping, Escape-to-close, and backdrop dismissal.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { Dialog as DialogPrimitive } from "bits-ui";

  // Services
  const hapticService = getHapticFeedback();

  // Props
  const {
    isOpen = false,
    isMirrored = true,
    availableCameras = [],
    selectedCameraId = null,
    onClose,
    onMirrorToggle,
    onCameraChange,
  }: {
    isOpen?: boolean;
    isMirrored?: boolean;
    availableCameras?: MediaDeviceInfo[];
    selectedCameraId?: string | null;
    onClose?: () => void;
    onMirrorToggle?: () => void;
    onCameraChange?: (deviceId: string) => void;
  } = $props();

  function handleMirrorToggle() {
    hapticService?.trigger("selection");
    onMirrorToggle?.();
  }

  function handleCameraChange(event: Event) {
    hapticService?.trigger("selection");
    const target = event.target as HTMLSelectElement;
    onCameraChange?.(target.value);
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose?.();
  }

  // Fires when Bits UI closes the dialog via Escape or backdrop click
  function handleOpenChange(open: boolean) {
    if (!open && isOpen) {
      handleClose();
    }
  }
</script>

<DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="camera-dialog-backdrop" />
    <DialogPrimitive.Content class="camera-dialog-container">
      <!-- Header -->
      <div class="dialog-header">
        <DialogPrimitive.Title class="camera-dialog-title"
          >{t("create_ui_camera_settings")}</DialogPrimitive.Title
        >
        <button
          class="close-button"
          onclick={handleClose}
          title={t("create_ui_close_settings")}
          aria-label={t("create_ui_close_camera_settings")}
        >
          <span class="close-icon" aria-hidden="true">✕</span>
        </button>
      </div>

      <!-- Content -->
      <div class="dialog-content">
        <!-- Mirror Toggle -->
        <div class="setting-group">
          <span class="setting-label" id="mirror-toggle-label"
            >{t("create_ui_mirror_video")}</span
          >
          <div class="setting-control">
            <button
              class="toggle-button"
              class:active={isMirrored}
              onclick={handleMirrorToggle}
              aria-pressed={isMirrored}
              aria-labelledby="mirror-toggle-label"
              title={isMirrored ? "Disable mirror" : "Enable mirror"}
            >
              <span class="toggle-icon" aria-hidden="true"
                >{isMirrored ? "🪞" : "📹"}</span
              >
              <span class="toggle-text"
                >{isMirrored ? "Mirrored" : "Normal"}</span
              >
            </button>
          </div>
        </div>

        <!-- Camera Selection -->
        {#if availableCameras.length > 1}
          <div class="setting-group">
            <label class="setting-label" for="camera-selector"
              >{t("create_ui_camera_source")}</label
            >
            <div class="setting-control">
              <select
                id="camera-selector"
                class="camera-selector"
                value={selectedCameraId || ""}
                onchange={handleCameraChange}
              >
                {#each availableCameras as camera, index}
                  <option value={camera.deviceId}>
                    {camera.label || `Camera ${index + 1}`}
                  </option>
                {/each}
              </select>
            </div>
          </div>
        {/if}

        <!-- Info Text -->
        <div class="info-text">
          <p>
            {t(
              "create_ui_adjust_your_camera_settings_for_the_best_recording_experience"
            )}
          </p>
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  :global(.camera-dialog-backdrop) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: var(--z-modal);
  }

  :global(.camera-dialog-container) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface-glass, rgba(20, 20, 20, 0.95));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-color, var(--theme-stroke));
    border-radius: var(--border-radius-lg, 12px);
    width: calc(100% - 2 * var(--spacing-lg, 24px));
    max-width: 400px;
    max-height: 80vh;
    overflow: hidden;
    z-index: calc(var(--z-modal) + 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg, 24px);
    border-bottom: 1px solid var(--border-color, var(--theme-stroke));
  }

  :global(.camera-dialog-title) {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--foreground, #ffffff);
  }

  .close-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: transparent;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--surface-light, rgba(255, 255, 255, 0.1));
    border-color: var(--primary, var(--semantic-info));
  }

  .close-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .close-icon {
    font-size: var(--font-size-base);
    color: var(--foreground, #ffffff);
  }

  .dialog-content {
    padding: var(--spacing-lg, 24px);
  }

  .setting-group {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .setting-group:last-child {
    margin-bottom: 0;
  }

  .setting-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--foreground-muted, #cccccc);
    margin-bottom: var(--spacing-sm, 8px);
  }

  .setting-control {
    width: 100%;
  }

  .toggle-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    width: 100%;
    padding: var(--spacing-md, 16px);
    background: var(--surface-light, var(--theme-card-bg));
    border: 1px solid var(--border-color, var(--theme-stroke));
    border-radius: var(--border-radius-md, 8px);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    font-size: var(--font-size-base);
    color: var(--foreground, #ffffff);
  }

  .toggle-button:hover {
    background: var(--surface-lighter, rgba(255, 255, 255, 0.1));
    border-color: var(--primary, var(--semantic-info));
  }

  .toggle-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .toggle-button.active {
    background: var(--primary-glass, rgba(59, 130, 246, 0.2));
    border-color: var(--primary, var(--semantic-info));
  }

  .toggle-icon {
    font-size: var(--font-size-xl);
  }

  .toggle-text {
    font-weight: 500;
  }

  .camera-selector {
    width: 100%;
    padding: var(--spacing-md, 16px);
    background: var(--surface-light, var(--theme-card-bg));
    color: var(--foreground, #ffffff);
    border: 1px solid var(--border-color, var(--theme-stroke));
    border-radius: var(--border-radius-md, 8px);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .camera-selector:hover {
    background: var(--surface-lighter, rgba(255, 255, 255, 0.1));
    border-color: var(--primary, var(--semantic-info));
  }

  .camera-selector:focus {
    outline: none;
    border-color: var(--primary, var(--semantic-info));
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .info-text {
    margin-top: var(--spacing-lg, 24px);
    padding-top: var(--spacing-lg, 24px);
    border-top: 1px solid var(--border-color, var(--theme-stroke));
  }

  .info-text p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--foreground-muted, #cccccc);
    text-align: center;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    :global(.camera-dialog-container) {
      width: calc(100% - 2 * var(--spacing-md, 16px));
      max-width: none;
    }

    .dialog-header,
    .dialog-content {
      padding: var(--spacing-md, 16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button,
    .toggle-button,
    .camera-selector {
      transition: none;
    }
  }
</style>
