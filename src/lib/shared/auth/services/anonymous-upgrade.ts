//
// Anonymous-guest upgrade. On signup we LINK the anonymous Firebase user in
// place (preserving its uid + all its Firestore data) rather than minting a new
// account. If the chosen credential already belongs to a permanent account we
// can't link onto the anon — that's the "collision" case: we sign into the
// existing account instead, and hand back the anon's drafts so the caller can
// offer to import them.
import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  type AuthError,
  type User,
} from "firebase/auth";
import { getAuthInstance } from "$lib/shared/auth/firebase";
import { stashPendingLink } from "$lib/shared/auth/services/pending-credential-link";
import { recordLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
import { getPropUnlockManager } from "$lib/shared/gamification/get-prop-unlock-manager";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { reportPostHogLifecycleEvent } from "$lib/shared/analytics/services/posthog-lifecycle-reporter";
import { getAuthSubmissionContext } from "$lib/shared/auth/services/auth-analytics-bridge";
import * as dexiePersistence from "$lib/shared/persistence/services/dexie-persistence-service";
import { getSavedSequenceIds } from "$lib/shared/library/services/saved-sequence-ledger";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export type UpgradeStatus = "linked" | "collision-signed-in";

/**
 * Drafts captured from the anon session before a link/collision. These are
 * raw Dexie rows (SequenceData), not full LibrarySequence — the anon guest
 * never had a Firestore library doc for a Dexie-only save (SP1 made Dexie
 * authoritative for guests). importDrafts()/saveSequence() accept SequenceData
 * directly and mint the LibrarySequence fields (ownerId, source, visibility,
 * ...) on write, so no upcast is needed here.
 */
export type AnonymousDraft = SequenceData;

export interface UpgradeResult {
  status: UpgradeStatus;
  /** Drafts captured from the anon session, present only on collision. */
  importable?: AnonymousDraft[];
  /**
   * On a collision, the uid of the account we just signed INTO — read from the
   * auth result itself, the instant the sign-in completed. This is the account
   * the import offer is about. It is not re-derivable later: a subsequent
   * "who is signed in now?" lookup answers a different question the moment the
   * user switches accounts, and would silently re-point the offer.
   */
  destinationUid?: string;
}

const CREDENTIAL_COLLISION = new Set([
  "auth/credential-already-in-use",
  "auth/email-already-in-use",
]);

function isCollision(error: unknown): error is AuthError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    CREDENTIAL_COLLISION.has((error as AuthError).code)
  );
}

/** Analytics must never turn a completed account transition into a failure. */
export async function reportGuestUpgradeLifecycle(
  status: UpgradeStatus
): Promise<void> {
  try {
    const context = getAuthSubmissionContext();
    await reportPostHogLifecycleEvent({
      event: "guest_upgraded_to_account",
      properties: {
        status,
        ...(context.surface ? { surface: context.surface as never } : {}),
        ...(context.origin ? { origin: context.origin } : {}),
        ...(context.method ? { method: context.method as never } : {}),
        ...(context.auth_mode
          ? { authMode: context.auth_mode as "signin" | "signup" }
          : {}),
      },
    });
  } catch (error) {
    console.warn(
      "[anonymous-upgrade] Could not deliver the upgrade lifecycle event:",
      error
    );
  }
}

/**
 * Read the anon user's saved sequences before we risk losing the session.
 *
 * The drafts worth capturing live in local Dexie, not Firestore: SP1 made
 * Dexie authoritative for guest saves, so a fresh guest save may never have
 * reached `library-repository.getUserSequences` (Firestore) at all. Firestore
 * is intentionally NOT consulted — a genuinely anonymous session cannot own a
 * Firestore library doc (rules gate writes to full accounts), so it would only
 * return [] and cost a round trip.
 *
 * Dexie is a flat, single-device store NOT keyed by uid, and it is never
 * cleared on sign-out — so `getAllSequences()` alone would return a PRIOR
 * user's rows too, and on a collision-signin into a different account those
 * could be imported into a stranger's library. To scope correctly, we filter
 * to the ids THIS uid recorded when it saved (saved-sequence-ledger), so only
 * the current guest's own drafts are captured. An empty ledger → capture
 * nothing (safe): no leak of another user's data.
 */
