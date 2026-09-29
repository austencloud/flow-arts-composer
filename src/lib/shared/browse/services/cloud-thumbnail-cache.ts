/**
 * Cloud Thumbnail Cache
 *
 * Manages thumbnail storage in Firebase Storage for crowd-sourced rendering.
 * When a user encounters a prop type for the first time, they render it locally
 * and upload to Firebase Storage so future users get instant loading.
 *
 * Storage structure:
 * thumbnails/{variant}/{propType}/{sequenceName}_{id}_r{renderer}_{mode}.webp
 * Example: thumbnails/gallery/club/Butterfly_public-1_r3_dark.webp
 *
 * This enables a "lazy generation" pattern where:
 * 1. First user to view a prop/sequence combo renders it locally
 * 2. Rendered image is uploaded to Firebase Storage
 * 3. All subsequent users get the pre-rendered image instantly
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailVariant } from "$lib/shared/browse/services/thumbnail-key-deriver";

export interface CloudThumbnailKey {
  sequenceName: string;
  /** Unique sequence ID - distinguishes variations with the same word */
  sequenceId?: string;
  propType: PropType;
  lightMode: boolean;
  /** Cache variant - defaults to 'gallery' for backwards compatibility */
  variant?: ThumbnailVariant;
  /** QR-baked variant. The short code is content-hash-deduped globally so the
   * QR image is identical for all signed-in users — cacheable, but stored at a
   * distinct `_qr` path so it never collides with the guest/no-QR card. */
  showQRCode?: boolean;
  /** Raster renderer revision; prevents corrected output from hitting stale files */
  rendererVersion: number;
}

export interface DeleteProgress {
  deleted: number;
  total: number;
  currentFile?: string;
}

export interface CloudLookupOptions {
  /** Probe Firebase for a key absent from the manifest and local knowledge.
   * Normal gallery rendering leaves this off so expected misses stay quiet. */
  probeUnknown?: boolean;
}

// In-memory cache with TTL to avoid stale URLs
// Firebase download URLs expire after ~1 hour, so we refresh after 30 minutes
const URL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Longer TTL for "known missing" entries - no need to re-check frequently
const MISSING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedUrl {
  url: string | null;
  timestamp: number;
}

const urlCache = new Map<string, CachedUrl>();
const pendingUploads = new Map<string, Promise<string | null>>();

// Manifest loading state
let manifestLoaded = false;
let manifestLoadPromise: Promise<number> | null = null;
const MANIFEST_PATH = "thumbnails/manifest.json";
const MANIFEST_CACHE_VERSION = 3;

// Firebase Storage bucket - single source of truth
const FIREBASE_STORAGE_BUCKET = "the-kinetic-alphabet.firebasestorage.app";

// Track thumbnails we've confirmed EXIST in cloud storage
// This inverts the usual pattern: we assume things DON'T exist (render locally)
// and only check cloud for things we KNOW exist (from previous uploads or checks)
// This prevents 404 spam because we never request things that don't exist
const KNOWN_EXISTS_KEY = "tka-cloud-thumbnails";
let knownExists: Set<string> | null = null;
let sessionConfirmedExists = new Set<string>();

