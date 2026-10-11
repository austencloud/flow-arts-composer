/**
 * MuseumVillageManager - Persistent Village simulation for the museum.
 *
 * Created once when the museum loads. The orchestrator runs continuously
 * (or pauses when the player is in a different room). The visual embed
 * component reads from this manager - it never creates or destroys the sim.
 *
 * This means:
 * - Walking away and back: village has progressed, no GLTF reload
 * - HMR: manager persists in module scope, avatars survive hot reload
 * - Room streaming: tick loop pauses when not visible, resumes on return
 */

import { createVillageState, type VillageState } from "#lib/features/village/state/village-state.svelte.js";
import { createVillageVisualState, type VillageVisualState } from "#lib/features/village/state/village-visual-state.svelte.js";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../data/museum-exhibit-sequences";
import { getAvatarModelPath } from "@austencloud/scene-3d";
import {
	createSequenceData,
	type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";

// propInterpolator / sequenceConverter are now module-level functions

// Avatar model IDs used by the village - preload these in background
const VILLAGE_AVATAR_MODELS = [
	"x-bot", "y-bot", "remy", "ch26", "ch01", "ch07", "ch10", "ch12",
	"ch18", "ch21", "ch22", "ch24", "ch34", "ch41", "ch42", "ch44",
];

let modelsPreloaded = false;

/**
 * Preload all avatar GLTF models in the background via fetch().
 * The browser caches the responses, so when Avatar3D later loads them
 * via GLTFLoader, they come from cache instantly - no network wait.
 * Call this when the museum first loads, well before the player reaches
 * the collaboration room.
 */
export function preloadVillageAvatarModels(): void {
	if (modelsPreloaded) return;
	modelsPreloaded = true;

	for (const modelId of VILLAGE_AVATAR_MODELS) {
		const url = getAvatarModelPath(modelId);
		// Fire-and-forget fetch - just warms the cache
		fetch(url, { priority: "low" as RequestPriority }).catch(() => {
			// Ignore errors - models will load normally when needed
		});
	}
}

const COLLAB_SEQUENCE_IDS = [
	"performer-cave-seq",
	"gallery-spiral-seq",
	"gallery-scribes-seq",
	"gallery-practice-seq",
];

function buildSeedSequences(): SequenceData[] {
	return COLLAB_SEQUENCE_IDS
		.map((id) => {
			const museumSeq = MUSEUM_EXHIBIT_SEQUENCES[id];
			if (!museumSeq) return null;
			return createSequenceData({
				id: `museum-village-${id}`,
				word: museumSeq.word,
				steps: museumSeq.steps,
				isCircular: true,
			});
		})
		.filter((s): s is SequenceData => s !== null);
}

let instance: {
	villageState: VillageState;
	visualState: VillageVisualState;
	isVisible: boolean;
} | null = null;

export function getMuseumVillageManager() {
	if (instance) return instance;

	// Start preloading avatar models immediately
	preloadVillageAvatarModels();

	const seeds = buildSeedSequences();
	const villageState = createVillageState(
		{},
		seeds,
		{
			targetPopulation: 8,
			arenaRadius: 8,
			lifespanTicks: 400,
			ticksPerSecond: 7,
		},
	);
	const visualState = createVillageVisualState();

	// Wire death marks
	villageState.orchestrator.on("entity:died", (entity) => {
		visualState.addDeathMark(entity, villageState.orchestrator.currentTick);
	});

	// Wire monument relight flash
	villageState.orchestrator.on("monument:relit", (seqId) => {
		visualState.triggerRelight(seqId);
	});

	// Start ticking immediately - sim runs in background
	villageState.start();

	instance = { villageState, visualState, isVisible: false };
	return instance;
}

/** Pause tick loop when player leaves collaboration room */
export function setMuseumVillageVisible(visible: boolean): void {
	if (!instance) return;
	if (visible === instance.isVisible) return;
	instance.isVisible = visible;

	if (visible) {
		instance.villageState.start();
	} else {
		instance.villageState.pause();
	}
}

/** Full cleanup when museum module unmounts */
export function destroyMuseumVillage(): void {
	if (!instance) return;
	instance.villageState.destroy();
	instance = null;
}
