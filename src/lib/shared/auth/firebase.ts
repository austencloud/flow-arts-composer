/**
 * Firebase Configuration and Initialization
 *
 * Zero-Downtime HMR Support via App Instance Rotation
 *
 * The Firebase SDK caches instances internally. After calling terminate(),
 * getFirestore(app) still returns the terminated (corrupt) instance.
 * This module solves that by creating a new Firebase App on each HMR cycle.
 *
 * Key Features:
 * - App instance rotation (new app name each HMR cycle)
 * - Auth state preservation across HMR
 * - Automatic listener resubscription
 * - Presence handler re-establishment
 * - Lazy loading for Firestore, Database, Storage, Analytics
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  setPersistence,
} from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Database } from "firebase/database";
import type { FirebaseStorage } from "firebase/storage";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { resolveAuthDomain } from "./auth-domain";
import {
  getFirebaseHMRManager,
  type FirebaseHMRManager,
} from "./firebase-hmr-manager";
import { getInAppBrowserDetector } from "./get-in-app-browser-detector";
import { registerLoadedAuth } from "./loaded-auth";
import { shouldAvoidIndexedDbPersistence } from "./services/indexeddb-persistence-policy";
import type { Functions } from "firebase/functions";
import type { Unsubscribe } from "firebase/firestore";
import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { resolveFirebaseEmulatorConfig } from "./firebase-emulator-config";

const debug = createComponentLogger("Firebase");

type FirebaseEmulatorProduct =
  | "auth"
  | "firestore"
  | "database"
  | "storage"
  | "functions";

interface FirebaseEmulatorConnectionState {
  projectId: string;
  products: Set<string>;
}

const firebaseEmulatorConfig = resolveFirebaseEmulatorConfig({
  dev: import.meta.env.DEV,
  browserUrl: browser ? window.location.href : undefined,
  enabledValue: env.PUBLIC_USE_FIREBASE_EMULATORS,
  projectIdValue: env.PUBLIC_FIREBASE_EMULATOR_PROJECT_ID,
});

const firebaseEmulatorGlobal = globalThis as typeof globalThis & {
  __TKA_FIREBASE_EMULATOR_CONNECTIONS__?: FirebaseEmulatorConnectionState;
};

function connectFirebaseProductToEmulator(
  product: FirebaseEmulatorProduct,
  connect: () => void
): void {
  if (!browser || !firebaseEmulatorConfig.enabled) return;

  const state =
    (firebaseEmulatorGlobal.__TKA_FIREBASE_EMULATOR_CONNECTIONS__ ??= {
      projectId: firebaseEmulatorConfig.projectId,
      products: new Set<string>(),
    });

  if (state.projectId !== firebaseEmulatorConfig.projectId) {
    throw new Error(
      "Firebase emulator project changed without a full page reload."
    );
  }

  const connectionKey = `${app.name}:${product}`;
  if (state.products.has(connectionKey)) return;

  connect();
  state.products.add(connectionKey);
  debug.info(
    `${product} connected to ${firebaseEmulatorConfig.projectId} emulator`
  );
}

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================

/**
 * Firebase configuration object
 * Uses hardcoded values for reliable deployment across environments.
 * authDomain is resolved per environment — see resolveAuthDomain (auth-domain.ts).
 */
const firebaseConfig = firebaseEmulatorConfig.enabled
  ? {
      apiKey: "demo-api-key",
      authDomain: "localhost",
      databaseURL: `https://${firebaseEmulatorConfig.projectId}-default-rtdb.firebaseio.com`,
      projectId: firebaseEmulatorConfig.projectId,
      storageBucket: `${firebaseEmulatorConfig.projectId}.appspot.com`,
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:0000000000000000000000",
    }
  : {
      apiKey: "AIzaSyDKUM9pf0e_KgFjW1OBKChvrU75SnR12v4",
      authDomain: resolveAuthDomain(),
      databaseURL: "https://the-kinetic-alphabet-default-rtdb.firebaseio.com",
      projectId: "the-kinetic-alphabet",
      storageBucket: "the-kinetic-alphabet.firebasestorage.app",
      messagingSenderId: "664225703033",
      appId: "1:664225703033:web:62e6c1eebe4fff3ef760a8",
      measurementId: "G-CQH94GGM6B",
    };

