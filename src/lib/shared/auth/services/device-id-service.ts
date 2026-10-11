import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirestoreInstance } from "../firebase";
import { getDeviceId } from "#lib/shared/foundation/services/device-id.js";
import { isActivityStale } from "../domain/activity-refresh";

// The device id itself now lives in foundation/services/device-id.ts, which has
// no Firebase imports — analytics reads it at PostHog init, and pulling
// firebase/firestore into that graph is not an option. Re-exported here so the
// existing call sites keep importing it from where they always have.
export { getDeviceId };

/**
 * Link this browser to the signed-in account. This runs on every signed-in
 * page load, so it reads the device document first: firstSeen is written only
 * when the document is created (merging it on every visit overwrote it with
 * the latest visit), and afterwards the document is written only when the
 * browser's user agent changed or lastSeen is an hour old.
 */
export async function linkDeviceToUser(userId: string): Promise<void> {
  const deviceId = getDeviceId();
  try {
    const firestore = await getFirestoreInstance();
    const ref = doc(firestore, "users", userId, "devices", deviceId);
    const stored = await getDoc(ref);
    const userAgent = navigator.userAgent;

    if (!stored.exists()) {
      await setDoc(ref, {
        deviceId,
        firstSeen: serverTimestamp(),
        lastSeen: serverTimestamp(),
        userAgent,
      });
      return;
    }

    const storedDevice = stored.data();
    const userAgentChanged = storedDevice.userAgent !== userAgent;
    if (!userAgentChanged && !isActivityStale(storedDevice.lastSeen)) return;

    await setDoc(
      ref,
      {
        ...(userAgentChanged ? { userAgent } : {}),
        lastSeen: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("[device-id-service] Failed to link device to user:", error);
    throw error;
  }
}
