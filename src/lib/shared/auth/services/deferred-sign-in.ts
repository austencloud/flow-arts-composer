/**
 * Quiet sign-in for public pages.
 *
 * Public pages boot without the sign-in code so a first visit stays fast. A
 * returning visitor still expects their account there: their avatar in the
 * site header, and prop, color and grip changes that reach their account
 * instead of staying on this device. So the page first checks browser storage
 * for a saved session, which needs no Firebase, and only when one is there
 * does it load the real auth state, at the browser's next idle moment.
 * Signing in that way also attaches settings sync (auth-boot-orchestrator.ts).
 *
 * The site header and the headerless Shape Engine page share this. Each picks
 * the storage check that fits it; see the two checks below.
 */
import type { authState as AuthStateInstance } from "../state/auth-state.svelte";

export type AuthStateApi = typeof AuthStateInstance;

// Where Firebase Auth keeps a signed-in (or guest) user: one record keyed
// "firebase:authUser:<apiKey>:<appName>", in this IndexedDB database normally
// and in localStorage on Safari and iOS (indexeddb-persistence-policy.ts).
// Signing out deletes the record but leaves the database in place.
const AUTH_DATABASE = "firebaseLocalStorageDb";
const AUTH_STORE = "firebaseLocalStorage";
const SAVED_USER_KEY_PREFIX = "firebase:authUser:";

/**
 * Has this browser ever created Firebase's sign-in database? The site
 * header's check. It stays yes after sign-out, and once any page has loaded
 * Firebase, so a signed-out visitor can still start sign-in. It never looks
 * at localStorage, where Safari and iOS keep the session.
 */
export async function hasFirebaseAuthDatabase(): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined") return false;
    // indexedDB.databases() is available in Chromium/WebKit. If unavailable,
    // assume auth may exist and let the real init decide.
    if (typeof indexedDB.databases !== "function") return true;
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === AUTH_DATABASE);
  } catch (error) {
    console.debug(
      "[deferred-sign-in] Auth persistence probe unavailable:",
      error
    );
    return true;
  }
}

/**
 * Is a Firebase user saved in this browser right now? Pages that load Firebase
 * for every visitor need this stricter check: there the database exists for
 * signed-out visitors too, so only the saved user record tells them apart.
 * It reads Firebase's database without ever creating it.
 */
export async function hasSavedFirebaseUser(): Promise<boolean> {
  try {
    if (hasSavedUserInLocalStorage()) return true;
    if (typeof indexedDB === "undefined") return false;
    // Without databases() the only way to look is to open the database, which
    // would create it. Assume a session may exist and let the real init decide.
    if (typeof indexedDB.databases !== "function") return true;
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === AUTH_DATABASE)) {
      return false;
    }
    return await hasSavedUserInIndexedDb();
  } catch (error) {
    console.debug("[deferred-sign-in] Saved session probe unavailable:", error);
    return true;
  }
}

function hasSavedUserInLocalStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  for (let index = 0; index < localStorage.length; index += 1) {
    if (localStorage.key(index)?.startsWith(SAVED_USER_KEY_PREFIX)) return true;
  }
  return false;
}

function hasSavedUserInIndexedDb(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTH_DATABASE);
    let databaseWasMissing = false;
    // Opening by name creates a missing database. If Firebase's database went
    // away after it was listed, back out instead of leaving an empty one
    // behind, which Firebase would then have to delete and rebuild.
    request.onupgradeneeded = () => {
      databaseWasMissing = true;
      request.transaction?.abort();
    };
    request.onerror = () => {
      if (databaseWasMissing) resolve(false);
      else reject(request.error);
    };
    request.onsuccess = () => {
      const database = request.result;
      // Never hold up Firebase if it needs to upgrade or delete its database.
      database.onversionchange = () => database.close();
      if (!database.objectStoreNames.contains(AUTH_STORE)) {
        database.close();
        resolve(false);
        return;
      }
      try {
        const transaction = database.transaction(AUTH_STORE, "readonly");
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => database.close();
        const count = transaction
          .objectStore(AUTH_STORE)
          .count(
            IDBKeyRange.bound(
              SAVED_USER_KEY_PREFIX,
              `${SAVED_USER_KEY_PREFIX}\uffff`
            )
          );
        count.onsuccess = () => resolve(count.result > 0);
        count.onerror = () => reject(count.error);
      } catch (error) {
        database.close();
        reject(error);
      }
    };
  });
}

/**
 * Load the real auth state and start it: restore the saved session, then the
 * account services, settings sync among them. Starting it twice is harmless
 * (initialize() shares one run). `onLoaded` gets the auth state before the
 * session is restored, so reactive UI can follow it as it resolves.
 */
export async function startAuthState(
  onLoaded?: (authState: AuthStateApi) => void
): Promise<void> {
  const { authState } = await import("../state/auth-state.svelte");
  onLoaded?.(authState);
  await authState.initialize();
}

export interface DeferredSignInOptions {
  /** Answers "is there a session to restore?" without loading Firebase. */
  hasSession: () => Promise<boolean>;
  /** Hears that answer, e.g. to hold the header's account slot until then. */
  onProbed?: (hasSession: boolean) => void;
  /** Starts sign-in. Defaults to starting the shared auth state. */
  signIn?: () => Promise<void>;
  /** Names the page in the console warning when sign-in fails to start. */
  label: string;
}

/**
 * Sign a returning visitor in at the browser's next idle moment, and only when
 * `hasSession` finds a saved session. A signed-out visitor never loads the
 * sign-in code. Returns a cleanup that cancels a start still waiting for idle
 * time, for a page that unmounts first.
 */
export function signInWhenIdle({
  hasSession,
  onProbed,
  signIn = () => startAuthState(),
  label,
}: DeferredSignInOptions): () => void {
  let active = true;
  let idleHandle: number | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  void (async () => {
    const found = await hasSession();
    if (!active) return;
    onProbed?.(found);
    if (!found) return;

    const start = () => {
      if (!active) return;
      void signIn().catch((error) =>
        console.warn(`[${label}] Deferred auth initialization failed:`, error)
      );
    };

    if (typeof requestIdleCallback !== "undefined") {
      idleHandle = requestIdleCallback(start);
    } else {
      timeoutHandle = setTimeout(start, 0);
    }
  })();

  return () => {
    active = false;
    if (idleHandle !== undefined) cancelIdleCallback(idleHandle);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  };
}
