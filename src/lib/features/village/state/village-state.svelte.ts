/**
 * Village State - the bridge between the headless village sim and the
 * Threlte renderer.
 *
 * The sim hands out one plain snapshot per tick (engine/village-snapshot.ts).
 * This layer keeps the latest one, turns each avatar's entry into a render
 * record with its own rig state, and starts or stops sequence playback when
 * the sim says an avatar's active sequence changed. Nothing here holds a live
 * sim object, so every change in the sim reaches the screen.
 */

import {
	createCharacterInstanceState as createAvatarInstanceState,
	makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { HUMAN_CHARACTER_IDS } from "#lib/shared/3d/performers/human-character-roster.js";
import { mirrorSequence } from "#lib/shared/create/services/sequence-transformer.js";
import { restFacing, turnToward } from "./village-rest-facing";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import { createVillageDriver, type VillageDriver } from "../engine/village-driver";
import type { VisitorLessonRequest } from "../engine/village-visitor";
import type { VillageRules } from "../domain/village-rules";
import type { VillageInputLog } from "../domain/village-input-log";
import type { VillageEvent } from "../domain/village-types";
import type {
	VillageAvatarSnapshot,
	VillageSnapshot,
	VillageVisitorSnapshot,
} from "../engine/village-snapshot";

export interface AvatarRenderState {
	readonly entityId: string;
	readonly instanceState: ReturnType<typeof createAvatarInstanceState>;
	// Replaced whole every tick, never mutated in place, so a component that
	// reads any field of it updates when the sim changes that avatar.
	avatar: VillageAvatarSnapshot;
	// Which playback this rig is showing, so a restart is only issued when the
	// sim starts a new one. A mirrored lesson copy is keyed apart from the
	// sequence itself.
	loadedSequenceId: string | null;
	loadedStartTick: number | null;
	// Sat down before passing, so they pass where they sat.
	wasSeated: boolean;
}

const MIRRORED_KEY = ":facing-mirror";

// What sequence playback reads from a snapshot entry: an avatar's, or the
// visitor's teacher pose.
type PlaybackFields = Pick<
	VillageAvatarSnapshot,
	| "activeSequenceId"
	| "playbackStartTick"
	| "lessonPhase"
	| "lessonStep"
	| "lessonStepTick"
	| "lessonMirrored"
>;

interface PlaybackRecord {
	readonly instanceState: ReturnType<typeof createAvatarInstanceState>;
	loadedSequenceId: string | null;
	loadedStartTick: number | null;
}

/**
 * A rig for the visitor's side of a lesson: where the sim stands them and
 * the teacher's pose, step for step. The museum may draw it in place of the
 * player's own body (VillageVisitorFigure). Null when no lesson runs.
 */
export interface VisitorRenderState extends PlaybackRecord {
	visitor: VillageVisitorSnapshot;
}

function createVisitorRenderState(initial: VillageVisitorSnapshot): VisitorRenderState {
	let visitor = $state.raw(initial);
	return {
		instanceState: createAvatarInstanceState(
			{ id: "visitor", positionX: initial.x, positionZ: initial.z },
			makeStandaloneDeps(),
		),
		get visitor() {
			return visitor;
		},
		set visitor(next) {
			visitor = next;
		},
		loadedSequenceId: null,
		loadedStartTick: null,
	};
}

// The visitor's pose as playback fields. Before the lesson's first step
// they hold still.
function visitorPlayback(visitor: VillageVisitorSnapshot): PlaybackFields {
	return {
		activeSequenceId: visitor.lessonPhase === null ? null : visitor.sequenceId,
		playbackStartTick: null,
		lessonPhase: visitor.lessonPhase,
		lessonStep: visitor.lessonStep,
		lessonStepTick: visitor.lessonStepTick,
		lessonMirrored: visitor.lessonMirrored,
	};
}

function createAvatarRenderState(initial: VillageAvatarSnapshot): AvatarRenderState {
	let avatar = $state.raw(initial);
	return {
		entityId: initial.id,
		instanceState: createAvatarInstanceState(
			{ id: initial.id, positionX: initial.x, positionZ: initial.z },
			makeStandaloneDeps(),
		),
		get avatar() {
			return avatar;
		},
		set avatar(next) {
			avatar = next;
		},
		loadedSequenceId: null,
		loadedStartTick: null,
		wasSeated: false,
	};
}

export interface VillageState {
	readonly snapshot: VillageSnapshot;
	readonly avatarList: AvatarRenderState[];
	readonly isRunning: boolean;
	readonly selectedAvatarId: string | null;
	readonly speed: number;
	readonly seed: string;
	readonly rules: VillageRules;
	// Whether a new village starts with the staged opening.
	readonly openingEnabled: boolean;
	/** The visitor's rig while they teach, else null. */
	readonly visitorRenderState: VisitorRenderState | null;

	/** Feed real elapsed seconds from the render loop; runs due ticks. */
	advance(elapsedSeconds: number): void;
	/** Ease each rig toward the sim; the frame's seconds, or measured here. */
	lerpAvatars(deltaSeconds?: number): void;
	onEvents(listener: (events: VillageEvent[], snapshot: VillageSnapshot) => void): () => void;
	/** Like onEvents, but also on frames where ticks ran without events, for
	 * readers that watch state change (village-moments.ts). */
	onAdvance(listener: (events: VillageEvent[], snapshot: VillageSnapshot) => void): () => void;
	start(): void;
	pause(): void;
	togglePlay(): void;
	setSpeed(speed: number): void;
	selectAvatar(id: string | null): void;
	/** Swap in sequence motion once it is built; playing avatars restart on it. */
	setSequenceCatalogue(catalogue: ReadonlyMap<string, SequenceData>): void;
	/**
	 * The museum visitor starts teaching a villager (engine/village-visitor.ts).
	 * Applies between ticks; false when the sim refuses the lesson.
	 */
	teachFromVisitor(request: VisitorLessonRequest): boolean;
	/** Stops the visitor's lesson, if one is under way. */
	cancelVisitorLesson(): void;
	/** Everything the visitor has done here, to keep and replay on a return. */
	readonly inputLog: VillageInputLog;
	/** Restart the village; a new seed gives a different village. */
	reset(seed?: string): void;
	/** Turn the staged opening on or off; restarts the village on the same seed. */
	setOpeningEnabled(enabled: boolean): void;
	destroy(): void;
}

export interface CreateVillageStateOptions {
	rules: VillageRules;
	seed: string;
	// Motion for each sequence id the sim may name. Building it is async, so
	// it may start empty and arrive through setSequenceCatalogue; ids without
	// an entry simply do not play until then.
	sequenceCatalogue?: ReadonlyMap<string, SequenceData>;
	// Start with the staged opening (engine/village-opening.ts). Default on.
	opening?: boolean;
	// The rules preset the rules came from, kept in the input log; null (the
	// default) for the base table.
	preset?: string | null;
	// Come back to a remembered village: rebuild it from this log
	// (domain/village-input-log.ts). Its seed, preset and opening must match
	// these options, or the orchestrator throws. Only the first village
	// replays; a reset starts a fresh one.
	replay?: VillageInputLog;
}

// Sim facing is atan2(dz, dx) (0 faces +x); the rig's yaw is atan2(dx, dz)
// (0 faces +z).
function toRigYaw(simFacing: number): number {
	return Math.PI / 2 - simFacing;
}

// The longest the opening lesson waits for its motion to be built before it
// plays anyway, so a failed load cannot freeze the village.
const MOTION_WAIT_LIMIT_SECONDS = 10;
// How far the rig may drift from the sim's place in a step before it is put
// back, as a share of the step.
const LESSON_DRIFT = 0.3;
// How fast a body turns: brisk into a walk's heading, unhurried when settling
// to look at someone. A long frame (a hidden tab) still turns at most this far.
const WALK_TURN_RADIANS_PER_SECOND = 4;
const REST_TURN_RADIANS_PER_SECOND = 2;
const MAX_TURN_FRAME_SECONDS = 0.1;

export function createVillageState(options: CreateVillageStateOptions): VillageState {
	const { rules } = options;
	let sequenceCatalogue: ReadonlyMap<string, SequenceData> = options.sequenceCatalogue ?? new Map();
	// The learner's copy during a lesson: the sequence through the app's own
	// mirror transform, built on first need and kept.
	const mirrored = new Map<string, SequenceData>();
	const mirroring = new Set<string>();

	let openingEnabled = $state(options.opening ?? true);
	const preset = options.preset ?? null;
	let orchestrator = createOrchestrator(options.seed, options.replay);
	let seed = $state(options.seed);
	let snapshot = $state.raw<VillageSnapshot>(orchestrator.snapshot);
	let avatarList = $state.raw<AvatarRenderState[]>([]);
	let isRunning = $state(false);
	let speed = $state(1);
	let selectedAvatarId = $state<string | null>(null);
	let visitorRenderState = $state.raw<VisitorRenderState | null>(null);

	const records = new Map<string, AvatarRenderState>();
	const listeners = new Set<(events: VillageEvent[], snapshot: VillageSnapshot) => void>();
	const advanceListeners = new Set<(events: VillageEvent[], snapshot: VillageSnapshot) => void>();
	// The entry snapshot's own events (the opening's "started") were made
	// before anyone could listen; they wait here for the first advance.
	let eventsThisFrame: VillageEvent[] = [];
	let motionWaited = 0;

	const driver: VillageDriver = createVillageDriver({
		ticksPerSecond: rules.ticksPerSecond,
		step: () => {
			const next = orchestrator.tick();
			eventsThisFrame.push(...next.events);
		},
	});

	function createOrchestrator(runSeed: string, replay?: VillageInputLog): VillageOrchestrator {
		return new VillageOrchestrator({
			rules,
			seed: runSeed,
			avatarModels: HUMAN_CHARACTER_IDS,
			opening: openingEnabled,
			preset,
			...(replay ? { replay } : {}),
		});
	}

	function applySnapshot(next: VillageSnapshot): void {
		snapshot = next;
		const seen = new Set<string>();
		let listChanged = false;

		for (const avatar of next.avatars) {
			seen.add(avatar.id);
			let record = records.get(avatar.id);
			if (!record) {
				record = createAvatarRenderState(avatar);
				records.set(avatar.id, record);
				listChanged = true;
			} else {
				record.avatar = avatar;
			}
			record.wasSeated =
				avatar.state === "seated" || (avatar.state === "passing" && record.wasSeated);
			syncSequencePlayback(record, avatar);
		}

		for (const id of records.keys()) {
			if (!seen.has(id)) {
				records.delete(id);
				listChanged = true;
			}
		}
		if (listChanged) avatarList = [...records.values()];
		applyVisitor(next.world.visitor ?? null);
	}

	function applyVisitor(visitor: VillageVisitorSnapshot | null): void {
		if (!visitor) {
			if (visitorRenderState) {
				visitorRenderState.instanceState.pause();
				visitorRenderState = null;
			}
			return;
		}
		if (!visitorRenderState) {
			visitorRenderState = createVisitorRenderState(visitor);
		} else {
			visitorRenderState.visitor = visitor;
		}
		// The visitor stands where the sim put them; nothing to ease toward.
		const inst = visitorRenderState.instanceState;
		inst.position.x = visitor.x;
		inst.position.z = visitor.z;
		inst.snapFacingAngle(toRigYaw(visitor.facing));
		syncSequencePlayback(visitorRenderState, visitorPlayback(visitor));
	}

	function mirroredSequence(sequenceId: string): SequenceData | undefined {
		const ready = mirrored.get(sequenceId);
		if (ready) return ready;
		const source = sequenceCatalogue.get(sequenceId);
		if (!source || mirroring.has(sequenceId)) return undefined;
		mirroring.add(sequenceId);
		const catalogue = sequenceCatalogue;
		void mirrorSequence(source).then((copy) => {
			mirroring.delete(sequenceId);
			if (catalogue !== sequenceCatalogue) return;
			mirrored.set(sequenceId, copy);
		});
		return undefined;
	}

	function syncSequencePlayback(record: PlaybackRecord, avatar: PlaybackFields): void {
		const inst = record.instanceState;
		const id = avatar.activeSequenceId;
		// While the mirrored copy is still being built the learner plays the
		// sequence as it is; the next tick swaps it in.
		const mirroredCopy = id && avatar.lessonMirrored ? mirroredSequence(id) : undefined;
		const sequence = mirroredCopy ?? (id ? sequenceCatalogue.get(id) : undefined);
		const key = mirroredCopy ? `${id}${MIRRORED_KEY}` : id;

		// Nothing to play: unload it, not just pause it. A paused rig keeps the
		// sequence's start pose and props in hand, which is the arms-out stance
		// idle people used to hold; an empty rig falls back to the body's own
		// idle, hands empty.
		if (!sequence) {
			if (inst.isPlaying) inst.pause();
			if (inst.hasSequence) inst.clearSequence();
			record.loadedSequenceId = null;
			record.loadedStartTick = null;
			return;
		}

		const fresh =
			record.loadedSequenceId !== key || record.loadedStartTick !== avatar.playbackStartTick;
		if (fresh) {
			inst.loadSequence(sequence);
			inst.loop = true;
			record.loadedSequenceId = key;
			record.loadedStartTick = avatar.playbackStartTick;
		}

		if (avatar.lessonPhase === null) {
			if (fresh) {
				inst.speed = 1;
				inst.play();
			}
			return;
		}
		followLesson(inst, avatar);
	}

	/**
	 * A lesson plays exactly the step the sim names, at the sim's tempo: one
	 * step every teaching.ticksPerStep ticks. Holding still pauses the rig
	 * where it is; a fumble plays the missed step at a stumbling tempo.
	 */
	function followLesson(inst: PlaybackRecord["instanceState"], avatar: PlaybackFields): void {
		if (avatar.lessonStep === null) {
			if (inst.isPlaying) inst.pause();
			return;
		}
		const ticksPerStep = rules.teaching.ticksPerStep;
		const stepsPerSecond = (rules.ticksPerSecond * speed) / ticksPerStep;
		const fumbling = avatar.lessonPhase === "fumble";
		const tempo = fumbling ? rules.lesson.fumbleTempo : 1;
		const expected = Math.min(0.999, (avatar.lessonStepTick / ticksPerStep) * tempo);
		const rigStep = avatar.lessonStep + inst.motionStepOffset;

		if (inst.currentStepIndex !== rigStep) {
			inst.goToStep(rigStep);
			inst.setProgress(expected);
		} else if (Math.abs(inst.progress - expected) > LESSON_DRIFT) {
			inst.setProgress(expected);
		}
		inst.speed = stepsPerSecond * tempo;
		if (!inst.isPlaying) inst.play();
	}

	/**
	 * Smoothly move each rig toward where the sim last put the avatar.
	 * Called every render frame; the sim only ticks a few times a second.
	 * Bodies turn at a steady rate toward where they are going or, standing
	 * still, toward where they rest their gaze (village-rest-facing.ts):
	 * never a snap.
	 */
	let lastLerpAt: number | null = null;
	function lerpAvatars(deltaSeconds?: number): void {
		const POSITION_LERP = 0.15;
		const MOVE_THRESHOLD = 0.02;
		const now = performance.now();
		const measured = lastLerpAt === null ? 1 / 60 : (now - lastLerpAt) / 1000;
		const delta = Math.min(MAX_TURN_FRAME_SECONDS, deltaSeconds ?? measured);
		lastLerpAt = now;
		const watchRadius = rules.performance.attractionRadius;

		for (const record of records.values()) {
			const inst = record.instanceState;
			const { avatar } = record;
			const dx = avatar.x - inst.position.x;
			const dz = avatar.z - inst.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			// A capped snapFacingAngle, not setFacingAngle: the village never
			// calls updateLocomotion(), which is what eases toward a set target.
			const walking = dist > MOVE_THRESHOLD;
			const target = walking
				? Math.atan2(dx, dz)
				: toRigYaw(restFacing(avatar, snapshot, watchRadius));
			const rate = walking ? WALK_TURN_RADIANS_PER_SECOND : REST_TURN_RADIANS_PER_SECOND;
			const next = turnToward(inst.facingAngle, target, rate * delta);
			if (next !== inst.facingAngle) inst.snapFacingAngle(next);

			inst.position.x += dx * POSITION_LERP;
			inst.position.z += dz * POSITION_LERP;
		}
	}

	function restart(runSeed: string): void {
		const wasRunning = driver.isRunning;
		driver.pause();
		records.clear();
		avatarList = [];
		selectedAvatarId = null;
		visitorRenderState = null;
		seed = runSeed;
		orchestrator = createOrchestrator(runSeed);
		eventsThisFrame = [...orchestrator.snapshot.events];
		motionWaited = 0;
		applySnapshot(orchestrator.snapshot);
		if (wasRunning) driver.play();
	}

	/**
	 * True while the opening lesson's motion (and the learner's mirrored copy)
	 * is still being built. The clock holds instead of the sim, so the lesson
	 * plays from its first step once it can be seen, and the run stays the
	 * same tick for tick.
	 */
	function openingMotionPending(): boolean {
		const opening = snapshot.world.opening;
		// The visitor's lesson waits the same way, so the learner's first
		// steps are not lost to a motion still being built. Read from the rig,
		// which a cancel clears at once, not the snapshot, which only a tick
		// would refresh.
		const visitor = visitorRenderState?.visitor;
		const sequenceId =
			opening?.phase === "lesson" ? opening.sequenceId : (visitor?.sequenceId ?? null);
		if (!sequenceId) return false;
		if (!sequenceCatalogue.has(sequenceId)) return true;
		return mirroredSequence(sequenceId) === undefined;
	}

	function start(): void {
		driver.play();
		isRunning = true;
	}

	function pause(): void {
		driver.pause();
		isRunning = false;
	}

	eventsThisFrame = [...orchestrator.snapshot.events];
	applySnapshot(orchestrator.snapshot);

	return {
		get snapshot() {
			return snapshot;
		},
		get avatarList() {
			return avatarList;
		},
		get isRunning() {
			return isRunning;
		},
		get selectedAvatarId() {
			return selectedAvatarId;
		},
		get speed() {
			return speed;
		},
		get seed() {
			return seed;
		},
		get openingEnabled() {
			return openingEnabled;
		},
		get visitorRenderState() {
			return visitorRenderState;
		},
		rules,

		advance(elapsedSeconds) {
			let ran = 0;
			if (driver.isRunning && motionWaited < MOTION_WAIT_LIMIT_SECONDS && openingMotionPending()) {
				motionWaited += elapsedSeconds;
			} else {
				ran = driver.advance(elapsedSeconds);
			}
			if (ran === 0 && eventsThisFrame.length === 0) return;
			const events = eventsThisFrame;
			eventsThisFrame = [];
			if (ran > 0) applySnapshot(orchestrator.snapshot);
			if (events.length > 0) {
				for (const listener of listeners) listener(events, snapshot);
			}
			for (const listener of advanceListeners) listener(events, snapshot);
		},
		lerpAvatars,
		onEvents(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		onAdvance(listener) {
			advanceListeners.add(listener);
			return () => advanceListeners.delete(listener);
		},
		start,
		pause,
		togglePlay() {
			if (driver.isRunning) pause();
			else start();
		},
		setSpeed(next) {
			driver.setSpeed(next);
			speed = next;
		},
		selectAvatar(id) {
			selectedAvatarId = id;
		},
		setSequenceCatalogue(next) {
			sequenceCatalogue = next;
			mirrored.clear();
			for (const record of records.values()) {
				record.loadedSequenceId = null;
				record.loadedStartTick = null;
				syncSequencePlayback(record, record.avatar);
			}
			if (visitorRenderState) {
				visitorRenderState.loadedSequenceId = null;
				visitorRenderState.loadedStartTick = null;
				syncSequencePlayback(visitorRenderState, visitorPlayback(visitorRenderState.visitor));
			}
		},
		teachFromVisitor(request) {
			return orchestrator.teachFromVisitor(request);
		},
		cancelVisitorLesson() {
			orchestrator.cancelVisitorLesson();
			applyVisitor(null);
		},
		get inputLog() {
			return orchestrator.inputLog;
		},
		reset(nextSeed) {
			restart(nextSeed ?? seed);
		},
		setOpeningEnabled(enabled) {
			if (enabled === openingEnabled) return;
			openingEnabled = enabled;
			restart(seed);
		},
		destroy() {
			driver.pause();
			isRunning = false;
			listeners.clear();
			records.clear();
			avatarList = [];
		},
	};
}
