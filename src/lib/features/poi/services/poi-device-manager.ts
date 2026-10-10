import type { OpenPixelPoiAdapter } from "./open-pixel-poi-adapter";
import type { IPoiConnection } from "./types";
import type { PoiDeviceInfo } from "../domain/device-types";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

/**
 * Aggregates multiple device adapters (BLE, USB Serial) and manages
 * connections + pattern uploads across all connected poi.
 */
export class PoiDeviceManager {
  private _adapters: OpenPixelPoiAdapter[];
  private _connections: Map<string, IPoiConnection> = new Map();
  private _deviceToAdapter: Map<string, OpenPixelPoiAdapter> = new Map();

  constructor(adapters: OpenPixelPoiAdapter[]) {
    this._adapters = adapters;
  }

  get adapters(): OpenPixelPoiAdapter[] {
    return this._adapters;
  }

  get connections(): IPoiConnection[] {
    return [...this._connections.values()].filter((c) => c.connected);
  }

  async scanAll(): Promise<PoiDeviceInfo[]> {
    const results: PoiDeviceInfo[] = [];
    for (const adapter of this._adapters) {
      try {
        const devices = await adapter.scan();
        for (const device of devices) {
          this._deviceToAdapter.set(device.id, adapter);
          results.push(device);
        }
      } catch (err) {
        // Adapter may not be supported in this browser - skip it
        console.warn(`${adapter.protocolName} scan failed:`, err);
      }
    }
    return results;
  }

  async connect(device: PoiDeviceInfo): Promise<IPoiConnection> {
    const adapter = this._deviceToAdapter.get(device.id);
    if (!adapter) {
      throw new Error(`No adapter found for device ${device.id}. Run scanAll() first.`);
    }

    const connection = await adapter.connect(device);
    this._connections.set(device.id, connection);
    return connection;
  }

  disconnect(deviceId: string): void {
    const connection = this._connections.get(deviceId);
    if (connection) {
      connection.disconnect();
      this._connections.delete(deviceId);
    }
  }

  async uploadPattern(
    deviceId: string,
    pattern: StripPattern,
    slot: number,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const connection = this._connections.get(deviceId);
    if (!connection?.connected) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    await connection.uploadPattern(pattern, slot, onProgress);
  }

  async uploadToAll(
    pattern: StripPattern,
    slot: number,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const active = this.connections;
    if (active.length === 0) {
      throw new Error("No connected devices");
    }
    // Upload to all devices in parallel
    await Promise.all(
      active.map((conn) => conn.uploadPattern(pattern, slot, onProgress))
    );
  }
}
