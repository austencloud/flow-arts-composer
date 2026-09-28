/**
 * auth-state's admin answer, readable without loading Firebase.
 *
 * The premium prop check runs on public pages, and importing auth-state to
 * answer it put Firebase Auth and Firestore on their first download.
 * auth-state registers itself here when it loads. Before that nobody is
 * signed in, so nobody is an admin.
 *
 * The registration is reactive: a picker that asked before auth-state loaded
 * asks again once it does, and from then on follows auth-state's own answer,
 * the desktop app's signed-out admin fallback included.
 */
interface AuthStateReader {
  isAdmin(): boolean;
}

let registered = $state.raw<AuthStateReader | null>(null);

export function registerLoadedAuthState(reader: AuthStateReader): void {
  registered = reader;
}

export const loadedAuthState = {
  get isAdmin(): boolean {
    return registered?.isAdmin() ?? false;
  },
};
