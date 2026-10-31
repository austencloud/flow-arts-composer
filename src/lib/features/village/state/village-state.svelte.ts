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
import type {
	LocomotionGaitClock,
	Plane,
	ScheduledGaitTimingSample,
	TerminalStepPlan,
	TurnRequest,
} from "@austencloud/scene-3d";
import {
	createPhrasePlayback,
	phraseBeatPlaneOverrides,
	phraseFrameFacingHint,
	phraseFrameRootTurn,
	type PhrasePlayback,
	type PhrasePlaybackFrame,
} from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-playback.js";
import { restFacing } from "./village-rest-facing";
import { VillageWalker, type VillageWalkPose } from "./village-walk";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import type { VillageWalkIntent } from "../engine/village-walk-intent";
import { createVillageDriver, type VillageDriver } from "../engine/village-driver";
import type { VisitorLessonRequest } from "../engine/village-visitor";
import type { VillageRules } from "../domain/village-rules";
import type { VillageInputLog } from "../domain/village-input-log";
import type { VillageEvent, VillagePerformance } from "../domain/village-types";
import type {
	VillageAvatarSnapshot,
	VillageSnapshot,
	VillageVisitorSnapshot,
} from "../engine/village-snapshot";

export interface AvatarRenderState {
	readonly entityId: string;
	/** Where the body stands and faces; the walk moves it every frame. */
	readonly instanceState: ReturnType<typeof createAvatarInstanceState>;
	// Replaced whole every tick, never mutated in place, so a component that
	// reads any field of it updates when the sim changes that avatar.
	avatar: VillageAvatarSnapshot;
	/** What the props play this tick, for LiveSequencePerformer3D. */
	spin: VillageSpin;
	// Sat down before passing, so they pass where they sat.
	wasSeated: boolean;
	/**
	 * How the body walks this frame, as PerformerRig props (village-walk.ts).
	 * VillageAvatar spreads it onto the rig after its own isMoving/moveSpeed.
	 */
	readonly walk: VillageWalkRigProps;
}

/**
 * What a body's props play, as LiveSequencePerformer3D props. A null
 * sequence is empty hands. `scoreBeat` (motion beats from the start of beat
 * 1) pins the props to the sim; the performer plays on its own clock at
 * `beatsPerSecond` between ticks and only seeks when it drifts.
 */
export interface VillageSpin {
	readonly sequence: SequenceData | null;
	readonly scoreBeat: number | null;
	readonly beatsPerSecond: number;
	readonly active: boolean;
	/** A performance's planes per beat (Flow Fest's phrases); none for poi. */
	readonly beatPlaneOverrides?: ReadonlyMap<number, { left: Plane; right: Plane }>;
	/** Where a performance turns the body as the phrase plays. */
	readonly facingHint?: ((scoreTime: number) => number | null) | null;
	/** How far the root has turned under a planted phrase, which the feet hold against. */
	readonly rootTurn?: ((scoreTime: number) => number) | null;
}

const EMPTY_HANDS: VillageSpin = { sequence: null, scoreBeat: null, beatsPerSecond: 1, active: false };

/** The rig props a village body walks by; the getters stay reactive. */
export interface VillageWalkRigProps {
	readonly isMoving: boolean;
	readonly moveSpeed: number;
	readonly terminalStepPlan: TerminalStepPlan | null;
	/** Undefined when no turn clip runs, so the rig keeps its beat turns. */
	readonly turnRequestOverride: TurnRequest | undefined;
	/** A performance's walk: where the feet head and when they land. */
	readonly moveDirection: { x: number; z: number } | undefined;
	readonly gaitTimingSample: ScheduledGaitTimingSample | null;
	readonly locomotionResetKey: number;
	readonly onGaitClock: (clock: LocomotionGaitClock) => void;
}

/** What the walk keeps per body, beside the render record. */
interface WalkRecord {
	walker: VillageWalker | null;
	clock: LocomotionGaitClock | null;
	/** The last pose's reset count, which a fresh walker carries on. */
	resetKey: number;
	setPose(pose: WalkPose): void;
}

// The walker's pose, or a performance's: its walks steer the feet and time
// the footfalls.
type WalkPose = VillageWalkPose & {
	moveDirection?: { x: number; z: number };
	gaitTimingSample?: ScheduledGaitTimingSample | null;
};

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
	| "lessonStepCount"
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
		lessonStepCount: visitor.lessonStepCount,
		lessonMirrored: visitor.lessonMirrored,
	};
}

