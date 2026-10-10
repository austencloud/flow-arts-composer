import type { PoiDeviceInfo } from "../domain/device-types";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

export interface IPoiConnection {
  readonly deviceInfo: PoiDeviceInfo;
  readonly connected: boolean;
  uploadPattern(
    pattern: StripPattern,
    slot: number,
    onProgress?: (pct: number) => void
  ): Promise<void>;
  setBrightness(level: number): Promise<void>;
  setSpeed(hz: number): Promise<void>;
  disconnect(): void;
}
