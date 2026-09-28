/**
 * PublicSequenceHashMatcher - Matches URL-decoded sequences to public library records
 *
 * Uses the SequenceEncoder's deterministic pipe-delimited output as the canonical
 * form for hashing. The same encoder output that creates the URL also creates the
 * hash, so roundtrip identity is guaranteed: encode(decode(str)) === str.
 *
 * The SHA-256 hash is computed via Web Crypto API (native, zero dependencies).
 */

import { getPublicSequencesPath } from "$lib/shared/library/data/firestore-paths";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PublicSequenceIndex } from "$lib/shared/foundation/domain/models/public-sequence-index";
import { encodeSequence } from "$lib/shared/navigation/services/sequence-encoder";

export interface SequenceMatchResult {
	readonly matched: boolean;
	readonly publicRecord: PublicSequenceIndex | null;
}
export class PublicSequenceHashMatcher {

	async findPublicMatch(
		sequence: SequenceData
	): Promise<SequenceMatchResult> {
		const hash = await this.computeEncoderHash(sequence);
		// Firebase loads on the first lookup rather than with this module. The
		// build can pack this module into a chunk that public pages such as the
		// spinner load to start, and a Firebase import at the top put all of
		// Firebase on their first download. The import() names the Firebase
		// modules themselves: the small-chunk merge in vite.config.ts can fold a
		// small wrapper module back into the page.
		const { collection, getDocs, limit, query, where } = await import(
			"firebase/firestore"
		);
		const { getFirestoreInstance } = await import("$lib/shared/auth/firebase");
		const firestore = await getFirestoreInstance();

		const snap = await getDocs(
			query(
				collection(firestore, getPublicSequencesPath()),
				where("encoderHash", "==", hash),
				limit(1)
			)
		);

		if (snap.empty) {
			return { matched: false, publicRecord: null };
		}

		const doc = snap.docs[0]!;
		return {
			matched: true,
			publicRecord: { id: doc.id, ...doc.data() } as PublicSequenceIndex,
		};
	}

	async computeEncoderHash(sequence: SequenceData): Promise<string> {
		const pipeString = encodeSequence(sequence);
		return this.sha256(pipeString);
	}

	private async sha256(input: string): Promise<string> {
		const buffer = new TextEncoder().encode(input);
		const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
		return Array.from(new Uint8Array(hashBuffer), (b) =>
			b.toString(16).padStart(2, "0")
		).join("");
	}
}
