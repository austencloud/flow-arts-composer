/**
 * MandalaLoader pool — a small bounded set of locally-generated sequences.
 *
 * - Persisted in the `generatedMandalaPool` Dexie store across sessions.
 * - Seeds itself live on first run (cold store) so there is no fixture file.
 * - Tops up during idle, dropping the oldest beyond the cap.
 * - Generation is fully client-side (GenerationOrchestrator), no network.
 */
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GeneratedMandalaEntry } from "../domain/mandala-pool-types";
import {
	buildLoaderRecipe,
	LOADER_LENGTHS,
	MANDALA_POOL_CAP,
	MANDALA_POOL_MIN,
	MANDALA_POOL_TARGET,
	MANDALA_TOPUP_BATCH,
} from "../domain/mandala-loader-config";

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Ids to evict so the pool stays at/under `cap` — oldest `generatedAt` first. */
export function selectDropIds(entries: GeneratedMandalaEntry[], cap: number): string[] {
	if (entries.length <= cap) return [];
	const byNewest = [...entries].sort((a, b) => b.generatedAt - a.generatedAt);
	return byNewest.slice(cap).map((e) => e.id);
}

/** Pick one entry using the given rng (defaults to Math.random). */
export function sampleEntry(
	entries: GeneratedMandalaEntry[],
	rng: () => number = Math.random,
): GeneratedMandalaEntry | null {
	if (entries.length === 0) return null;
	return entries[Math.min(entries.length - 1, Math.floor(rng() * entries.length))]!;
}

// ── Service (Dexie + generation wiring) ─────────────────────────────────────

const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";

let entries = $state<GeneratedMandalaEntry[]>([]);
let warming: Promise<void> | null = null;
let toppingUp = false;

function randomLength(): number {
	return LOADER_LENGTHS[Math.floor(Math.random() * LOADER_LENGTHS.length)]!;
}

/** Generate one sequence from the recipe; returns null on engine failure. */
async function generateOne(): Promise<GeneratedMandalaEntry | null> {
	try {
		const seq: SequenceData = await generationOrchestrator.generateSequence(
			buildLoaderRecipe(randomLength()),
		);
		// Plain-ify: steps may be reactive proxies / class instances — Dexie needs
		// structured-cloneable data.
		const plain = JSON.parse(JSON.stringify(seq)) as SequenceData;
		return { id: crypto.randomUUID(), sequence: plain, generatedAt: Date.now() };
	} catch {
		return null; // beam search found no path — skip, keep existing pool
	}
}

async function persist(entry: GeneratedMandalaEntry): Promise<void> {
	await db.generatedMandalaPool.put(entry);
}

async function evictOverflow(): Promise<void> {
	const dropIds = selectDropIds(entries, MANDALA_POOL_CAP);
	if (dropIds.length === 0) return;
	await db.generatedMandalaPool.bulkDelete(dropIds);
	const drop = new Set(dropIds);
	entries = entries.filter((e) => !drop.has(e.id));
}

export const mandalaPool = {
	/** Number of sequences currently in memory. */
	get count(): number {
		return entries.length;
	},

	/**
	 * Ensure the pool has at least MANDALA_POOL_MIN sequences. Reads the Dexie
	 * store; if cold, generates a starter batch live. Idempotent + de-duped.
	 */
	async ensureWarm(): Promise<void> {
		if (!isBrowser) return;
		if (warming) return warming;
		warming = (async () => {
			const stored = await db.generatedMandalaPool.toArray();
			entries = stored;
			while (entries.length < MANDALA_POOL_MIN) {
				const made = await generateOne();
				if (!made) break; // avoid an infinite loop if generation keeps failing
				await persist(made);
				entries = [...entries, made];
			}
		})();
		try {
			await warming;
		} finally {
			warming = null;
		}
	},

	/** Random sequence, or null if the pool is still cold. */
	sample(): SequenceData | null {
		return sampleEntry(entries)?.sequence ?? null;
	},

	/**
	 * Background top-up toward MANDALA_POOL_TARGET. Call after first paint, on
	 * idle. Generates one small batch per call; drops oldest beyond the cap.
	 */
	async topUp(): Promise<void> {
		if (!isBrowser || toppingUp) return;
		if (entries.length >= MANDALA_POOL_TARGET) return;
		toppingUp = true;
		try {
			for (let i = 0; i < MANDALA_TOPUP_BATCH; i++) {
				const made = await generateOne();
				if (!made) break;
				await persist(made);
				entries = [...entries, made];
			}
			await evictOverflow();
		} finally {
			toppingUp = false;
		}
	},
};
