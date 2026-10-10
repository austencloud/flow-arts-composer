/**
 * Pictograph Cloud Cache
 *
 * Per-cell sibling of cloud-thumbnail-cache. Stores one pre-rendered WebP per
 * unique pictograph (keyed by the canonical cloud-cell hash) in Firebase
 * Storage, so a cold scanner DOWNLOADS the image instead of rasterizing it.
 *
 * READ PATH IS DIRECT-PROBE (not manifest-gated). A scan card has only a handful
 * of cells, so we just attempt the deterministic public URL: a hit downloads, a
 * miss is reported to the scan card as an asset-integrity failure. QR creation
 * and the admin shortcode backfill are the writers; every later device reads the
 * deterministic object directly. This guarantees the asset exists before the
 * code can be generated. Scanner devices never need to initialize or run the
 * pictograph rasterizer. Writer paths use a quiet lookup: an unknown hash is
 * rendered and uploaded without first sending a request that is expected to
 * 404. Scanner reads retain direct probing because QR creation has already
 * guaranteed that those objects exist.
 *
 * Storage: pictograph-cells/{hash}.webp
 * (Reads require the Storage bucket's CORS to allow the app origin — same bucket
 * + CORS as cloud-thumbnail-cache; run `npm run storage:cors:apply` if a read is
 * CORS-blocked on localhost.)
 */

const FIREBASE_STORAGE_BUCKET = "the-kinetic-alphabet.firebasestorage.app";
const KNOWN_EXISTS_KEY = "tka-cloud-pictograph-cells";
const KNOWN_MISSING_KEY = "tka-cloud-pictograph-cells-missing";
const MISSING_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PERSISTED_HASHES = 3_000;

/** Successful public URLs, keyed by hash (pure fn of hash; session-lived). */
const urlCache = new Map<string, string>();
/** In-flight uploads, deduped by hash. */
const pendingUploads = new Map<string, Promise<string | null>>();
let knownExists: Set<string> | null = null;
let knownMissing: Map<string, number> | null = null;

export interface CellDownloadOptions {
  /** Send a request for a hash this browser has never seen before. Scanner
   * reads enable this; render-and-upload writers leave it disabled. */
  probeUnknown?: boolean;
  /** Cancel a verification fetch when its parent render is obsolete. */
  signal?: AbortSignal;
}

function getKnownExists(): Set<string> {
  if (knownExists) return knownExists;
  knownExists = new Set();
  try {
    const stored = localStorage.getItem(KNOWN_EXISTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { hashes?: string[] };
      knownExists = new Set(parsed.hashes ?? []);
    }
  } catch {
    // Storage access is optional. The in-memory cache still works.
  }
  return knownExists;
}

function getKnownMissing(): Map<string, number> {
  if (knownMissing) return knownMissing;
  knownMissing = new Map();
  try {
    const stored = localStorage.getItem(KNOWN_MISSING_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { entries?: [string, number][] };
      const now = Date.now();
      for (const [hash, timestamp] of parsed.entries ?? []) {
        if (now - timestamp < MISSING_TTL_MS) {
          knownMissing.set(hash, timestamp);
        }
      }
    }
  } catch {
    // Storage access is optional. The in-memory cache still works.
  }
  return knownMissing;
}

function persistKnownExists(): void {
  try {
    const hashes = Array.from(getKnownExists()).slice(-MAX_PERSISTED_HASHES);
    localStorage.setItem(KNOWN_EXISTS_KEY, JSON.stringify({ hashes }));
  } catch {
    // A cache write must never block rendering.
  }
}

function persistKnownMissing(): void {
  try {
    const entries = Array.from(getKnownMissing().entries()).slice(
      -MAX_PERSISTED_HASHES
    );
    localStorage.setItem(KNOWN_MISSING_KEY, JSON.stringify({ entries }));
  } catch {
    // A cache write must never block rendering.
  }
}

