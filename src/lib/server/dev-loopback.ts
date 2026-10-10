import { dev } from "$app/env";
import { error } from "@sveltejs/kit";

/**
 * Guards for dev routes that read and write files on this computer. They
 * answer only on a dev server, only to this computer, and only to the page's
 * own origin, so another site open in the same browser cannot reach them.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LOCAL_CLIENTS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
/** The largest JSON body a dev route reads. */
export const DEV_JSON_LIMIT_BYTES = 12_000_000;

export function authorizeLoopback(
  request: Request,
  getClientAddress: () => string
): void {
  if (!dev) error(404, "Not found");
  const url = new URL(request.url);
  if (!LOCAL_HOSTS.includes(url.hostname)) error(403, "Local editor only");
  if (!LOCAL_CLIENTS.includes(getClientAddress()))
    error(403, "Local editor only");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) error(403, "Forbidden origin");
  const reading = request.method === "GET" || request.method === "HEAD";
  if (!reading && origin !== url.origin) error(403, "Origin required");
}

/** Reads a JSON object body, refusing one longer than `maxBytes`. */
export async function readJsonBody(
  request: Request,
  maxBytes = DEV_JSON_LIMIT_BYTES
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    error(413, "Manifest too large");
  const reader = request.body?.getReader();
  if (!reader) error(400, "Missing request body");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel();
        error(413, "Manifest too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    error(400, "Invalid JSON");
  }
}
