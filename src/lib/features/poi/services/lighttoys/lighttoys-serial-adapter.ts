/**
 * Lighttoys staffs over USB, via Web Serial (Chrome and Edge).
 *
 * A staff is a CDC serial port that answers ASCII command lines with `OK`.
 * Uploads go only into an empty bank 1 to 4: the bank list is read first and
 * a used bank is refused, so an existing show is never overwritten or
 * deleted. See docs/reference/lighttoys-protocol.md.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PoiDeviceInfo } from "../../domain/device-types";
import type { IPoiConnection, UploadOptions } from "../types";
import { portMatches, webSerial, type WebSerialPort } from "../web-serial";
import {
  BLOCK_BYTES,
  LIGHTTOYS_BANKS,
  LIGHTTOYS_BAUD,
  LIGHTTOYS_PRODUCT_ID,
  LIGHTTOYS_VENDOR_ID,
  LUMI_STAFF,
  LighttoysError,
  commandBytes,
  frameBlock,
  isVerifiedStaff,
  parseIdentity,
  patternToStaffShow,
  showName,
  usedBanks,
  writeCommand,
  type LighttoysIdentity,
} from "./lighttoys-protocol";

export const LIGHTTOYS_FILTER = {
  usbVendorId: LIGHTTOYS_VENDOR_ID,
  usbProductId: LIGHTTOYS_PRODUCT_ID,
};

const IDENTIFY_TIMEOUT_MS = 2500;
const BANKS_TIMEOUT_MS = 3000;
const WRITE_START_TIMEOUT_MS = 8000;
const BLOCK_TIMEOUT_MS = 3000;
export const DEFAULT_PLAY_SECONDS = 600;

let nextId = 1;

export class LighttoysSerialConnection implements IPoiConnection {
  deviceInfo: PoiDeviceInfo;
  identity: LighttoysIdentity | null = null;
  /** Banks holding a show at the last check. */
  banksInUse = new Set<number>();
  private open = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pending = "";
  private lines: string[] = [];
  private lineWaiter: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(readonly port: WebSerialPort) {
    this.deviceInfo = {
      id: `lighttoys-usb-${nextId++}`,
      name: "Lighttoys device",
      model: "Lighttoys",
      connectionType: "usb-serial",
      ledCount: LUMI_STAFF.ledCount,
      ledType: "ws2812b",
    };
  }

  get connected(): boolean {
    return this.open;
  }

  onClose(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    await this.port.open({ baudRate: LIGHTTOYS_BAUD });
    this.open = true;
    void this.readLoop();
    const reply = await this.command("v", IDENTIFY_TIMEOUT_MS);
    this.identity = parseIdentity(reply);
    const staff = isVerifiedStaff(this.identity);
    const remote = this.identity?.hardware.startsWith("LTC") ?? false;
    this.deviceInfo = {
      ...this.deviceInfo,
      name: staff
        ? "Lumi Staff"
        : remote
          ? "Lighttoys remote"
          : "Lighttoys device",
      model: staff
        ? "Lighttoys Lumi Staff"
        : remote
          ? "Lighttoys remote"
          : `Lighttoys ${this.identity?.hardware ?? "device"}`,
      firmware: this.identity?.firmware,
      supported: staff,
    };
    if (staff) await this.refreshBanks();
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    try {
      while (this.port.readable) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value) this.pushText(decoder.decode(value, { stream: true }));
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

  private pushText(text: string): void {
    this.pending += text;
    let nl: number;
    while ((nl = this.pending.indexOf("\n")) >= 0) {
      this.lines.push(this.pending.slice(0, nl).replace(/\r$/, ""));
      this.pending = this.pending.slice(nl + 1);
    }
    this.lineWaiter?.();
  }

  private markClosed(): void {
    if (!this.open) return;
    this.open = false;
    this.lineWaiter?.();
    for (const l of this.listeners) l();
  }

  /** Write bytes, then collect reply lines up to an exact `OK`. */
  private exchange(bytes: Uint8Array, timeoutMs: number): Promise<string[]> {
    const run = async () => {
      if (!this.open || !this.port.writable)
        throw new LighttoysError("The staff is not connected");
      this.lines = [];
      this.pending = "";
      const writer = this.port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const ok = this.lines.findIndex(
          (l) => l.trim() === "OK" || l.trim() === "CMD>OK"
        );
        if (ok >= 0) return this.lines.splice(0, ok + 1).slice(0, -1);
        if (!this.open) throw new LighttoysError("The staff was unplugged");
        const left = deadline - Date.now();
        if (left <= 0) {
          const heard = this.lines.join(" | ").slice(0, 160);
          throw new LighttoysError(
            heard
              ? `The staff answered: ${heard}`
              : "The staff did not answer in time"
          );
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, Math.min(left, 250));
          function done() {
            clearTimeout(timer);
            resolve();
          }
          this.lineWaiter = done;
        });
        this.lineWaiter = null;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private command(command: string, timeoutMs: number): Promise<string[]> {
    return this.exchange(commandBytes(command), timeoutMs);
  }

  async refreshBanks(): Promise<Set<number>> {
    this.banksInUse = usedBanks(await this.command("sd", BANKS_TIMEOUT_MS));
    return this.banksInUse;
  }

  /** Upload a pattern as a one-image show into an empty bank (1-4). */
  async uploadPattern(
    pattern: StripPattern,
    _slot: number,
    onProgress?: (pct: number) => void,
    options: UploadOptions = {}
  ): Promise<void> {
    if (!this.deviceInfo.supported)
      throw new LighttoysError(`${this.deviceInfo.model} can't take uploads`);
    const bank = options.bank ?? 1;
    if (!Number.isInteger(bank) || bank < 1 || bank > LIGHTTOYS_BANKS)
      throw new LighttoysError(`Bank must be 1 to ${LIGHTTOYS_BANKS}`);

    onProgress?.(0);
    const used = await this.refreshBanks();
    if (used.has(bank))
      throw new LighttoysError(
        `Bank ${bank} already holds a show. Pick an empty bank, or clear it in Lighttoys Composer.`
      );

    const { bytes, uid } = patternToStaffShow(pattern, {
      playSeconds: options.playSeconds ?? DEFAULT_PLAY_SECONDS,
    });
    await this.command(
      writeCommand(uid, bank, bytes.length, showName(pattern.metadata.name)),
      WRITE_START_TIMEOUT_MS
    );

    const blocks = Math.ceil(bytes.length / BLOCK_BYTES);
    for (let n = 0; n < blocks; n++) {
      const block = bytes.subarray(n * BLOCK_BYTES, (n + 1) * BLOCK_BYTES);
      await this.exchange(frameBlock(block), BLOCK_TIMEOUT_MS);
      onProgress?.(((n + 1) / (blocks + 1)) * 100);
    }

    const after = await this.refreshBanks();
    if (!after.has(bank))
      throw new LighttoysError(
        `The staff did not list bank ${bank} after the upload`
      );
    onProgress?.(100);
  }

  async setBrightness(): Promise<void> {
    throw new LighttoysError("Set brightness on the staff itself");
  }

  async setSpeed(): Promise<void> {
    throw new LighttoysError("Lighttoys staffs set their own speed");
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

export class LighttoysSerialAdapter {
  readonly protocolName = "Lighttoys USB";
  private readonly byPort = new Map<WebSerialPort, LighttoysSerialConnection>();

  isLighttoysPort(port: WebSerialPort): boolean {
    return portMatches(port, LIGHTTOYS_FILTER);
  }

  async grantedPorts(): Promise<WebSerialPort[]> {
    const serial = webSerial();
    if (!serial) return [];
    return (await serial.getPorts()).filter((p) => this.isLighttoysPort(p));
  }

  /** Fires when a granted staff is plugged in. */
  onPlugIn(listener: (port: WebSerialPort) => void): () => void {
    const serial = webSerial();
    if (!serial) return () => {};
    const handler = (event: Event) => {
      const port = (event.target ??
        (event as unknown as { port?: WebSerialPort }).port) as WebSerialPort;
      if (port && this.isLighttoysPort(port)) listener(port);
    };
    serial.addEventListener("connect", handler);
    return () => serial.removeEventListener("connect", handler);
  }

  async connectPort(port: WebSerialPort): Promise<LighttoysSerialConnection> {
    const existing = this.byPort.get(port);
    if (existing?.connected) return existing;
    const connection = new LighttoysSerialConnection(port);
    try {
      await connection.start();
    } catch (err) {
      connection.disconnect();
      throw err instanceof LighttoysError
        ? err
        : new LighttoysError(`Could not open the staff: ${String(err)}`);
    }
    this.byPort.set(port, connection);
    connection.onClose(() => this.byPort.delete(port));
    return connection;
  }
}
