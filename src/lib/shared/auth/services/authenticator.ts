/**
 * Firebase authentication operations:
 * - Social auth (Google, Facebook)
 * - Email/password auth
 * - Account linking/unlinking
 * - Email verification utilities
 */

import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  unlink,
  updateProfile,
  type AuthError,
} from "firebase/auth";
import { auth, configureAuthPersistence, getAuthInstance } from "../firebase";
import {
  captureAnonymousDrafts,
  notifyUpgradeSignup,
  reportGuestUpgradeLifecycle,
  upgradeAnonymousWithEmail,
  upgradeAnonymousWithFacebook,
  upgradeAnonymousWithGoogle,
  upgradeAnonymousWithGoogleCredential,
  type UpgradeResult,
} from "./anonymous-upgrade";
import { promptAnonymousImport } from "$lib/shared/auth/state/anonymous-import-prompt.svelte";
import { clearPendingLink, stashPendingLink } from "./pending-credential-link";
import { recordLastAuthMethod } from "./last-auth-method.svelte";
import {
  authenticateWithInstagram,
  disconnectInstagramAccount,
} from "./instagram-auth";

/**
 * On an "account exists with a different credential" collision, capture the
 * pending Facebook credential so it can be linked onto the existing account the
 * next time the user signs in (see pending-credential-link.ts). Always returns
 * to the caller, which then rethrows so the UI can guide the user.
 */
function stashFacebookCollision(error: unknown): void {
  if (
    (error as AuthError)?.code !==
    "auth/account-exists-with-different-credential"
  ) {
    return;
  }
  const cred = FacebookAuthProvider.credentialFromError(error as AuthError);
  const email = (error as AuthError).customData?.email ?? null;
  if (cred) stashPendingLink(cred, typeof email === "string" ? email : null);
}

// Dev-only breadcrumb. Google's popup auth handler ships a report-only COOP
// header, so Chrome logs a browser-level "Cross-Origin-Opener-Policy policy
// would block the window.close call" warning when Firebase closes the popup.
// That warning is browser-emitted and cannot be intercepted from page JS, so
// we print an adjacent note explaining it's benign. Sign-in still completes.
// firebase-js-sdk#8541 / #8295. Fully removed in prod via tree-shaking.
export function notePopupCoop(): void {
  if (!import.meta.env.DEV) return;
  console.info(
    "%c[auth]%c Opening Google/Facebook popup — a “Cross-Origin-Opener-Policy … window.close” warning may follow. It's benign (Google's popup header) and sign-in still works.",
    "color:#7dd3fc;font-weight:bold",
    "color:inherit"
  );
}

/**
 * If the current session is an anonymous guest, route a sign-in through the
 * in-place upgrade instead, and offer the drafts back on a collision.
 *
 * Returns true when it handled the sign-in, false when there was no guest to
 * upgrade and the caller should proceed with its ordinary path. This is the one
 * place the "guest signing in must not be abandoned" rule lives for the plain
 * authenticator entry points; `signInWithGoogleCredential` already inlines the
 * same shape for the One Tap credential it holds.
 */
async function upgradeCurrentGuestWith(
  upgrade: () => Promise<UpgradeResult>
): Promise<boolean> {
  const authInstance = await getAuthInstance();
  if (!authInstance.currentUser?.isAnonymous) return false;
  const result = await upgrade();
  if (result.status === "collision-signed-in") {
    promptAnonymousImport(result.importable ?? []);
  }
  return true;
}

export async function signInWithGoogle(): Promise<void> {
  // A guest signing in here must UPGRADE, not be replaced. Plain sign-in swaps
  // the anonymous uid out and abandons everything saved under it. The signup
  // modal's callers (SocialAuthCompact, AccountPopover) branch on isAnonymous
  // before calling, so for them this is inert; the retro shell's login dialog
  // calls straight through and was losing guest work. Guarding at the owner
  // fixes every caller instead of adding a third copy of the upgrade dance.
  // upgradeAnonymousWithGoogle() does its own native/desktop/popup routing, so
  // it must come before the platform branches below. See docs/superpowers/
  // reviews/2026-09-12-guest-save-continuity-audit.md (F4).
  const guestUpgrade = await upgradeCurrentGuestWith(
    upgradeAnonymousWithGoogle
  );
  if (guestUpgrade) return;

  const { isDesktop } = await import("$lib/shared/desktop/is-desktop");
  if (isDesktop()) {
    const { signInWithDesktopOAuth } =
      await import("$lib/shared/desktop/tauri-auth-bridge");
    await signInWithDesktopOAuth();
    recordLastAuthMethod("google");
    return;
  }

  // Native (Capacitor iOS/Android): signInWithPopup falls back to the WebView
  // redirect flow, which loses sessionStorage across the auth-handler redirect
  // (Firebase "auth/missing-initial-state") and hangs forever on "Signing in…".
  // Use the native Google SDK to obtain an ID token, then sign the JS SDK in
  // with the credential. skipNativeAuth (capacitor.config) keeps the JS Firebase
  // SDK authoritative, matching every other auth path in the app.
  const { isNative } =
    await import("$lib/shared/platform/services/platform-detector");
  if (isNative()) {
    const { nativeGoogleCredential } = await import("./native-google-auth");
    await signInWithCredential(auth, await nativeGoogleCredential());
    recordLastAuthMethod("google");
    return;
  }

  // getAuthInstance(), not the static `auth`: after an HMR app rotation the
  // static export can be bound to a terminated app, which signInWithPopup
  // rejects deep inside with auth/argument-error.
  const authInstance = await getAuthInstance();
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  notePopupCoop();
  await signInWithPopup(authInstance, provider);
  recordLastAuthMethod("google");
}

