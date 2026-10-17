/**
 * Hardware device types for poi connectivity.
 */

export interface PoiDeviceInfo {
  id: string;
  name: string;
  model: string;
  connectionType: "ble" | "usb-serial";
  ledCount: number;
  ledType: "ws2812b" | "sk9822";
  /** Firmware version, when the device reports it. */
  firmware?: string;
  /** Battery level as the device reports it. */
  batteryLevel?: number;
  /** Hardware serial / UID, when known. */
  serial?: string;
  /**
   * False when we can talk to the device but have not verified its image
   * format, so uploads are refused. Undefined means no such check applies.
   */
  supported?: boolean;
}

export interface DeviceDetailedInfo extends PoiDeviceInfo {
  firmwareVersion: string;
  bootloaderVersion?: string;
  uid: string;
  batteryLevel?: number;
}

/**
 * Open-Pixel-Poi BLE protocol constants.
 * Packet format: [0xD0] [CommCode] [payload] [0xD1]
 */
export const BLE_START_BYTE = 0xd0;
export const BLE_END_BYTE = 0xd1;

export enum BleCommCode {
  /** Upload pattern image data */
  IMAGE_UPLOAD = 0x04,
  /** Set global brightness (0–255) */
  SET_BRIGHTNESS = 0x02,
  /** Set rotation speed (uint16 BE, Hz) */
  SET_SPEED = 0x03,
}

/** Maximum bytes per BLE write (MTU-limited) */
export const BLE_CHUNK_SIZE = 509;

/** Maximum total pixel count for Open-Pixel-Poi */
export const OPP_MAX_PIXELS = 40_000;

/** Nordic UART Service UUID */
export const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
/** Nordic UART TX characteristic (write to device) */
export const NORDIC_UART_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
/** Nordic UART RX characteristic (read from device) */
export const NORDIC_UART_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
