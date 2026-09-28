/**
 * Who is signed in, readable without loading Firebase.
 *
 * Public pages import settings code that asks this on every edit. Importing
 * the Firebase bootstrap to answer would put Firebase Auth and Firestore on
 * those pages' first download. The bootstrap (firebase.ts) registers its Auth
 * instance here when it loads, and nobody can be signed in before that, so
 * until then the answer is null.
 *
 * Reads stay synchronous on purpose: settings pin an edit or a save to the
 * account that was signed in when it happened, before any await.
 */
import type { Auth, User } from "firebase/auth";

let registered: Auth | null = null;
let waiting: Array<(instance: Auth) => void> = [];

export function registerLoadedAuth(instance: Auth): void {
  registered = instance;
  const due = waiting;
  waiting = [];
  for (const callback of due) {
    // firebase.ts calls this while it loads; a failing listener must not
    // break the bootstrap for everyone else.
    try {
      callback(instance);
    } catch (error) {
      console.error("[loaded-auth] Auth listener failed:", error);
    }
  }
}

/**
 * Run `callback` with the Auth instance once the bootstrap has loaded, at once
 * if it already has. For code that follows sign-in changes but must not be the
 * one to load Firebase.
 */
export function whenAuthLoaded(callback: (instance: Auth) => void): void {
  if (registered) callback(registered);
  else waiting.push(callback);
}

export const loadedAuth = {
  get currentUser(): User | null {
    return registered?.currentUser ?? null;
  },
};
