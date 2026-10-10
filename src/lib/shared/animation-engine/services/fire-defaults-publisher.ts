/**
 * Fire Defaults Publisher - Firestore Implementation
 *
 * Writes admin-tuned fire defaults to Firestore at `config/fireDefaults`.
 * Admin-only: Firestore security rules enforce isAdmin().
 */

import {
	doc,
	setDoc,
	serverTimestamp,
} from "firebase/firestore";
import { auth, getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import type { FirePhysicsParams } from "../domain/types/fire-types";
import type { PropTipConfig } from "../domain/types/prop-tip-points";

const FIRESTORE_DOC_PATH = "config/fireDefaults";

async function getDocRef() {
	const firestore = await getFirestoreInstance();
	return doc(firestore, FIRESTORE_DOC_PATH);
}

export async function publishFireDefaults(data: {
	firePoints: Record<string, PropTipConfig>;
	propPhysics: Record<string, FirePhysicsParams>;
	globalPhysics: FirePhysicsParams;
}): Promise<void> {
	const uid = auth.currentUser?.uid;
	if (!uid) {
		throw new Error("Cannot publish fire defaults: not authenticated");
	}

	const docRef = await getDocRef();

	await trackWrite(() =>
		setDoc(
			docRef,
			{
				firePoints: data.firePoints,
				propPhysics: data.propPhysics,
				globalPhysics: data.globalPhysics,
				updatedAt: serverTimestamp(),
				updatedBy: uid,
			},
			{ merge: true },
		),
	);
}
