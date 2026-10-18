import { PoiDeviceManager } from "./services/poi-device-manager";
import { getOpenPixelPoiAdapter } from "./get-open-pixel-poi-adapter";
import { IgnisSerialAdapter } from "./services/ignis/ignis-serial-adapter";
import { LighttoysSerialAdapter } from "./services/lighttoys/lighttoys-serial-adapter";

let instance: PoiDeviceManager | null = null;
let ignis: IgnisSerialAdapter | null = null;
let lighttoys: LighttoysSerialAdapter | null = null;

export function getIgnisSerialAdapter(): IgnisSerialAdapter {
  return (ignis ??= new IgnisSerialAdapter());
}

/** Lighttoys staffs connect through the device panel's USB chooser, not a scan. */
export function getLighttoysSerialAdapter(): LighttoysSerialAdapter {
  return (lighttoys ??= new LighttoysSerialAdapter());
}

export function getPoiDeviceManager(): PoiDeviceManager {
  return (instance ??= new PoiDeviceManager([
    getIgnisSerialAdapter(),
    getOpenPixelPoiAdapter(),
  ]));
}
