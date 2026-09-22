/**
 * Experience Persistence
 *
 * Persists learning experience state (step, phase) across HMR and page refresh.
 * Simple synchronous save pattern - no reactive effects to avoid loops.
 *
 * Usage:
 * ```typescript
 * const persistence = getExperiencePersistence("grid");
 * let step = $state(persistence.load().step);
 *
 * function handleNext() {
 *   step++;
 *   persistence.saveStep(step);
 * }
 * ```
 */

import { browser } from "$app/environment";
import { LEGACY_CONCEPT_ID_ALIASES } from "../services/concept-progress-tracker";

/**
 * State for a single experience
 */
export interface ExperienceState {
	step: number;
	phaseData?: Record<string, unknown>;
}

/**
 * Map of all experiences by concept ID
 */
interface AllExperiencesState {
	_activeConceptId?: string;
	[conceptId: string]: ExperienceState | string | undefined;
}

const STORAGE_KEY = "tka_experience_state";

// Active Concept Persistence (which concept detail view is open)

/**
 * Get the currently active concept ID (if any)
 */
export function getActiveConceptId(): string | null {
	const states = loadAllStates();
	return (states._activeConceptId as string) || null;
}

/**
 * Set the active concept ID (call when opening a concept)
 */
export function setActiveConceptId(conceptId: string): void {
	const states = loadAllStates();
	states._activeConceptId = conceptId;
	saveAllStates(states);
}

/**
 * Clear the active concept ID (call when closing a concept)
 */
export function clearActiveConceptId(): void {
	const states = loadAllStates();
	delete states._activeConceptId;
	saveAllStates(states);
}

// Experience State Persistence (step/phase within a concept)

/**
 * Fold every legacy concept id key onto its current id
 * (LEGACY_CONCEPT_ID_ALIASES). A concept id rename does not migrate the state
 * already saved under the old key: if only the legacy key is present, it
 * becomes the current key; if both are present, the current key's state is
 * kept and the legacy one is dropped. `_activeConceptId` is folded the same
 * way since it also holds a concept id, just as a value rather than a key.
 * Returns the same object when nothing needed folding, so callers can tell
 * whether a re-save is warranted.
 */
function foldLegacyConceptIds(states: AllExperiencesState): {
	states: AllExperiencesState;
	changed: boolean;
} {
	let changed = false;
	const folded: AllExperiencesState = { ...states };

	for (const [legacyId, currentId] of Object.entries(
		LEGACY_CONCEPT_ID_ALIASES
	)) {
		if (legacyId in folded) {
			if (!(currentId in folded)) {
				folded[currentId] = folded[legacyId];
			}
			delete folded[legacyId];
			changed = true;
		}
	}

	if (
		typeof folded._activeConceptId === "string" &&
		folded._activeConceptId in LEGACY_CONCEPT_ID_ALIASES
	) {
		folded._activeConceptId =
			LEGACY_CONCEPT_ID_ALIASES[folded._activeConceptId];
		changed = true;
	}

	return { states: folded, changed };
}

/**
 * Load all experience states from localStorage, folding any legacy concept
 * id onto its current id. The fold is one-time: when it changes anything,
 * the result is written straight back so the next load reads clean state.
 */
function loadAllStates(): AllExperiencesState {
	if (!browser) return {};
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return {};
		const parsed = JSON.parse(stored) as AllExperiencesState;
		const { states, changed } = foldLegacyConceptIds(parsed);
		if (changed) saveAllStates(states);
		return states;
	} catch {
		return {};
	}
}

/**
 * Save all experience states to localStorage
 */
function saveAllStates(states: AllExperiencesState): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
	} catch (error) {
		console.error("Failed to save experience state:", error);
	}
}

/**
 * Get a persistence helper for a specific learning experience.
 * Uses simple synchronous load/save - no reactive effects.
 *
 * @param conceptId - Unique identifier for the concept (e.g., "grid", "placements")
 */
export function getExperiencePersistence(conceptId: string) {
	/**
	 * Load this concept's state
	 */
	function load(): ExperienceState {
		const allStates = loadAllStates();
		const state = allStates[conceptId];
		// Handle mixed types - only return ExperienceState objects
		if (state && typeof state === "object" && "step" in state) {
			return state as ExperienceState;
		}
		return { step: 0 };
	}

	function saveStep(step: number): void {
		const allStates = loadAllStates();
		const existing = allStates[conceptId];
		const currentState =
			existing && typeof existing === "object" && "step" in existing
				? (existing as ExperienceState)
				: { step: 0 };
		allStates[conceptId] = {
			...currentState,
			step,
		};
		saveAllStates(allStates);
	}

	function savePhaseData(key: string, value: unknown): void {
		const allStates = loadAllStates();
		const existing = allStates[conceptId];
		const currentState =
			existing && typeof existing === "object" && "step" in existing
				? (existing as ExperienceState)
				: { step: 0 };
		allStates[conceptId] = {
			...currentState,
			step: currentState.step ?? 0,
			phaseData: {
				...(currentState.phaseData ?? {}),
				[key]: value,
			},
		};
		saveAllStates(allStates);
	}

	/**
	 * Get a phase data value (from current load)
	 */
	function getPhaseData<T>(key: string, defaultValue: T): T {
		const state = load();
		return (state.phaseData?.[key] as T) ?? defaultValue;
	}

	/**
	 * Reset this concept's experience state (call on completion)
	 */
	function reset(): void {
		const allStates = loadAllStates();
		delete allStates[conceptId];
		saveAllStates(allStates);
	}

	return {
		load,
		saveStep,
		savePhaseData,
		getPhaseData,
		reset,
	};
}

/**
 * Clear all experience state (for testing/development)
 */
export function clearAllExperienceState(): void {
	saveAllStates({});
}