export async function captureAnonymousDrafts(
  anonUid: string
): Promise<AnonymousDraft[]> {
  try {
    const mine = new Set(getSavedSequenceIds(anonUid));
    if (mine.size === 0) return [];
    const all = await dexiePersistence.getAllSequences();
    return all.filter((s) => !!s.id && mine.has(s.id));
  } catch {
    return [];
  }
}

/**
 * Fire the admin "new signup" notification when a guest upgrades to a full
 * account by linking a credential onto their anonymous session.
 *
 * This is the real signup moment for guest-first users. createOrUpdateUserDocument
 * skips the notification for anonymous users (the write is denied by isFullUser),
 * and a successful link preserves the anon uid so its user doc already exists —
 * meaning the create-time branch never re-fires. Without this hook, guests who
 * upgrade would never trigger the admin notification. The "collision-signed-in"
 * path is NOT a new signup (it signs into a pre-existing account), so it is not
 * notified here.
 *
 * It is also the single fire site for the user-facing "your guest work was
 * saved" confirmation: this function is invoked only from the in-place link
 * paths (the three upgradeAnonymousWith* fns + the magic-link link branch),
 * never from a plain sign-in or the collision path (which shows its own import
 * dialog + toast). The non-anon guard below guarantees we only confirm a real
 * upgrade.
 */
export async function notifyUpgradeSignup(linkedUser?: User): Promise<void> {
  try {
    const user = linkedUser ?? (await getAuthInstance()).currentUser;
    if (!user) return;
    // Linking mutates the User before every Firestore client necessarily sees
    // its replacement token. Complete that transition here so profile writes
    // and username claims run with a full-account provider claim.
    await user.getIdToken(true);
    if (user.isAnonymous) return;

    // Push the upgraded user into authState so the CLIENT stops believing it is
    // a guest. An in-place link mutates Firebase's User object without changing
    // the uid, so onAuthStateChanged never fires and nothing reassigns
    // _state.user — Svelte therefore never recomputes isFullAccount, isGuest
    // stays true, and MainApplication's {#if isGuest} keeps the sign-in modal
    // mounted on top of a fully upgraded account. That is the 2026-07-29 report:
    // "it just bounced them back to the app without signing them in" — Google
    // had in fact succeeded (both accounts existed server-side), the sheet just
    // never closed, so the users kept retrying a sign-in they had already
    // completed.
    //
    // Here rather than at each call site: this function is already the single
    // convergence point for every in-place link (all three upgradeAnonymousWith*
    // fns plus the magic-link branch), and it already force-refreshes the ID
    // token for the same "linking mutates the User" reason. Its own try/catch so
    // a user-doc or toast failure below can never strand the UI as a guest.
    try {
      const { refreshUser } = await import("../state/auth-state.svelte");
      await refreshUser();
    } catch (error) {
      console.warn(
        "⚠️ [anonymous-upgrade] Failed to refresh client auth state after link:",
        error
      );
    }

    // Clear the guest flag now that this uid is a full account, so the creator
    // surfaces in Browse Creators. onAuthStateChanged doesn't reliably fire on
    // an in-place link, so we do it explicitly. createOrUpdateUserDocument's
    // update branch writes isAnonymous:false; it also creates the doc if dev
    // skipped it while the session was anonymous (PROD-only guest-doc guard).
    try {
      const { getUserDocumentManager } =
        await import("$lib/shared/auth/get-user-document-manager");
      await getUserDocumentManager().createOrUpdateUserDocument(user);
    } catch (error) {
      console.warn(
        "⚠️ [anonymous-upgrade] Failed to clear guest flag on user doc:",
        error
      );
    }
    // Guest work was attached to this uid before the link, so it carried over.
    // One non-blocking confirmation so the ~90% no-collision signups aren't left
    // wondering whether their sequences survived the upgrade.
    toast.success("Account created. Your sequences are saved.");
    void getPropUnlockManager().mergeGuestCollection();
    // Discrete guest→account conversion event, separate from identify() -
    // fires exactly once here since this is the single call site for every
    // in-place link path (Google/Facebook/Email + magic-link, native or web).
    await reportGuestUpgradeLifecycle("linked");
    // Admin upgrade notifications are handled server-side by the
    // pulseUserActivity cloud function (fires when isAnonymous flips false
    // on the user doc). The old client-side notify was rules-denied.
  } catch (error) {
    console.warn(
      "⚠️ [anonymous-upgrade] Failed to notify admins of upgrade signup:",
      error
    );
  }
}