// ============================================================================
// HMR MANAGER
// ============================================================================

// Get or create HMR manager (survives HMR via global)
const hmrManager: FirebaseHMRManager = getFirebaseHMRManager();

// ============================================================================
// APP INITIALIZATION
// ============================================================================

/**
 * Generate app name for HMR rotation
 * In dev: unique name per HMR cycle
 * In prod: default (undefined = "[DEFAULT]")
 */
function getAppName(): string | undefined {
  if (import.meta.env?.DEV) {
    return `tka-app-${hmrManager.getAppId()}`;
  }
  return undefined;
}

/**
 * Initialize or get existing Firebase App
 */
function initializeFirebaseApp(): FirebaseApp {
  const appName = getAppName();

  // In production or first dev load, check for existing app
  if (!import.meta.env?.DEV || hmrManager.getAppId() === 0) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      const existing = appName
        ? existingApps.find((a) => a.name === appName)
        : existingApps[0];
      if (existing) {
        debug.info(`Using existing Firebase App: ${existing.name}`);
        return existing;
      }
    }
  }

  // Create new app
  const newApp = initializeApp(firebaseConfig, appName);
  debug.success(`Firebase App initialized: ${newApp.name}`);
  return newApp;
}

// Initialize app
let app: FirebaseApp = initializeFirebaseApp();
hmrManager.setApp(app);

// ============================================================================
// AUTH (LAZY ACCESSOR)
// ============================================================================

let authInstance: Auth | null = null;
let authInitPromise: Promise<Auth> | null = null;

/**
 * Select the most reliable supported Auth persistence for this browser.
 * WebKit uses localStorage because losing its IndexedDB server can otherwise
 * invalidate the user's Auth state and Firestore credentials together.
 */
export async function configureAuthPersistence(
  authToConfigure: Auth
): Promise<void> {
  if (shouldAvoidIndexedDbPersistence()) {
    try {
      await setPersistence(authToConfigure, browserLocalPersistence);
      debug.info("Auth persistence: localStorage (WebKit)");
    } catch {
      await setPersistence(authToConfigure, inMemoryPersistence);
      debug.info("Auth persistence: memory (WebKit fallback)");
    }
    return;
  }

  try {
    await setPersistence(authToConfigure, indexedDBLocalPersistence);
    debug.success("Auth persistence: IndexedDB");
  } catch {
    try {
      await setPersistence(authToConfigure, browserLocalPersistence);
      debug.info("Auth persistence: localStorage (fallback)");
    } catch {
      await setPersistence(authToConfigure, inMemoryPersistence);
      debug.info("Auth persistence: memory (fallback)");
    }
  }
}

/**
 * Get Firebase Auth instance (lazy, HMR-safe)
 *
 * This is the recommended way to access Auth. It:
 * - Lazily initializes auth
 * - Survives HMR rotation
 * - Waits for persistence configuration
 */
export async function getAuthInstance(): Promise<Auth> {
  // If HMR rotation is in progress, wait for it
  if (hmrManager.isRotating()) {
    await hmrManager.waitForReady();
  }

  // Check if we have a valid instance
  if (authInstance) {
    return authInstance;
  }

  // If initialization is in progress, wait for it
  if (authInitPromise) {
    return authInitPromise;
  }

  // Start initialization
  authInitPromise = (async () => {
    authInstance = getAuth(app);
    hmrManager.setAuth(authInstance);

    // Configure persistence
    try {
      await configureAuthPersistence(authInstance);
    } catch (error) {
      debug.warn("Auth persistence configuration failed:", error);
    }

    return authInstance;
  })();

  return authInitPromise;
}

