/**
 * auth-state's admin, signed-in and user id answers, readable without loading
 * Firebase.
 *
 * The premium prop check and the sequence thumbnails run on public pages, and
 * importing auth-state to answer them put Firebase Auth and Firestore on
 * their first download. auth-state registers itself here when it loads.
 * Before that nobody is signed in, so nobody is an admin.
 *
 * The registration is reactive: a picker or thumbnail that asked before
 * auth-state loaded asks again once it does, and from then on follows
 * auth-state's own answer, the desktop app's signed-out admin fallback
 * included.
 */
interface AuthStateReader {
  isAdmin(): boolean;
  isAuthenticated(): boolean;
  userId(): string | null;
}

let registered = $state.raw<AuthStateReader | null>(null);

export function registerLoadedAuthState(reader: AuthStateReader): void {
  registered = reader;
}

export const loadedAuthState = {
  get isAdmin(): boolean {
    return registered?.isAdmin() ?? false;
  },
  get isAuthenticated(): boolean {
    return registered?.isAuthenticated() ?? false;
  },
  /** The signed-in user's uid, not a previewed user's. */
  get userId(): string | null {
    return registered?.userId() ?? null;
  },
};
