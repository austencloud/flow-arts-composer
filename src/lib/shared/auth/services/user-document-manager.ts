/**
 * UserDocumentManager
 *
 * Manages user document creation and updates in Firestore.
 * Ensures every authenticated user has a Firestore profile document.
 */

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { type User } from "firebase/auth";
import { getAuthInstance, getFirestoreInstance } from "../firebase";
import { getProviderIds } from "./profile-picture-manager";
import {
  claimHandleFromName,
  getUsernameOwner,
  repairUsernameClaim,
} from "./username-validator";
import { formatUsername } from "../domain/models/username-validation";
import {
  handleBaseFromName,
  isPlaceholderHandle,
} from "../domain/models/handle-rule";
import { isActivityStale } from "../domain/activity-refresh";
import { retryAuthenticatedFirestoreOperation } from "./retry-authenticated-firestore-operation";
import { runProfileSyncExclusively } from "./profile-sync-lock";
import { isPermissionDeniedError } from "../utils/is-permission-denied-error";
import { rememberAccountProfile } from "../state/account-profile-snapshot";

import {
  newPublicProfile,
  photoChanges,
} from "../domain/public-profile-payload";
import { profileVersionFor } from "#lib/shared/community/domain/models/public-profile-contract.js";
import {
  captureWhenReady,
  getCurrentPostHogSessionId,
} from "#lib/shared/analytics/services/posthog.js";
import { reportErrorTelemetry } from "#lib/shared/error/services/error-telemetry-reporter.js";
import { refreshPublicSequenceOwnerProfile } from "#lib/shared/library/services/public-sequence-persister.js";

/**
 * Capitalize each word in a name (e.g., "brendan freaney" -> "Brendan Freaney")
 * Handles common edge cases like hyphenated names and apostrophes.
 */
