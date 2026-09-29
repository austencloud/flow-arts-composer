/**
 * Test harness for static/sw.js — a classic (non-module) service worker script
 * with no exports. The real file is read from disk and evaluated inside a
 * controlled scope via `new Function`, with every global the script touches
 * injected: `self`, `caches`, `fetch`, `location`, `importScripts`, `clients`,
 * and `Request` (injected because undici's Request rejects the relative URLs a
 * real SW resolves against its own scope). Response/URL/AbortController/
 * setTimeout resolve from the Node/jsdom globals, which means vi.useFakeTimers()
 * reaches the SW's timeout code unmodified.
 *
 * No maintained SW-testing library exists (service-worker-mock is abandoned;
 * MSW mocks networks for apps, not SW internals) — hence this minimal fake of
 * the CacheStorage + fetch surface the worker actually uses.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

// Locate static/sw.js from the repo root (cwd when vitest runs; walk up as a
// safety net in case a runner changes cwd).
function resolveSwPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "static", "sw.js");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`sw-harness: could not locate static/sw.js walking up from ${process.cwd()}`);
}

// ---------------------------------------------------------------------------
// Route table for the controllable fetch mock
// ---------------------------------------------------------------------------
export type RouteHandler = (ctx: {
  url: string;
  request: Request | null;
}) => Response | Promise<Response> | Error;

export interface RespondWithOptions {
  status?: number;
  contentType?: string;
}

/**
 * Builds a route handler that mints a FRESH Response per fetch (Response
 * bodies are one-shot; sharing one instance across fetches would poison the
 * second read). Objects are JSON-stringified with an application/json type.
 */
export function respondWith(
  body: string | object,
  opts: RespondWithOptions = {}
): RouteHandler {
  const isObject = typeof body !== "string";
  const text = isObject ? JSON.stringify(body) : body;
  const status = opts.status ?? 200;
  const contentType = opts.contentType ?? (isObject ? "application/json" : "text/plain");
  return () => new Response(text, { status, headers: { "content-type": contentType } });
}

// ---------------------------------------------------------------------------
// Fake Cache / CacheStorage
//
// Entries are stored as bytes + metadata (not live Response objects) so that
// every match() mints a fresh Response — mirroring the real Cache API, which
// returns a new copy per call. sw.js's precacheBootChunks depends on exactly
// this ("cache.match returns a fresh Response copy each call") when it reads
// the /app shell back out and consumes its body.
// ---------------------------------------------------------------------------
interface StoredEntry {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
}

type Normalizer = (input: Request | URL | string) => string;
type FetchLike = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

class FakeCache {
  private store = new Map<string, StoredEntry>();

  constructor(
    private normalize: Normalizer,
    private fetchImpl: FetchLike
  ) {}

