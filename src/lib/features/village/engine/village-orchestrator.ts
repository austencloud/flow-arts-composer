/**
 * Runs one village. `tick()` advances the sim by exactly one step and returns
 * that step's snapshot; nothing in here reads the clock or owns a timer, so the
 * same seed and rules always produce the same run. Timing (speed, pause,
 * frame pacing) belongs to village-driver.ts.
 */

import {
	VISITOR_ID,
	type PopulationStats,
	type VillageEvent,
	type VillageEventInput,
	type VillageWorld,
} from "../domain/village-types";
import type { VillageRules } from "../domain/village-rules";
import type { VillageEventEmitter } from "./village-event-emitter";
import { createVillageWorld } from "./village-world";
import {
	planVillageCatalogue,
	type VillageCatalogueEntry,
} from "../domain/village-catalogue";
import { createVillageStream } from "./village-rng";
import {
	buildVillageSnapshot,
	campfireSnapshot,
	resolveActiveSequenceId,
	type VillageCampfireSnapshot,
	type VillageMemorySnapshot,
	type VillageSnapshot,
} from "./village-snapshot";
import { planCampLayout, sequenceColour } from "../domain/village-campfire";
import { LifecycleSystem } from "./systems/lifecycle-system";
import { MovementSystem } from "./systems/movement-system";
import { SocialSystem } from "./systems/social-system";
import { TeachingSystem } from "./systems/teaching-system";
import { RecombinationSystem } from "./systems/recombination-system";
import { PopulationSystem } from "./systems/population-system";
import { DecaySystem } from "./systems/decay-system";
import { PerformanceSystem } from "./systems/performance-system";
import { FuneralSystem } from "./systems/funeral-system";
import { MonumentSystem } from "./systems/monument-system";
import { ProximityLearningSystem } from "./systems/proximity-learning-system";
import { OpeningDirector } from "./village-opening";
import {
	canLearnFromVisitor,
	cancelVisitorLesson,
	isVisitorSequence,
	startVisitorLesson,
	type VisitorLessonRequest,
} from "./village-visitor";
import {
	catalogueSeedIds,
	withCarriedSequences,
	type VillageCarriedSequence,
} from "../domain/village-rules";
import {
	roundFacing,
	roundPosition,
	VILLAGE_INPUT_LOG_VERSION,
	VillageInputLogError,
	type VillageInputEntry,
	type VillageInputLog,
	type VillageLoggedSequence,
} from "../domain/village-input-log";

// A replayed log's own sequences, as descriptors.
function loggedSequences(log: VillageInputLog | undefined): VillageCarriedSequence[] {
	return Object.entries(log?.sequences ?? {}).map(([sequenceId, logged]) => ({
		sequenceId,
		word: logged.word,
		colour: logged.colour,
		stepCount: logged.stepCount,
		...(logged.steps ? { steps: logged.steps } : {}),
	}));
}

// Every catalogue id has a seed with a stone, so this only shows if a
// monument ever names something outside the catalogue.
const FALLBACK_STONE_COLOUR = "#d8d2c4";

export interface VillageSimOptions {
	rules: VillageRules;
	// Master seed for every random choice in the run.
	seed: string;
	// Rig models avatars may wear; see CreateAvatarOptions.avatarModels.
	avatarModels: readonly string[];
	// Live the prologue's pre-run unseen, then stage the opening lesson
	// (engine/village-opening.ts). Defaults to true.
	opening?: boolean;
	// The rules preset these rules came from, recorded in the input log;
	// null (the default) for the base table.
	preset?: string | null;
	// Come back to a remembered village: replay this log (its seed and
	// opening must match these options), then live `memory.carryOnTicks`
	// more, unseen. See domain/village-input-log.ts.
	replay?: VillageInputLog;
	// Sequences the visitor brought that the rules table does not list, such
	// as one made in the Composer; see withCarriedSequences. A replayed log
	// adds the ones it carries itself, so a return needs none passed here.
	carried?: readonly VillageCarriedSequence[];
}

export class VillageOrchestrator implements VillageEventEmitter {
	readonly rules: VillageRules;
	readonly seed: string;
	// Every sequence this village can ever name; see village-catalogue.ts.
	readonly catalogue: readonly VillageCatalogueEntry[];

