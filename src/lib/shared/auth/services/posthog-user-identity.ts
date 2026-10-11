import type { User } from "firebase/auth";
import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
import { identifyUser } from "#lib/shared/analytics/services/posthog.js";

/**
 * Keep Firebase-to-PostHog identity mapping in one place. Ordinary sign-in and
 * an anonymous user's same-UID credential link must publish the same person
 * properties even though Firebase only emits onAuthStateChanged for the first
 * path.
 */
export function identifyFirebaseUserToPostHog(
  user: User,
  role: UserRole,
  isAdmin: boolean
): void {
  identifyUser(user.uid, {
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
    role,
    createdAt: user.metadata.creationTime
      ? new Date(user.metadata.creationTime)
      : undefined,
    isPremium: role === "premium" || role === "admin",
    isTester: role === "tester" || role === "admin",
    isAdmin,
  });
}