/**
 * Get Auth instance synchronously (for backward compatibility)
 * During HMR rotation, returns cached auth from HMR manager.
 *
 * @deprecated Use getAuthInstance() for HMR safety
 */
export function getAuthSync(): Auth {
  // During HMR rotation, try to use cached auth from HMR manager
  if (hmrManager.isRotating()) {
    const cachedAuth = hmrManager.getAuth();
    if (cachedAuth) {
      return cachedAuth;
    }
    // If no cached auth, log warning but don't throw - try to continue
    debug.warn("getAuthSync called during HMR rotation with no cached auth");
  }

  if (!authInstance) {
    // Initialize synchronously for backward compat
    authInstance = getAuth(app);
    hmrManager.setAuth(authInstance);
  }

  return authInstance;
}

/**
 * Legacy auth export for backward compatibility
 * New code should use getAuthInstance()
 *
 * Initialized via initializeAuth so persistence is configured atomically
 * during construction. This avoids the IndexedDB race that caused setPersistence
 * to hang for 5+ seconds on every refresh (firebase-js-sdk #8626).
 *
 * @deprecated Use getAuthInstance() for HMR safety
 */
function initAuthWithPersistence(): Auth {
  // SSR has no browser storage or popup environment. Firebase falls back to
  // in-memory persistence when dependencies are omitted; passing the browser
  // hierarchy here makes its floating initializer assert during prerender.
  if (!browser) {
    return initializeAuth(app);
  }

  // initializeAuth can only run once per Firebase app - fall back to getAuth
  // if it's already been initialized (e.g., via HMR or another call site).
  // popupRedirectResolver is required here because signInWithPopup relies on it;
  // getAuth() installs it by default, but initializeAuth() does not.
  try {
    return initializeAuth(app, {
      persistence: shouldAvoidIndexedDbPersistence()
        ? [browserLocalPersistence, inMemoryPersistence]
        : [
            indexedDBLocalPersistence,
            browserLocalPersistence,
            inMemoryPersistence,
          ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth: Auth = initAuthWithPersistence();

connectFirebaseProductToEmulator("auth", () =>
  connectAuthEmulator(
    auth,
    `http://${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.authPort}`,
    { disableWarnings: true }
  )
);

// Register with HMR manager
hmrManager.setAuth(auth);

// Lets settings code ask who is signed in without importing this module.
registerLoadedAuth(auth);

// FIRESTORE (LAZY, HMR-SAFE)

let firestoreInstance: Firestore | null = null;
let firestoreInitPromise: Promise<Firestore> | null = null;
let usingMemoryCache = false;

/**
 * Check if an error is the known IndexedDB/persistence corruption error
 */
function isFirestoreCorruptionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message || "";
    return (
      message.includes("INTERNAL ASSERTION FAILED") ||
      message.includes("Unexpected state") ||
      message.includes("IndexedDB") ||
      message.includes("persistence") ||
      message.includes("asyncQueue") ||
      message.includes("Cannot read properties of undefined")
    );
  }
  return false;
}

/**
 * Firestore throws `failed-precondition` when initializeFirestore runs after
 * the instance has already been started (a second module evaluation, or a
 * getFirestore call that beat us). That is a "reuse what exists" signal, not a
 * cache failure — it must not trigger the corruption/clear path.
 */
function isAlreadyStartedError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return (
    code === "failed-precondition" || message.includes("already been started")
  );
}

/**
 * Clear corrupted Firestore IndexedDB databases
 */
async function clearFirestoreIndexedDB(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const databases = await indexedDB.databases();
    const firestoreDbs = databases.filter(
      (db) => db.name?.includes("firestore") || db.name?.includes("firebase")
    );

    for (const db of firestoreDbs) {
      if (db.name) {
        debug.warn(`Deleting corrupted IndexedDB: ${db.name}`);
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(db.name!);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        });
      }
    }

    debug.success("Cleared corrupted Firestore IndexedDB databases");
  } catch (error) {
    debug.error("Failed to clear IndexedDB:", error);
  }
}