	private world: VillageWorld = createVillageWorld();
	private lifecycleSystem: LifecycleSystem;
	private movementSystem: MovementSystem;
	private socialSystem: SocialSystem;
	private teachingSystem: TeachingSystem;
	private recombinationSystem: RecombinationSystem;
	private populationSystem: PopulationSystem;
	private decaySystem: DecaySystem;
	private performanceSystem: PerformanceSystem;
	private funeralSystem: FuneralSystem;
	private monumentSystem: MonumentSystem;
	private proximityLearningSystem: ProximityLearningSystem;
	private openingDirector: OpeningDirector;

	private _currentTick = 0;
	private readonly preset: string | null;
	private readonly opening: boolean;
	private inputEntries: VillageInputEntry[] = [];
	// What the visitor brought from outside the table, by id, for the log.
	private readonly carried = new Map<string, VillageCarriedSequence>();
	// True once this village is a remembered one the visitor came back to.
	private remembered = false;
	private pendingEvents: VillageEvent[] = [];
	private everKnown = new Set<string>();
	private knownLastTick = new Set<string>();
	private playback = new Map<string, { sequenceId: string; startTick: number }>();
	private _snapshot: VillageSnapshot;
	private campfire: VillageCampfireSnapshot;

	constructor(options: VillageSimOptions) {
		const { seed } = options;
		for (const sequence of [...(options.carried ?? []), ...loggedSequences(options.replay)]) {
			const same = this.carried.get(sequence.sequenceId);
			if (same && same.stepCount !== sequence.stepCount) {
				throw new VillageInputLogError(`sequence ${sequence.sequenceId} is carried with two step counts`);
			}
			if (!same && !isVisitorSequence(options.rules, sequence.sequenceId)) {
				this.carried.set(sequence.sequenceId, sequence);
			}
		}
		const rules = withCarriedSequences(options.rules, [...this.carried.values()]);
		this.rules = rules;
		this.seed = seed;
		this.preset = options.preset ?? null;
		this.opening = options.opening ?? true;
		this.catalogue = planVillageCatalogue(catalogueSeedIds(rules), rules.catalogue.transforms);
		this.campfire = campfireSnapshot(planCampLayout(rules));

		this.lifecycleSystem = new LifecycleSystem(rules);
		this.movementSystem = new MovementSystem(rules);
		this.socialSystem = new SocialSystem(rules, this, createVillageStream(seed, "social"));
		this.teachingSystem = new TeachingSystem(
			rules,
			this,
			createVillageStream(seed, "teaching"),
		);
		this.recombinationSystem = new RecombinationSystem(
			rules,
			this,
			createVillageStream(seed, "recombination"),
			this.catalogue,
		);
		this.decaySystem = new DecaySystem(rules, this);
		this.performanceSystem = new PerformanceSystem(rules);
		this.funeralSystem = new FuneralSystem(rules, this);
		this.monumentSystem = new MonumentSystem(rules, this, rules.seedSequenceIds);
		this.proximityLearningSystem = new ProximityLearningSystem(rules);
		this.populationSystem = new PopulationSystem({
			rules,
			emitter: this,
			avatarModels: options.avatarModels,
			identityRng: createVillageStream(seed, "identity"),
			populationRng: createVillageStream(seed, "population"),
			onDeath: (deceased) =>
				this.funeralSystem.onDeath(deceased, this.world, this._currentTick),
		});

		this.openingDirector = new OpeningDirector(rules, this.socialSystem);

		this.populationSystem.spawnFounders(this.world, rules.seedSequenceIds);
		// Light the seed stones for the founders before the first snapshot.
		this.monumentSystem.tick(this.world, 0);
		if (this.opening) {
			this.openingDirector.staggerFounders(this.world);
			for (let i = 0; i < rules.prologue.preRunTicks; i++) this.advance();
			// Nobody watched the pre-run; its events are history, not news.
			this.pendingEvents = [];
			this.openingDirector.stage(this.world, this._currentTick);
		}
		this.announceExtinctions();
		this.updatePlayback();
		if (options.replay) this.replay(options.replay);
		this._snapshot = this.buildSnapshot();
	}

