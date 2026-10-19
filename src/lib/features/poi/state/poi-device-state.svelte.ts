/**
 * Connected props and the upload to them, for the device panel.
 *
 * Ignis poi and Lighttoys staffs come in over USB through one chooser and
 * reconnect by themselves once the browser has been granted their port. Open
 * Pixel Poi stay available over Bluetooth.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PoiDeviceInfo } from "../domain/device-types";
import {
  getIgnisSerialAdapter,
  getLighttoysSerialAdapter,
  getPoiDeviceManager,
} from "../get-poi-device-manager";
import { getOpenPixelPoiAdapter } from "../get-open-pixel-poi-adapter";
import { IGNIS_BRIGHT, IGNIS_IMAGE_SLOTS } from "../services/ignis/ignis-image";
import {
  IgnisSerialConnection,
  STM32_VENDOR_ID,
  isWebSerialSupported,
  type WebSerialPort,
} from "../services/ignis/ignis-serial-adapter";
import { LIGHTTOYS_BANKS } from "../services/lighttoys/lighttoys-protocol";
import {
  DEFAULT_PLAY_SECONDS,
  LIGHTTOYS_FILTER,
  LighttoysSerialConnection,
} from "../services/lighttoys/lighttoys-serial-adapter";
import type { IPoiConnection } from "../services/types";
import { webSerial } from "../services/web-serial";

const SETTINGS_KEY = "tka-poi-upload";
export const MAX_PLAY_MINUTES = 60;

export type UploadStatus =
  | { phase: "sending"; pct: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

interface UploadSettings {
  slot: number;
  brightness: number;
  bank: number;
  playMinutes: number;
}

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

function loadSettings(): UploadSettings {
  const fallback: UploadSettings = {
    slot: 1,
    brightness: IGNIS_BRIGHT.maxBright,
    bank: 1,
    playMinutes: DEFAULT_PLAY_SECONDS / 60,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<UploadSettings>;
    return {
      slot: clampInt(s.slot, 1, IGNIS_IMAGE_SLOTS, fallback.slot),
      brightness: clampInt(
        s.brightness,
        1,
        IGNIS_BRIGHT.maxBright,
        fallback.brightness
      ),
      bank: clampInt(s.bank, 1, LIGHTTOYS_BANKS, fallback.bank),
      playMinutes: clampInt(
        s.playMinutes,
        1,
        MAX_PLAY_MINUTES,
        fallback.playMinutes
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

/** A Lighttoys staff rather than a poi. */
export function isStaff(device: PoiDeviceInfo): boolean {
  return device.id.startsWith("lighttoys-");
}

export class PoiDeviceState {
  readonly usbSupported = isWebSerialSupported();
  readonly bluetoothSupported =
    typeof navigator !== "undefined" && "bluetooth" in navigator;
  readonly slotCount = IGNIS_IMAGE_SLOTS;
  readonly maxBrightness = IGNIS_BRIGHT.maxBright;
  readonly bankCount = LIGHTTOYS_BANKS;

  devices = $state<PoiDeviceInfo[]>([]);
  uploads = $state<Record<string, UploadStatus>>({});
  connecting = $state(false);
  error = $state<string | null>(null);
  slot = $state(1);
  brightness = $state<number>(IGNIS_BRIGHT.maxBright);
  bank = $state(1);
  playMinutes = $state(DEFAULT_PLAY_SECONDS / 60);
  /** Banks holding a show on each connected staff, by device id. */
  banksInUse = $state<Record<string, number[]>>({});

  readonly sending = $derived(
    Object.values(this.uploads).some((u) => u.phase === "sending")
  );
  readonly uploadable = $derived(
    this.devices.filter((d) => d.supported !== false)
  );
  readonly hasPoi = $derived(this.devices.some((d) => !isStaff(d)));
  readonly hasStaff = $derived(this.devices.some((d) => isStaff(d)));
  /** Staffs whose chosen bank already holds a show. */
  readonly bankTaken = $derived(
    this.devices.filter(
      (d) => isStaff(d) && this.banksInUse[d.id]?.includes(this.bank)
    )
  );

