import type { IPoiConnection } from "./types";
import type { PoiDeviceInfo } from "../domain/device-types";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import {
  BLE_START_BYTE,
  BLE_END_BYTE,
  BleCommCode,
  BLE_CHUNK_SIZE,
  OPP_MAX_PIXELS,
  NORDIC_UART_SERVICE,
  NORDIC_UART_TX,
} from "../domain/device-types";

/**
 * Build the complete BLE packet for an Open-Pixel-Poi pattern upload.
 * Exported for unit testing (no hardware dependency).
 *
 * Format: [0xD0] [0x04] [height:1] [count:2 BE] [RGB data...] [0xD1]
 * Where count = ledCount * frameCount (total pixels)
 */
export function buildPatternPacket(pattern: StripPattern): Uint8Array {
  const totalPixels = pattern.ledCount * pattern.frameCount;
  if (totalPixels > OPP_MAX_PIXELS) {
    throw new Error(
      `Pattern has ${totalPixels} pixels, exceeds Open-Pixel-Poi limit of ${OPP_MAX_PIXELS}`
    );
  }

  // Header: start byte + comm code + height + pixel count (2 bytes BE)
  const headerSize = 5;
  const dataSize = totalPixels * 3;
  const totalSize = headerSize + dataSize + 1; // +1 for end byte

  const packet = new Uint8Array(totalSize);
  let offset = 0;

  packet[offset++] = BLE_START_BYTE;
  packet[offset++] = BleCommCode.IMAGE_UPLOAD;
  packet[offset++] = pattern.ledCount; // height (1 byte, max 255)
  packet[offset++] = (totalPixels >> 8) & 0xff; // count high byte
  packet[offset++] = totalPixels & 0xff;         // count low byte

  // RGB data: frame-major order (column by column)
  for (let f = 0; f < pattern.frameCount; f++) {
    const frame = pattern.frames[f]!;
    for (let led = 0; led < pattern.ledCount; led++) {
      const srcIdx = led * 3;
      packet[offset++] = frame.colors[srcIdx]!;
      packet[offset++] = frame.colors[srcIdx + 1]!;
      packet[offset++] = frame.colors[srcIdx + 2]!;
    }
  }

  packet[offset++] = BLE_END_BYTE;
  return packet;
}

/**
 * Build a brightness command packet.
 * Format: [0xD0] [0x02] [brightness:1] [0xD1]
 */
export function buildBrightnessPacket(brightness: number): Uint8Array {
  const clamped = Math.max(0, Math.min(255, Math.round(brightness)));
  return new Uint8Array([BLE_START_BYTE, BleCommCode.SET_BRIGHTNESS, clamped, BLE_END_BYTE]);
}

/**
 * Build a speed command packet.
 * Format: [0xD0] [0x03] [hz_high:1] [hz_low:1] [0xD1]
 */
export function buildSpeedPacket(hz: number): Uint8Array {
  const clamped = Math.max(0, Math.min(65535, Math.round(hz)));
  return new Uint8Array([
    BLE_START_BYTE,
    BleCommCode.SET_SPEED,
    (clamped >> 8) & 0xff,
    clamped & 0xff,
    BLE_END_BYTE,
  ]);
}

/**
 * Split a packet into BLE-sized chunks for transmission.
 */
export function chunkPacket(packet: Uint8Array, chunkSize: number = BLE_CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < packet.length; i += chunkSize) {
    chunks.push(packet.slice(i, Math.min(i + chunkSize, packet.length)));
  }
  return chunks;
}

/**
 * Web Bluetooth adapter for Open-Pixel-Poi hardware.
 * Requires browser with Web Bluetooth API support.
 */
export class OpenPixelPoiAdapter {
  readonly protocolName = "Open-Pixel-Poi BLE";

  async scan(): Promise<PoiDeviceInfo[]> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API not available in this browser");
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [NORDIC_UART_SERVICE] }],
      optionalServices: [NORDIC_UART_SERVICE],
    });

    if (!device) return [];

    return [
      {
        id: device.id,
        name: device.name ?? "Open-Pixel-Poi",
        model: "Open-Pixel-Poi",
        connectionType: "ble",
        ledCount: 55, // Default; user can override
        ledType: "ws2812b",
      },
    ];
  }

  async connect(device: PoiDeviceInfo): Promise<IPoiConnection> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API not available in this browser");
    }

    const btDevices = await navigator.bluetooth.getDevices();
    const btDevice = btDevices.find((d) => d.id === device.id);
    if (!btDevice) {
      throw new Error(`BLE device ${device.id} no longer available`);
    }

    const server = await btDevice.gatt!.connect();
    const service = await server.getPrimaryService(NORDIC_UART_SERVICE);
    const txChar = await service.getCharacteristic(NORDIC_UART_TX);

    return new OpenPixelPoiConnection(device, server, txChar);
  }
}

class OpenPixelPoiConnection implements IPoiConnection {
  readonly deviceInfo: PoiDeviceInfo;
  private server: BluetoothRemoteGATTServer;
  private txChar: BluetoothRemoteGATTCharacteristic;

  constructor(
    deviceInfo: PoiDeviceInfo,
    server: BluetoothRemoteGATTServer,
    txChar: BluetoothRemoteGATTCharacteristic
  ) {
    this.deviceInfo = deviceInfo;
    this.server = server;
    this.txChar = txChar;
  }

  get connected(): boolean {
    return this.server.connected;
  }

  async uploadPattern(
    pattern: StripPattern,
    _slot: number,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const packet = buildPatternPacket(pattern);
    const chunks = chunkPacket(packet);

    for (let i = 0; i < chunks.length; i++) {
      await this.txChar.writeValueWithoutResponse(chunks[i]! as BufferSource);
      onProgress?.(((i + 1) / chunks.length) * 100);
    }
  }

  async setBrightness(level: number): Promise<void> {
    const packet = buildBrightnessPacket(level);
    await this.txChar.writeValueWithoutResponse(packet as BufferSource);
  }

  async setSpeed(hz: number): Promise<void> {
    const packet = buildSpeedPacket(hz);
    await this.txChar.writeValueWithoutResponse(packet as BufferSource);
  }

  disconnect(): void {
    if (this.server.connected) {
      this.server.disconnect();
    }
  }
}