  async match(request: Request | URL | string): Promise<Response | undefined> {
    const entry = this.store.get(this.normalize(request));
    if (!entry) return undefined;
    return new Response(entry.body.slice(0), {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
  }

  async put(request: Request | URL | string, response: Response): Promise<void> {
    const body = await response.arrayBuffer();
    this.store.set(this.normalize(request), {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
  }

  async add(request: Request | URL | string): Promise<void> {
    await this.addAll([request]);
  }

  /**
   * Spec behavior: addAll rejects if ANY response is not ok. The SW's install
   * tolerance for missing manifests/assets lives in its OWN try/catch +
   * Promise.allSettled — the /app shell addAll has no tolerance, by design.
   */
  async addAll(requests: Array<Request | URL | string>): Promise<void> {
    await Promise.all(
      requests.map(async (req) => {
        const res = await this.fetchImpl(req);
        if (!res.ok) {
          throw new TypeError(
            `Cache.addAll: request for ${this.normalize(req)} returned ${res.status}`
          );
        }
        await this.put(req, res);
      })
    );
  }

  async delete(request: Request | URL | string): Promise<boolean> {
    return this.store.delete(this.normalize(request));
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

class FakeCacheStorage {
  private map = new Map<string, FakeCache>();

  constructor(
    private normalize: Normalizer,
    private fetchImpl: FetchLike
  ) {}

  async open(name: string): Promise<FakeCache> {
    let cache = this.map.get(name);
    if (!cache) {
      cache = new FakeCache(this.normalize, this.fetchImpl);
      this.map.set(name, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.map.delete(name);
  }

  async has(name: string): Promise<boolean> {
    return this.map.has(name);
  }

  /** caches.match searches every cache, first hit wins (spec semantics). */
  async match(request: Request | URL | string): Promise<Response | undefined> {
    for (const cache of this.map.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Test-only synchronous peek — does not create the cache. */
  peek(name: string): FakeCache | undefined {
    return this.map.get(name);
  }

  /** Test-only synchronous name list. */
  names(): string[] {
    return [...this.map.keys()];
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
export interface SwHarnessOptions {
  /** SW script URL — determines the scope origin. Default: production. */
  location?: string;
}

export interface DispatchFetchOptions {
  mode?: RequestMode | "navigate";
  method?: string;
}

export function createSwHarness(options: SwHarnessOptions = {}) {
  const location = new URL(options.location ?? "https://tkaflowarts.com/sw.js");
  const origin = location.origin;

  const normalize: Normalizer = (input) => {
    if (typeof input === "string") return new URL(input, origin).toString();
    if (input instanceof URL) return input.toString();
    return input.url;
  };

  // --- controllable fetch mock: routed responses, default = offline reject ---
  const routes = new Map<string | RegExp, RouteHandler>();

  function findRoute(url: string): RouteHandler | undefined {
    const pathname = new URL(url).pathname;
    for (const [key, handler] of routes) {
      if (typeof key === "string") {
        if (key === url || key === pathname || new URL(key, origin).toString() === url) {
          return handler;
        }
      } else {
        key.lastIndex = 0; // defend against stateful /g regexps
        if (key.test(url) || key.test(pathname)) return handler;
      }
    }
    return undefined;
  }

  const fetchImpl: FetchLike = (input, init) => {
    const url = normalize(input);
    const result = (async () => {
      const handler = findRoute(url);
      if (!handler) throw new TypeError(`sw-harness fetch: offline (no route for ${url})`);
      const out = await handler({ url, request: input instanceof Request ? input : null });
      if (out instanceof Error) throw out;
      return out;
    })();

    // Honor AbortSignal so the SW's fetchWithTimeout (AbortController +
    // setTimeout) works under vi.useFakeTimers: a never-settling route still
    // rejects with AbortError the moment the timeout timer aborts.
    const signal = init?.signal;
    if (!signal) return result;
    return new Promise<Response>((resolve, reject) => {
      const abort = () =>
        reject(new DOMException("The operation was aborted.", "AbortError"));
      if (signal.aborted) {
        result.catch(() => {}); // keep the orphaned route promise handled
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      result.then(resolve, reject);
    });
  };

  const cacheStorage = new FakeCacheStorage(normalize, fetchImpl);

  // --- the `self` global the worker sees ---
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const clients = { claim: vi.fn() };
  const self = {
    addEventListener(type: string, fn: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    skipWaiting: vi.fn(),
    clients,
    location,
  };

  // A classic SW resolves relative request URLs against its own scope; Node's
  // undici Request throws on them. Same interface, scope-aware resolution.
  class ScopedRequest extends Request {
    constructor(input: Request | URL | string, init?: RequestInit) {
      super(
        typeof input === "string" ? new URL(input, origin).toString() : input,
        init
      );
    }
  }

  // --- evaluate the real worker script inside the controlled scope ---
  const code = readFileSync(resolveSwPath(), "utf8");
  // Records what the worker loads (firebase-messaging-handler.js) without
  // evaluating it; that file has its own suite (tests/unit/push/sw-push-handler.test.ts).
  const importScripts = vi.fn();
  const run = new Function(
    "self",
    "caches",
    "fetch",
    "location",
    "importScripts",
    "clients",
    "Request",
    code
  ) as (...args: unknown[]) => void;
  run(self, cacheStorage, fetchImpl, location, importScripts, clients, ScopedRequest);

  // Cache names parsed from the source so tests self-sync with version bumps.
  const constants = {
    cacheName: /const CACHE_NAME = "([^"]+)"/.exec(code)?.[1] ?? "tka-v3",
    assets3dCacheName:
      /const ASSETS_3D_CACHE = "([^"]+)"/.exec(code)?.[1] ?? "tka-3d-assets-v1",
  };

  // --- event drivers ---
  async function dispatchLifecycle(type: "install" | "activate"): Promise<void> {
    const waited: Array<Promise<unknown>> = [];
    const event = {
      waitUntil(p: unknown) {
        waited.push(Promise.resolve(p));
      },
    };
    for (const fn of listeners.get(type) ?? []) fn(event);
    await Promise.all(waited);
  }

  function makeRequest(url: string, opts: DispatchFetchOptions = {}): Request {
    const request = new Request(new URL(url, origin).toString(), {
      method: opts.method ?? "GET",
    });
    // RequestInit forbids mode "navigate"; real navigations carry it, so
    // shadow the prototype getter with an own property.
    if (opts.mode) {
      Object.defineProperty(request, "mode", { value: opts.mode, configurable: true });
    }
    return request;
  }

  /**
   * Fires the fetch listener. Resolves with the respondWith'd Response, or
   * null when the handler returned without responding (passthrough).
   */
  function dispatchFetch(
    input: string | Request,
    opts: DispatchFetchOptions = {}
  ): Promise<Response | null> {
    const request = typeof input === "string" ? makeRequest(input, opts) : input;
    let responsePromise: Promise<Response> | null = null;
    const event = {
      request,
      respondWith(p: Response | Promise<Response>) {
        responsePromise = Promise.resolve(p);
      },
      waitUntil() {
        /* sw.js never calls it in the fetch handler; accept and ignore */
      },
    };
    for (const fn of listeners.get("fetch") ?? []) fn(event);
    return responsePromise ?? Promise.resolve(null);
  }

  /** Fires the SW's `message` listeners with a { data } event (postMessage). */
  function dispatchMessage(data: unknown): void {
    const event = { data };
    for (const fn of listeners.get("message") ?? []) fn(event);
  }

  // --- test conveniences ---
  function route(matcher: string | RegExp, handler: RouteHandler): void {
    routes.set(matcher, handler);
  }

  async function seedCache(
    cacheName: string,
    url: string,
    body: string,
    init?: ResponseInit
  ): Promise<void> {
    const cache = await cacheStorage.open(cacheName);
    await cache.put(url, new Response(body, init));
  }

  async function cacheHas(cacheName: string, url: string): Promise<boolean> {
    const cache = cacheStorage.peek(cacheName);
    if (!cache) return false;
    return (await cache.match(url)) !== undefined;
  }

  async function cacheBody(cacheName: string, url: string): Promise<string | null> {
    const cache = cacheStorage.peek(cacheName);
    const hit = cache ? await cache.match(url) : undefined;
    return hit ? await hit.text() : null;
  }

  function cacheNames(): string[] {
    return cacheStorage.names();
  }

  return {
    self,
    importScripts,
    caches: cacheStorage,
    constants,
    route,
    routes,
    dispatchInstall: () => dispatchLifecycle("install"),
    dispatchActivate: () => dispatchLifecycle("activate"),
    dispatchFetch,
    dispatchMessage,
    makeRequest,
    seedCache,
    cacheHas,
    cacheBody,
    cacheNames,
  };
}

export type SwHarness = ReturnType<typeof createSwHarness>;
