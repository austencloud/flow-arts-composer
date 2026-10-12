<script lang="ts">
  import { getPoiContext } from "../context/poi-context";
  import type { PoiDeviceInfo } from "../domain/device-types";

  const poi = getPoiContext();

  let scanning = $state(false);
  let error = $state<string | null>(null);

  async function handleScan(): Promise<void> {
    scanning = true;
    error = null;
    try {
      await poi.scanDevices();
    } catch (err) {
      error = err instanceof Error ? err.message : "Scan failed";
    } finally {
      scanning = false;
    }
  }

  async function handleConnect(device: PoiDeviceInfo): Promise<void> {
    error = null;
    try {
      await poi.connectDevice(device);
    } catch (err) {
      error = err instanceof Error ? err.message : "Connection failed";
    }
  }

  async function handleUpload(deviceId: string): Promise<void> {
    error = null;
    try {
      await poi.uploadToDevice(deviceId);
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed";
    }
  }

  async function handleUploadAll(): Promise<void> {
    error = null;
    try {
      await poi.uploadToAll();
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed";
    }
  }
</script>

<div class="device-panel">
  <div class="panel-header">
    <h3 class="section-title">Devices</h3>
    <button class="scan-btn" onclick={handleScan} disabled={scanning}>
      {scanning ? "Scanning..." : "Scan"}
    </button>
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  {#if poi.connectedDevices.length === 0}
    <div class="empty-state">
      No devices found. Click Scan to search for BLE poi.
    </div>
  {:else}
    <div class="device-list">
      {#each poi.connectedDevices as device}
        <div class="device-card">
          <div class="device-info">
            <span class="device-name">{device.name}</span>
            <span class="device-meta"
              >{device.model} ({device.ledCount} LEDs)</span
            >
          </div>
          <div class="device-actions">
            <button
              class="action-btn"
              onclick={() => handleUpload(device.id)}
              disabled={!poi.activePattern || poi.uploadProgress !== null}
            >
              {poi.uploadProgress !== null
                ? `${Math.round(poi.uploadProgress)}%`
                : "Upload"}
            </button>
          </div>
        </div>
      {/each}
    </div>

    {#if poi.connectedDevices.length > 1 && poi.activePattern}
      <button
        class="upload-all-btn"
        onclick={handleUploadAll}
        disabled={poi.uploadProgress !== null}
      >
        Upload to All
      </button>
    {/if}
  {/if}

  {#if poi.uploadProgress !== null}
    <div class="progress-bar">
      <div class="progress-fill" style:width="{poi.uploadProgress}%"></div>
    </div>
  {/if}
</div>

<style>
  .device-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0;
  }

  .scan-btn,
  .action-btn,
  .upload-all-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    color: var(--theme-text-primary, #e2e8f0);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    min-height: 36px;
    transition: border-color var(--duration-fast);
  }

  .scan-btn:hover:not(:disabled),
  .action-btn:hover:not(:disabled),
  .upload-all-btn:hover:not(:disabled) {
    border-color: var(--theme-accent, #3b82f6);
  }

  .scan-btn:disabled,
  .action-btn:disabled,
  .upload-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-msg {
    padding: 0.5rem;
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    font-size: var(--font-size-compact, 12px);
  }

  .empty-state {
    padding: 1.5rem;
    text-align: center;
    color: var(--theme-text-secondary, #94a3b8);
    font-size: var(--font-size-compact, 12px);
  }

  .device-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .device-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
  }

  .device-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .device-name {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-primary, #e2e8f0);
    font-weight: 500;
  }

  .device-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .upload-all-btn {
    width: 100%;
  }

  .progress-bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255 255 255 / 0.1);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #3b82f6);
    transition: width var(--duration-normal);
  }
</style>