/**
 * Called from One Tap / FedCM (GoogleOneTap.svelte). If a guest is already
 * signed in anonymously, this must link the credential onto that session
 * (preserving their uid + saved sequences) rather than a plain sign-in, which
 * would abandon the anonymous account. Mirrors the popup upgrade path's
 * collision handling in anonymous-upgrade.ts.
 */
export async function signInWithGoogleCredential(
  idToken: string
): Promise<void> {
  const credential = GoogleAuthProvider.credential(idToken);

  const authInstance = await getAuthInstance();
  const anon = authInstance.currentUser;
  if (anon?.isAnonymous) {
    const result = await upgradeAnonymousWithGoogleCredential(anon, credential);
    if (result.status === "collision-signed-in") {
      promptAnonymousImport(result.importable ?? []);
    }
    return;
  }

  await signInWithCredential(auth, credential);
  recordLastAuthMethod("google");
}

export async function signInWithFacebook(): Promise<void> {
  const authInstance = await getAuthInstance();
  if (authInstance.currentUser?.isAnonymous) {
    const result = await upgradeAnonymousWithFacebook();
    if (result.status === "collision-signed-in") {
      promptAnonymousImport(result.importable ?? []);
    }
    return;
  }
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  notePopupCoop();
  try {
    await signInWithPopup(authInstance, provider);
    recordLastAuthMethod("facebook");
  } catch (error) {
    // Email already owned by a Google/email account: stash the pending Facebook
    // credential so the next sign-in auto-links it, then surface the error so the
    // UI can tell the user to sign in with their existing method.
    stashFacebookCollision(error);
    throw error;
  }
}

/**
 * Instagram is not a native Firebase provider. The server verifies Meta's
 * authorization code, resolves the stable Instagram ID, and returns a custom
 * Firebase token. Anonymous drafts follow the same preserve-or-import contract
 * as Google and Facebook upgrades.
 */
export async function signInWithInstagram(): Promise<void> {
  const authInstance = await getAuthInstance();
  const anonymousUser = authInstance.currentUser;
  if (!anonymousUser?.isAnonymous) {
    throw new Error("No anonymous session is ready for Instagram sign-in");
  }

  const drafts = await captureAnonymousDrafts(anonymousUser.uid);
  const result = await authenticateWithInstagram("signin");
  if (result.collision) {
    await reportGuestUpgradeLifecycle("collision-signed-in");
    promptAnonymousImport(drafts);
  } else {
    await notifyUpgradeSignup(authInstance.currentUser ?? undefined);
  }
  recordLastAuthMethod("instagram");
}