function registerExists(hash: string): void {
  const exists = getKnownExists();
  const missing = getKnownMissing();
  const isNew = !exists.has(hash);
  const clearedMissing = missing.delete(hash);
  exists.add(hash);
  if (isNew) persistKnownExists();
  if (clearedMissing) persistKnownMissing();
}

function isKnownMissing(hash: string): boolean {
  const missingAt = getKnownMissing().get(hash);
  if (missingAt === undefined) return false;
  if (Date.now() - missingAt < MISSING_TTL_MS) return true;
  getKnownMissing().delete(hash);
  persistKnownMissing();
  return false;
}

function registerMissing(hash: string): void {
  getKnownMissing().set(hash, Date.now());
  getKnownExists().delete(hash);
  persistKnownMissing();
  persistKnownExists();
}

/**
 * Whether this browser has positive proof that the canonical object exists.
 * Upload success and successful downloads both register that proof, so writer
 * paths can verify readiness without transferring the image bytes again.
 */
export function isCellKnownAvailable(hash: string): boolean {
  return getKnownExists().has(hash) && !isKnownMissing(hash);
}

/** The deterministic public URL where this hash's image would live. */
export function cellPublicUrl(hash: string): string {
  const encoded = encodeURIComponent(`pictograph-cells/${hash}.webp`);
  return `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encoded}?alt=media`;
}

/**
 * Download the pre-rendered WebP for this hash, or null if it doesn't exist yet
 * (or the network failed). Confirmed misses are cached for 24 hours. Never throws.
 */
export async function download(
  hash: string,
  options: CellDownloadOptions = {}
): Promise<Blob | null> {
  if (isKnownMissing(hash)) return null;
  if (options.probeUnknown === false && !getKnownExists().has(hash)) {
    return null;
  }
  try {
    const res = await fetch(cellPublicUrl(hash), { signal: options.signal });
    if (!res.ok) {
      if (res.status === 404) registerMissing(hash);
      return null;
    }
    urlCache.set(hash, cellPublicUrl(hash));
    registerExists(hash);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Upload a freshly-rendered WebP for this hash so later scanners download it.
 * First-write-wins, deduped per session. Never throws — returns the URL on
 * success, null on failure.
 */
export async function upload(hash: string, blob: Blob): Promise<string | null> {
  const pending = pendingUploads.get(hash);
  if (pending) return pending;

  const p = (async (): Promise<string | null> => {
    try {
      const { ref, uploadBytes, getDownloadURL } =
        await import("firebase/storage");
      const { getAuthInstance, getStorageInstance } =
        await import("#lib/shared/auth/firebase.js");
      // The reactive app state can know about the restored user a moment before
      // Firebase Storage has installed that user's token. Use the SDK's own
      // readiness boundary so a valid signed-in QR warm is not sent as an
      // unauthenticated write and reported as 0/N ready.
      const auth = await getAuthInstance();
      await auth.authStateReady();
      if (!auth.currentUser) return null;
      const storage = await getStorageInstance();
      const storageRef = ref(storage, `pictograph-cells/${hash}.webp`);
      await uploadBytes(storageRef, blob, {
        contentType: "image/webp",
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          source: "crowd-sourced",
        },
      });
      const url = await getDownloadURL(storageRef);
      urlCache.set(hash, url);
      registerExists(hash);
      return url;
    } catch {
      return null;
    }
  })();

  pendingUploads.set(hash, p);
  try {
    return await p;
  } finally {
    pendingUploads.delete(hash);
  }
}

/** Test-only reset of module state. */
export function _resetForTest(): void {
  urlCache.clear();
  pendingUploads.clear();
  knownExists = null;
  knownMissing = null;
  try {
    localStorage.removeItem(KNOWN_EXISTS_KEY);
    localStorage.removeItem(KNOWN_MISSING_KEY);
  } catch {
    // Tests without DOM storage only need the module state reset.
  }
}
