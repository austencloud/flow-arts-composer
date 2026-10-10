import { deviceDetector } from './services/device-detector';
import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'

/** Returns the module-level DeviceDetector singleton. */
export function getDeviceDetector(): DeviceDetector {
	return deviceDetector;
}