/**
 * Get Firestore instance (lazy, HMR-safe)
 *
 * Features:
 * - Lazy initialization (reduces bundle size)
 * - Memory cache in dev (avoids HMR corruption)
 * - Persistent cache in production (offline support)
 * - Automatic recovery from corruption
 */
export async function getFirestoreInstance(): Promise<Firestore> {
  // If HMR rotation is in progress, wait for it
  if (hmrManager.isRotating()) {
    await hmrManager.waitForReady();
    // After rotation, firestore instance is cleared - need fresh one
  }

  // Return existing instance if valid
  if (firestoreInstance) {
    return firestoreInstance;
  }

  // Wait for in-progress initialization
  if (firestoreInitPromise) {
    return firestoreInitPromise;
  }

  // Start initialization
  firestoreInitPromise = initializeFirestore();
  return firestoreInitPromise;
}

async function initializeFirestore(): Promise<Firestore> {
  const {
    connectFirestoreEmulator,
    getFirestore,
    initializeFirestore: initFs,
    memoryLocalCache,
  } = await import("firebase/firestore");

  // DEV: memory cache (avoids HMR corruption) + forced long-polling.
  // experimentalAutoDetectLongPolling is on by default, but its probe still
  // opens a WebChannel/QUIC connection first — on flaky local networks those
  // probes stall and Chrome floods the console with
  // ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS (the request still 200s after
  // fallback, so it's pure noise). Forcing long-polling never opens WebChannel,
  // so the QUIC errors never appear. Must run initFs BEFORE any getFirestore,
  // or the default WebChannel instance is created without these settings.
  if (import.meta.env?.DEV) {
    try {
      firestoreInstance = initFs(app, {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
      });
      usingMemoryCache = true;
      debug.success(
        "Firestore initialized with memory cache + long-polling (dev)"
      );
    } catch {
      // Already initialized (HMR) — reuse the existing instance, which already
      // carries the long-polling setting from the first init.
      firestoreInstance = getFirestore(app);
      debug.warn("Firestore reused existing instance (dev)");
    }

    connectFirebaseProductToEmulator("firestore", () =>
      connectFirestoreEmulator(
        firestoreInstance!,
        firebaseEmulatorConfig.host,
        firebaseEmulatorConfig.firestorePort
      )
    );

    hmrManager.setFirestore(firestoreInstance);
    return firestoreInstance;
  }

  // PRODUCTION: persistent local cache (offline support), with fallbacks.
  //
  // ORDERING IS LOAD-BEARING. This block used to open with `getFirestore(app)`
  // inside a try/catch, intending "reuse an already-started instance, otherwise
  // fall through to initFs". But getFirestore NEVER throws for a live app — it
  // just creates a default, memory-only instance — so the early return ALWAYS
  // fired and every persistent-cache line below it was unreachable. Production
  // ran with zero offline persistence, which is what turned a flaky scan into a
  // hard failure instead of a cache hit.
  //
  // initFs must therefore come FIRST: it is the only call that can attach a
  // cache, and it is the one that throws (failed-precondition) when Firestore
  // has already been started — the real "reuse it" signal.

  // SSR / workerd has no IndexedDB. persistentLocalCache would construct fine
  // there and then fail on the first read, so take the memory path knowingly.
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    firestoreInstance = getFirestore(app);
    usingMemoryCache = true;
    debug.info("Firestore memory-only (no IndexedDB in this runtime)");
    hmrManager.setFirestore(firestoreInstance);
    return firestoreInstance;
  }

  // WebKit's IndexedDB server can disappear while a page is still open. Once
  // that happens, Firestore's persistent cache retries every listener against
  // the same dead connection. Keep network-backed Firestore fully functional
  // with its supported memory cache on Safari and every iOS browser.
  if (shouldAvoidIndexedDbPersistence()) {
    firestoreInstance = initFs(app, { localCache: memoryLocalCache() });
    usingMemoryCache = true;
    debug.info("Firestore memory-only (WebKit)");
    hmrManager.setFirestore(firestoreInstance);
    return firestoreInstance;
  }

  // In-app webviews partition IndexedDB unpredictably, and these sessions are
  // short by nature: the visitor is on their way to a real browser. Skip the
  // 5s persistent-cache race rather than spend it, and skip the multi-tab lease
  // election that produces console noise nobody can act on.
  if (getInAppBrowserDetector().isInAppBrowser()) {
    firestoreInstance = getFirestore(app);
    usingMemoryCache = true;
    debug.info("Firestore memory-only (in-app browser)");
    hmrManager.setFirestore(firestoreInstance);
    return firestoreInstance;
  }

  // persistentMultipleTabManager can hang if BroadcastChannel/IndexedDB is stuck.
  // Race against a 5s timeout that falls back to memory cache.
  const FIRESTORE_INIT_TIMEOUT = 5000;

  try {
    const { persistentLocalCache, persistentMultipleTabManager } =
      await import("firebase/firestore");

    firestoreInstance = await Promise.race([
      (async () => {
        const fs = initFs(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
        debug.success("Firestore initialized with persistent cache");
        return fs;
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Firestore persistent cache timed out")),
          FIRESTORE_INIT_TIMEOUT
        )
      ),
    ]);
  } catch (error) {
    // Already started elsewhere: adopt that instance rather than clobbering it.
    // Its cache was chosen by whoever started it, so don't claim persistence.
    if (isAlreadyStartedError(error)) {
      firestoreInstance = getFirestore(app);
      usingMemoryCache = true;
      debug.info("Firestore already started — reusing existing instance");
      hmrManager.setFirestore(firestoreInstance);
      return firestoreInstance;
    }

    debug.warn("Persistent cache failed, falling back to memory cache:", error);
    if (isFirestoreCorruptionError(error)) {
      await clearFirestoreIndexedDB();
    }

    try {
      firestoreInstance = initFs(app, { localCache: memoryLocalCache() });
      usingMemoryCache = true;
      debug.success("Firestore initialized with memory cache (fallback)");
    } catch {
      firestoreInstance = getFirestore(app);
      usingMemoryCache = true;
      debug.error("Memory cache failed, using bare Firestore");
    }
  }

  hmrManager.setFirestore(firestoreInstance);
  return firestoreInstance;
}