function getKnownExists(): Set<string> {
  if (knownExists) return knownExists;
  try {
    const stored = localStorage.getItem(KNOWN_EXISTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        keys: string[];
        timestamp: number;
      };
      // Keep for 7 days (thumbnails don't get deleted often)
      if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        knownExists = new Set(parsed.keys);
        return knownExists;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  knownExists = new Set();
  return knownExists;
}

function addKnownExists(cacheKey: string): void {
  const exists = getKnownExists();
  exists.add(cacheKey);
  sessionConfirmedExists.add(cacheKey);
  clearKnownMissing(cacheKey);
  // Persist periodically (every 10 additions) to avoid excessive writes
  if (exists.size % 10 === 0) {
    persistKnownExists();
  }
}

function persistKnownExists(): void {
  try {
    const exists = getKnownExists();
    // Limit size to prevent localStorage bloat (keep most recent 2000)
    const keys = Array.from(exists).slice(-2000);
    localStorage.setItem(
      KNOWN_EXISTS_KEY,
      JSON.stringify({ keys, timestamp: Date.now() })
    );
  } catch {
    // Ignore localStorage errors
  }
}

// Track thumbnails we've confirmed DON'T exist (404 from the existence probe),
// so unknown keys are probed at most once per TTL per browser instead of on
// every visit. This is what lets getUrl() probe optimistically when the
// manifest hasn't caught up — the manifest becomes a warm-start optimization
// instead of a hard gate that rots whenever regeneration lags uploads.
const KNOWN_MISSING_KEY = "tka-cloud-thumbnails-missing";
let knownMissing: Map<string, number> | null = null;

function getKnownMissing(): Map<string, number> {
  if (knownMissing) return knownMissing;
  knownMissing = new Map();
  try {
    const stored = localStorage.getItem(KNOWN_MISSING_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { entries: [string, number][] };
      const now = Date.now();
      for (const [key, ts] of parsed.entries) {
        if (now - ts < MISSING_CACHE_TTL_MS) knownMissing.set(key, ts);
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return knownMissing;
}

function isKnownMissing(cacheKey: string): boolean {
  const missing = getKnownMissing();
  const ts = missing.get(cacheKey);
  if (ts === undefined) return false;
  if (Date.now() - ts >= MISSING_CACHE_TTL_MS) {
    missing.delete(cacheKey);
    return false;
  }
  return true;
}

function addKnownMissing(cacheKey: string): void {
  const missing = getKnownMissing();
  missing.set(cacheKey, Date.now());
  try {
    // Cap to the most recent 3000 entries to bound localStorage size
    const entries = Array.from(missing.entries()).slice(-3000);
    localStorage.setItem(KNOWN_MISSING_KEY, JSON.stringify({ entries }));
  } catch {
    // Ignore localStorage errors
  }
}

function clearKnownMissing(cacheKey: string): void {
  const missing = getKnownMissing();
  if (missing.delete(cacheKey)) {
    try {
      const entries = Array.from(missing.entries());
      localStorage.setItem(KNOWN_MISSING_KEY, JSON.stringify({ entries }));
    } catch {
      // Ignore localStorage errors
    }
  }
}

function markCacheKeyMissing(cacheKey: string): void {
  urlCache.delete(cacheKey);
  sessionConfirmedExists.delete(cacheKey);

  const exists = getKnownExists();
  if (exists.delete(cacheKey)) {
    persistKnownExists();
  }

  addKnownMissing(cacheKey);
}

/**
 * Record a confirmed 404 from an actual thumbnail download.
 *
 * The manifest and the browser's persisted positive set are snapshots, so a
 * deleted object can remain listed after it is gone. A real 404 outranks those
 * snapshots until the existing 24-hour missing-object TTL expires.
 */
export function markMissing(key: CloudThumbnailKey): void {
  markCacheKeyMissing(getCacheKey(key));
}

/**
 * Check if a cached entry is still valid (not expired)
 */
function isCacheValid(entry: CachedUrl): boolean {
  return Date.now() - entry.timestamp < URL_CACHE_TTL_MS;
}

// Concurrency control for cloud cache checks
// Prevents overwhelming Firebase with too many simultaneous requests
const MAX_CONCURRENT_CHECKS = 5;
let activeChecks = 0;

// Priority queue: lower number = higher priority (Y position from top of screen)
interface QueuedCheck {
  priority: number;
  resolve: () => void;
}
const checkQueue: QueuedCheck[] = [];

async function acquireCheckSlot(priority: number = Infinity): Promise<void> {
  if (activeChecks < MAX_CONCURRENT_CHECKS) {
    activeChecks++;
    return;
  }
  // Wait for a slot to become available
  return new Promise((resolve) => {
    checkQueue.push({
      priority,
      resolve: () => {
        activeChecks++;
        resolve();
      },
    });
    // Sort by priority (lower = higher priority = closer to top of screen)
    checkQueue.sort((a, b) => a.priority - b.priority);
  });
}

function releaseCheckSlot(): void {
  activeChecks--;
  // Take the highest priority item (first after sort)
  const next = checkQueue.shift();
  if (next) {
    next.resolve();
  }
}

/**
 * Get the storage path for a thumbnail
 * Includes variant in path to separate gallery (no user data) from wordcard (with user data)
 */
export function getStoragePath(key: CloudThumbnailKey): string {
  const variant = key.variant ?? "gallery";
  const modeSuffix = key.lightMode ? "_light" : "_dark";
  const idSuffix = key.sequenceId ? `_${key.sequenceId}` : "";
  const qrSuffix = key.showQRCode ? "_qr" : "";
  const rendererSuffix = `_r${key.rendererVersion}`;
  return `thumbnails/${variant}/${key.propType}/${key.sequenceName}${idSuffix}${qrSuffix}${rendererSuffix}${modeSuffix}.webp`;
}

/**
 * Get cache key for in-memory cache
 * Includes variant to keep gallery and wordcard thumbnails separate
 * Includes sequenceId so variations of the same word cache independently
 */
function getCacheKey(key: CloudThumbnailKey): string {
  const variant = key.variant ?? "gallery";
  const modeSuffix = key.lightMode ? "_light" : "_dark";
  const idSuffix = key.sequenceId ? `_${key.sequenceId}` : "";
  const qrSuffix = key.showQRCode ? "_qr" : "";
  const rendererSuffix = `_r${key.rendererVersion}`;
  return `${variant}/${key.propType}/${key.sequenceName}${idSuffix}${qrSuffix}${rendererSuffix}${modeSuffix}`;
}

/**
 * Get thumbnail URL from in-memory cache only (synchronous)
 * Returns undefined if not in cache, null if checked and known not to exist
 * Use this for instant cache hits without async overhead
 */
export function getCachedUrl(
  key: CloudThumbnailKey
): string | null | undefined {
  const cacheKey = getCacheKey(key);
  const cached = urlCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    return cached.url;
  }
  // Expired or not in cache
  if (cached) {
    urlCache.delete(cacheKey); // Clean up expired entry
  }
  return undefined; // Not in cache yet
}

/**
 * Get thumbnail URL from Firebase Storage
 * Returns null if thumbnail doesn't exist in cloud
 *
 * Keys in the "known exists" list (manifest + own uploads) resolve to a URL
 * with zero network cost. Unknown keys get ONE existence probe (a tiny
 * metadata GET), throttled by the priority queue; a 404 is remembered for
 * 24 hours so the probe never repeats per key. This keeps the crowd-sourced
 * cache alive even when the manifest lags behind uploads — without the probe,
 * a stale manifest silently kills the whole cloud tier (June 2026 incident).
 *
 * @param priority - Lower = higher priority (Y position). Visible thumbnails get served first.
 */
export async function getUrl(
  key: CloudThumbnailKey,
  priority: number = Infinity,
  options: CloudLookupOptions = {}
): Promise<string | null> {
  const cacheKey = getCacheKey(key);

  // Check in-memory cache first (no concurrency limit needed)
  const cached = urlCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    return cached.url;
  }
  // Clean up expired entry
  if (cached) {
    urlCache.delete(cacheKey);
  }

  const storagePath = getStoragePath(key);
  const encodedPath = encodeURIComponent(storagePath);
  const objectUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
  const publicUrl = `${objectUrl}?alt=media`;

  // A confirmed 404 outranks a stale manifest or persisted positive entry.
  if (isKnownMissing(cacheKey)) {
    return null;
  }

  // Fast path: manifest or a previous upload/probe confirmed this exists —
  // build the public URL directly, no request needed.
  if (getKnownExists().has(cacheKey)) {
    urlCache.set(cacheKey, { url: publicUrl, timestamp: Date.now() });
    return publicUrl;
  }

  // A cache writer can render and upload an unknown key directly. Probing it
  // first guarantees a browser-visible 404 for every genuine cold miss.
  if (options.probeUnknown === false) {
    return null;
  }

  // Acquire a slot before probing (respects the Y-position priority queue)
  await acquireCheckSlot(priority);

  try {
    // Double-check caches after acquiring slot (might have been populated
    // by another card's probe or an upload while waiting)
    const cachedAgain = urlCache.get(cacheKey);
    if (cachedAgain && isCacheValid(cachedAgain)) {
      return cachedAgain.url;
    }
    if (isKnownMissing(cacheKey)) {
      return null;
    }
    if (getKnownExists().has(cacheKey)) {
      urlCache.set(cacheKey, { url: publicUrl, timestamp: Date.now() });
      return publicUrl;
    }

    // Existence probe: the object METADATA endpoint (no ?alt=media) returns a
    // small JSON on 200 and a 404 if absent — far cheaper than fetching the image.
    const response = await fetch(objectUrl);
    if (response.ok) {
      addKnownExists(cacheKey);
      urlCache.set(cacheKey, { url: publicUrl, timestamp: Date.now() });
      return publicUrl;
    }

    // Only a real "not found" result belongs in the negative cache. Permission,
    // quota, and server failures remain retryable on the next request.
    if (response.status === 404) {
      markCacheKeyMissing(cacheKey);
    }
    return null;
  } catch {
    // Network/CORS error — don't poison the negative cache, just fall back
    // to local render this time.
    return null;
  } finally {
    // Always release the slot
    releaseCheckSlot();
  }
}

/**
 * Download thumbnail blob from Firebase Storage
 * Returns null if thumbnail doesn't exist
 */
export async function download(key: CloudThumbnailKey): Promise<Blob | null> {
  try {
    const url = await getUrl(key);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        markMissing(key);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.blob();
  } catch (error) {
    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Thumbnail didn't load",
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "warning",
        context: {
          module: "browse",
          action: "load-thumbnail",
        },
      });
    } catch {
      console.warn(
        `CloudThumbnailCache: Error downloading ${getCacheKey(key)}:`,
        error
      );
    }
    return null;
  }
}

