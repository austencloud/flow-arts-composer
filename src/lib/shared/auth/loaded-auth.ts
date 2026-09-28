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

export function registerLoadedAuth(instance: Auth): void {
  registered = instance;
}

export const loadedAuth = {
  get currentUser(): User | null {
    return registered?.currentUser ?? null;
  },
};