function createWalkRecord(): { record: WalkRecord; props: VillageWalkRigProps } {
	let pose = $state.raw<WalkPose | null>(null);
	const record: WalkRecord = {
		walker: null,
		clock: null,
		resetKey: 0,
		setPose(next) {
			record.resetKey = next.resetKey;
			const last = pose;
			if (
				last?.isMoving === next.isMoving &&
				last.moveSpeed === next.moveSpeed &&
				last.terminalStepPlan === next.terminalStepPlan &&
				last.turnRequest === next.turnRequest &&
				last.resetKey === next.resetKey &&
				last.moveDirection?.x === next.moveDirection?.x &&
				last.moveDirection?.z === next.moveDirection?.z &&
				last.gaitTimingSample === next.gaitTimingSample
			) {
				return;
			}
			pose = next;
		},
	};
	const onGaitClock = (clock: LocomotionGaitClock) => {
		record.clock = clock;
	};
	const props: VillageWalkRigProps = {
		get isMoving() {
			return pose?.isMoving ?? false;
		},
		get moveSpeed() {
			return pose?.moveSpeed ?? 0;
		},
		get terminalStepPlan() {
			return pose?.terminalStepPlan ?? null;
		},
		get turnRequestOverride() {
			return pose?.turnRequest;
		},
		get moveDirection() {
			return pose?.moveDirection;
		},
		get gaitTimingSample() {
			return pose?.gaitTimingSample ?? null;
		},
		get locomotionResetKey() {
			return pose?.resetKey ?? 0;
		},
		onGaitClock,
	};
	return { record, props };
}

