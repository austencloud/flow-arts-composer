/**
 * Which account's per-user services must be released when Auth reports a new
 * user.
 *
 * The services auth-state starts on sign-in (settings sync, library and
 * followed-collection listeners, the media collections, the subscription
 * listener) are scoped to one uid. Firestore keeps a listener running across an
 * account change and re-runs it under the new account's token, which the rules
 * deny. Signing out through authState released them, but an account can also
 * change without that: a guest whose Google account already exists is signed
 * straight into it, and another tab can replace this tab's identity. Both went
 * from one uid to another with the old listeners still attached (2026-10-22,
 * 2026-10-24).
 *
 * Returns the uid whose services must be released, or null when they still
 * belong to the signed-in user (HMR re-fires and an in-place guest upgrade keep
 * the uid).
 */
export function userServicesToRelease(
  ownerUid: string | null,
  nextUid: string | null
): string | null {
  return ownerUid !== null && ownerUid !== nextUid ? ownerUid : null;
}
