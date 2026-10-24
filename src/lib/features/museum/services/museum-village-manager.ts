/**
 * MuseumVillageManager - Persistent Village simulation for the museum.
 *
 * Created once when the museum loads. The embed's render loop paces the sim
 * through the village driver while the player is in the collaboration room,
 * and it pauses when they leave. The visual embed component reads from this
 * manager - it never creates or destroys the sim.
 *
 * This means:
 * - Walking away and back: village has progressed, no GLTF reload
 * - HMR: manager persists in module scope, avatars survive hot reload
 * - Room streaming: the sim pauses when not visible, resumes on return
 */

import { createVillageState, type VillageState } from "#lib/features/village/state/village-state.svelte.js";
import {
	createVillageVisualState,
	followVillage,
	type VillageVisualState,
} from "#lib/features/village/state/village-visual-state.svelte.js";
import { loadVillageRules } from "#lib/features/village/domain/village-rules.js";
import {
	createVillageMomentTracker,
	type VillageMoment,
} from "#lib/features/village/state/village-moments.js";
import { buildVillageSequenceCatalogue } from "#lib/features/village/services/village-sequence-catalogue.js";
import type { VisitorLessonRequest } from "#lib/features/village/engine/village-visitor.js";
import { getAvatarModelPath, prepareSharedGltf } from "@austencloud/scene-3d";
import { HUMAN_CHARACTER_IDS } from "#lib/shared/3d/performers/human-character-roster.js";
import {
	asksToForget,
	forgetVillageMemory,
	loadVillageMemory,
	memoryMoment,
	saveVillageMemory,
	type VillageMemoryTarget,
} from "./museum-village-memory";
import { visitorLearnerName } from "./museum-exit-handoff";

// The characters villagers wear, people only (no mannequins or creatures):
// the list the village state draws from, preloaded in the background.
export const VILLAGE_AVATAR_MODELS = HUMAN_CHARACTER_IDS;

let modelsPreloaded = false;

/**
 * Parse every villager's model into scene-3d's shared GLTF cache, which each
 * PerformerRig reads, so the first villagers stand up without a network wait.
 * Unlike warming the HTTP cache with fetch(), this also holds on a
 * cache-disabled load. The museum calls it as soon as the visitor is headed
 * for the Room of Collaboration.
 */
export function preloadVillageAvatarModels(): void {
	if (modelsPreloaded) return;
	modelsPreloaded = true;

	for (const modelId of VILLAGE_AVATAR_MODELS) {
		const url = getAvatarModelPath(modelId);
		prepareSharedGltf(url).catch(() => {
			// The rig loads it again on mount and reports its own failure.
		});
	}
}

// Module-level so the room's sound and narration can listen before the
// village exists (it is made when the visitor first nears the room).
const momentListeners = new Set<(moment: VillageMoment) => void>();
// Who the visitor taught this visit, by sequence, in the order they learned.
const heardLearners: Array<{ sequenceId: string; name: string }> = [];

/** Hear the museum village's moments (village-moments.ts): the opening lesson,
 * passings, a seed's loss. Returns the unsubscribe. */
export function onMuseumVillageMoment(listener: (moment: VillageMoment) => void): () => void {
	momentListeners.add(listener);
	return () => momentListeners.delete(listener);
}

function followMoments(villageState: VillageState): void {
	const track = createVillageMomentTracker(villageState.rules.seedSequenceIds);
	villageState.onAdvance((events, next) => {
		const moments = track(events, next);
		// Keep the learner's name: they may die before the visitor leaves.
		for (const moment of moments) {
			if (moment.kind !== "visitor:taught" || !moment.sequenceId) continue;
			const learner = next.avatars.find((avatar) => avatar.id === moment.avatarId);
			if (learner) heardLearners.push({ sequenceId: moment.sequenceId, name: learner.name });
		}
		// A remembered village tells the returning visitor what became of
		// their sequence, once, on the first step after they walk in. Sent
		// from here rather than on entering, so the room's listeners, which
		// mount with it, are there to hear it.
		if (instance?.memoryDue && next.world.memory) {
			instance.memoryDue = false;
			moments.unshift(memoryMoment(next.world.memory, next.world.tick));
		}
		for (const moment of moments) {
			for (const listener of momentListeners) listener(moment);
		}
	});
}

let instance: {
	villageState: VillageState;
	visualState: VillageVisualState;
	isVisible: boolean;
	// A remembered village whose memory moment has not been heard yet.
	memoryAnnounced: boolean;
	memoryDue: boolean;
	stopSaving: () => void;
} | null = null;