/**
 * Check if thumbnail exists in Firebase Storage
 */
export async function exists(key: CloudThumbnailKey): Promise<boolean> {
  const url = await getUrl(key);
  return url !== null;
}

/**
 * Upload rendered thumbnail to Firebase Storage
 * Returns the public URL of the uploaded image, or null when the visitor is
 * signed out and therefore cannot write to the shared cache.
 * Handles race conditions gracefully (first upload wins)
 */
export async function upload(
  key: CloudThumbnailKey,
  blob: Blob
): Promise<string | null> {
  const cacheKey = getCacheKey(key);

  // Check if there's already a pending upload for this key
  const pendingUpload = pendingUploads.get(cacheKey);
  if (pendingUpload) {
    return pendingUpload;
  }

  // Gallery browsing is public, but the shared Storage path only accepts
  // authenticated writes. A signed-out visitor still paid for the render, so
  // mint an anonymous identity here rather than throw that work away. This is
  // the write site, and it owns the identity it needs regardless of which
  // surface (gallery, choreo card tab, offline warmer) triggered the render.
  // ensureGuestIdentity() is idempotent and swallows provider failures, so the
  // currentUser check below stays the real gate: without it every signed-out
  // cache miss would make a doomed upload request and fill the console with
  // 403s when the anonymous provider is disabled.
  //
  // Public pages that show cards import this module to read the shared
  // cache, which needs no Firebase. Loading sign-in here, on the first
  // upload, keeps Firebase off those pages' first download.
  const [{ ensureGuestIdentity }, { getAuthInstance }] = await Promise.all([
    import("$lib/shared/auth/services/guest-identity"),
    import("$lib/shared/auth/firebase"),
  ]);
  await ensureGuestIdentity("thumbnail_upload");
  const auth = await getAuthInstance();
  await auth.authStateReady();
  if (!auth.currentUser) {
    return null;
  }

  // Check if it already exists (race condition check)
  const existingUrl = await getUrl(key, Infinity, { probeUnknown: false });
  if (existingUrl) {
    return existingUrl;
  }

  // Create upload promise
  const uploadPromise = performUpload(key, blob);
  pendingUploads.set(cacheKey, uploadPromise);

  try {
    const url = await uploadPromise;
    urlCache.set(cacheKey, { url, timestamp: Date.now() });
    addKnownExists(cacheKey); // Register as existing - future getUrl() calls will fetch it
    clearKnownMissing(cacheKey); // A pre-upload probe may have 404'd this key
    return url;
  } finally {
    pendingUploads.delete(cacheKey);
  }
}