	/**
	 * Rebuilds the visitor's village: each entry applies when the sim reaches
	 * its tick, exactly as it did live, up to the log's last tick; then the
	 * village lives `memory.carryOnTicks` more. Everything in between is
	 * history, so its events are dropped. The opening is staged once, by the
	 * constructor, as in the original run; it is long over by the return.
	 */
	private replay(log: VillageInputLog): void {
		if (log.version !== VILLAGE_INPUT_LOG_VERSION) {
			throw new VillageInputLogError(`version must be ${VILLAGE_INPUT_LOG_VERSION}`);
		}
		if (log.seed !== this.seed || log.opening !== this.opening || log.preset !== this.preset) {
			throw new VillageInputLogError("seed, preset and opening must match the village's");
		}
		if (log.lastTick < this._currentTick) {
			throw new VillageInputLogError("lastTick is before the village opens");
		}
		for (const entry of log.entries) {
			if (entry.type === "teach" && !isVisitorSequence(this.rules, entry.sequenceId)) {
				throw new VillageInputLogError(`teaches ${entry.sequenceId}, which the log does not carry`);
			}
		}
		let next = 0;
		const applyDue = () => {
			for (; next < log.entries.length && log.entries[next]!.tick <= this._currentTick; next++) {
				const entry = log.entries[next]!;
				if (entry.type === "cancel") this.cancelVisitorLesson();
				else this.teachFromVisitor(entry);
			}
		};
		applyDue();
		while (this._currentTick < log.lastTick) {
			this.advance();
			applyDue();
		}
		for (let i = 0; i < this.rules.memory.carryOnTicks; i++) this.advance();
		this.pendingEvents = [];
		this.remembered = true;
	}

	/**
	 * Everything the visitor has done to this village so far, to keep and
	 * replay later. A replayed village's log carries on from the one it was
	 * built from.
	 */
	get inputLog(): VillageInputLog {
		const log: VillageInputLog = {
			version: VILLAGE_INPUT_LOG_VERSION,
			seed: this.seed,
			preset: this.preset,
			opening: this.opening,
			entries: this.inputEntries.map((entry) => ({ ...entry })),
			lastTick: this._currentTick,
		};
		const sequences: Record<string, VillageLoggedSequence> = {};
		for (const entry of this.inputEntries) {
			const carried = entry.type === "teach" ? this.carried.get(entry.sequenceId) : undefined;
			if (!carried) continue;
			sequences[carried.sequenceId] = {
				word: carried.word,
				colour: carried.colour,
				stepCount: carried.stepCount,
				...(carried.steps ? { steps: structuredClone([...carried.steps]) } : {}),
			};
		}
		if (Object.keys(sequences).length > 0) log.sequences = sequences;
		return log;
	}

	/** Advances one step and returns what the village looks like after it. */
	tick(): VillageSnapshot {
		this.advance();
		this._snapshot = this.buildSnapshot();
		return this._snapshot;
	}

	private advance(): void {
		this._currentTick++;
		const tick = this._currentTick;

		this.openingDirector.beforeTick(this.world, tick);
		this.lifecycleSystem.tick(this.world, tick);
		this.socialSystem.tick(this.world, tick);
		this.performanceSystem.tick(this.world);
		this.teachingSystem.tick(this.world, tick);
		this.proximityLearningSystem.tick(this.world, tick);
		this.decaySystem.tick(this.world, tick);
		this.recombinationSystem.tick(this.world, tick);
		this.movementSystem.tick(this.world);
		this.monumentSystem.tick(this.world, tick);
		this.populationSystem.tick(this.world, tick);
		this.openingDirector.afterTick(this.world);

		this.announceExtinctions();
		this.updatePlayback();
	}

	/**
	 * The visitor starts teaching this villager, standing at (x, z) in sim
	 * space; see engine/village-visitor.ts. Applies between ticks: its
	 * `teaching:started` arrives with the next tick's snapshot. False (and
	 * nothing changes) when the sequence is not one the visitor carries, the
	 * villager knows it already or is past being taught, or they are one of
	 * the opening's pair while its lesson plays. A lesson already under way
	 * is cancelled first.
	 */
	teachFromVisitor(input: VisitorLessonRequest): boolean {
		// Rounded first, so the log holds exactly what the sim used.
		const request: VisitorLessonRequest = {
			learnerId: input.learnerId,
			sequenceId: input.sequenceId,
			x: roundPosition(input.x),
			z: roundPosition(input.z),
			facing: roundFacing(input.facing),
		};
		const opening = this.openingDirector.current;
		if (
			opening?.phase === "lesson" &&
			(request.learnerId === opening.teacherId || request.learnerId === opening.learnerId)
		) {
			return false;
		}
		const learner = this.world.entities.find((e) => e.id === request.learnerId);
		if (
			!learner ||
			!isVisitorSequence(this.rules, request.sequenceId) ||
			!canLearnFromVisitor(learner, request.sequenceId)
		) {
			return false;
		}
		cancelVisitorLesson(this.world, this.rules);
		const started = startVisitorLesson(this.world, this.rules, this.socialSystem, request);
		if (started) this.inputEntries.push({ tick: this._currentTick, type: "teach", ...request });
		return started;
	}