function capitalizeName(name: string): string {
  if (!name) return name;

  return name
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // Handle hyphenated names (e.g., "mary-jane" -> "Mary-Jane")
      if (word.includes("-")) {
        return word
          .split("-")
          .map(
            (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          )
          .join("-");
      }
      // Handle names with apostrophes (e.g., "o'brien" -> "O'Brien")
      if (word.includes("'")) {
        const parts = word.split("'");
        return parts
          .map(
            (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          )
          .join("'");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

interface ProfileSyncStep {
  action: string;
  message: string;
  path?: string;
}

export class UserDocumentManager {
  constructor() {}

  /**
   * Create or update a user document in Firestore.
   *
   * This ensures every authenticated user has a corresponding Firestore document
   * that can be displayed in the users browse panel.
   *
   * Creates new document with initial fields if doesn't exist.
   * Updates an existing document only where it differs from the latest auth data.
   */
  async createOrUpdateUserDocument(user: User): Promise<void> {
    return runProfileSyncExclusively(user.uid, async () => {
      // Queued behind a sync that ran while the account changed: this account
      // is no longer the one Firestore authenticates, so every owner-scoped
      // read below would be denied.
      const auth = await getAuthInstance();
      if (auth.currentUser && auth.currentUser.uid !== user.uid) return;
      await this.syncUserDocument(user);
    });
  }

  private async syncUserDocument(user: User): Promise<void> {
    let currentStep: ProfileSyncStep = {
      action: "initialize-profile-sync",
      message: "Could not initialize the signed-in user's profile sync",
    };

    try {
      // Dev guard: localhost writes straight to production Firestore (no
      // emulator wired). Skip minting a public profile doc for anonymous guest
      // sessions during development so dev reloads don't pollute the live
      // `users` collection. Real (linked) accounts still get their doc in dev.
      if (user.isAnonymous && !import.meta.env.PROD) return;

      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, `users/${user.uid}`);
      const privateProfileRef = doc(firestore, "userPrivateProfiles", user.uid);
      const mergePrivateProfile = async (
        profile: Record<string, unknown>
      ): Promise<void> => {
        currentStep = {
          action: "set-private-profile",
          message: "Could not update the signed-in user's private profile",
          path: `userPrivateProfiles/${user.uid}`,
        };
        await retryAuthenticatedFirestoreOperation(user, () =>
          setDoc(privateProfileRef, profile, { merge: true })
        );
      };

      currentStep = {
        action: "get",
        message: "Could not read the signed-in user's profile document",
        path: `users/${user.uid}`,
      };
      const userDoc = await retryAuthenticatedFirestoreOperation(user, () =>
        getDoc(userDocRef)
      );

      // This event is the denominator for the autonomous production review.
      // It proves the exact owner-scoped read ran under deployed rules; generic
      // pageviews cannot distinguish real exposure from an untouched code path.
      captureWhenReady("profile_document_read_completed", {
        telemetry_schema_version: 2,
        telemetry_path_shape: "users/{id}",
        profile_document_exists: userDoc.exists(),
      });

      currentStep = {
        action: "prepare-profile-sync",
        message: "Could not prepare the signed-in user's profile sync",
      };

      // Determine display name and auto-capitalize.
      //
      // providerData comes BEFORE the email local-part: Google sign-ins
      // routinely land with an empty top-level displayName and the real name
      // only on the provider record. Reading the email first is what stored two
      // real people as "Jasminehartart" and "Hairbykevin127".
      // Same order as provisionUserProfile.ts server-side — keep them in step.
      const providerName = user.providerData.find(
        (p) => p?.displayName
      )?.displayName;
      //
      // Never the email: a name is public, and the part before the @ is close
      // enough to the address to count as publishing it.
      const authName = user.displayName || providerName || null;
      const rawName =
        authName || (user.isAnonymous ? "Anonymous User" : "Creator");
      // The rules take 1 to 50 printable characters; a provider name past
      // that must not stop the account from being made.
      const displayName =
        capitalizeName(rawName)
          .replace(/[\u0000-\u001F\u007F]+/g, " ")
          .trim()
          .slice(0, 50)
          .trim() || "Creator";
      /** Did Auth actually give us a name? */
      const hasRealAuthName = Boolean(authName);

      // Get provider IDs for reliable profile picture URLs
      const providerIds = getProviderIds(user);
      const postHogSessionId = await getCurrentPostHogSessionId();

      // Capture the Google provider's photo URL separately so we can
      // always offer "Use Google Photo" even after the user switches to
      // a generated avatar (which overwrites user.photoURL).
      const googleProvider = user.providerData.find(
        (p) => p.providerId === "google.com"
      );
      const googlePhotoURL = googleProvider?.photoURL || null;

      if (!userDoc.exists()) {
        // NEW USER. A full account takes its handle and its profile in one write.
        // A guest gets no handle: it could not reserve one, and it gets one from
        // its name when it upgrades (the existing-user branch below).
        // NOTE: Email deliberately NOT stored here - user documents are publicly readable
        // Email is available via Firebase Auth for the user themselves
        currentStep = {
          action: "create-public-profile",
          message: "Could not create the signed-in user's public profile",
          path: `users/${user.uid}`,
        };
        const newProfile = newPublicProfile(user, displayName, serverTimestamp);
        await retryAuthenticatedFirestoreOperation(user, async () => {
          if (user.isAnonymous) await setDoc(userDocRef, newProfile);
          else await claimHandleFromName(user.uid, authName, newProfile);
        });

        await mergePrivateProfile({
          email: user.email ?? null,
          googleId: providerIds.googleId || null,
          googlePhotoURL,
          facebookId: providerIds.facebookId || null,
          ...(postHogSessionId
            ? {
                postHogSessionId,
                postHogSessionCapturedAt: serverTimestamp(),
              }
            : {}),
        });

        // Admin signup notifications are handled server-side by the
        // pulseUserActivity cloud function (fires on this doc create).
        // The old client-side notify call was always denied by Firestore
        // rules — a non-admin can't write another user's notifications —
        // and silently failed for every signup since launch.
      } else {
        // EXISTING USER: this runs on every signed-in page load, so it writes
        // only what differs from the stored public and private profiles and
        // never the username. Rewriting the profile each time billed a write
        // per page view, woke the pulseUserActivity trigger, and made
        // updatedAt mean "last page view" instead of "last profile change".
        const existingData = userDoc.data();
        const existingUsername = existingData?.username;

        // NOTE: Email deliberately NOT stored - user documents are publicly readable
        const profileChanges: Record<string, unknown> = {};

        // Keep the guest flag current. onAuthStateChanged doesn't reliably
        // fire on in-place link, so anonymous-upgrade.ts also clears this
        // explicitly — this just keeps it correct on any later auth refresh.
        if (existingData?.isAnonymous !== user.isAnonymous) {
          profileChanges.isAnonymous = user.isAnonymous;
        }
        // A guest's doc is unlisted and an upgrade makes it listed, in the same
        // write. Also moves guest docs written listed before this rule (version
        // 2) back out of the directory on their next visit. Only these two
        // versions are touched; a legacy doc with no version is the admin
        // migration's business.
        const storedVersion = existingData?.publicProfileVersion;
        const wantedVersion = profileVersionFor(user.isAnonymous);
        if (
          (storedVersion === 0 || storedVersion === 2) &&
          storedVersion !== wantedVersion
        ) {
          profileChanges.publicProfileVersion = wantedVersion;
        }

        // Same rule the avatar below follows: only overwrite the stored name
        // when Auth actually has one. This branch runs on EVERY sign-in, so
        // writing the email-derived fallback unconditionally re-mangled a
        // repaired name (and clobbered a name the user had set themselves) the
        // next time they logged in.
        if (
          (hasRealAuthName || !existingData?.displayName) &&
          existingData?.displayName !== displayName
        ) {
          profileChanges.displayName = displayName;
        }

        // Only overwrite avatar fields when Auth provides a real URL.
        // Prevents nulling out a generated or custom avatar on re-login.
        // A person with no photo stores null; avatars draw the generated
        // picture at render time (see public-profile-payload.ts).
        Object.assign(profileChanges, photoChanges(user.photoURL, existingData));

        // A full account with no real handle gets one from its name. That is a
        // guest upgrading (an old guest doc may hold a uid fragment nobody ever
        // reserved) or a nameless account whose name has now arrived: an email
        // signup's first sync runs before its name is saved.
        const needsHandle =
          !user.isAnonymous &&
          (!existingUsername ||
            existingData?.isAnonymous === true ||
            (isPlaceholderHandle(existingUsername) &&
              handleBaseFromName(authName) !== null));

        // Add usernameLowercase if missing (backfill for existing users)
        if (existingUsername && !existingData?.usernameLowercase) {
          profileChanges.usernameLowercase = formatUsername(existingUsername);
        }

        // Every users/{uid} write stamps lastActivityDate. With nothing else
        // to write, the date alone is refreshed once it is an hour old.
        const hasProfileChanges = Object.keys(profileChanges).length > 0;
        const writesPublicProfile =
          hasProfileChanges || isActivityStale(existingData?.lastActivityDate);

        currentStep = {
          action: "get-private-profile",
          message: "Could not read the signed-in user's private profile",
          path: `userPrivateProfiles/${user.uid}`,
        };
        const privateProfileDoc = await retryAuthenticatedFirestoreOperation(
          user,
          () => getDoc(privateProfileRef)
        );
        const storedPrivateProfile = privateProfileDoc.exists()
          ? privateProfileDoc.data()
          : undefined;

        const accountProfile = {
          userId: user.uid,
          username: existingUsername || "",
          instagramUsername: existingData?.instagramUsername || "",
          pronouns: existingData?.pronouns || "",
          profileColor: existingData?.profileColor || null,
          googlePhotoUrl:
            googlePhotoURL ?? storedPrivateProfile?.googlePhotoURL ?? null,
        };
        rememberAccountProfile(accountProfile);

        // Only update googlePhotoURL if we have a fresh one from the provider.
        // Don't null it out - the provider's photoURL becomes null after the
        // user switches to a generated avatar, but we want to keep the
        // original so "Use Google Photo" always works.
        const latestPrivateProfile: Record<string, unknown> = {
          email: user.email ?? null,
          googleId: providerIds.googleId || null,
          facebookId: providerIds.facebookId || null,
          ...(googlePhotoURL ? { googlePhotoURL } : {}),
        };
        const privateProfileChanges: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(latestPrivateProfile)) {
          if ((storedPrivateProfile?.[field] ?? null) !== value) {
            privateProfileChanges[field] = value;
          }
        }

        // Pulse links a session replay to its signup and "is back" alerts
        // only when postHogSessionCapturedAt is within five minutes of
        // lastActivityDate, and it reads this private profile as soon as the
        // users/{uid} write below fires it. So the session is saved just
        // before that write, and not at all when it is skipped.
        if (writesPublicProfile && postHogSessionId) {
          privateProfileChanges.postHogSessionId = postHogSessionId;
          privateProfileChanges.postHogSessionCapturedAt = serverTimestamp();
        }
        if (Object.keys(privateProfileChanges).length > 0) {
          await mergePrivateProfile(privateProfileChanges);
        }

        if (needsHandle) {
          // In one write with the guest flag, so a failure leaves the account
          // a guest that tries again, not a listed person with no handle.
          currentStep = {
            action: "claim-username",
            message: "Could not claim the signed-in user's username",
            path: "usernames/{handle}",
          };
          const handle = await retryAuthenticatedFirestoreOperation(user, () =>
            claimHandleFromName(
              user.uid,
              authName,
              {
                ...profileChanges,
                updatedAt: serverTimestamp(),
                lastActivityDate: serverTimestamp(),
              },
              // Whatever it held before is released, if this person owns it.
              existingUsername || null
            )
          );
          rememberAccountProfile({ ...accountProfile, username: handle });
        } else if (writesPublicProfile) {
          currentStep = {
            action: "update-public-profile",
            message: "Could not update the signed-in user's public profile",
            path: `users/${user.uid}`,
          };
          await retryAuthenticatedFirestoreOperation(user, () =>
            setDoc(
              userDocRef,
              {
                ...profileChanges,
                ...(hasProfileChanges ? { updatedAt: serverTimestamp() } : {}),
                lastActivityDate: serverTimestamp(),
              },
              { merge: true }
            )
          );
        }

        // Repair accounts whose parent profile was created while an anonymous
        // token was still being replaced and whose first username claim was
        // consequently denied. A plain read comes first so an intact claim
        // costs one read per page load: even a transaction that changes
        // nothing sends a commit.
        if (existingUsername && !user.isAnonymous && !needsHandle) {
          const usernameClaimPath = `usernames/${formatUsername(existingUsername)}`;
          currentStep = {
            action: "get-username-claim",
            message: "Could not read the signed-in user's username claim",
            path: usernameClaimPath,
          };
          const claimOwner = await retryAuthenticatedFirestoreOperation(
            user,
            () => getUsernameOwner(existingUsername)
          );
          if (claimOwner !== user.uid) {
            currentStep = {
              action: "claim-username",
              message: "Could not claim the signed-in user's username",
              path: usernameClaimPath,
            };
            await retryAuthenticatedFirestoreOperation(user, () =>
              repairUsernameClaim(user.uid, existingUsername)
            );
          }
        }

        const projectedDisplayName =
          typeof profileChanges.displayName === "string"
            ? profileChanges.displayName
            : typeof existingData?.displayName === "string" &&
                existingData.displayName.length > 0
              ? existingData.displayName
              : "Unknown";
        const projectedAvatarUrl =
          typeof profileChanges.photoURL === "string"
            ? profileChanges.photoURL
            : typeof existingData?.photoURL === "string"
              ? existingData.photoURL
              : undefined;
        const profileProjectionChanged =
          projectedDisplayName !== existingData?.displayName ||
          projectedAvatarUrl !== existingData?.photoURL;
        const hasSavedSequences =
          typeof existingData?.sequenceCount === "number" &&
          existingData.sequenceCount > 0;

        // A previous profile write may have landed while its projection fan-out
        // failed offline. Sequence owners therefore run the idempotent check on
        // later sign-ins too; current mirrors are filtered before transactions.
        if (profileProjectionChanged || hasSavedSequences) {
          currentStep = {
            action: "refresh-public-sequence-owner-profile",
            message:
              "Could not refresh the signed-in user's public sequence profile",
            path: "publicSequences/{sequenceId}",
          };
          await retryAuthenticatedFirestoreOperation(user, () =>
            refreshPublicSequenceOwnerProfile(firestore, user.uid, {
              displayName: projectedDisplayName,
              ...(projectedAvatarUrl !== undefined && {
                avatarUrl: projectedAvatarUrl,
              }),
            })
          );
        }
      }
    } catch (error) {
      // The account changed while this sync ran (a guest signed into an
      // existing account, or another tab replaced the identity). Its denial
      // belongs to the departed uid; the new account runs its own sync.
      const auth = await getAuthInstance();
      if (
        isPermissionDeniedError(error) &&
        auth.currentUser?.uid !== user.uid
      ) {
        return;
      }
      const reportedError =
        error instanceof Error ? error : new Error(String(error));
      await reportErrorTelemetry({
        message: currentStep.message,
        error: reportedError,
        context: {
          module: "firestore",
          action: currentStep.action,
          ...(currentStep.path
            ? { additionalData: { path: currentStep.path } }
            : {}),
        },
      });
      console.error(`[UserDocumentManager] ${currentStep.message}:`, error);
      // Don't throw - this shouldn't block authentication
    }
  }

  /**
   * Update only the photoURL field for a user's Firestore document.
   * Used when user changes their profile picture without a full auth refresh.
   */
  async updatePhotoURL(user: User, photoURL: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, `users/${user.uid}`);

      await retryAuthenticatedFirestoreOperation(user, () =>
        setDoc(
          userDocRef,
          {
            photoURL,
            avatar: photoURL,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );

      const profileSnapshot = await retryAuthenticatedFirestoreOperation(
        user,
        () => getDoc(userDocRef)
      );
      const storedDisplayName = profileSnapshot.data()?.displayName;
      await retryAuthenticatedFirestoreOperation(user, () =>
        refreshPublicSequenceOwnerProfile(firestore, user.uid, {
          displayName:
            typeof storedDisplayName === "string" &&
            storedDisplayName.length > 0
              ? storedDisplayName
              : user.displayName?.trim() || "Unknown",
          avatarUrl: photoURL,
        })
      );
    } catch (error) {
      console.error(
        `❌ [UserDocumentManager] Failed to update photoURL:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update the user's profile accent color in Firestore.
   * This color appears as the ring around the avatar and on profile cards.
   */
  /** "Show me in Creators". Throws so the switch can put itself back. */
  async setHiddenFromCreators(userId: string, hidden: boolean): Promise<void> {
    const firestore = await getFirestoreInstance();
    await setDoc(
      doc(firestore, `users/${userId}`),
      { isHidden: hidden, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async updateProfileColor(userId: string, color: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const userDocRef = doc(firestore, `users/${userId}`);

      await setDoc(
        userDocRef,
        {
          profileColor: color,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error(
        `❌ [UserDocumentManager] Failed to update profileColor:`,
        error
      );
    }
  }
}