/** Check if Firestore is using memory-only cache */
export function isFirestoreUsingMemoryCache(): boolean {
  return usingMemoryCache;
}

/**
 * Release Firestore before a user-requested full cache clear.
 *
 * Firebase only permits clearing its IndexedDB persistence after termination.
 * AccountManager removes live listeners first, then calls this boundary before
 * deleting the rest of the app's browser storage and reloading.
 */
export async function shutdownFirestoreForCacheClear(): Promise<void> {
  let firestore = firestoreInstance ?? hmrManager.getFirestore();
  if (!firestore && firestoreInitPromise) {
    firestore = await firestoreInitPromise.catch(() => null);
  }
  if (!firestore) return;

  const { clearIndexedDbPersistence, terminate } =
    await import("firebase/firestore");

  try {
    await terminate(firestore);
  } catch (error) {
    // A corrupted IndexedDB connection can make termination itself reject.
    // The raw browser-storage clear that follows remains the recovery path.
    debug.warn("Firestore termination needed browser fallback:", error);
  } finally {
    firestoreInstance = null;
    firestoreInitPromise = null;
    usingMemoryCache = false;
    hmrManager.clearFirestore();
  }

  try {
    await clearIndexedDbPersistence(firestore);
  } catch (error) {
    // The broader cache clear still deletes the database directly. WebKit may
    // reject this SDK call when the very problem being repaired is a lost
    // IndexedDB server connection.
    debug.warn("Firestore persistence clear needed browser fallback:", error);
  }
}