/**
 * Link an already-obtained Google credential (ID token) onto the current
 * anonymous session, or sign into the existing account on collision. Shared
 * by the native Google SDK path and the web One Tap / FedCM path — both hold
 * the credential themselves, so a collision signs in with that same
 * credential directly (no credentialFromError needed, unlike the popup path).
 */
export async function upgradeAnonymousWithGoogleCredential(
  anon: NonNullable<Awaited<ReturnType<typeof getAuthInstance>>["currentUser"]>,
  credential: ReturnType<typeof GoogleAuthProvider.credential>
): Promise<UpgradeResult> {
  const auth = await getAuthInstance();
  const drafts = await captureAnonymousDrafts(anon.uid);
  try {
    const result = await linkWithCredential(anon, credential);
    await notifyUpgradeSignup(result.user);
    recordLastAuthMethod("google");
    return { status: "linked" };
  } catch (error) {
    if (isCollision(error)) {
      const signedIn = await signInWithCredential(auth, credential);
      await reportGuestUpgradeLifecycle("collision-signed-in");
      recordLastAuthMethod("google");
      return {
        status: "collision-signed-in",
        importable: drafts,
        destinationUid: signedIn.user.uid,
      };
    }
    throw error;
  }
}

export async function upgradeAnonymousWithGoogle(): Promise<UpgradeResult> {
  const auth = await getAuthInstance();
  const anon = auth.currentUser;
  if (!anon?.isAnonymous) throw new Error("No anonymous session to upgrade");
  const drafts = await captureAnonymousDrafts(anon.uid);

  // Native: linkWithPopup dead-ends in the WebView (Google blocks WebView
  // sign-in), so get the credential from the native SDK and link it directly.
  const { isNative } =
    await import("$lib/shared/platform/services/platform-detector");
  if (isNative()) {
    const { nativeGoogleCredential } = await import("./native-google-auth");
    const credential = await nativeGoogleCredential();
    return upgradeAnonymousWithGoogleCredential(anon, credential);
  }

  // Desktop (Tauri): same popup wall in WebView2 — get the credential from
  // the system-browser OAuth bridge and link it directly.
  const { isDesktop } = await import("$lib/shared/desktop/is-desktop");
  if (isDesktop()) {
    const { desktopGoogleCredential } =
      await import("$lib/shared/desktop/tauri-auth-bridge");
    return upgradeAnonymousWithGoogleCredential(
      anon,
      await desktopGoogleCredential()
    );
  }

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  try {
    const result = await linkWithPopup(anon, provider);
    await notifyUpgradeSignup(result.user);
    recordLastAuthMethod("google");
    return { status: "linked" };
  } catch (error) {
    if (isCollision(error)) {
      const cred = GoogleAuthProvider.credentialFromError(error as AuthError);
      if (!cred) throw error;
      const signedIn = await signInWithCredential(auth, cred);
      await reportGuestUpgradeLifecycle("collision-signed-in");
      recordLastAuthMethod("google");
      return {
        status: "collision-signed-in",
        importable: drafts,
        destinationUid: signedIn.user.uid,
      };
    }
    throw error;
  }
}

export async function upgradeAnonymousWithFacebook(): Promise<UpgradeResult> {
  const auth = await getAuthInstance();
  const anon = auth.currentUser;
  if (!anon?.isAnonymous) throw new Error("No anonymous session to upgrade");
  const drafts = await captureAnonymousDrafts(anon.uid);
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  try {
    const result = await linkWithPopup(anon, provider);
    await notifyUpgradeSignup(result.user);
    recordLastAuthMethod("facebook");
    return { status: "linked" };
  } catch (error) {
    if (isCollision(error)) {
      const cred = FacebookAuthProvider.credentialFromError(error as AuthError);
      if (!cred) throw error;
      const signedIn = await signInWithCredential(auth, cred);
      await reportGuestUpgradeLifecycle("collision-signed-in");
      recordLastAuthMethod("facebook");
      return {
        status: "collision-signed-in",
        importable: drafts,
        destinationUid: signedIn.user.uid,
      };
    }
    // The Facebook email already belongs to a DIFFERENT provider's account
    // (e.g. Google/email). We can't link onto the anon and we don't hold the
    // existing provider's credential, so stash the pending Facebook credential:
    // it auto-links once the user signs into that existing account. Rethrow so
    // the UI guides them there.
    if (
      (error as AuthError)?.code ===
      "auth/account-exists-with-different-credential"
    ) {
      const cred = FacebookAuthProvider.credentialFromError(error as AuthError);
      const email = (error as AuthError).customData?.email ?? null;
      if (cred)
        stashPendingLink(cred, typeof email === "string" ? email : null);
    }
    throw error;
  }
}