function createAvatarRenderState(
	initial: VillageAvatarSnapshot,
	walks: Map<string, WalkRecord>,
): AvatarRenderState {
	let avatar = $state.raw(initial);
	let spin = $state.raw<VillageSpin>(EMPTY_HANDS);
	const walk = createWalkRecord();
	walks.set(initial.id, walk.record);
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
		get spin() {
			return spin;
		},
		set spin(next) {
			spin = next;
		},
		wasSeated: false,
		walk: walk.props,
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
// A long frame (a hidden tab) still moves a body at most this far.
const MAX_WALK_FRAME_SECONDS = 0.1;
// Faster than this the village outruns the turn clips and planned stops,
// so bodies just follow (village-walk.ts).
const MAX_AUTHORED_WALK_SPEED = 2;

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
	const walks = new Map<string, WalkRecord>();
	// Each walker's target and pace at the latest tick, and when it ran.
	let walkIntents = new Map<string, VillageWalkIntent>();
	let lastTickAt = performance.now();
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
		walkIntents = orchestrator.walkIntents();
		lastTickAt = performance.now();
		const seen = new Set<string>();
		let listChanged = false;

		for (const avatar of next.avatars) {
			seen.add(avatar.id);
			let record = records.get(avatar.id);
			if (!record) {
				record = createAvatarRenderState(avatar, walks);
				records.set(avatar.id, record);
				listChanged = true;
			} else {
				record.avatar = avatar;
			}
			record.wasSeated =
				avatar.state === "seated" || (avatar.state === "passing" && record.wasSeated);
			syncSpin(record, avatar, next.world.tick);
		}

		for (const id of records.keys()) {
			if (!seen.has(id)) {
				records.delete(id);
				walks.delete(id);
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

	/** The motion an entry plays, and the key a restart is judged by. */
	function playedSequence(avatar: PlaybackFields): { sequence?: SequenceData; key: string | null } {
		const id = avatar.activeSequenceId;
		// While the mirrored copy is still being built the learner plays the
		// sequence as it is; the next tick swaps it in.
		const mirroredCopy = id && avatar.lessonMirrored ? mirroredSequence(id) : undefined;
		const sequence = mirroredCopy ?? (id ? sequenceCatalogue.get(id) : undefined);
		return { sequence, key: mirroredCopy ? `${id}${MIRRORED_KEY}` : id };
	}

	/**
	 * A villager's props for this tick. Nothing to play is empty hands, never
	 * a paused sequence (that held the arms out at its pose). A lesson pins
	 * the score to the lesson's step; anything else plays from when the sim
	 * started it, on the sim's clock.
	 */
	function syncSpin(record: AvatarRenderState, avatar: VillageAvatarSnapshot, tick: number): void {
		if (avatar.performance) {
			const { playback, frame } = performanceFrame(avatar, avatar.performance, tick, 0);
			record.spin = performanceSpin(avatar, avatar.performance, playback, frame);
			return;
		}
		const { sequence } = playedSequence(avatar);
		if (!sequence) {
			if (record.spin !== EMPTY_HANDS) record.spin = EMPTY_HANDS;
			return;
		}
		if (avatar.lessonPhase !== null) {
			const step = avatar.lessonStep;
			if (step === null) {
				if (record.spin !== EMPTY_HANDS) record.spin = EMPTY_HANDS;
				return;
			}
			const ticksPerStep = rules.teaching.ticksPerStep;
			// The beat at the end of a pass holds the sequence's end pose.
			const holding = step >= avatar.lessonStepCount;
			record.spin = {
				sequence,
				scoreBeat: holding
					? avatar.lessonStepCount - 0.001
					: step + Math.min(0.999, avatar.lessonStepTick / ticksPerStep),
				beatsPerSecond: (rules.ticksPerSecond * speed) / ticksPerStep,
				active: !holding,
			};
			return;
		}
		const started = avatar.playbackStartTick ?? tick;
		record.spin = {
			sequence,
			scoreBeat: (tick - started) / rules.ticksPerSecond,
			beatsPerSecond: speed,
			active: true,
		};
	}

	// Each performance's playback, built once per plan: the phrases the sim
	// planned, played the way Flow Fest plays them, so the feet land on the
	// beat, the staffs keep their planes and the body turns with the phrase.
	const playbacks = new WeakMap<VillagePerformance, PhrasePlayback>();

	function performanceFrame(
		avatar: VillageAvatarSnapshot,
		perf: VillagePerformance,
		tick: number,
		sinceTick: number,
	): { playback: PhrasePlayback; frame: PhrasePlaybackFrame } {
		let playback = playbacks.get(perf);
		if (!playback) {
			playback = createPhrasePlayback(
				{
					id: avatar.id,
					seed: perf.seed,
					characterId: avatar.modelId,
					propFamily: avatar.propType,
					// Only the plan is played; the brain's inputs are spent.
					personality: { skill: 0, style: 0, energy: 0 },
					home: perf.home,
					areaRadius: perf.areaRadius,
					phrases: perf.phrases,
				},
				// A beat past the plan, so its last beat does not wrap to the first.
				{ tempoBpm: perf.tempoBpm, lengthBeats: perf.beats + 1 },
			);
			playbacks.set(perf, playback);
		}
		const seconds = (tick - perf.startTick) / rules.ticksPerSecond + sinceTick * speed;
		const beat = Math.max(0, Math.min(perf.beats, (seconds * perf.tempoBpm) / 60));
		return { playback, frame: playback.sample(beat) };
	}

	/**
	 * A performer's props for a frame: the phrase playing, pinned to its
	 * score, with its planes per beat and the body's turn. Poi keep their own
	 * rig's planes; the brain planned them as staffs.
	 */
	function performanceSpin(
		avatar: VillageAvatarSnapshot,
		perf: VillagePerformance,
		playback: PhrasePlayback,
		frame: PhrasePlaybackFrame,
	): VillageSpin {
		const sequence = sequenceCatalogue.get(frame.phrase.sequenceId);
		if (!sequence) return EMPTY_HANDS;
		return {
			sequence,
			scoreBeat: frame.scoreBeat,
			beatsPerSecond: (perf.tempoBpm / 60) * frame.scoreRate * speed,
			active: !frame.phrase.rest,
			...(avatar.propType === "poi" ? {} : { beatPlaneOverrides: phraseBeatPlaneOverrides(frame.phrase) }),
			facingHint: phraseFrameFacingHint(playback, frame),
			rootTurn: phraseFrameRootTurn(frame),
		};
	}

	function syncSequencePlayback(record: PlaybackRecord, avatar: PlaybackFields): void {
		const inst = record.instanceState;
		const { sequence, key } = playedSequence(avatar);

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
	 * step every teaching.ticksPerStep ticks. Not playing pauses the rig where
	 * it is; the beat at the end of a pass holds the sequence's end pose.
	 */
	function followLesson(inst: PlaybackRecord["instanceState"], avatar: PlaybackFields): void {
		if (avatar.lessonStep === null) {
			if (inst.isPlaying) inst.pause();
			return;
		}
		const ticksPerStep = rules.teaching.ticksPerStep;
		const stepsPerSecond = (rules.ticksPerSecond * speed) / ticksPerStep;
		const holding = avatar.lessonStep >= avatar.lessonStepCount;
		const expected = holding ? 0.999 : Math.min(0.999, avatar.lessonStepTick / ticksPerStep);
		const rigStep = Math.min(avatar.lessonStep, avatar.lessonStepCount - 1) + inst.motionStepOffset;

		if (inst.currentStepIndex !== rigStep) {
			inst.goToStep(rigStep);
			inst.setProgress(expected);
		} else if (Math.abs(inst.progress - expected) > LESSON_DRIFT) {
			inst.setProgress(expected);
		}
		if (holding) {
			if (inst.isPlaying) inst.pause();
			return;
		}
		inst.speed = stepsPerSecond;
		if (!inst.isPlaying) inst.play();
	}

	/**
	 * Walk each body to where the sim puts the avatar (village-walk.ts).
	 * Called every render frame; the sim only ticks a few times a second.
	 * Bodies follow the sim's path at its pace, turn on the spot with the
	 * turn clips before setting off the wrong way, end each walk in a planned
	 * stop on the mark, and standing still settle their gaze toward where
	 * they rest it (village-rest-facing.ts). Never a snap.
	 */
	let lastLerpAt: number | null = null;
	function lerpAvatars(deltaSeconds?: number): void {
		const now = performance.now();
		const measured = lastLerpAt === null ? 1 / 60 : (now - lastLerpAt) / 1000;
		const delta = Math.min(MAX_WALK_FRAME_SECONDS, deltaSeconds ?? measured);
		lastLerpAt = now;
		const watchRadius = rules.performance.attractionRadius;
		const running = driver.isRunning;
		const ticksPerSecond = rules.ticksPerSecond * speed;
		const sinceTick = Math.min(1 / Math.max(1e-6, ticksPerSecond), (now - lastTickAt) / 1000);
		const authoredSpeed = running && speed <= MAX_AUTHORED_WALK_SPEED;

		for (const record of records.values()) {
			const walk = walks.get(record.entityId);
			if (!walk) continue;
			const inst = record.instanceState;
			const { avatar } = record;

			// A performer is moved by the phrases, not the walker: planted,
			// turning, or walking the plan's steps on the beat. A fresh walker
			// takes over from wherever the performance ends.
			if (avatar.performance) {
				const { playback, frame } = performanceFrame(
					avatar,
					avatar.performance,
					snapshot.world.tick,
					running ? sinceTick : 0,
				);
				inst.position.x = frame.position.x;
				inst.position.z = frame.position.z;
				if (frame.facingAngle !== inst.facingAngle) inst.snapFacingAngle(frame.facingAngle);
				walk.walker = null;
				walk.setPose({
					x: frame.position.x,
					z: frame.position.z,
					yaw: frame.facingAngle,
					isMoving: frame.isMoving,
					moveSpeed: frame.moveSpeed,
					terminalStepPlan: frame.terminalStepPlan,
					turnRequest: frame.turnRequest ?? undefined,
					resetKey: walk.resetKey,
					moveDirection: frame.moveDirection,
					gaitTimingSample: frame.gaitTimingSample,
				});
				// Between ticks only a new phrase (or its settled turn) needs new
				// props; the tick pins the score.
				const spin = performanceSpin(avatar, avatar.performance, playback, frame);
				if (spin.sequence !== record.spin.sequence || spin.facingHint !== record.spin.facingHint) {
					record.spin = spin;
				}
				continue;
			}

			walk.walker ??= new VillageWalker({
				id: record.entityId,
				x: inst.position.x,
				z: inst.position.z,
				yaw: inst.facingAngle,
				arrivalThreshold: rules.movement.arrivalThreshold,
				fire: rules.campfire,
				resetKey: walk.resetKey,
			});

			const intent = running ? walkIntents.get(record.entityId) : undefined;
			const pace = intent ? intent.metresPerTick * ticksPerSecond : 0;
			const pose = walk.walker.step({
				delta,
				sim: { x: avatar.x, z: avatar.z },
				sinceTick,
				intent:
					intent && pace > 0
						? { target: { x: intent.targetX, z: intent.targetZ }, speed: pace }
						: null,
				restYaw: toRigYaw(restFacing(avatar, snapshot, watchRadius)),
				clock: walk.clock,
				// A body playing a sequence moves by its motion, not the clips.
				authored: authoredSpeed && record.spin.sequence === null,
			});

			inst.position.x = pose.x;
			inst.position.z = pose.z;
			// A snapFacingAngle, not setFacingAngle: the village never calls
			// updateLocomotion(), which is what eases toward a set target.
			if (pose.yaw !== inst.facingAngle) inst.snapFacingAngle(pose.yaw);
			walk.setPose(pose);
		}
	}

	function restart(runSeed: string): void {
		const wasRunning = driver.isRunning;
		driver.pause();
		records.clear();
		walks.clear();
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
				syncSpin(record, record.avatar, snapshot.world.tick);
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
			walks.clear();
			avatarList = [];
		},
	};
}