// ============================================================================
// REALTIME DATABASE (LAZY, HMR-SAFE)
// ============================================================================

let databaseInstance: Database | null = null;
let databaseInitPromise: Promise<Database> | null = null;

/**
 * Get Realtime Database instance (lazy, HMR-safe)
 */
export async function getDatabaseInstance(): Promise<Database> {
  if (hmrManager.isRotating()) {
    await hmrManager.waitForReady();
  }

  if (databaseInstance) {
    return databaseInstance;
  }

  if (databaseInitPromise) {
    return databaseInitPromise;
  }

  databaseInitPromise = (async () => {
    const { connectDatabaseEmulator, getDatabase } =
      await import("firebase/database");
    databaseInstance = getDatabase(app);
    connectFirebaseProductToEmulator("database", () =>
      connectDatabaseEmulator(
        databaseInstance!,
        firebaseEmulatorConfig.host,
        firebaseEmulatorConfig.databasePort
      )
    );
    hmrManager.setDatabase(databaseInstance);
    debug.success("Realtime Database lazy-loaded");
    return databaseInstance;
  })();

  return databaseInitPromise;
}

/**
 * Legacy database proxy for backward compatibility
 * @deprecated Use getDatabaseInstance() for HMR safety
 */
let _cachedDatabase: Database | null = null;

export const database = new Proxy({} as Database, {
  get(_target, prop) {
    if (!_cachedDatabase) {
      throw new Error(
        "Realtime Database accessed before initialization. " +
          "Use getDatabaseInstance() instead."
      );
    }
    return Reflect.get(_cachedDatabase, prop);
  },
});

// Initialize database cache (browser only)
if (typeof window !== "undefined") {
  getDatabaseInstance().then((instance) => {
    _cachedDatabase = instance;
  });
}

// ============================================================================
// STORAGE (LAZY)
// ============================================================================

/**
 * Get Firebase Storage instance (lazy)
 */
export async function getStorageInstance(): Promise<FirebaseStorage> {
  const { connectStorageEmulator, getStorage } =
    await import("firebase/storage");
  const storage = getStorage(app);
  connectFirebaseProductToEmulator("storage", () =>
    connectStorageEmulator(
      storage,
      firebaseEmulatorConfig.host,
      firebaseEmulatorConfig.storagePort
    )
  );
  return storage;
}

// ============================================================================
// FUNCTIONS (LAZY + SYNC)
// ============================================================================

let functionsInstance: Functions | null = null;
let functionsInitPromise: Promise<Functions> | null = null;

/**
 * Get Firebase Functions instance (lazy)
 * Uses the current HMR-safe app instance
 */
export async function getFunctionsInstance(): Promise<Functions> {
  if (functionsInstance) {
    return functionsInstance;
  }

  if (functionsInitPromise) {
    return functionsInitPromise;
  }

  functionsInitPromise = (async () => {
    const { connectFunctionsEmulator, getFunctions } =
      await import("firebase/functions");
    functionsInstance = getFunctions(app);
    connectFirebaseProductToEmulator("functions", () =>
      connectFunctionsEmulator(
        functionsInstance!,
        firebaseEmulatorConfig.host,
        firebaseEmulatorConfig.functionsPort
      )
    );
    return functionsInstance;
  })();

  return functionsInitPromise;
}

// Pre-initialize functions in browser for faster first call
if (typeof window !== "undefined") {
  getFunctionsInstance();
}

// ============================================================================
// AUTH PERSISTENCE
//
// Persistence is now configured atomically by initializeAuth() above.
// This function exists for backward compatibility - it resolves immediately
// because there's nothing to wait for. Previously this Promise.raced
// setPersistence with a 5-second timeout, which fired on every refresh
// because setPersistence races with IndexedDB setup (firebase-js-sdk #8626).
// ============================================================================