export async function upgradeAnonymousWithEmail(
  email: string,
  password: string
): Promise<UpgradeResult> {
  const auth = await getAuthInstance();
  const anon = auth.currentUser;
  if (!anon?.isAnonymous) throw new Error("No anonymous session to upgrade");
  const drafts = await captureAnonymousDrafts(anon.uid);
  const credential = EmailAuthProvider.credential(email.trim(), password);
  try {
    const result = await linkWithCredential(anon, credential);
    await notifyUpgradeSignup(result.user);
    recordLastAuthMethod("password");
    return { status: "linked" };
  } catch (error) {
    if (isCollision(error)) {
      const signedIn = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await reportGuestUpgradeLifecycle("collision-signed-in");
      recordLastAuthMethod("password");
      return {
        status: "collision-signed-in",
        importable: drafts,
        destinationUid: signedIn.user.uid,
      };
    }
    throw error;
  }
}

export interface ImportDraftsResult {
  /** Drafts written into the account (duplicates are not counted). */
  imported: number;
  /**
   * Drafts that failed for a reason a retry could still fix — offline, a
   * transient Firestore error. The caller MUST keep these: they are the only
   * remaining handle on that work.
   */
  failed: AnonymousDraft[];
}

/**
 * Copy captured anon drafts into the currently-signed-in account's library.
 *
 * Every draft is attempted. A single failure used to throw straight out of the
 * loop, abandoning the drafts behind it AND discarding the count of the ones
 * already written — so one offline write lost the rest of the guest's work with
 * no record of what had succeeded. Failures are collected and returned instead,
 * so the caller can re-offer exactly what is still outstanding. See
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md (F3).
 *
 * Visibility travels with the draft. A guest's Dexie row records its saved
 * visibility ONLY under `pendingSyncMetadata` (SequenceData has no top-level
 * visibility field), and the repository defaults an unspecified visibility to
 * "public" — so importing without it republished private guest work to the
 * community gallery the moment the importing session was a full account.
 * Private is the fallback when nothing was recorded: an import preserves work,
 * it does not make a publication decision on the user's behalf (F2).
 */
export async function importDrafts(
  drafts: AnonymousDraft[],
  /**
   * REQUIRED. An import that cannot name its destination account cannot be
   * fenced, and an unfenced import is the defect this parameter exists to
   * prevent — optionality here would let a caller silently opt out of it.
   */
  destinationUid: string
): Promise<ImportDraftsResult> {
  const repo = getLibraryRepository();
  let imported = 0;
  const failed: AnonymousDraft[] = [];
  for (const draft of drafts) {
    try {
      await repo.saveSequence(draft, {
        visibility: draft.pendingSyncMetadata?.visibility ?? "private",
        notes: draft.pendingSyncMetadata?.notes ?? "",
        // The account the user agreed to import INTO. Each write awaits, and
        // the repository resolves the uid it stamps only after its own await,
        // so without this a switch between drafts would silently redirect the
        // remainder into a different account. The repository refuses instead,
        // and the draft comes back in `failed` rather than landing somewhere
        // the user never chose.
        expectedOwnerId: destinationUid,
      });
      imported += 1;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // A duplicate is already safe in the account and empty junk can never be
      // written — neither is retryable, so neither is "failed" work to keep.
      if (code === "ALREADY_EXISTS" || code === "INVALID_DATA") continue;
      failed.push(draft);
    }
  }
  return { imported, failed };
}

/**
 * Magic-link collision: capture anon drafts, then sign into the existing
 * account via the email link. Returns the captured drafts to offer importing.
 */
export async function upgradeMagicLinkCollision(
  anonUid: string,
  email: string,
  link: string
): Promise<{ drafts: AnonymousDraft[]; destinationUid: string }> {
  const auth = await getAuthInstance();
  const drafts = await captureAnonymousDrafts(anonUid);
  const signedIn = await signInWithEmailLink(auth, email, link);
  await reportGuestUpgradeLifecycle("collision-signed-in");
  recordLastAuthMethod("magic-link");
  return { drafts, destinationUid: signedIn.user.uid };
}
