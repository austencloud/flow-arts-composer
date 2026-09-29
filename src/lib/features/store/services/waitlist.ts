// Launch waitlist. A signed-out visitor on a Coming Soon page submits an email;
// it lands in shop_waitlist for a launch announcement later. The `source` tags
// which page captured it (shop vs. the guide rewrite, etc.) so one collection
// serves multiple announce-me forms. Rule: anyone create, admin read
// (firestore.rules) — needs a deploy before it persists.
//
// Shop pages show the form to every visitor. Firebase loads only when someone
// submits it, which keeps it off those pages' first download.
export async function joinWaitlist(
  email: string,
  source = "shop-coming-soon"
): Promise<void> {
  const { collection, addDoc, serverTimestamp } = await import(
    "firebase/firestore"
  );
  const { getFirestoreInstance } = await import("$lib/shared/auth/firebase");
  const firestore = await getFirestoreInstance();
  await addDoc(collection(firestore, "shop_waitlist"), {
    email: email.trim().toLowerCase(),
    createdAt: serverTimestamp(),
    source,
  });
}