export async function ensureAuthPersistence(): Promise<void> {
  // No-op: persistence is configured during initializeAuth(), no waiting needed.
}

// Keep setPersistence imported for any code that needs to switch persistence
// (e.g., session-only mode for Remember Me unchecked). Not used at boot.
void setPersistence;

// ============================================================================
// EXPORTS
// ============================================================================

export { app };

// Initialize Firestore (browser only)
if (typeof window !== "undefined") {
  getFirestoreInstance().catch((error) => {
    console.error("Failed to initialize Firestore:", error);
  });
}

// ============================================================================
// HMR LIFECYCLE - STABLE APP (NO ROTATION)
// ============================================================================
//
// Prod builds strip `import.meta.hot`, so none of this runs in production —
// where the app is the stable "[DEFAULT]" app anyway.
//
// We deliberately do NOT rotate the Firebase app or terminate Firestore on HMR.
// Firebase Auth persists the signed-in user in IndexedDB under a key that embeds
// the app NAME: `firebase:authUser:<apiKey>:<appName>` (see @firebase/auth
// _persistenceKeyName). The old app-rotation scheme gave every HMR cycle a new
// app name ("tka-app-hmr-N"), so the fresh auth instance read an EMPTY
// persistence namespace and silently signed the user out on every hot reload —
// and the next full refresh (reading the original "tka-app-0" key, now stale)
// stayed signed out too. `transferAuthState`'s premise that "Firebase
// auto-restores the user on the new app instance" is false across differing app
// names: persistence is keyed per app name.
//
// Rotation only ever existed to escape Firestore's terminate()/IndexedDB
// corruption (getFirestore(app) returns the terminated instance after
// terminate()). But in dev, Firestore uses an in-memory cache (see
// initializeFirestore) — there is no IndexedDB state to corrupt and nothing to
// terminate. So we keep the app stable and self-accept: the re-evaluated module
// reuses the same "tka-app-0" app (getApps match), the same auth instance (with
// the live signed-in user, via getAuth's already-initialized path), and the same
// live Firestore (getFirestore returns the non-terminated instance). The auth
// persistence key never changes, so the user stays signed in across HMR and
// across full refreshes.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Intentionally no-op: no terminate(), no rotation. Keeping the app, auth,
    // and memory-cache Firestore alive is what preserves the session. Module
    // locals are discarded with the old module and rebound (to the same reused
    // instances) when the new module evaluates.
  });

  // Self-accept so an edit to this module (or its deps) hot-swaps in place
  // instead of bubbling up to a full page reload.
  import.meta.hot.accept();
}

// ============================================================================
// LISTENER HELPERS (HMR-SAFE)
// ============================================================================

/**
 * Create an HMR-safe Firestore listener
 *
 * Usage:
 * ```typescript
 * const unsubscribe = createHMRSafeFirestoreListener(
 *   'user-profile-listener',
 *   `users/${userId}`,
 *   () => onSnapshot(doc(db, 'users', userId), callback)
 * );
 * ```
 */
export function createHMRSafeFirestoreListener(
  id: string,
  path: string,
  subscribe: () => Unsubscribe
): Unsubscribe {
  return hmrManager.registerFirestoreListener(id, path, subscribe);
}

/**
 * Create an HMR-safe Realtime Database listener
 */
export function createHMRSafeDatabaseListener(
  id: string,
  path: string,
  subscribe: () => () => void
): () => void {
  return hmrManager.registerDatabaseListener(id, path, subscribe);
}

/**
 * Register a presence handler for automatic re-establishment after HMR
 */
export function registerPresenceHandler(
  handler: () => Promise<void> | void
): () => void {
  return hmrManager.registerPresenceHandler(handler);
}

/**
 * Wait for Firebase to be ready (after HMR rotation)
 */
export { waitForFirebaseReady } from "./firebase-hmr-manager";