// The museum's one village. The log of what the visitor did to it is kept
// (museum-village-memory.ts) and replayed when they come back.
const MUSEUM_PRESET = "museum";
const MUSEUM_VILLAGE: VillageMemoryTarget = { seed: "museum-village", preset: MUSEUM_PRESET, opening: true };

function browserStorage(): Storage | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

function rememberVillage(): void {
	if (instance) saveVillageMemory(browserStorage(), instance.villageState.inputLog);
}

// Built from the kept log when there is one. A log the sim refuses is
// dropped and the village starts fresh.
function buildMuseumVillage(rules: ReturnType<typeof loadVillageRules>): VillageState {
	const storage = browserStorage();
	if (typeof location !== "undefined" && asksToForget(location.search)) forgetVillageMemory(storage);
	const base = { rules, seed: MUSEUM_VILLAGE.seed, preset: MUSEUM_VILLAGE.preset, opening: MUSEUM_VILLAGE.opening };
	const replay = loadVillageMemory(storage, MUSEUM_VILLAGE);
	if (replay) {
		try {
			return createVillageState({ ...base, replay });
		} catch (error) {
			console.warn("[museum village] kept log would not replay; starting fresh", error);
			forgetVillageMemory(storage);
		}
	}
	return createVillageState(base);
}

export function getMuseumVillageManager() {
	if (instance) return instance;

	// Start preloading avatar models immediately
	preloadVillageAvatarModels();

	// The museum preset: a smaller, shorter-lived, slower village
	const rules = loadVillageRules(MUSEUM_PRESET);
	const villageState = buildMuseumVillage(rules);
	// Motion for the catalogue is built async; avatars start playing once it lands.
	void buildVillageSequenceCatalogue(rules).then((catalogue) =>
		villageState.setSequenceCatalogue(catalogue),
	);
	const visualState = createVillageVisualState();

	// Stone relights and the loss caption follow the sim's events.
	followVillage(villageState, visualState);
	// Sound cues and K's narration follow its moments.
	followMoments(villageState);

	// Sim only advances while the embed feeds it frames (i.e. while visible)
	villageState.start();

	// A reload mid-visit keeps what happened since the last action.
	const stopSaving = (() => {
		if (typeof window === "undefined") return () => {};
		window.addEventListener("pagehide", rememberVillage);
		return () => window.removeEventListener("pagehide", rememberVillage);
	})();

	instance = {
		villageState,
		visualState,
		isVisible: false,
		memoryAnnounced: false,
		memoryDue: false,
		stopSaving,
	};
	return instance;
}

/** Pause tick loop when player leaves collaboration room */
export function setMuseumVillageVisible(visible: boolean): void {
	if (!instance) return;
	if (visible === instance.isVisible) return;
	instance.isVisible = visible;

	if (visible) {
		if (!instance.memoryAnnounced && instance.villageState.snapshot.world.memory) {
			instance.memoryAnnounced = true;
			instance.memoryDue = true;
		}
		instance.villageState.start();
	} else {
		instance.villageState.pause();
		rememberVillage();
	}
}

/** The museum's village state, if the room has made it yet. Read-only use. */
export function peekMuseumVillageState(): VillageState | null {
	return instance?.villageState ?? null;
}

/** Who the visitor taught this sequence to, for the exit's name; null when
 * they have not (museum-exit-handoff.ts). */
export function museumVisitorLearnerName(sequenceId: string): string | null {
	if (!instance) return null;
	const heard = heardLearners.filter((h) => h.sequenceId === sequenceId).map((h) => h.name);
	return visitorLearnerName(instance.villageState.snapshot.avatars, sequenceId, heard);
}

/**
 * Teach the pocket's sequence to a villager (engine/village-visitor.ts). The
 * request is in village space (museum-village-visitor.ts). False when there
 * is no village yet or the sim refuses the lesson.
 */
export function teachFromVisitor(request: VisitorLessonRequest): boolean {
	const started = instance?.villageState.teachFromVisitor(request) ?? false;
	if (started) rememberVillage();
	return started;
}

/** Stop the visitor's lesson, if one is under way. */
export function cancelVisitorLesson(): void {
	if (!instance) return;
	instance.villageState.cancelVisitorLesson();
	rememberVillage();
}

/** Full cleanup when museum module unmounts */
export function destroyMuseumVillage(): void {
	if (!instance) return;
	rememberVillage();
	instance.stopSaving();
	instance.villageState.destroy();
	instance = null;
}