async function setAuthPersistence(): Promise<void> {
  await configureAuthPersistence(auth);
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  await setAuthPersistence();
  // Same guest guard as signInWithGoogle. The app's own email form
  // (EmailPasswordAuth) calls firebase directly and does its own capture, so
  // this path's only callers today are the retro shells — which had none.
  const guestUpgrade = await upgradeCurrentGuestWith(() =>
    upgradeAnonymousWithEmail(email, password)
  );
  if (guestUpgrade) return;

  await signInWithEmailAndPassword(auth, email, password);
  recordLastAuthMethod("password");
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<void> {
  await setAuthPersistence();
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  if (name?.trim()) {
    await updateProfile(userCredential.user, { displayName: name.trim() });
  }

  recordLastAuthMethod("password");

  await sendEmailVerification(userCredential.user);
}

export async function signOut(): Promise<void> {
  // Drop any in-flight pending credential link — it belongs to the session
  // we're ending.
  clearPendingLink();
  await firebaseSignOut(auth);
}

export async function linkGoogleAccount(): Promise<void> {
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");

  const isAlreadyLinked = currentUser.providerData.some(
    (p) => p.providerId === "google.com"
  );
  if (isAlreadyLinked) throw new Error("Google account is already linked");

  // Native: popups dead-end in the WebView — link with a native-SDK credential.
  const { isNative } =
    await import("$lib/shared/platform/services/platform-detector");
  if (isNative()) {
    const { nativeGoogleCredential } = await import("./native-google-auth");
    await linkWithCredential(currentUser, await nativeGoogleCredential());
    return;
  }

  // Desktop (Tauri): same popup wall — link with a bridge credential.
  const { isDesktop } = await import("$lib/shared/desktop/is-desktop");
  if (isDesktop()) {
    const { desktopGoogleCredential } =
      await import("$lib/shared/desktop/tauri-auth-bridge");
    await linkWithCredential(currentUser, await desktopGoogleCredential());
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  notePopupCoop();
  await linkWithPopup(currentUser, provider);
}

export async function linkFacebookAccount(): Promise<void> {
  // getAuthInstance(), not the static `auth`: HMR-safe (see signInWithGoogle).
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");

  const isAlreadyLinked = currentUser.providerData.some(
    (p) => p.providerId === "facebook.com"
  );
  if (isAlreadyLinked) throw new Error("Facebook account is already linked");

  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  notePopupCoop();
  await linkWithPopup(currentUser, provider);
}

export async function linkInstagramAccount(): Promise<void> {
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    throw new Error("No full account is currently signed in");
  }
  await authenticateWithInstagram("link");
}

/**
 * Reauthenticate the current user via a Google popup. Used to satisfy
 * Firebase's recent-login requirement for sensitive operations (account
 * deletion) on accounts that have no password. Mirrors signInWithGoogle.
 */
export async function reauthenticateWithGoogle(): Promise<void> {
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");

  // Native: popups dead-end in the WebView — reauth with a native-SDK credential.
  const { isNative } =
    await import("$lib/shared/platform/services/platform-detector");
  if (isNative()) {
    const { nativeGoogleCredential } = await import("./native-google-auth");
    await reauthenticateWithCredential(
      currentUser,
      await nativeGoogleCredential()
    );
    return;
  }

  // Desktop (Tauri): same popup wall — reauth with a bridge credential.
  const { isDesktop } = await import("$lib/shared/desktop/is-desktop");
  if (isDesktop()) {
    const { desktopGoogleCredential } =
      await import("$lib/shared/desktop/tauri-auth-bridge");
    await reauthenticateWithCredential(
      currentUser,
      await desktopGoogleCredential()
    );
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  const linkedGoogleEmail =
    currentUser.providerData.find(
      ({ providerId }) => providerId === GoogleAuthProvider.PROVIDER_ID
    )?.email ?? currentUser.email;
  if (linkedGoogleEmail) {
    provider.setCustomParameters({ login_hint: linkedGoogleEmail });
  }
  notePopupCoop();
  await reauthenticateWithPopup(currentUser, provider);
}

/**
 * Reauthenticate the current user via a Facebook popup. See
 * reauthenticateWithGoogle.
 */
export async function reauthenticateWithFacebook(): Promise<void> {
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");

  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  notePopupCoop();
  await reauthenticateWithPopup(currentUser, provider);
}

export async function reauthenticateWithInstagram(): Promise<void> {
  const authInstance = await getAuthInstance();
  const currentUser = authInstance.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    throw new Error("No full account is currently signed in");
  }
  await authenticateWithInstagram("reauth");
}

export function getLinkedProviders(): string[] {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  return currentUser.providerData
    .map((p) => p.providerId)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

export async function unlinkProvider(providerId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");
  await unlink(currentUser, providerId);
}

export async function unlinkInstagramAccount(): Promise<void> {
  await disconnectInstagramAccount();
}

export async function linkEmailPassword(
  email: string,
  password: string
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("No user is currently signed in");

  if (!email?.trim()) throw new Error("Email is required");
  if (!password) throw new Error("Password is required");
  if (password.length < 8)
    throw new Error("Password must be at least 8 characters");

  const credential = EmailAuthProvider.credential(email.trim(), password);
  await linkWithCredential(currentUser, credential);
}

export async function resendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user is currently signed in");
  await sendEmailVerification(user);
}

export async function reloadUser(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error("No user is currently signed in");
  await user.reload();
  return !!auth.currentUser?.emailVerified;
}

export function isEmailVerified(): boolean {
  return !!auth.currentUser?.emailVerified;
}
