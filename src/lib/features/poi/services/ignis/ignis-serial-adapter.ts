/**
 * Ignis iPixel HD poi over USB, via Web Serial (Chrome and Edge).
 *
 * The poi enumerate as STM32 virtual COM ports. Once a port has been granted
 * the browser remembers it, so a poi that was paired once reconnects on
 * plug-in with no chooser.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PoiDeviceInfo } from "../../domain/device-types";
import type { IPoiAdapter, IPoiConnection } from "../types";
import { FrameDecoder, crc32 } from "./ignis-codec";
import { IGNIS_IMAGE_SLOTS, encodeImage } from "./ignis-image";
import {
  CTAG,
  IGNIS_MODELS,
  MODE_ACTION,
  MODE_TYPE,
  VERIFIED_FAMILIES,
  describeAck,
  eraseRequest,
  infoRequest,
  parseReply,
  resolveFamily,
  toWire,
  writeImageChunkRequest,
  type IgnisDeviceInfo,
  type IgnisReply,
} from "./ignis-messages";

import {
  isWebSerialSupported,
  webSerial,
  type WebSerialPort,
} from "../web-serial";

export { isWebSerialSupported, type WebSerialPort };

/** STMicroelectronics: the poi's USB virtual COM port. */
export const STM32_VENDOR_ID = 0x0483;

// ---------------------------------------------------------------- timings (from LoadModeProc, 0x1400368f0)

const INFO_TIMEOUT_MS = 2500;
/** Erase covers up to three 256 KB blocks; the Utility allows 5 s minimum. */
const ERASE_TIMEOUT_MS = 15000;
const CHUNK_TIMEOUT_MS = 2500;
const CHUNK_RETRIES = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class IgnisError extends Error {}

// ---------------------------------------------------------------- connection

let nextId = 1;

export class IgnisSerialConnection implements IPoiConnection {
  deviceInfo: PoiDeviceInfo;
  ignisInfo: IgnisDeviceInfo = {};
  private open = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private waiter: {
    accept: (r: IgnisReply) => boolean;
    resolve: (r: IgnisReply) => void;
  } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(readonly port: WebSerialPort) {
    this.deviceInfo = {
      id: `ignis-usb-${nextId++}`,
      name: "Ignis poi",
      model: "Ignis",
      connectionType: "usb-serial",
      ledCount: 200,
      ledType: "sk9822",
    };
  }

  get connected(): boolean {
    return this.open;
  }

  /** Called when the poi is unplugged or the port closes. */
  onClose(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    await this.port.open({ baudRate: 115200 });
    this.open = true;
    void this.readLoop();
    await this.refreshInfo();
  }

