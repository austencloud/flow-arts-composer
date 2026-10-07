import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The origin route tests pretend the editor page has. */
export const ORIGIN = "http://localhost:5173";

export function tempFeatureRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "feature-videos-"));
}

export type RouteInit = RequestInit & {
  params?: Record<string, string>;
  /** The caller's address; this computer unless a test says otherwise. */
  client?: string;
  /** The Origin header; null sends none. */
  origin?: string | null;
};

/**
 * The parts of a SvelteKit request event the dev routes read. Pass it to a
 * handler as `routeEvent(...) as never`.
 */
export function routeEvent(pathname: string, init: RouteInit = {}) {
  const {
    params = {},
    client = "::1",
    origin = ORIGIN,
    headers,
    ...rest
  } = init;
  const merged = new Headers({ accept: "application/json" });
  if (origin) merged.set("origin", origin);
  if (rest.body !== undefined && rest.body !== null)
    merged.set("content-type", "application/json");
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  const request = new Request(new URL(pathname, ORIGIN), {
    ...rest,
    headers: merged,
  });
  return {
    request,
    url: new URL(request.url),
    params,
    getClientAddress: () => client,
  };
}

/** The HTTP status a handler failed with; fails the test when it succeeded. */
export async function thrownStatus(run: () => unknown): Promise<number> {
  try {
    await run();
  } catch (cause) {
    if (cause && typeof cause === "object" && "status" in cause)
      return Number((cause as { status: unknown }).status);
    throw cause;
  }
  throw new Error("Expected the handler to fail.");
}
