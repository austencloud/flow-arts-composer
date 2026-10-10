import { db } from "#lib/shared/persistence/database/tka-database.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PublicSequenceIndex } from "#lib/shared/foundation/domain/models/public-sequence-index.js";
import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";
import { getGalleryOfflineCache } from "#lib/shared/offline/get-gallery-offline-cache.js";

const BUNDLE_VERSION_KEY = "desktop-bundle-version";
const GALLERY_BUNDLE_KEY = "desktop-gallery-bundle";
const GALLERY_BUNDLE_RESOURCE = "data/gallery/public-sequences.json";

interface DeckManifest {
	decks: Array<{
		deckId: string;
		deckName: string;
		filename: string;
		count: number;
	}>;
	totalSequences: number;
	exportedAt: string;
}

interface DeckBundle {
	deckId: string;
	deckName: string;
	sequences: Array<Record<string, unknown>>;
}

/** Shape written by scripts/export-gallery-bundle.cjs. */
export interface GalleryBundle {
	exportedAt: string;
	count: number;
	sequences: PublicSequenceIndex[];
}

export interface GallerySeedDependencies {
	readBundle: () => Promise<GalleryBundle | null>;
	persist: (docs: PublicSequenceIndex[]) => Promise<void>;
	lastSyncedAt: () => Promise<number | null>;
	readMarker: () => Promise<string | null>;
	writeMarker: (exportedAt: string) => Promise<void>;
}

/**
 * Decide whether the bundled public index should replace the IndexedDB
 * gallery cache. Separated from Dexie/Tauri so the policy is unit-testable.
 *
 * - The same bundle is never applied twice (marker).
 * - A cache the app synced from Firestore AFTER the bundle was exported is
 *   fresher than the bundle and is left alone.
 * - Otherwise the bundle wins: a first launch, or an update carrying a newer
 *   export than the last sync.
 */
export async function seedGalleryFromBundle(
	deps: GallerySeedDependencies
): Promise<"seeded" | "skipped"> {
	const bundle = await deps.readBundle();
	if (!bundle || !Array.isArray(bundle.sequences) || bundle.sequences.length === 0) {
		return "skipped";
	}
	if ((await deps.readMarker()) === bundle.exportedAt) return "skipped";

	const exportedAt = Date.parse(bundle.exportedAt);
	const lastSyncedAt = await deps.lastSyncedAt();
	const cacheIsFresher =
		lastSyncedAt !== null && Number.isFinite(exportedAt) && lastSyncedAt > exportedAt;
	if (!cacheIsFresher) {
		await deps.persist(bundle.sequences);
	}
	await deps.writeMarker(bundle.exportedAt);
	return cacheIsFresher ? "skipped" : "seeded";
}

export class DesktopDataSeeder {
	async seedIfNeeded(appVersion: string): Promise<void> {
		await Promise.all([this.seedDecksIfNeeded(appVersion), this.seedGallery()]);
	}

	private async seedDecksIfNeeded(appVersion: string): Promise<void> {
		const existing = await db.settings.get(BUNDLE_VERSION_KEY);
		if (existing && (existing as unknown as Record<string, unknown>).bundleVersion === appVersion) {
			return;
		}

		await this.seed(appVersion);
	}

	/**
	 * Pre-seed the gallery's offline cache from the public index exported at
	 * build time, so the first Browse open on a fresh install (or with no
	 * network) reads the whole gallery from disk instead of waiting on Firestore.
	 */
	private async seedGallery(): Promise<void> {
		const result = await seedGalleryFromBundle({
			readBundle: async () => {
				const { resolveResource } = await import("@tauri-apps/api/path");
				const { readTextFile } = await import("@tauri-apps/plugin-fs");
				const path = await resolveResource(GALLERY_BUNDLE_RESOURCE);
				try {
					return JSON.parse(await readTextFile(path)) as GalleryBundle;
				} catch (err) {
					// A build produced without Firebase credentials ships no gallery
					// bundle; the gallery then syncs the way it always has.
					console.warn("[Desktop] No bundled gallery index:", err);
					return null;
				}
			},
			persist: (docs) => getGalleryOfflineCache().persist(docs),
			lastSyncedAt: async () =>
				(await db.galleryCacheMeta.get("gallery-cache-meta"))?.lastSyncedAt ?? null,
			readMarker: async () => {
				const marker = await db.settings.get(GALLERY_BUNDLE_KEY);
				const exportedAt = (marker as unknown as Record<string, unknown> | undefined)
					?.exportedAt;
				return typeof exportedAt === "string" ? exportedAt : null;
			},
			writeMarker: async (exportedAt) => {
				await db.settings.put({
					id: GALLERY_BUNDLE_KEY,
					exportedAt,
				} as unknown as AppSettings & { id: string });
			},
		});
		if (result === "seeded") {
			console.log("[Desktop] Gallery cache seeded from the bundled public index.");
		}
	}

	private async seed(appVersion: string): Promise<void> {
		const { resolveResource } = await import("@tauri-apps/api/path");
		const { readTextFile } = await import("@tauri-apps/plugin-fs");

		const manifestPath = await resolveResource("data/sequences/_manifest.json");
		const manifestJson = await readTextFile(manifestPath);
		const manifest: DeckManifest = JSON.parse(manifestJson);

		let seeded = 0;

		for (const deck of manifest.decks) {
			const deckPath = await resolveResource(`data/sequences/${deck.filename}`);
			const deckJson = await readTextFile(deckPath);
			const bundle: DeckBundle = JSON.parse(deckJson);

			const BATCH_SIZE = 500;
			for (let i = 0; i < bundle.sequences.length; i += BATCH_SIZE) {
				const batch = bundle.sequences.slice(i, i + BATCH_SIZE);
				await db.sequences.bulkPut(batch as unknown as SequenceData[]);
				seeded += batch.length;

				if (seeded % 2000 === 0) {
					await new Promise((r) => setTimeout(r, 0));
				}
			}
		}

		await db.settings.put({
			id: BUNDLE_VERSION_KEY,
			bundleVersion: appVersion,
		} as unknown as AppSettings & { id: string });
	}
}
