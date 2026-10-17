import { PoiDeviceManager } from './services/poi-device-manager';
import { getOpenPixelPoiAdapter } from './get-open-pixel-poi-adapter';
import { IgnisSerialAdapter } from './services/ignis/ignis-serial-adapter';

let instance: PoiDeviceManager | null = null;
let ignis: IgnisSerialAdapter | null = null;

export function getIgnisSerialAdapter(): IgnisSerialAdapter {
  return ignis ??= new IgnisSerialAdapter();
}

export function getPoiDeviceManager(): PoiDeviceManager {
  return instance ??= new PoiDeviceManager([getIgnisSerialAdapter(), getOpenPixelPoiAdapter()]);
}