  private readonly manager = getPoiDeviceManager();
  private readonly ignis = getIgnisSerialAdapter();
  private readonly lighttoys = getLighttoysSerialAdapter();
  private readonly staffConnections = new Map<
    string,
    LighttoysSerialConnection
  >();
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    const settings = loadSettings();
    this.slot = settings.slot;
    this.brightness = settings.brightness;
    this.bank = settings.bank;
    this.playMinutes = settings.playMinutes;
    for (const connection of this.manager.connections) this.track(connection);
  }

  /** Reconnect props this browser already knows, now and whenever one is plugged in. */
  start(): void {
    if (!this.usbSupported) return;
    const open = (port: WebSerialPort) => void this.openPort(port);
    this.cleanups.push(
      this.ignis.onPlugIn(open),
      this.lighttoys.onPlugIn(open)
    );
    void Promise.all([
      this.ignis.grantedPorts(),
      this.lighttoys.grantedPorts(),
    ]).then(([poi, staffs]) =>
      Promise.all([...poi, ...staffs].map((p) => this.openPort(p)))
    );
  }

  dispose(): void {
    for (const c of this.cleanups.splice(0)) c();
  }

  /** Show the browser's port chooser for poi and staffs. Must run from a click. */
  async addUsbProp(): Promise<void> {
    this.error = null;
    let port;
    try {
      const serial = webSerial();
      if (!serial)
        throw new Error(
          "This browser cannot talk to USB devices. Use Chrome or Edge."
        );
      port = await serial.requestPort({
        filters: [{ usbVendorId: STM32_VENDOR_ID }, LIGHTTOYS_FILTER],
      });
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

  setBank(bank: number): void {
    this.bank = clampInt(bank, 1, LIGHTTOYS_BANKS, this.bank);
    this.save();
  }

  setPlayMinutes(minutes: number): void {
    this.playMinutes = clampInt(minutes, 1, MAX_PLAY_MINUTES, this.playMinutes);
    this.save();
  }

  /** Send one pattern to every connected prop at once. */
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
        {
          maxBright: this.brightness,
          bank: this.bank,
          playSeconds: this.playMinutes * 60,
        }
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
    this.readBanks();
  }

  private async openPort(port: WebSerialPort): Promise<void> {
    this.connecting = true;
    const staff = this.lighttoys.isLighttoysPort(port);
    try {
      this.track(
        await (staff
          ? this.lighttoys.connectPort(port)
          : this.ignis.connectPort(port))
      );
    } catch (err) {
      this.error = message(
        err,
        staff ? "Could not talk to the staff" : "Could not talk to the poi"
      );
    } finally {
      this.connecting = false;
    }
  }

  private track(connection: IPoiConnection): void {
    this.manager.register(connection);
    const info = connection.deviceInfo;
    if (!this.devices.some((d) => d.id === info.id))
      this.devices = [...this.devices, info];
    if (connection instanceof LighttoysSerialConnection) {
      this.staffConnections.set(info.id, connection);
      this.readBanks();
    }
    if (
      connection instanceof IgnisSerialConnection ||
      connection instanceof LighttoysSerialConnection
    ) {
      this.cleanups.push(
        connection.onClose(() => {
          this.manager.forget(info.id);
          this.drop(info.id);
        })
      );
    }
  }

  private drop(deviceId: string): void {
    this.devices = this.devices.filter((d) => d.id !== deviceId);
    const { [deviceId]: _gone, ...rest } = this.uploads;
    this.uploads = rest;
    this.staffConnections.delete(deviceId);
    this.readBanks();
  }

  private readBanks(): void {
    this.banksInUse = Object.fromEntries(
      [...this.staffConnections].map(([id, c]) => [
        id,
        [...c.banksInUse].sort((a, b) => a - b),
      ])
    );
  }

  private save(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          slot: this.slot,
          brightness: this.brightness,
          bank: this.bank,
          playMinutes: this.playMinutes,
        } satisfies UploadSettings)
      );
    } catch {
      // Private window or blocked storage: settings just won't persist.
    }
  }
}
