/**
 * A rune-backed stand-in for the signed-in account, for inbox component tests.
 *
 * `vi.mock` factories return plain objects, and a plain getter cannot wake a
 * `$effect`. The inbox drawer's ownership teardown lives in an effect that reads
 * `authState.user?.uid`, so proving it needs a double whose account change is a
 * real reactive write.
 */
export interface ReactiveAccountDouble {
  /** Shaped like the slice of `authState` the inbox reads. */
  readonly authState: {
    readonly user: { uid: string; displayName: string | null } | null;
    readonly isAdmin: boolean;
  };
  /** Sign a different account in, or pass null to sign out. */
  setAccount(uid: string | null): void;
}

export function createReactiveAccountDouble(
  initialUid: string | null
): ReactiveAccountDouble {
  let uid = $state<string | null>(initialUid);

  return {
    authState: {
      get user() {
        return uid === null ? null : { uid, displayName: "Austen" };
      },
      get isAdmin() {
        return false;
      },
    },
    setAccount(next: string | null) {
      uid = next;
    },
  };
}
