<!--
  DevicePanel.svelte - Send the lab's pattern to real poi.

  USB first: Ignis poi pair once through the browser's port chooser, then
  reconnect by themselves whenever they are plugged in. One button sends the
  pattern to every connected poi at once.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getPoiContext } from "../context/poi-context";
  import { PoiDeviceState, type UploadStatus } from "../state/poi-device-state.svelte";
  import type { PoiDeviceInfo } from "../domain/device-types";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

  const poi = getPoiContext();
  const devices = new PoiDeviceState();

  onMount(() => devices.start());
  onDestroy(() => devices.dispose());

  const count = $derived(devices.uploadable.length);
  const sendLabel = $derived(
    devices.sending
      ? "Sending…"
      : count === 2
        ? "Send to both poi"
        : count > 2
          ? `Send to all ${count} poi`
          : "Send to poi",
  );

  function details(device: PoiDeviceInfo): string {
    const parts = [`${device.ledCount} LEDs`];
    if (device.firmware) parts.push(`firmware ${device.firmware.split(".").slice(0, 3).join(".")}`);
    if (device.batteryLevel !== undefined && device.batteryLevel <= 100) {
      parts.push(`battery ${device.batteryLevel}%`);
    }
    return parts.join(" · ");
  }

  function statusText(device: PoiDeviceInfo, status: UploadStatus | undefined): string {
    if (device.supported === false) return "This model can't take uploads yet";
    if (!status) return device.connectionType === "usb-serial" ? "Ready over USB" : "Ready over Bluetooth";
    if (status.phase === "sending") return `Sending ${Math.round(status.pct)}%`;
    if (status.phase === "done") return `In slot ${devices.slot}`;
    return status.message;
  }

  function send(): void {
    if (poi.activePattern) void devices.send(poi.activePattern);
  }
</script>

<section class="device-panel" aria-labelledby="device-panel-title">
  <header class="panel-header">
    <h3 id="device-panel-title" class="section-title">Poi</h3>
    {#if devices.devices.length > 0}
      <span class="header-meta">{devices.devices.length} connected</span>
    {/if}
  </header>

  {#if devices.devices.length === 0}
    <div class="empty">
      {#if devices.usbSupported}
        <p class="hint">
          Plug a poi in with its USB cable, then choose it from the list. After that it connects by
          itself.
        </p>
        <PanelButton variant="primary" fullWidth onclick={() => devices.addUsbPoi()} disabled={devices.connecting}>
          <i class="fab fa-usb" aria-hidden="true"></i>
          {devices.connecting ? "Connecting…" : "Connect poi over USB"}
        </PanelButton>
      {:else}
        <p class="hint">Sending to poi over USB needs Chrome or Edge on a computer.</p>
      {/if}
    </div>
  {:else}
    <ul class="device-list">
      {#each devices.devices as device (device.id)}
        {@const status = devices.uploads[device.id]}
        <li class="device" class:failed={status?.phase === "error" || device.supported === false}>
          <div class="device-text">
            <span class="device-name">{device.model}</span>
            <span class="device-meta">{details(device)}</span>
            <span class="device-status" class:done={status?.phase === "done"} aria-live="polite">
              {#if status?.phase === "done"}<i class="fas fa-check" aria-hidden="true"></i>{/if}
              {statusText(device, status)}
            </span>
            <div class="progress" class:shown={status !== undefined} aria-hidden="true">
              <div
                class="progress-fill"
                style:transform="scaleX({status?.phase === 'sending'
                  ? status.pct / 100
                  : status?.phase === 'done'
                    ? 1
                    : 0})"
              ></div>
            </div>
          </div>
          <button
            class="icon-btn"
            onclick={() => devices.disconnect(device.id)}
            disabled={status?.phase === "sending"}
            aria-label="Disconnect {device.model}"
            title="Disconnect"
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </li>
      {/each}
    </ul>

    <div class="settings">
      <ValueSlider
        label="Slot"
        value={devices.slot}
        min={1}
        max={devices.slotCount}
        step={1}
        onchange={(v) => devices.setSlot(v)}
        disabled={devices.sending}
      />
      <ValueSlider
        label="Brightness"
        value={devices.brightness}
        min={1}
        max={devices.maxBrightness}
        step={1}
        format={(v) => `${Math.round((v / devices.maxBrightness) * 100)}%`}
        onchange={(v) => devices.setBrightness(v)}
        disabled={devices.sending}
      />
    </div>

    <PanelButton
      variant="primary"
      fullWidth
      onclick={send}
      disabled={!poi.activePattern || count === 0 || devices.sending}
      ariaBusy={devices.sending}
    >
      <i class="fas fa-paper-plane" aria-hidden="true"></i>
      {sendLabel}
    </PanelButton>

    {#if devices.usbSupported}
      <PanelButton variant="quiet" onclick={() => devices.addUsbPoi()} disabled={devices.connecting}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        {devices.connecting ? "Connecting…" : "Add another poi"}
      </PanelButton>
    {/if}
  {/if}

  {#if devices.error}
    <p class="error" role="alert">{devices.error}</p>
  {/if}

  {#if devices.bluetoothSupported}
    <PanelButton variant="quiet" onclick={() => devices.addBluetoothPoi()} disabled={devices.connecting}>
      <i class="fab fa-bluetooth-b" aria-hidden="true"></i>
      Open Pixel Poi over Bluetooth
    </PanelButton>
  {/if}
</section>

<style>
  .device-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
  }

  .panel-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0;
  }

  .header-meta,
  .device-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .empty {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .hint {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
    color: var(--theme-text-secondary, #94a3b8);
  }

  .device-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .device {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.25rem 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
  }

  .device.failed {
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 55%, transparent);
  }

  .device-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .device-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
  }

  .device-status {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-primary, #e2e8f0);
    font-variant-numeric: tabular-nums;
    min-height: 1.4em;
  }

  .device.failed .device-status {
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
  }

  .device-status.done {
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 75%, white);
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-secondary, #94a3b8);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255 255 255 / 0.08));
    color: var(--theme-text-primary, #e2e8f0);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .progress {
    height: 4px;
    margin-top: 0.25rem;
    border-radius: 2px;
    overflow: hidden;
    background: var(--theme-stroke, rgba(255 255 255 / 0.12));
    visibility: hidden;
  }

  .progress.shown {
    visibility: visible;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #3b82f6);
    transform-origin: left;
    transition: transform var(--duration-normal, 200ms) ease-out;
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    font-size: var(--font-size-compact, 12px);
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }
  }
</style>