	/** Stops the visitor's lesson, if one is under way; the learner goes back to ordinary life. */
	cancelVisitorLesson(): void {
		if (!this.world.visitor) return;
		cancelVisitorLesson(this.world, this.rules);
		this.inputEntries.push({ tick: this._currentTick, type: "cancel" });
	}

	emit(event: VillageEventInput): void {
		this.pendingEvents.push({ ...event, tick: this._currentTick });
		if (event.type === "sequence:invented") {
			const inventor = this.world.entities.find((e) => e.id === event.avatarId);
			if (inventor) this.monumentSystem.recordInvention(inventor, event.sequenceId);
		} else if (event.type === "teaching:completed" && event.teacherId === VISITOR_ID) {
			this.monumentSystem.recordVisitorLesson(event.sequenceId);
		}
	}

	get currentTick(): number {
		return this._currentTick;
	}

	get snapshot(): VillageSnapshot {
		return this._snapshot;
	}

	private buildSnapshot(): VillageSnapshot {
		const opening = this.openingDirector.current;
		const snapshot = buildVillageSnapshot({
			world: this.world,
			tick: this._currentTick,
			generation: this.populationSystem.currentGeneration,
			monuments: this.monumentSystem.monuments,
			events: this.pendingEvents,
			stats: this.computeStats(),
			playbackStartTicks: new Map(
				[...this.playback].map(([id, p]) => [id, p.startTick]),
			),
			campfire: this.campfire,
			colourOf: (id) => sequenceColour(this.rules, id) ?? FALLBACK_STONE_COLOUR,
			rules: this.rules,
			opening: opening ? { ...opening } : null,
			memory: this.remembered ? this.memory() : null,
		});
		this.pendingEvents = [];
		return snapshot;
	}

	// What came of the visitor's sequence while they were away: read from its
	// stone, so null if they never finished teaching one.
	private memory(): VillageMemorySnapshot | null {
		const stone = this.monumentSystem.monuments.find((m) => m.fromVisitor);
		if (!stone) return null;
		return {
			sequenceId: stone.sequenceId,
			taughtTick: stone.createdAtTick,
			carrierCount: stone.carrierCount,
			generations: stone.cohortsSurvived.length,
			lost: stone.carrierCount === 0,
		};
	}

	// A sequence is extinct the moment no one in the village knows it any
	// more, whether its last carrier died or simply forgot it.
	private announceExtinctions(): void {
		const knownNow = new Set<string>();
		for (const entity of this.world.entities) {
			for (const id of entity.knowledge.knownSequences.keys()) knownNow.add(id);
		}
		for (const id of this.knownLastTick) {
			if (!knownNow.has(id)) this.emit({ type: "sequence:extinct", sequenceId: id });
		}
		for (const id of knownNow) this.everKnown.add(id);
		this.knownLastTick = knownNow;
	}

	private updatePlayback(): void {
		const alive = new Set<string>();
		for (const entity of this.world.entities) {
			alive.add(entity.id);
			const active = resolveActiveSequenceId(entity);
			const current = this.playback.get(entity.id);
			if (!active) {
				this.playback.delete(entity.id);
			} else if (current?.sequenceId !== active) {
				this.playback.set(entity.id, { sequenceId: active, startTick: this._currentTick });
			}
		}
		for (const id of this.playback.keys()) {
			if (!alive.has(id)) this.playback.delete(id);
		}
	}

	private computeStats(): PopulationStats {
		const entities = this.world.entities;
		let totalAge = 0;
		let totalKnowledge = 0;
		for (const entity of entities) {
			totalAge += entity.lifecycle.currentAge;
			totalKnowledge += entity.knowledge.knownSequences.size;
		}
		return {
			alive: entities.length,
			averageAge: entities.length > 0 ? totalAge / entities.length : 0,
			totalKnowledge,
			uniqueSequences: this.knownLastTick.size,
			extinctionCount: this.everKnown.size - this.knownLastTick.size,
			currentGeneration: this.populationSystem.currentGeneration,
		};
	}
}
