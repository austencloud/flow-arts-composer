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
 * Upper bound on the manifest read. `+layout.svelte` awaits the install during
 * boot, and every later boot step — `DesktopInitializer` included, which is
 * what navigates the shell off the marketing landing — queues behind it. A
 * scheme handler that never answers must cost the boot this much and no more.
 * Matches the updater's own "offline must not hold the boot hostage" budget.
 */
const MANIFEST_TIMEOUT_MS = 5_000;

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
 * desktop build carries no bundle, and when the bundle cannot be read. Never
 * rejects and always settles within `MANIFEST_TIMEOUT_MS`, because desktop
 * boot awaits it. Safe to call more than once; the outcome is cached.
 */
export function installDesktopAssetRuntime(): Promise<boolean> {
  if (!isDesktop()) return Promise.resolve(false);
  return (installing ??= install());
}

/**
 * Never rejects. Loading assets from the network is the documented fallback
 * for a build with no bundle, and it is equally correct for a bundle that
 * cannot be read — but a rejection here is cached in `installing` forever and
 * propagates into the boot path that awaits it, so failure has to come back as
 * `false`.
 */
async function install(): Promise<boolean> {
  try {
    return await installBundle();
  } catch (err) {
    console.warn(
      "[Desktop] Offline asset bundle unavailable; assets load from the network.",
      err
    );
    return false;
  }
}

/**
 * Read the manifest under a hard time bound. `fetch` alone has none: a custom
 * scheme handler that accepts the request and never answers would stall the
 * whole desktop boot. The abort cancels the in-flight read; the race is what
 * guarantees the bound regardless.
 */
async function readManifest(url: string): Promise<Response | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, MANIFEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }),
      expired,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function installBundle(): Promise<boolean> {
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  // `convertFileSrc` owns the per-platform origin shape:
  // `https://tka-assets.localhost/` on Windows, `tka-assets://localhost/` on macOS.
  const origin = convertFileSrc("", DESKTOP_ASSET_SCHEME).replace(/\/+$/, "");

  const response = await readManifest(`${origin}/manifest.json`);
  if (!response) {
    console.warn(
      `[Desktop] Asset bundle manifest did not answer within ${MANIFEST_TIMEOUT_MS}ms; assets load from the network.`
    );
    return false;
  }
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
  bundledPaths = new Set(manifest.files.map((file) => file.path));

  resolver = createDesktopAssetResolver({
    origin,
    has: (bundlePath) => bundledPaths.has(bundlePath),
    pageOrigin: location.origin,
  });

  const { DefaultLoadingManager } = await import("three");
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
