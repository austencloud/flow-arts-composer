import type { IPoiAdapter, IPoiConnection, UploadOptions } from "./types";
import type { PoiDeviceInfo } from "../domain/device-types";
import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";

/**
 * Aggregates multiple device adapters (BLE, USB Serial) and manages
 * connections + pattern uploads across all connected poi.
 */
export class PoiDeviceManager {
  private _adapters: IPoiAdapter[];
  private _connections: Map<string, IPoiConnection> = new Map();
  private _deviceToAdapter: Map<string, IPoiAdapter> = new Map();

  constructor(adapters: IPoiAdapter[]) {
    this._adapters = adapters;
  }

  get adapters(): IPoiAdapter[] {
    return this._adapters;
  }

  get connections(): IPoiConnection[] {
    return [...this._connections.values()].filter((c) => c.connected);
  }

  /** Scan one adapter (each one shows its own browser chooser). */
  async scan(adapter: IPoiAdapter): Promise<PoiDeviceInfo[]> {
    const devices = await adapter.scan();
    for (const device of devices) this._deviceToAdapter.set(device.id, adapter);
    return devices;
  }

  async connect(device: PoiDeviceInfo): Promise<IPoiConnection> {
    const adapter = this._deviceToAdapter.get(device.id);
    if (!adapter) {
      throw new Error(`No adapter found for device ${device.id}. Scan first.`);
    }

    const connection = await adapter.connect(device);
    this._connections.set(device.id, connection);
    return connection;
  }

  /** Track a connection an adapter opened itself (USB plug-in, port chooser). */
  register(connection: IPoiConnection): void {
    this._connections.set(connection.deviceInfo.id, connection);
  }

  /** Forget a connection that closed on its own (unplugged). */
  forget(deviceId: string): void {
    this._connections.delete(deviceId);
  }

  disconnect(deviceId: string): void {
    const connection = this._connections.get(deviceId);
    if (connection) {
      connection.disconnect();
      this._connections.delete(deviceId);
    }
  }

  /**
   * Upload to every connected device in parallel. Progress is reported per
   * device; resolves once all finish, listing any that failed.
   */
  async uploadToAll(
    pattern: StripPattern,
    slot: number,
    onProgress?: (deviceId: string, pct: number) => void,
    options?: UploadOptions
  ): Promise<{ deviceId: string; error: unknown }[]> {
    const active = this.connections;
    if (active.length === 0) {
      throw new Error("No connected devices");
    }
    const results = await Promise.allSettled(
      active.map((conn) =>
        conn.uploadPattern(pattern, slot, (pct) => onProgress?.(conn.deviceInfo.id, pct), options)
      )
    );
    return results.flatMap((r, i) =>
      r.status === "rejected" ? [{ deviceId: active[i]!.deviceInfo.id, error: r.reason as unknown }] : []
    );
  }
}
