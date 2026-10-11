/**
 * Poi-legality verdict store — the curation state behind /test/poi-matrix.
 *
 * Source of truth is the committed JSON data file
 * (`../data/poi-legal-matrix.json`); live edits sit in $state and are
 * persisted back to the file through the dev-only save endpoint, so a
 * curation session ends as ordinary repo changes. localStorage only backs
 * up unsaved edits against accidental tab loss — it is never the source.
 *
 * Keys are `${flowerKey(blue)}|${flowerKey(red)}`. Missing key = unjudged.
 */

import { flowerKey, type Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import seed from "../data/poi-legal-matrix.json";

export type PoiVerdict = "legal" | "illegal" | "unsure";

export interface PoiLegalFile {
	version: 1;
	verdicts: Record<string, PoiVerdict>;
}

const CYCLE: (PoiVerdict | null)[] = [null, "legal", "illegal", "unsure"];
const BACKUP_KEY = "poi-legal-matrix-unsaved";

export function pairKey(left: Flower, right: Flower): string {
	return `${flowerKey(left)}|${flowerKey(right)}`;
}

function assertFileShape(data: unknown): asserts data is PoiLegalFile {
	const file = data as PoiLegalFile;
	if (file?.version !== 1 || typeof file.verdicts !== "object" || file.verdicts === null) {
		throw new Error("poi-legal-matrix.json: unrecognized shape (expected { version: 1, verdicts: {} })");
	}
}

export function createPoiLegalVerdicts() {
	assertFileShape(seed);
	const verdicts = $state<Record<string, PoiVerdict>>({ ...seed.verdicts });
	let dirty = $state<Set<string>>(new Set());

	// Restore an unsaved-backup from a lost tab, if one exists.
	if (typeof localStorage !== "undefined") {
		try {
			const raw = localStorage.getItem(BACKUP_KEY);
			if (raw) {
				const backup = JSON.parse(raw) as Record<string, PoiVerdict | null>;
				for (const [key, verdict] of Object.entries(backup)) {
					if (verdict === null) delete verdicts[key];
					else verdicts[key] = verdict;
					dirty = new Set(dirty).add(key);
				}
			}
		} catch {
			// A corrupt backup only loses the backup, never the committed file.
			localStorage.removeItem(BACKUP_KEY);
		}
	}

	function backup(): void {
		if (typeof localStorage === "undefined") return;
		const unsaved: Record<string, PoiVerdict | null> = {};
		for (const key of dirty) unsaved[key] = verdicts[key] ?? null;
		localStorage.setItem(BACKUP_KEY, JSON.stringify(unsaved));
	}

	return {
		get verdicts() {
			return verdicts;
		},
		get dirtyCount() {
			return dirty.size;
		},
		verdictFor(left: Flower, right: Flower): PoiVerdict | null {
			return verdicts[pairKey(left, right)] ?? null;
		},
		/** Click cycle: unjudged → legal → illegal → unsure → unjudged. */
		cycle(left: Flower, right: Flower): void {
			const key = pairKey(left, right);
			const current = verdicts[key] ?? null;
			const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
			if (next === null) delete verdicts[key];
			else verdicts[key] = next;
			dirty = new Set(dirty).add(key);
			backup();
		},
		judgedCount(): number {
			return Object.keys(verdicts).length;
		},
		serialize(): PoiLegalFile {
			// Stable key order keeps the committed file's diffs reviewable.
			const sorted = Object.fromEntries(
				Object.entries(verdicts).sort(([a], [b]) => a.localeCompare(b))
			);
			return { version: 1, verdicts: sorted };
		},
		async save(): Promise<{ ok: boolean; message: string }> {
			const response = await fetch("/test/poi-matrix/save", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(this.serialize()),
			});
			if (!response.ok) {
				return { ok: false, message: await response.text() };
			}
			dirty = new Set();
			if (typeof localStorage !== "undefined") localStorage.removeItem(BACKUP_KEY);
			return { ok: true, message: `saved ${this.judgedCount()} verdicts` };
		},
	};
}
