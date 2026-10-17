/**
 * Connected poi and the upload to them, for the device panel.
 *
 * Ignis poi come in over USB and reconnect by themselves once the browser has
 * been granted their port. Open Pixel Poi stay available over Bluetooth.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PoiDeviceInfo } from "../domain/device-types";
import {
  getIgnisSerialAdapter,
  getPoiDeviceManager,
} from "../get-poi-device-manager";
import { getOpenPixelPoiAdapter } from "../get-open-pixel-poi-adapter";
import { IGNIS_BRIGHT, IGNIS_IMAGE_SLOTS } from "../services/ignis/ignis-image";
import {
  IgnisSerialConnection,
  isWebSerialSupported,
  type WebSerialPort,
} from "../services/ignis/ignis-serial-adapter";
import type { IPoiConnection } from "../services/types";

const SETTINGS_KEY = "tka-poi-upload";

export type UploadStatus =
  | { phase: "sending"; pct: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The chooser was closed without picking: not an error worth showing. */
function cancelled(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotFoundError" || err.name === "AbortError")
  );
}

function loadSettings(): { slot: number; brightness: number } {
  const fallback = { slot: 1, brightness: IGNIS_BRIGHT.maxBright };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      slot: clampInt(s.slot, 1, IGNIS_IMAGE_SLOTS, fallback.slot),
      brightness: clampInt(
        s.brightness,
        1,
        IGNIS_BRIGHT.maxBright,
        fallback.brightness
      ),
    };
  } catch {
    return fallback;
  }
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
}

export class PoiDeviceState {
  readonly usbSupported = isWebSerialSupported();
  readonly bluetoothSupported =
    typeof navigator !== "undefined" && "bluetooth" in navigator;
  readonly slotCount = IGNIS_IMAGE_SLOTS;
  readonly maxBrightness = IGNIS_BRIGHT.maxBright;

  devices = $state<PoiDeviceInfo[]>([]);
  uploads = $state<Record<string, UploadStatus>>({});
  connecting = $state(false);
  error = $state<string | null>(null);
  slot = $state(1);
  brightness = $state<number>(IGNIS_BRIGHT.maxBright);

  readonly sending = $derived(
    Object.values(this.uploads).some((u) => u.phase === "sending")
  );
  readonly uploadable = $derived(
    this.devices.filter((d) => d.supported !== false)
  );

  private readonly manager = getPoiDeviceManager();
  private readonly ignis = getIgnisSerialAdapter();
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    const settings = loadSettings();
    this.slot = settings.slot;
    this.brightness = settings.brightness;
    this.devices = this.manager.connections.map((c) => c.deviceInfo);
  }

  /** Reconnect poi this browser already knows, now and whenever one is plugged in. */
  start(): void {
    if (!this.usbSupported) return;
    this.cleanups.push(this.ignis.onPlugIn((port) => void this.openPort(port)));
    void this.ignis
      .grantedPorts()
      .then((ports) => Promise.all(ports.map((p) => this.openPort(p))));
  }

  dispose(): void {
    for (const c of this.cleanups.splice(0)) c();
  }

  /** Show the browser's port chooser. Must run from a click. */
  async addUsbPoi(): Promise<void> {
    this.error = null;
    let port;
    try {
      port = await this.ignis.requestPort();
    } catch (err) {
      if (!cancelled(err))
        this.error = message(err, "Could not open the USB chooser");
      return;
    }
    await this.openPort(port);
  }

  async addBluetoothPoi(): Promise<void> {
    this.error = null;
    this.connecting = true;
    try {
      const found = await this.manager.scan(getOpenPixelPoiAdapter());
      for (const device of found)
        this.track(await this.manager.connect(device));
    } catch (err) {
      if (!cancelled(err))
        this.error = message(err, "Bluetooth connection failed");
    } finally {
      this.connecting = false;
    }
  }

  disconnect(deviceId: string): void {
    this.manager.disconnect(deviceId);
    this.drop(deviceId);
  }

  setSlot(slot: number): void {
    this.slot = clampInt(slot, 1, IGNIS_IMAGE_SLOTS, this.slot);
    this.save();
  }

  setBrightness(level: number): void {
    this.brightness = clampInt(
      level,
      1,
      IGNIS_BRIGHT.maxBright,
      this.brightness
    );
    this.save();
  }

  /** Send one pattern to every connected poi at once. */
  async send(pattern: StripPattern): Promise<void> {
    if (this.sending) return;
    this.error = null;
    const targets = this.uploadable.map((d) => d.id);
    this.uploads = Object.fromEntries(
      targets.map((id) => [id, { phase: "sending", pct: 0 } as UploadStatus])
    );
    const failures = await this.manager
      .uploadToAll(
        pattern,
        this.slot - 1,
        (id, pct) => {
          if (this.uploads[id]?.phase === "sending")
            this.uploads[id] = { phase: "sending", pct };
        },
        { maxBright: this.brightness }
      )
      .catch((err: unknown) =>
        targets.map((deviceId) => ({ deviceId, error: err }))
      );
    const failed = new Map(failures.map((f) => [f.deviceId, f.error]));
    this.uploads = Object.fromEntries(
      targets.map((id) => [
        id,
        failed.has(id)
          ? ({
              phase: "error",
              message: message(failed.get(id), "Upload failed"),
            } as UploadStatus)
          : ({ phase: "done" } as UploadStatus),
      ])
    );
  }

  private async openPort(port: WebSerialPort): Promise<void> {
    this.connecting = true;
    try {
      this.track(await this.ignis.connectPort(port));
    } catch (err) {
      this.error = message(err, "Could not talk to the poi");
    } finally {
      this.connecting = false;
    }
  }

  private track(connection: IPoiConnection): void {
    this.manager.register(connection);
    const info = connection.deviceInfo;
    if (!this.devices.some((d) => d.id === info.id))
      this.devices = [...this.devices, info];
    if (connection instanceof IgnisSerialConnection) {
      connection.onClose(() => {
        this.manager.forget(info.id);
        this.drop(info.id);
      });
    }
  }

  private drop(deviceId: string): void {
    this.devices = this.devices.filter((d) => d.id !== deviceId);
    const { [deviceId]: _gone, ...rest } = this.uploads;
    this.uploads = rest;
  }

  private save(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ slot: this.slot, brightness: this.brightness })
      );
    } catch {
      // Private window or blocked storage: settings just won't persist.
    }
  }
}
