/**
 * Minimal RequestEvent doubles for handler-level audit tests.
 *
 * Only the members the audited handlers actually touch are provided; the cast
 * keeps the call sites honest about which handler contract is being exercised
 * without dragging SvelteKit's full runtime into a node test.
 */
import type { RequestEvent } from "@sveltejs/kit";

export interface FakeEventOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  params?: Record<string, string>;
  clientAddress?: string;
  platformEnv?: Record<string, unknown>;
}

export function fakeEvent(options: FakeEventOptions): RequestEvent {
  const url = new URL(options.url);
  const request = new Request(url, {
    method: options.method ?? "POST",
    headers: options.headers,
    body: options.body ?? undefined,
  });

  return {
    url,
    request,
    params: options.params ?? {},
    getClientAddress: () => options.clientAddress ?? "203.0.113.7",
    platform: options.platformEnv ? { env: options.platformEnv } : undefined,
  } as unknown as RequestEvent;
}

/** A 12-byte `ftyp`/`isom` prelude — the shape `isMP4()` in qr-video accepts. */
export function minimalMp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 16); // box size
  view.setUint32(4, 0x66747970); // "ftyp"
  view.setUint32(8, 0x69736f6d); // "isom"
  return bytes;
}

/** 64 lowercase hex characters, deterministic per index. */
export function hashForIndex(index: number): string {
  return index.toString(16).padStart(64, "0");
}
