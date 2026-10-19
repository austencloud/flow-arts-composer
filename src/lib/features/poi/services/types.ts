import type { PoiDeviceInfo } from "../domain/device-types";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

export interface UploadOptions {
  /** Brightness ceiling on devices that take one (Ignis: 1-21). */
  maxBright?: number;
  /** Lighttoys show bank, 1-4. Only an empty bank is written. */
  bank?: number;
  /** How long a Lighttoys staff plays the pattern, in seconds. */
  playSeconds?: number;
}

/** A transport that finds and connects poi (Bluetooth, USB serial). */
export interface IPoiAdapter {
  readonly protocolName: string;
  scan(): Promise<PoiDeviceInfo[]>;
  connect(device: PoiDeviceInfo): Promise<IPoiConnection>;
}

export interface IPoiConnection {
  readonly deviceInfo: PoiDeviceInfo;
  readonly connected: boolean;
  uploadPattern(
    pattern: StripPattern,
    slot: number,
    onProgress?: (pct: number) => void,
    options?: UploadOptions
  ): Promise<void>;
  setBrightness(level: number): Promise<void>;
  setSpeed(hz: number): Promise<void>;
  disconnect(): void;
}
