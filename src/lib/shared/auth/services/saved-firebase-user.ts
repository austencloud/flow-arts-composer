/**
 * Is a Firebase user saved in this browser? Answered without loading Firebase.
 *
 * Quiet sign-in (deferred-sign-in.ts) asks before it loads the sign-in code,
 * and the card layout settings (image-composition-state.svelte.ts) ask before
 * they load Firebase to learn whose column choices apply. This module imports
 * nothing, so embeds and public pages can ask without reaching either.
 */

// Where Firebase Auth keeps a signed-in (or guest) user: one record keyed
// "firebase:authUser:<apiKey>:<appName>", in this IndexedDB database normally
// and in localStorage on Safari and iOS (indexeddb-persistence-policy.ts).
// Signing out deletes the record but leaves the database in place.
const AUTH_DATABASE = "firebaseLocalStorageDb";
const AUTH_STORE = "firebaseLocalStorage";
const SAVED_USER_KEY_PREFIX = "firebase:authUser:";

/**
 * Is a Firebase user, signed in or guest, saved in this browser right now?
 * Only the saved user record tells: whether Firebase's database exists does
 * not. Safari and iOS never create it, and elsewhere it outlives sign-out and
 * appears for signed-out visitors once any page loads Firebase. It reads the
 * database without ever creating it.
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
    console.debug(
      "[saved-firebase-user] Saved session probe unavailable:",
      error
    );
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
