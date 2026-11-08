/**
 * An email signup's first profile sync runs from onAuthStateChanged, before the
 * name typed into the form has been saved to Auth, so that sync can only give a
 * placeholder handle. Run the sync again once the name is there. It never fails
 * the signup: the same sync runs on every later page load.
 */
import type { User } from "firebase/auth";

export async function syncNamedProfile(user: User): Promise<void> {
  try {
    const { getUserDocumentManager } =
      await import("#lib/shared/auth/get-user-document-manager.js");
    await getUserDocumentManager().createOrUpdateUserDocument(user);
  } catch (error) {
    console.warn("[auth] Could not sync the profile after signup:", error);
  }
}