  private async readLoop(): Promise<void> {
    const decoder = new FrameDecoder((message) => {
      let reply: IgnisReply;
      try {
        reply = parseReply(message);
      } catch (err) {
        console.warn("[ignis] dropped unreadable reply", err);
        return;
      }
      if (this.waiter?.accept(reply)) {
        const { resolve } = this.waiter;
        this.waiter = null;
        resolve(reply);
      }
    });
    try {
      while (this.port.readable) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value) decoder.push(value);
          }
        } finally {
          this.reader.releaseLock();
          this.reader = null;
        }
        if (!this.open) break;
      }
    } catch {
      // Unplugged mid-read.
    }
    this.markClosed();
  }

  private markClosed(): void {
    if (!this.open) return;
    this.open = false;
    for (const l of this.listeners) l();
  }

  /** One request at a time: write it, then wait for the matching reply. */
  private request(
    wire: Uint8Array,
    accept: (r: IgnisReply) => boolean,
    timeoutMs: number
  ): Promise<IgnisReply> {
    const run = async () => {
      if (!this.open || !this.port.writable)
        throw new IgnisError("Poi is not connected");
      let deadline = Date.now() + timeoutMs;
      const reply = new Promise<IgnisReply>((resolve, reject) => {
        const tick = () => {
          if (!this.waiter) return;
          if (Date.now() >= deadline) {
            this.waiter = null;
            reject(new IgnisError("Poi did not answer in time"));
          } else setTimeout(tick, 50);
        };
        this.waiter = {
          accept: (r) => {
            // WAIT means "busy, give me this long": push the deadline out.
            if (r.waitMs !== undefined && !r.ack) {
              deadline = Date.now() + r.waitMs + timeoutMs;
              return false;
            }
            return accept(r);
          },
          resolve,
        };
        setTimeout(tick, 50);
      });
      const writer = this.port.writable.getWriter();
      try {
        await writer.write(wire);
      } finally {
        writer.releaseLock();
      }
      return reply;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async refreshInfo(): Promise<IgnisDeviceInfo> {
    const reply = await this.request(
      toWire(infoRequest()),
      (r) => r.deviceInfo !== undefined,
      INFO_TIMEOUT_MS
    );
    const info = reply.deviceInfo!;
    this.ignisInfo = info;
    const family = resolveFamily(info);
    const model = family !== undefined ? IGNIS_MODELS[family] : undefined;
    this.deviceInfo = {
      ...this.deviceInfo,
      name: model?.name ?? info.name ?? "Ignis poi",
      model: model?.name ?? `Ignis type ${family?.toString(16) ?? "?"}`,
      ledCount: model?.ledCount ?? this.deviceInfo.ledCount,
      firmware: info.firmware,
      batteryLevel: info.batteryLevel,
      serial: info.uid,
      supported: family !== undefined && VERIFIED_FAMILIES.has(family),
    };
    return info;
  }

  private async modeRequest(
    wire: Uint8Array,
    action: number,
    timeoutMs: number
  ): Promise<void> {
    const reply = await this.request(
      wire,
      (r) =>
        r.ack !== undefined &&
        r.ack.requestTag === CTAG.MODE &&
        r.ack.action === action,
      timeoutMs
    );
    if (reply.ack!.code !== 0)
      throw new IgnisError(describeAck(reply.ack!.code));
  }

  /**
   * Write a pattern into image slot `slot` (0-based). Erases the slot, then
   * streams 2 KB chunks, each acknowledged before the next, retrying a chunk
   * up to ten times like the Utility.
   */
  async uploadPattern(
    pattern: StripPattern,
    slot: number,
    onProgress?: (pct: number) => void,
    options: { maxBright?: number } = {}
  ): Promise<void> {
    if (!this.deviceInfo.supported) {
      throw new IgnisError(
        `${this.deviceInfo.model} is not supported for uploads yet`
      );
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= IGNIS_IMAGE_SLOTS) {
      throw new IgnisError(`Slot must be 1 to ${IGNIS_IMAGE_SLOTS}`);
    }
    const image = encodeImage(pattern, {
      ledCount: this.deviceInfo.ledCount,
      maxBright: options.maxBright,
    });
    const total = image.chunks.length + 1;
    onProgress?.(0);

    await this.modeRequest(
      toWire(eraseRequest({ type: MODE_TYPE.IMAGE, index: slot })),
      MODE_ACTION.ERASE,
      ERASE_TIMEOUT_MS
    );
    onProgress?.((1 / total) * 100);

    for (let n = 0; n < image.chunks.length; n++) {
      const chunk = image.chunks[n]!;
      const wire = toWire(
        writeImageChunkRequest(slot, chunk, n, image.header, crc32(chunk))
      );
      for (let attempt = 0; ; attempt++) {
        try {
          await this.modeRequest(wire, MODE_ACTION.WRITE, CHUNK_TIMEOUT_MS);
          break;
        } catch (err) {
          if (attempt + 1 >= CHUNK_RETRIES || !this.open) throw err;
          await sleep(100);
        }
      }
      onProgress?.(((n + 2) / total) * 100);
    }
  }

  async setBrightness(): Promise<void> {
    throw new IgnisError(
      "Brightness is set per pattern when uploading to Ignis poi"
    );
  }

  async setSpeed(): Promise<void> {
    throw new IgnisError("Ignis poi set their own speed");
  }

  disconnect(): void {
    this.open = false;
    void (async () => {
      try {
        await this.reader?.cancel();
      } catch {
        // Already gone.
      }
      try {
        await this.port.close();
      } catch {
        // Already closed.
      }
      for (const l of this.listeners) l();
    })();
  }
}

// ---------------------------------------------------------------- adapter

export class IgnisSerialAdapter implements IPoiAdapter {
  readonly protocolName = "Ignis USB";
  private readonly byPort = new Map<WebSerialPort, IgnisSerialConnection>();

  get supported(): boolean {
    return isWebSerialSupported();
  }

  /** Ports this browser already has permission for (no chooser). */
  async grantedPorts(): Promise<WebSerialPort[]> {
    const serial = webSerial();
    if (!serial) return [];
    const ports = await serial.getPorts();
    return ports.filter((p) => p.getInfo().usbVendorId === STM32_VENDOR_ID);
  }

  /** Show the browser's port chooser, filtered to poi. Needs a click. */
  async requestPort(): Promise<WebSerialPort> {
    const serial = webSerial();
    if (!serial)
      throw new IgnisError(
        "This browser cannot talk to USB devices. Use Chrome or Edge."
      );
    return serial.requestPort({ filters: [{ usbVendorId: STM32_VENDOR_ID }] });
  }

  async connectPort(port: WebSerialPort): Promise<IgnisSerialConnection> {
    const existing = this.byPort.get(port);
    if (existing?.connected) return existing;
    const connection = new IgnisSerialConnection(port);
    try {
      await connection.start();
    } catch (err) {
      connection.disconnect();
      throw err instanceof IgnisError
        ? err
        : new IgnisError(`Could not open the poi: ${String(err)}`);
    }
    this.byPort.set(port, connection);
    connection.onClose(() => this.byPort.delete(port));
    return connection;
  }

  /** Fires when a granted poi is plugged in. */
  onPlugIn(listener: (port: WebSerialPort) => void): () => void {
    const serial = webSerial();
    if (!serial) return () => {};
    const handler = (event: Event) => {
      const port = (event.target ??
        (event as unknown as { port?: WebSerialPort }).port) as WebSerialPort;
      if (port?.getInfo?.().usbVendorId === STM32_VENDOR_ID) listener(port);
    };
    serial.addEventListener("connect", handler);
    return () => serial.removeEventListener("connect", handler);
  }

  async scan(): Promise<PoiDeviceInfo[]> {
    const port = await this.requestPort();
    const connection = await this.connectPort(port);
    return [connection.deviceInfo];
  }

  async connect(device: PoiDeviceInfo): Promise<IPoiConnection> {
    for (const connection of this.byPort.values()) {
      if (connection.deviceInfo.id === device.id) return connection;
    }
    throw new IgnisError("That poi is no longer plugged in");
  }
}
