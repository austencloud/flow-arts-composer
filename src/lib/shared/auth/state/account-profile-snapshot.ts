/**
 * The profile fields sign-in already read for the signed-in account.
 *
 * Sign-in reads users/{uid} and userPrivateProfiles/{uid} to keep them in
 * step with the provider. Keeping what it saw lets Settings › Account draw
 * the username, pronouns and color on its first open instead of popping
 * them in after a second read of the same documents.
 */

export interface AccountProfileSnapshot {
  userId: string;
  username: string;
  pronouns: string;
  profileColor: string | null;
  googlePhotoUrl: string | null;
}

let snapshot: AccountProfileSnapshot | null = null;

export function rememberAccountProfile(profile: AccountProfileSnapshot): void {
  snapshot = { ...profile };
}

/** The remembered profile, only when it belongs to this account. */
export function knownAccountProfile(
  userId: string | null | undefined
): AccountProfileSnapshot | null {
  return userId && snapshot?.userId === userId ? { ...snapshot } : null;
}
