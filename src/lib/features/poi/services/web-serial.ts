/** Minimal Web Serial types and access (Chrome and Edge on a computer). */

export interface WebSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface WebSerial extends EventTarget {
  getPorts(): Promise<WebSerialPort[]>;
  requestPort(options?: {
    filters?: SerialPortFilter[];
  }): Promise<WebSerialPort>;
}

export function webSerial(): WebSerial | null {
  return typeof navigator !== "undefined" && "serial" in navigator
    ? (navigator as unknown as { serial: WebSerial }).serial
    : null;
}

export function isWebSerialSupported(): boolean {
  return webSerial() !== null;
}

export function portMatches(
  port: WebSerialPort,
  filter: SerialPortFilter
): boolean {
  const info = port.getInfo?.() ?? {};
  return (
    (filter.usbVendorId === undefined ||
      info.usbVendorId === filter.usbVendorId) &&
    (filter.usbProductId === undefined ||
      info.usbProductId === filter.usbProductId)
  );
}