/**
 * Perform the actual upload to Firebase Storage
 */
async function performUpload(
  key: CloudThumbnailKey,
  blob: Blob
): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const { getStorageInstance } = await import("$lib/shared/auth/firebase");
  const storage = await getStorageInstance();
  const storagePath = getStoragePath(key);
  const storageRef = ref(storage, storagePath);

  // Upload with metadata
  await uploadBytes(storageRef, blob, {
    contentType: "image/webp",
    customMetadata: {
      sequenceName: key.sequenceName,
      propType: key.propType,
      lightMode: String(key.lightMode),
      variant: key.variant ?? "gallery",
      uploadedAt: new Date().toISOString(),
      source: "crowd-sourced",
    },
  });

  const url = await getDownloadURL(storageRef);
  return url;
}

/**
 * Clear the in-memory URL cache
 * @param includeKnownExists - Also clear the persistent "known exists" list
 *        (use this after bulk-deleting thumbnails from storage)
 */
export function clearMemoryCache(includeKnownExists: boolean = false): void {
  urlCache.clear();
  if (includeKnownExists) {
    knownExists = new Set();
    sessionConfirmedExists = new Set();
    knownMissing = new Map();
    try {
      localStorage.removeItem(KNOWN_EXISTS_KEY);
      localStorage.removeItem(KNOWN_MISSING_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Invalidate a specific cache entry
 * Call this when an image fails to load (e.g., 404) to allow retry
 */
export function invalidateUrl(key: CloudThumbnailKey): void {
  const cacheKey = getCacheKey(key);
  urlCache.delete(cacheKey);
}

/**
 * Load the thumbnail manifest from cloud storage
 * Pre-populates the "known exists" list for instant cache hits across all devices
 * Should be called once on app startup
 * Returns the number of thumbnails registered
 */
export async function loadManifest(): Promise<number> {
  // Already loaded
  if (manifestLoaded) {
    return getKnownExists().size;
  }

  // Already loading - wait for it
  if (manifestLoadPromise) {
    return manifestLoadPromise;
  }

  // Start loading
  manifestLoadPromise = doLoadManifest();
  return manifestLoadPromise;
}

async function doLoadManifest(): Promise<number> {
  try {
    // Build direct URL to manifest (public read)
    const encodedPath = encodeURIComponent(MANIFEST_PATH);
    const manifestUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media&v=${MANIFEST_CACHE_VERSION}`;

    const response = await fetch(manifestUrl);
    if (!response.ok) {
      // Manifest doesn't exist yet - that's OK, will be created on first upload
      manifestLoaded = true;
      return 0;
    }

    const manifest = (await response.json()) as {
      keys: string[];
      generated: string;
    };

    // The freshly generated manifest is authoritative for old persisted
    // positives. Keep only keys confirmed during this live session in addition
    // to the manifest, and let confirmed 404s override both.
    knownExists = new Set(
      [...manifest.keys, ...sessionConfirmedExists].filter(
        (key) => !isKnownMissing(key)
      )
    );
    persistKnownExists();
    manifestLoaded = true;

    return knownExists.size;
  } catch (error) {
    console.warn("[CloudThumbnailCache] Failed to load manifest:", error);
    manifestLoaded = true; // Don't retry continuously
    return getKnownExists().size;
  } finally {
    manifestLoadPromise = null;
  }
}

/**
 * Check if manifest has been loaded
 */
export function isManifestLoaded(): boolean {
  return manifestLoaded;
}

/**
 * Delete all thumbnails for a variant (admin only)
 * Lists all files in thumbnails/{variant}/ and deletes them
 * Returns the number of files deleted
 */
export async function deleteVariant(
  variant: ThumbnailVariant,
  onProgress?: (progress: DeleteProgress) => void
): Promise<number> {
  const { ref, listAll, deleteObject } = await import("firebase/storage");
  const { getStorageInstance } = await import("$lib/shared/auth/firebase");
  const storage = await getStorageInstance();

  // Get reference to the variant folder
  const variantRef = ref(storage, `thumbnails/${variant}`);

  let deletedCount = 0;

  try {
    // List all items recursively (Firebase listAll returns prefixes for folders)
    const result = await listAll(variantRef);

    // Collect all files to delete
    const allItems: { fullPath: string; ref: (typeof result.items)[0] }[] = [];

    // Add root items
    for (const item of result.items) {
      allItems.push({ fullPath: item.fullPath, ref: item });
    }

    // Add subfolder items
    for (const prefix of result.prefixes) {
      const subResult = await listAll(prefix);
      for (const item of subResult.items) {
        allItems.push({ fullPath: item.fullPath, ref: item });
      }
    }

    const total = allItems.length;

    // Report initial count
    onProgress?.({ deleted: 0, total });

    // Delete files in parallel batches for speed
    const BATCH_SIZE = 50;
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);

      // Delete batch in parallel
      const results = await Promise.allSettled(
        batch.map((item) => deleteObject(item.ref))
      );

      // Count successes - treat "object-not-found" as success (already deleted)
      results.forEach((result, j) => {
        if (result.status === "fulfilled") {
          deletedCount++;
        } else {
          // Check if this is a "not found" error - that's OK, file is already gone
          const reason = result.reason as { code?: string };
          if (reason?.code === "storage/object-not-found") {
            // Already deleted or never existed - count as success
            deletedCount++;
          } else {
            // Only log actual failures (permission errors, network issues, etc.)
            const item = batch[j];
            if (item) {
              console.warn(`Failed to delete ${item.fullPath}:`, result.reason);
            }
          }
        }
      });

      // Report progress after each batch
      onProgress?.({
        deleted: deletedCount,
        total,
      });
    }

    // Clear in-memory cache for this variant
    for (const key of urlCache.keys()) {
      if (key.startsWith(`${variant}/`)) {
        urlCache.delete(key);
      }
    }

    // Also clear "known exists" entries for deleted thumbnails
    const existsSet = getKnownExists();
    for (const key of existsSet) {
      if (key.startsWith(`${variant}/`)) {
        existsSet.delete(key);
      }
    }
    persistKnownExists();

    return deletedCount;
  } catch (error) {
    console.error(`CloudThumbnailCache: Error deleting ${variant}:`, error);
    throw error;
  }
}
