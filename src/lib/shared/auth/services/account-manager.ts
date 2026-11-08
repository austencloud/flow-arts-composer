import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";
import { doc, deleteDoc, setDoc } from "firebase/firestore";
import {
  auth,
  getFirestoreInstance,
  shutdownFirestoreForCacheClear,
} from "../firebase";
import { nuclearCacheClear } from "../utils/nuclear-cache-clear";
import {
  reauthenticateWithGoogle,
  reauthenticateWithFacebook,
  reauthenticateWithInstagram,
} from "./authenticator";
import { authState } from "../state/auth-state.svelte";
import type { HapticFeedback } from "../../application/services/haptic-feedback";

/**
 * How the user proves identity before deleting their account. OAuth methods
 * use a reauthentication popup (no password); `password` is for accounts whose
 * only provider is email/password.
 */
export type DeleteReauth =
  | { method: "password"; password: string }
  | { method: "google" }
  | { method: "facebook" }
  | { method: "instagram" };

/**
 * Manages user account operations using Firebase client SDK directly.
 * No server routes needed - all operations go through Firebase Auth
 * and Firestore client libraries, which work with adapter-static.
 */
export class AccountManager {
  constructor(private haptics: HapticFeedback) {}

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    this.haptics.trigger("selection");

    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    if (!currentPassword) {
      throw new Error("Current password is required");
    }

    const user = auth.currentUser;
    if (!user?.email) {
      throw new Error("No authenticated user found");
    }

    // Re-authenticate to prove identity
    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword
    );

    try {
      await reauthenticateWithCredential(user, credential);
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e && "code" in e
          ? (e as { code: string }).code
          : "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        throw new Error("WRONG_PASSWORD");
      }
      throw new Error("WRONG_PASSWORD");
    }

    // Update password via Firebase client SDK
    await updatePassword(user, newPassword);
    this.haptics.trigger("success");
  }

  async deleteAccount(reauth: DeleteReauth, reason?: string): Promise<void> {
    this.haptics.trigger("warning");

    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Admin accounts cannot be self-deleted. Deleting an admin removes both the
    // Auth custom claim and the Firestore role doc — if they're the last admin
    // that leaves zero admins with no in-app recovery. Read the authoritative
    // token claim (same source the admin routes trust) and refuse before any
    // reauth or deletion. This is the real lock; the UI also hides the path.
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult.claims.admin === true) {
      throw new Error("Admin accounts can't be deleted from the app.");
    }

    // Re-authenticate to satisfy Firebase's recent-login requirement, using the
    // method the user actually has. OAuth accounts (Google/Facebook/Instagram,
    // magic-link
    // upgrades) have no password — a popup reauth is the only path for them.
    try {
      if (reauth.method === "google") {
        await reauthenticateWithGoogle();
      } else if (reauth.method === "facebook") {
        await reauthenticateWithFacebook();
      } else if (reauth.method === "instagram") {
        await reauthenticateWithInstagram();
      } else {
        if (!user.email) {
          throw new Error("No authenticated user found");
        }
        if (!reauth.password) {
          throw new Error("Password is required to delete your account");
        }
        const credential = EmailAuthProvider.credential(
          user.email,
          reauth.password
        );
        await reauthenticateWithCredential(user, credential);
      }
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e && "code" in e
          ? (e as { code: string }).code
          : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "instagram/cancelled"
      ) {
        throw new Error("Reauthentication cancelled");
      }
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        throw new Error("Incorrect password");
      }
      if (code === "auth/user-mismatch" && reauth.method === "google") {
        const linkedGoogleEmail =
          user.providerData.find(
            ({ providerId }) => providerId === "google.com"
          )?.email ?? user.email;
        const signInHint = linkedGoogleEmail
          ? ` Sign in as ${linkedGoogleEmail}.`
          : "";
        throw new Error(
          `That Google account doesn't match this Flow Arts account.${signInHint}`
        );
      }
      // Surface a thrown precondition (missing email/password) as-is.
      if (e instanceof Error && !code) {
        throw e;
      }
      if (e instanceof Error && code.startsWith("instagram/")) {
        throw e;
      }
      throw new Error("Authentication failed");
    }

    // Instagram reauthentication signs in with a fresh Firebase custom token,
    // which can replace the User object. The uid must remain identical, and all
    // destructive work below uses the new current object.
    const reauthenticatedUser = auth.currentUser;
    if (!reauthenticatedUser || reauthenticatedUser.uid !== user.uid) {
      throw new Error("Authentication failed");
    }

    // Optional exit reason for the deletion tombstone, written BEFORE auth
    // deletion while the user is still authed (firestore.rules only allows
    // the owner to write it). The Auth onDelete trigger merge-writes the
    // identity fields over this doc afterward, so the reason survives.
    // Best-effort — a rules failure here must never block account deletion.
    const trimmedReason = reason?.trim();
    if (trimmedReason) {
      try {
        const firestore = await getFirestoreInstance();
        await setDoc(
          doc(firestore, "accountDeletions", user.uid),
          { uid: user.uid, reason: trimmedReason.slice(0, 500) },
          { merge: true }
        );
      } catch {
        console.warn("Could not save account deletion reason");
      }
    }

    // Best-effort cleanup: delete the user's Firestore document. The Auth
    // onDelete trigger is the real cleanup (recursively removes users/{uid}
    // and all subcollections) — this is belt and suspenders.
    try {
      const firestore = await getFirestoreInstance();
      // The map pin first: once the profile is gone, a pin left behind points
      // at nobody until the trigger catches up.
      await deleteDoc(
        doc(firestore, "userLocations", reauthenticatedUser.uid)
      ).catch(() => console.warn("Could not delete map location"));
      const userDocRef = doc(firestore, "users", reauthenticatedUser.uid);
      await deleteDoc(userDocRef);
    } catch {
      // Non-fatal - the auth account is the important deletion
      console.warn("Could not delete user Firestore document");
    }

    // Delete the Firebase Auth account
    await deleteUser(reauthenticatedUser);

    // The "last used" sign-in hint points at an account that no longer exists.
    const { clearLastAuthMethod } = await import("./last-auth-method.svelte");
    clearLastAuthMethod();

    // Sign out through the app wrapper (not the raw Firebase SDK signOut) so
    // onboarding cloud-sync state (app-entry, first-run, password-onboarding)
    // gets reset the same way a normal sign-out resets it - otherwise the
    // next account signed in on this device could inherit this account's
    // already-resolved sync flags. Belt-and-suspenders: deleteUser() above
    // should already invalidate the session.
    await authState.signOut().catch(() => {});

    this.haptics.trigger("success");
  }

  async clearCache(): Promise<void> {
    this.haptics.trigger("selection");

    try {
      // Stop owner-scoped listeners and invalidate Auth before terminating
      // Firestore. Deleting live SDK databases caused snapshot listeners to
      // throw a burst of "Firestore shutting down" exceptions.
      await authState.signOut().catch(() => {});
      await shutdownFirestoreForCacheClear().catch(() => {});
      await nuclearCacheClear();
      setTimeout(() => {
        window.location.reload();
      }, 0);
    } catch (error) {
      console.error("Failed to clear cache:", error);
      this.haptics.trigger("error");
      throw new Error("Failed to clear cache. Please try again.");
    }
  }
}
