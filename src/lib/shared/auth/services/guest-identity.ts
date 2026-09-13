import { signInAnonymously } from "firebase/auth";
import { getAuthInstance } from "$lib/shared/auth/firebase";
import { adoptUnownedSequenceIds } from "$lib/shared/library/services/saved-sequence-ledger";
import {
  captureExceptionWhenReady,
  captureWhenReady,
} from "$lib/shared/analytics/services/posthog";

/**
 * Lazily provision an anonymous Firebase identity. Idempotent and
 * concurrency-safe: a single in-flight sign-in is shared across callers, and a
 * no-op once any user (anonymous or full) is present.
 *
 * Call from every "first persistable action" entry point — committing a first
 * beat, saving, favoriting — and from the crowd-sourced thumbnail upload, which
 * is a persistable action the visitor never consciously takes. Uses getAuthInstance() (HMR-safe) rather than the
 * static `auth` export to avoid the dev-cycle app-rotation argument-error.
 */
let inFlight: Promise<void> | null = null;
let warnedDisabled = false;
let restoredRecorded = false;
let createdRecorded = false;

export type GuestIdentitySource =
  | "first_persistable_action"
  | "gallery_mount"
  | "thumbnail_upload";

/**
 * Hand saves that completed with no identity to this ANONYMOUS uid.
 *
 * Called from both anonymous paths — a freshly provisioned identity and a
 * restored one — and from neither full-account path. Never throws: adoption is
 * a continuity nicety and must not be able to fail a sign-in.
 */
function adoptParkedSaves(uid: string, source: GuestIdentitySource): void {
  try {
    const adopted = adoptUnownedSequenceIds(uid);
    if (adopted.length > 0) {
      captureWhenReady("guest_identity_adopted_unowned_saves", {
        source,
        count: adopted.length,
      });
    }
  } catch (adoptionError) {
    console.warn(
      "[guest-identity] Could not adopt unowned saves:",
      adoptionError
    );
  }
}

export async function ensureGuestIdentity(
  source: GuestIdentitySource = "first_persistable_action"
): Promise<void> {
  const auth = await getAuthInstance();
  if (auth.currentUser) {
    if (auth.currentUser.isAnonymous) {
      // A RESTORED anonymous session is the same guest continuing, so it may
      // claim saves parked while no identity existed. Without this, a browser
      // that already holds an anonymous user takes the early return and the
      // parked rows stay parked forever — invisible and unsyncable, which is
      // the exact orphaning the park was introduced to end.
      //
      // Still anonymous-only: a full account takes neither branch and can
      // never adopt work it did not make.
      adoptParkedSaves(auth.currentUser.uid, source);
      if (!restoredRecorded) {
        restoredRecorded = true;
        captureWhenReady("guest_identity_restored", { source });
      }
    }
    return;
  }
  if (inFlight) return inFlight;
  inFlight = signInAnonymously(auth)
    .then((credential) => {
      // A save can complete before any identity exists (this function swallows
      // its own failures, and callers must not lose the user's work over it).
      // Those rows are parked as unowned; this is the one moment they can be
      // attributed — to a fresh ANONYMOUS identity, i.e. the same person
      // continuing the same guest session. A full-account sign-in never
      // reaches here, so it can never adopt work it did not make.
      adoptParkedSaves(credential.user.uid, source);
      if (!createdRecorded) {
        createdRecorded = true;
        captureWhenReady("guest_identity_created", { source });
      }
    })
    .catch((err: unknown) => {
      // Anonymous auth provider may be disabled in the Firebase console
      // (auth/admin-restricted-operation), or sign-in may fail offline. Swallow
      // so a guest's first persistable action doesn't surface an uncaught
      // rejection on every page — log once. Guest continuity stays inert until
      // the provider is enabled; nothing downstream should hard-depend on a uid.
      if (!warnedDisabled) {
        warnedDisabled = true;
        const failureCode =
          typeof (err as { code?: unknown } | null)?.code === "string"
            ? String((err as { code: string }).code).slice(0, 80)
            : "unknown";
        captureWhenReady("guest_identity_failed", {
          source,
          failure_code: failureCode,
        });
        captureExceptionWhenReady(err, {
          auth_error_code: failureCode,
          auth_action: "ensure_guest_identity",
        });
        console.warn("[guest-identity] anonymous sign-in unavailable:", err);
      }
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
