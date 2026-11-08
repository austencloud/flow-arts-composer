import {
  updateEmail,
  updateProfile,
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { claimUsername } from "./username-validator";
import { doc, setDoc } from "firebase/firestore";
import { getFirestoreInstance } from "../firebase";
import { retryAuthenticatedFirestoreOperation } from "./retry-authenticated-firestore-operation";

export async function changeEmail(
  user: User,
  newEmail: string,
  currentPassword: string
): Promise<{ success: true; message: string }> {
  if (!user.email) {
    throw new Error("No authenticated user");
  }

  try {
    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword
    );
    await reauthenticateWithCredential(user, credential);
    await updateEmail(user, newEmail);
    await sendEmailVerification(user);

    return {
      success: true,
      message:
        "Email updated successfully. Please check your inbox to verify your new email address.",
    };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error) {
      const firebaseError = error as { code: string; message: string };
      if (firebaseError.code === "auth/wrong-password") {
        throw new Error("Incorrect password. Please try again.");
      } else if (firebaseError.code === "auth/email-already-in-use") {
        throw new Error("This email is already in use by another account.");
      } else if (firebaseError.code === "auth/invalid-email") {
        throw new Error("Invalid email address format.");
      } else if (firebaseError.code === "auth/requires-recent-login") {
        throw new Error(
          "Please sign out and sign in again before changing your email."
        );
      } else {
        throw new Error(
          firebaseError.message || "Failed to change email. Please try again."
        );
      }
    } else {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to change email. Please try again.";
      throw new Error(message);
    }
  }
}

export async function updateDisplayName(
  user: User,
  displayName: string
): Promise<{ success: true; message: string }> {
  const valueToStore = displayName.trim() || null;

  await updateProfile(user, { displayName: valueToStore });

  await retryAuthenticatedFirestoreOperation(user, async () => {
    const firestore = await getFirestoreInstance();
    const userDocRef = doc(firestore, "users", user.uid);
    await setDoc(userDocRef, { displayName: valueToStore }, { merge: true });
  });

  return { success: true, message: "Display name updated successfully." };
}

export async function updateUsername(
  user: User,
  newUsername: string
): Promise<{ success: true; message: string }> {
  await retryAuthenticatedFirestoreOperation(user, async () => {
    // One transaction takes the new handle and releases the old one.
    await claimUsername(user.uid, newUsername.trim());
  });

  return { success: true, message: "Username updated successfully." };
}

export async function updateInstagramUsername(
  user: User,
  username: string
): Promise<{ success: true; message: string }> {
  const normalized = username.trim().replace(/^@/, "");
  const valueToStore = normalized || null;

  await retryAuthenticatedFirestoreOperation(user, async () => {
    const firestore = await getFirestoreInstance();
    const userDocRef = doc(firestore, "users", user.uid);
    await setDoc(
      userDocRef,
      { instagramUsername: valueToStore },
      { merge: true }
    );
  });

  return {
    success: true,
    message: valueToStore
      ? "Instagram username updated successfully."
      : "Instagram username cleared.",
  };
}

export async function updatePronouns(
  user: User,
  pronouns: string
): Promise<{ success: true; message: string }> {
  const trimmed = pronouns.trim();
  const valueToStore = trimmed || null;

  await retryAuthenticatedFirestoreOperation(user, async () => {
    const firestore = await getFirestoreInstance();
    const userDocRef = doc(firestore, "users", user.uid);
    await setDoc(userDocRef, { pronouns: valueToStore }, { merge: true });
  });

  return {
    success: true,
    message: valueToStore
      ? "Pronouns updated successfully."
      : "Pronouns cleared.",
  };
}
