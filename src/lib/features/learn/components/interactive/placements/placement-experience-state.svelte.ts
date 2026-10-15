/**
 * Placement Experience State Machine
 *
 * Manages phase progression through Discovery → Construction Quiz → Speed Rounds → Complete.
 * Follows the same reactive getter + double-rAF transition pattern as Grid experience state.
 */

import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
import {
  PLACEMENT_KINDS,
  placementKindFor,
  placementExample,
  restorePlacementWorkshop,
  type PlacementWorkshopPhase,
} from "./hand-placement-lesson";
import type { PlacementType } from "../../../domain/constants/placement-quiz-data";
import type {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

// Reading time for a built placement before the hands leave the board.
export const PLACEMENT_SUCCESS_HOLD_MS = 1200;

/** The live lesson: find all three on the diamond grid, then on the box
 * grid, then free play. Legacy quiz consumers below keep their old
 * contract; they are not mounted by the current experience. */
export function createPlacementWorkshopState(
  persistence: ReturnType<typeof getExperiencePersistence>,
  review = false
) {
  const saved = restorePlacementWorkshop(persistence.load().phaseData?.workshop);
  let phase = $state<PlacementWorkshopPhase>(review ? "explore" : saved.phase);
  let explored = $state(saved.explored);
  let boxFound = $state(review ? [] : saved.boxFound);
  let examples = $state<
    Record<string, { left: GridLocation; right: GridLocation }>
  >({});

  function rememberPlacement(
    left: GridLocation | null,
    right: GridLocation | null,
    mode: GridMode
  ) {
    const kind = placementKindFor(left, right);
    if (!kind || !left || !right) return;
    examples = { ...examples, [`${mode}:${kind}`]: { left, right } };
  }

  function examplePair(kind: PlacementType, mode: GridMode) {
    return examples[`${mode}:${kind}`] ?? placementExample(kind, mode);
  }

  function save() {
    if (!review)
      persistence.savePhaseData("workshop", {
        version: 2,
        phase,
        explored,
        boxFound,
      });
  }

  /** The placements found in the current round. */
  const found = $derived(
    phase === "box" ? boxFound : phase === "explore" ? explored : PLACEMENT_KINDS
  );
  const roundDone = $derived(
    phase !== "complete" && PLACEMENT_KINDS.every((kind) => found.includes(kind))
  );

  function discover(kind: PlacementType) {
    if (phase === "complete" || found.includes(kind)) return;
    if (phase === "explore") explored = [...explored, kind];
    else boxFound = [...boxFound, kind];
    save();
  }
  /** Moves on once every placement in this round is found. */
  function advance() {
    if (!roundDone) return false;
    phase = phase === "explore" ? "box" : "complete";
    save();
    return true;
  }
  return {
    get phase() {
      return phase;
    },
    get explored() {
      return explored;
    },
    get boxFound() {
      return boxFound;
    },
    get found() {
      return found;
    },
    get roundDone() {
      return roundDone;
    },
    get canFinish() {
      return phase === "complete";
    },
    discover,
    advance,
    rememberPlacement,
    examplePair,
  };
}

export type PlacementsPhase = 'discovery' | 'construction-quiz' | 'speed-rounds' | 'complete';

export interface PlacementsExperienceState {
	phase: PlacementsPhase;
	discoveredTypes: Set<string>;
	allDiscovered: boolean;
	quizScore: number;
	quizTotal: number;
	quizPassed: boolean;
	currentStreak: number;
	bestStreak: number;
	animateIn: boolean;
	announcement: string;
}

export function createPlacementsExperienceState() {
	const persistence = getExperiencePersistence('placements');
	const initialState = persistence.load();

	// Restore persisted phase (mapped from step number for persistence API compatibility)
	const phaseMap: Record<number, PlacementsPhase> = {
		0: 'discovery',
		1: 'construction-quiz',
		2: 'speed-rounds',
		3: 'complete'
	};
	const stepMap: Record<PlacementsPhase, number> = {
		'discovery': 0,
		'construction-quiz': 1,
		'speed-rounds': 2,
		'complete': 3
	};

	const restoredPhase = phaseMap[initialState.step] ?? 'discovery';
	const restoredDiscovered = (initialState.phaseData?.discoveredTypes as string[]) ?? [];
	const restoredQuizPassed = (initialState.phaseData?.quizPassed as boolean) ?? false;

	// Core state
	let phase = $state<PlacementsPhase>(restoredPhase);
	let discoveredTypes = $state<Set<string>>(new Set(restoredDiscovered));
	let quizScore = $state(0);
	let quizTotal = $state(0);
	let quizPassed = $state(restoredQuizPassed);
	let currentStreak = $state(0);
	let bestStreak = $state(0);
	let animateIn = $state(false);
	let announcement = $state('');

	// Derived
	const allDiscovered = $derived(
		discoveredTypes.has('alpha') && discoveredTypes.has('beta') && discoveredTypes.has('gamma')
	);

	// Accessibility announcements
	function getAnnouncement(): string {
		switch (phase) {
			case 'discovery':
				return `Discovery phase. ${discoveredTypes.size} of 3 placement types discovered.`;
			case 'construction-quiz':
				return `Construction quiz. Score: ${quizScore} of ${quizTotal}.`;
			case 'speed-rounds':
				return `Speed rounds. Current streak: ${currentStreak}. Best streak: ${bestStreak}.`;
			case 'complete':
				return 'Placements lesson complete.';
			default:
				return '';
		}
	}

	function announce() {
		announcement = '';
		requestAnimationFrame(() => {
			announcement = getAnnouncement();
		});
	}

	/**
	 * Double-rAF phase transition: fade out → update phase → fade in.
	 * Matches the Grid lesson's nextStep/prevStep pattern exactly.
	 */
	function transitionTo(newPhase: PlacementsPhase, onComplete?: () => void) {
		animateIn = false;
		requestAnimationFrame(() => {
			phase = newPhase;
			persistence.saveStep(stepMap[newPhase]);
			requestAnimationFrame(() => {
				animateIn = true;
				announce();
				onComplete?.();
			});
		});
	}

	// --- Actions ---

	function startAnimations() {
		requestAnimationFrame(() => {
			animateIn = true;
			announce();
		});
	}

	function discoverType(type: string) {
		discoveredTypes = new Set([...discoveredTypes, type]);
		const typesArray = [...discoveredTypes];
		persistence.savePhaseData('discoveredTypes', typesArray);
		announce();
	}

	function advanceToQuiz() {
		transitionTo('construction-quiz');
	}

	function recordQuizAnswer(correct: boolean) {
		quizTotal++;
		if (correct) {
			quizScore++;
			currentStreak++;
			if (currentStreak > bestStreak) {
				bestStreak = currentStreak;
			}
		} else {
			currentStreak = 0;
		}
		announce();
	}

	function passQuiz() {
		quizPassed = true;
		persistence.savePhaseData('quizPassed', true);
	}

	function advanceToSpeedRounds() {
		transitionTo('speed-rounds');
	}

	function complete() {
		transitionTo('complete');
	}

	function reset() {
		phase = 'discovery';
		discoveredTypes = new Set();
		quizScore = 0;
		quizTotal = 0;
		quizPassed = false;
		currentStreak = 0;
		bestStreak = 0;
		animateIn = false;
		announcement = '';
		persistence.reset();
	}

	return {
		// State (reactive getters)
		get phase() { return phase; },
		get discoveredTypes() { return discoveredTypes; },
		get allDiscovered() { return allDiscovered; },
		get quizScore() { return quizScore; },
		get quizTotal() { return quizTotal; },
		get quizPassed() { return quizPassed; },
		get currentStreak() { return currentStreak; },
		get bestStreak() { return bestStreak; },
		get animateIn() { return animateIn; },
		get announcement() { return announcement; },

		// Actions
		startAnimations,
		discoverType,
		advanceToQuiz,
		recordQuizAnswer,
		passQuiz,
		advanceToSpeedRounds,
		complete,
		reset,
		transitionTo
	};
}

export type PlacementsExperienceStateManager = ReturnType<typeof createPlacementsExperienceState>;
