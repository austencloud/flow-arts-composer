// Walks catalog decks, computes mandala fingerprints, writes static/data/mandala-index.json.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/build-mandala-index.ts [deckIdSubstring]
import admin from "firebase-admin";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import {
	shapeKey,
	orbitKey,
	colorSignature,
} from "#lib/shared/mandala/services/mandala-fingerprint.js";
import type {
	IndexedRef,
	MandalaIndex,
} from "#lib/shared/mandala/services/mandala-index-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const serviceAccount = JSON.parse(
	readFileSync(resolve(__dirname, "../serviceAccountKey.json"), "utf8"),
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Stream a collection page-by-page, invoking cb per doc. Never retains the full
// doc set — keeps memory O(page) instead of O(deck) so large decks (22k+ seqs)
// don't blow the V8 heap.
async function forEachDoc(
	collectionPath: string,
	cb: (doc: FirebaseFirestore.QueryDocumentSnapshot) => void,
): Promise<number> {
	const PAGE = 500;
	let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
	let more = true;
	let count = 0;
	while (more) {
		let q = db.collection(collectionPath).orderBy("__name__").limit(PAGE);
		if (last) q = q.startAfter(last);
		const snap = await q.get();
		for (const doc of snap.docs) {
			cb(doc);
			count++;
		}
		last = snap.docs[snap.docs.length - 1] ?? null;
		more = snap.docs.length === PAGE;
	}
	return count;
}

async function main() {
	const filter = process.argv[2];
	const decksSnap = await db.collection("catalogs").get();
	// Index EVERY deck with a sequences subcollection — not just collection==="LOOPs".
	// The TnD turn decks (collection=undefined / "TnD") carry the high-turn dense
	// mandalas; gating on "LOOPs" silently scanned 8 of 107 decks (all 0-turn).
	const decks = decksSnap.docs
		.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
		.filter((d) => !filter || d.id.includes(filter));

	console.log(`Indexing ${decks.length} decks...`);

	// Stream fingerprints straight into the index; never hold MandalaPaths beyond
	// the current sequence. byOrbit accumulates as Sets, serialized to arrays at end.
	const byShape: Record<string, IndexedRef[]> = {};
	const byOrbit: Record<string, Set<string>> = {};
	let indexed = 0;

	for (const deck of decks) {
		const before = Object.keys(byShape).length;
		const seen = await forEachDoc(`catalogs/${deck.id}/sequences`, (doc) => {
			const seq = doc.data() as { steps?: unknown[]; word?: string };
			if (!seq.steps || seq.steps.length === 0) return;
			try {
				const paths = calculate(seq.steps as never, "staff", "staff");
				if (paths.left.length === 0 && paths.right.length === 0 && paths.purple.length === 0) return;
				const sk = shapeKey(paths);
				const ok = orbitKey(paths);
				const ref: IndexedRef = {
					seqId: doc.id,
					word: seq.word ?? doc.id,
					deck: deck.id,
					colorSig: colorSignature(paths),
					orbitKey: ok,
				};
				(byShape[sk] ??= []).push(ref);
				(byOrbit[ok] ??= new Set<string>()).add(sk);
				indexed++;
			} catch {
				/* skip unrenderable */
			}
		});
		const newGlyphs = Object.keys(byShape).length - before;
		console.log(`  ${deck.id}: ${seen} seqs (+${newGlyphs} new glyphs)`);
	}

	const byOrbitOut: Record<string, string[]> = {};
	for (const [ok, shapes] of Object.entries(byOrbit)) byOrbitOut[ok] = [...shapes];
	const index: MandalaIndex = { version: 1, byShape, byOrbit: byOrbitOut };

	console.log(
		`${indexed} sequences → ${Object.keys(byShape).length} distinct glyphs, ${Object.keys(byOrbitOut).length} orbits`,
	);

	const outPath = resolve(__dirname, "../static/data/mandala-index.json");
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(index));
	console.log(`Wrote ${outPath}`);
	process.exit(0);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
