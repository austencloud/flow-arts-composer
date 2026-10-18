/**
 * A Flowtoys Bridge over Web Bluetooth. The bridge relays each 21-byte
 * packet written to it over the props' radio, and notifies the packets it
 * hears, which is how groups and their counters are learned.
 */

import {
  FLOWTOYS_BRIDGE_NAME,
  FLOWTOYS_NOTIFY,
  FLOWTOYS_SERVICE,
  FLOWTOYS_WRITE,
  buildPacket,
  parseNotification,
  type FlowtoysPacket,
  type FlowtoysState,
} from "./flowtoys-packet";

/** Radio drops packets, so each one goes out three times. */
const REPEATS = 3;
const REPEAT_GAP_MS = 200;
/** At most one new packet per group this often. */
const MIN_GAP_MS = 50;

export interface FlowtoysGroup {
  id: number;
  counter: number;
  page: number;
  mode: number;
  lastHeard: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class FlowtoysBridge {
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly groups = new Map<number, FlowtoysGroup>();
  private readonly lastSent = new Map<number, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly groupListeners = new Set<
    (groups: FlowtoysGroup[]) => void
  >();
  private readonly closeListeners = new Set<() => void>();

  private constructor(readonly device: BluetoothDevice) {}

  /** Show the browser's Bluetooth chooser for bridges. Needs a click. */
  static async request(): Promise<FlowtoysBridge> {
    if (!isWebBluetoothSupported())
      throw new Error("This browser cannot use Bluetooth. Use Chrome or Edge.");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: FLOWTOYS_BRIDGE_NAME }],
      optionalServices: [FLOWTOYS_SERVICE],
    });
    const bridge = new FlowtoysBridge(device);
    await bridge.connect();
    return bridge;
  }

  get name(): string {
    return this.device.name ?? FLOWTOYS_BRIDGE_NAME;
  }

  get connected(): boolean {
    return this.device.gatt?.connected ?? false;
  }

  private async connect(): Promise<void> {
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(FLOWTOYS_SERVICE);
    this.writeChar = await service.getCharacteristic(FLOWTOYS_WRITE);
    const notify = await service.getCharacteristic(FLOWTOYS_NOTIFY);
    notify.addEventListener("characteristicvaluechanged", (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      const packet = value ? parseNotification(value) : null;
      if (packet) this.heard(packet);
    });
    await notify.startNotifications();
    this.device.addEventListener("gattserverdisconnected", () => {
      for (const l of this.closeListeners) l();
    });
  }

  private heard(packet: FlowtoysPacket): void {
    const known = this.groups.get(packet.group);
    this.groups.set(packet.group, {
      id: packet.group,
      counter: Math.max(packet.counter, known?.counter ?? 0),
      page: packet.page,
      mode: packet.mode,
      lastHeard: Date.now(),
    });
    this.emitGroups();
  }

  private emitGroups(): void {
    const list = this.list();
    for (const l of this.groupListeners) l(list);
  }

  list(): FlowtoysGroup[] {
    return [...this.groups.values()].sort((a, b) => a.id - b.id);
  }

  onGroups(listener: (groups: FlowtoysGroup[]) => void): () => void {
    this.groupListeners.add(listener);
    return () => this.groupListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /**
   * Send a state to a group the bridge has heard, under the group's counter
   * + 1 (props ignore anything not newer than the last they saw).
   */
  send(groupId: number, state: FlowtoysState, flags = 0): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group)
      return Promise.reject(
        new Error(
          "Press a prop's button five times so the bridge hears its group"
        )
      );
    const counter = (group.counter + 1) >>> 0;
    const packet = buildPacket(groupId, counter, state, flags);
    group.counter = counter;
    group.page = state.page;
    group.mode = state.mode;
    this.emitGroups();

    const run = async () => {
      if (!this.writeChar || !this.connected)
        throw new Error("The bridge is not connected");
      const wait = (this.lastSent.get(groupId) ?? 0) + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastSent.set(groupId, Date.now());
      for (let i = 0; i < REPEATS; i++) {
        // A newer state for this group replaces this one, so a slider drag
        // sends only where it ends up.
        if ((this.groups.get(groupId)?.counter ?? counter) !== counter) return;
        await this.writeChar.writeValueWithoutResponse(packet);
        if (i < REPEATS - 1) await sleep(REPEAT_GAP_MS);
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  disconnect(): void {
    this.device.gatt?.disconnect();
  }
}
