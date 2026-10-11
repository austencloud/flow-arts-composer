/**
 * Subscription Management
 *
 * Uses Firebase Stripe extension for checkout and subscription management.
 */

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
  type Unsubscribe,
  type Firestore,
} from "firebase/firestore";
import { auth, getFirestoreInstance } from "../../auth/firebase";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";
import type { SubscriptionInfo, SubscriptionStatus } from "./types";

const DEFAULT_SUBSCRIPTION_INFO: SubscriptionInfo = {
  status: "none",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

async function ensureCustomerExists(firestore: Firestore): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const customerRef = doc(firestore, "customers", user.uid);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists()) {
      await setDoc(customerRef, {
        email: user.email,
        uid: user.uid,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error(
      "[SubscriptionManager] Failed to ensure customer exists:",
      error
    );
  }
}

export async function createCheckoutSession(priceId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User must be signed in to subscribe");
  }

  try {
    const firestore = await getFirestoreInstance();

    await ensureCustomerExists(firestore);

    const sessionsRef = collection(
      firestore,
      `customers/${user.uid}/checkout_sessions`
    );

    const docRef = await addDoc(sessionsRef, {
      price: priceId,
      success_url: `${window.location.origin}/settings?tab=profile&subscription=success`,
      cancel_url: `${window.location.origin}/settings?tab=profile&subscription=canceled`,
      mode: "subscription",
      allow_promotion_codes: true,
    });

    return new Promise((resolve, reject) => {
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          const data = snap.data();

          if (data?.error) {
            unsubscribe();
            reject(
              new Error(data.error.message || "Checkout session failed")
            );
          }

          if (data?.url) {
            unsubscribe();
            resolve(data.url);
          }
        },
        (error) => {
          console.error(
            "[SubscriptionManager] Checkout session subscription error:",
            error
          );
          unsubscribe();
          reject(new Error("Failed to monitor checkout session"));
        }
      );

      setTimeout(() => {
        unsubscribe();
        reject(new Error("Checkout session creation timed out"));
      }, 30000);
    });
  } catch (error) {
    console.error(
      "[SubscriptionManager] Failed to create checkout session:",
      error
    );
    toast.error("Failed to start checkout. Please try again.");
    throw error;
  }
}

export async function createPortalSession(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User must be signed in to manage subscription");
  }

  try {
    const projectId =
      import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "the-kinetic-alphabet";
    const functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/ext-firestore-stripe-payments-createPortalLink`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({
        returnUrl: `${window.location.origin}/settings?tab=profile`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create portal session: ${error}`);
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error(
      "[SubscriptionManager] Failed to create portal session:",
      error
    );
    toast.error("Failed to open subscription management. Please try again.");
    throw error;
  }
}

export async function getSubscriptionInfo(): Promise<SubscriptionInfo> {
  const user = auth.currentUser;
  if (!user) {
    return DEFAULT_SUBSCRIPTION_INFO;
  }

  try {
    const firestore = await getFirestoreInstance();
    const subsRef = collection(
      firestore,
      `customers/${user.uid}/subscriptions`
    );

    const q = query(
      subsRef,
      where("status", "in", ["active", "trialing", "past_due"]),
      orderBy("created", "desc"),
      limit(1)
    );

    const snapshot = await getDocs(q);
    const firstDoc = snapshot.docs[0];

    if (snapshot.empty || !firstDoc) {
      return DEFAULT_SUBSCRIPTION_INFO;
    }

    const sub = firstDoc.data();

    return {
      status: sub.status as SubscriptionStatus,
      currentPeriodEnd: sub.current_period_end?.toDate() || null,
      cancelAtPeriodEnd: sub.cancel_at_period_end || false,
    };
  } catch (error) {
    console.error("Failed to get subscription info:", error);
    return DEFAULT_SUBSCRIPTION_INFO;
  }
}

export function onSubscriptionChange(callback: (info: SubscriptionInfo) => void): () => void {
  const user = auth.currentUser;
  if (!user) {
    return () => {};
  }

  let unsubscribe: Unsubscribe | null = null;

  getFirestoreInstance()
    .then((firestore: Firestore) => {
      const subsRef = collection(
        firestore,
        `customers/${user.uid}/subscriptions`
      );

      unsubscribe = onSnapshot(
        subsRef,
        async () => {
          const info = await getSubscriptionInfo();
          callback(info);
        },
        (error) => {
          if (isPermissionDeniedError(error)) return;
          console.error(
            "[SubscriptionManager] Subscription change listener error:",
            error
          );
          toast.error(
            "Lost connection to subscription status. Please refresh."
          );
        }
      );
    })
    .catch((error) => {
      console.error(
        "[SubscriptionManager] Failed to initialize subscription listener:",
        error
      );
      toast.error("Failed to connect to subscription status.");
    });

  return () => {
    unsubscribe?.();
  };
}
