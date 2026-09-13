/**
 * Installs the offline asset bundle into the running desktop app.
 *
 * One rewrite seam covers every 3D loader: three.js `DefaultLoadingManager`
 * resolves URLs for every `GLTFLoader`, `TextureLoader`, `FBXLoader`,
 * `DRACOLoader` and `KTX2Loader` constructed without an explicit manager —
 * which is all of Threlte's `useGltf`/`useTexture`/`useDraco`/`useKtx2`, the
 * scene-3d package's character and animation loaders, and the product's own
 * loaders. A `fetch` wrapper covers the scene package's HEAD availability
 * probes and JSON sidecars, which never touch a loading manager. `<img>`
 * consumers call `resolveDesktopAssetUrl` directly.
 *
 * Must run before any 3D surface mounts; `+layout.svelte` awaits it during
 * boot. The manifest read is a local file fetch through the custom scheme and
 * costs single-digit milliseconds.
 */

import {
  DESKTOP_ASSET_SCHEME,
  createDesktopAssetResolver,
  createDesktopFetch,
} from "./desktop-asset-url";
import { isDesktop } from "./is-desktop";

interface DesktopAssetManifest {
  generatedAt: string;
  fileCount: number;
  totalBytes: number;
  files: Array<{ path: string; bytes: number }>;
}

/**
 * Upper bound on the WHOLE install, not on any one step inside it.
 * `+layout.svelte` awaits the install during boot, and every later boot step —
 * `DesktopInitializer` included, which is what navigates the shell off the
 * marketing landing — queues behind it. Bounding only the manifest `fetch`
 * would not be enough: `fetch` settles when the response HEADERS arrive, so a
 * handler that answers headers promptly and then stalls the body would leave
 * `response.json()` pending forever past a cleared deadline. The dynamic
 * imports are inside the bound for the same reason.
 * Matches the updater's own "offline must not hold the boot hostage" budget.
 */
const INSTALL_TIMEOUT_MS = 5_000;

let resolver: ((url: string) => string) | null = null;
let installing: Promise<boolean> | null = null;
let bundledPaths: ReadonlySet<string> = new Set();
let nativeFetch: typeof fetch | null = null;

/** Rewrite a runtime asset URL onto the local bundle; identity off desktop. */
export function resolveDesktopAssetUrl(url: string): string {
  return resolver ? resolver(url) : url;
}

export function isDesktopAssetBundled(bundlePath: string): boolean {
  return bundledPaths.has(bundlePath);
}

export function desktopAssetBundleSize(): number {
  return bundledPaths.size;
}

/**
 * Read the bundle manifest and hook the resolver into three.js. Resolves
 * `true` when the bundle is live and `false` otherwise — on the web, when the
 * desktop build carries no bundle, and when the bundle cannot be read.
 *
 * Never rejects, and the RETURNED PROMISE always settles within
 * `INSTALL_TIMEOUT_MS`, because desktop boot awaits it. That bound is on the
 * promise, not on the underlying work: a stalled read may still be pending in
 * the background afterwards (aborted, best-effort), and if it completes late it
 * is discarded rather than installed. A `false` therefore means "not installed
 * and never will be for this call", which is what the boot path needs.
 *
 * Safe to call more than once; the outcome is cached.
 */
export function installDesktopAssetRuntime(): Promise<boolean> {
  if (!isDesktop()) return Promise.resolve(false);
  return (installing ??= install());
}

/**
 * Never rejects, and always settles within `INSTALL_TIMEOUT_MS`. Loading assets
 * from the network is the documented fallback for a build with no bundle, and
 * it is equally correct for a bundle that cannot be read — but a rejection here
 * is cached in `installing` forever and propagates into the boot path that
 * awaits it, so failure has to come back as `false`.
 *
 * The deadline covers the whole attempt. `attempt` can still be running in the
 * background after the race settles, which is why `installBundle` re-checks the
 * signal before it touches any module state: a bundle that arrives after boot
 * gave up must not swap the resolver under surfaces that already mounted
 * against network URLs.
 */
async function install(): Promise<boolean> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), INSTALL_TIMEOUT_MS);

  const attempt = installBundle(deadline.signal).catch((err: unknown) => {
    // An abort is the deadline doing its job; `expired` reports that itself.
    if (!deadline.signal.aborted) {
      console.warn(
        "[Desktop] Offline asset bundle unavailable; assets load from the network.",
        err
      );
    }
    return false;
  });

  const expired = new Promise<boolean>((resolve) => {
    deadline.signal.addEventListener(
      "abort",
      () => {
        console.warn(
          `[Desktop] Offline asset bundle did not install within ${INSTALL_TIMEOUT_MS}ms; assets load from the network.`
        );
        resolve(false);
      },
      { once: true }
    );
  });

  try {
    return await Promise.race([attempt, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function installBundle(signal: AbortSignal): Promise<boolean> {
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  // `convertFileSrc` owns the per-platform origin shape:
  // `https://tka-assets.localhost/` on Windows, `tka-assets://localhost/` on macOS.
  const origin = convertFileSrc("", DESKTOP_ASSET_SCHEME).replace(/\/+$/, "");

  // The signal cancels the in-flight read — headers AND body, per the fetch
  // spec — so a stalled handler does not hold a connection for the session.
  // `install`'s race is what guarantees the bound regardless of whether the
  // runtime honours that.
  const response = await fetch(`${origin}/manifest.json`, { signal });
  if (!response.ok) {
    console.warn(
      `[Desktop] Asset bundle manifest unavailable (HTTP ${response.status}); assets load from the network.`
    );
    return false;
  }
  const manifest = (await response.json()) as DesktopAssetManifest;
  if (!Array.isArray(manifest?.files)) {
    console.warn(
      "[Desktop] Asset bundle manifest is malformed; assets load from the network."
    );
    return false;
  }

  // Imported BEFORE the first module-state write, so the block below is one
  // synchronous step. Nothing may observe a `resolver` that three.js has not
  // been told about, or a populated `bundledPaths` with no resolver.
  const { DefaultLoadingManager } = await import("three");

  // Last gate before any side effect. Everything above is a read; everything
  // below is visible to the whole app, and the boot that asked for it may have
  // moved on without it.
  if (signal.aborted) return false;

  bundledPaths = new Set(manifest.files.map((file) => file.path));
  resolver = createDesktopAssetResolver({
    origin,
    has: (bundlePath) => bundledPaths.has(bundlePath),
    pageOrigin: location.origin,
  });
  DefaultLoadingManager.setURLModifier(resolver);
  if (!nativeFetch) {
    nativeFetch = window.fetch.bind(window);
    window.fetch = createDesktopFetch(resolver, nativeFetch);
  }

  // Counted from the files actually indexed, not from the manifest's own
  // summary fields: a boot log must never be the thing that throws.
  const bytes = manifest.files.reduce(
    (total, file) => total + (Number(file?.bytes) || 0),
    0
  );
  console.log(
    `[Desktop] Offline asset bundle live: ${bundledPaths.size} files, ` +
      `${(bytes / (1024 * 1024)).toFixed(0)} MB, served from ${origin}`
  );
  return true;
}

export function _resetDesktopAssetRuntimeForTests(): void {
  if (nativeFetch) window.fetch = nativeFetch;
  nativeFetch = null;
  resolver = null;
  installing = null;
  bundledPaths = new Set();
}
