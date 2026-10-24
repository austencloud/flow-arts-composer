/**
 * The village's tuning table. Every number that shapes how the village lives
 * (population, lifespans, how long a lesson takes, how fast memory fades) is in
 * village-rules.json so the browser lab, the museum and the future Unreal port
 * all read the same values. Tuning is a data change, not a code change.
 *
 * The JSON stays plain (no comments, no computed values) so a C++ loader can
 * read it with FJsonObject. Named presets hold partial overrides; the museum's
 * room runs the "museum" preset.
 */

import rulesJson from "./village-rules.json";
import { isVillageTransform, type VillageTransform } from "./village-catalogue";

export interface VillageRules {
	version: number;
	ticksPerSecond: number;
	seedSequenceIds: string[];
	names: string[];
	propTypes: string[];
	effectLooks: string[];
	population: {
		target: number;
		lifespanTicks: number;
		lifespanJitterMin: number;
		lifespanJitterMax: number;
		traitMean: number;
		traitStdDev: number;
		capacityBase: number;
		capacityCuriosityBonus: number;
		seedProficiency: number;
		passingTicks: number;
		// A newborn may be handed one sequence by a living elder: this chance,
		// at this proficiency. Never guaranteed, so a line can still end.
		inheritChance: number;
		inheritProficiency: number;
	};
	phases: { youth: number; adult: number; elder: number };
	arena: {
		// Edge of the clearing. Nobody walks beyond it; newborns walk in from
		// between this ratio of the radius and the rim.
		radius: number;
		newbornRadiusMinRatio: number;
	};
	campfire: VillageCampfireRules;
	// One standing stone per seed sequence, at the clearing's edge. Its colour
	// is the sequence's colour: the stone, the lineage threads and the glow of
	// everyone who carries it (variations included) all use it.
	stones: VillageStoneRules[];
	movement: {
		stepPerTick: number;
		speedYouth: number;
		speedAdult: number;
		speedElder: number;
		arrivalThreshold: number;
		avoidanceRadius: number;
		repulsionStrength: number;
		personalSpaceRadius: number;
	};
	social: {
		idleTicksBase: number;
		idleSociabilityDamping: number;
		interactionCooldownTicks: number;
		seekRadius: number;
		// How long an avatar keeps looking for a partner before giving up.
		// While looking, it can pull an idle or wandering neighbour in.
		seekWindowTicks: number;
		inventChancePerCreativity: number;
		performChance: number;
		seekChanceBase: number;
		seekChancePerSociability: number;
		socializeTicks: number;
		practiceTicks: number;
		// Proficiency gained per tick of practising or performing a sequence.
		rehearsalGainPerTick: number;
		performTicksAdult: number;
		performTicksElder: number;
		watchTicks: number;
		mourningTicks: number;
		giftSociabilityMin: number;
		giftChancePerSociability: number;
		giftProficiencyScale: number;
		divaEgo: number;
		hierarchyEgo: number;
		egoDecayPerTick: number;
	};
	teaching: {
		ticksPerStep: number;
		proficiencyThreshold: number;
		fumbleBaseProbability: number;
		frustrationPerFumble: number;
		frustrationDecay: number;
		giveUpFrustration: number;
		giveUpImpatience: number;
		egoGainPerLesson: number;
		// Lesson speed scales with how well the teacher knows the sequence:
		// a teacher at 0 proficiency still teaches at this fraction of full.
		teacherQualityFloor: number;
	};
	// The lesson's choreography; see LessonComponent. Step timing is
	// teaching.ticksPerStep.
	lesson: {
		// Times the teacher plays the whole sequence before the learner joins.
		demonstratePasses: number;
		// How many steps the learner copies behind the teacher.
		followSteps: number;
		// How long both stop after a fumble before the teacher leads again.
		fumbleTicks: number;
		// The pause of recognition once the learner has it.
		recognitionTicks: number;
		// Times the learner plays the sequence alone at the end.
		soloPasses: number;
		// Scales the progress a learner makes for each step copied cleanly.
		progressPerStep: number;
		// For renderers: the stumbling learner plays the missed step at this
		// share of the lesson's tempo. The sim's timing does not depend on it.
		fumbleTempo: number;
	};
	// How an elder spends their last moments.
	passing: {
		// At this share of their lifespan a free elder walks to a seat by the
		// fire and sits there until they pass.
		retireAge: number;
		// Their walking pace on the way, on top of the elder's own.
		walkSpeed: number;
		// Students within this distance come and keep them company, standing
		// this far from the fire, this far apart.
		studentRadius: number;
		studentStandRadius: number;
		studentSpacing: number;
	};
	decay: {
		graceTicks: number;
		perTick: number;
		forgetThreshold: number;
		floor: number;
		patienceDamping: number;
		structuralBonusPerTransform: number;
		structuralBonusMax: number;
	};
	performance: { attractionRadius: number; minWatcherCuriosity: number };
	funeral: { radius: number; panicCuriosityMin: number; panicRadiusScale: number };
	monument: { generationThreshold: number };
	proximityLearning: {
		radius: number;
		absorptionRate: number;
		absorptionThreshold: number;
	};
	invention: { inventedProficiency: number };
	// The staged opening; see engine/village-opening.ts.
	prologue: {
		// Founders start at ages spread evenly from 0 up to this.
		founderAgeSpread: number;
		// The world lives this many ticks before the visitor's first frame, so
		// ages are staggered and the stones already carry history.
		preRunTicks: number;
		// The opening teacher is the oldest seed carrier at least this old.
		teacherMinAge: number;
		// The pair stand this far from the fire, on the audience's side; it
		// keeps them in the performers' ring, so their props clear the fire.
		lessonDistance: number;
		// The opening lesson's one fumble falls on this learner step (0 is
		// the first step they copy). No other fumble happens in it.
		fumbleAtStep: number;
		// Nobody else may pass within this many ticks of entry: everyone but
		// the opening teacher lives this much longer.
		clearTicks: number;
	};
	// Coming back to a remembered village (domain/village-input-log.ts): after
	// replaying to the tick the visitor left on, it lives this many ticks
	// more, unseen, before they see it again.
	memory: { carryOnTicks: number };
	// What a museum visitor can teach; see engine/village-visitor.ts.
	visitor: VillageVisitorRules;
	catalogue: {
		// Transforms that make the village's variations; see village-catalogue.ts.
		transforms: VillageTransform[];
		// "rotate" turns a sequence by this many eighths of a turn.
		rotateEighths: number;
	};
}

/**
 * The village gathers around one fire. Seats ring it close in; performers keep
 * to a wider band (the ring) so their props never reach the fire, the seats or
 * a neighbour; the band is split into lanes, one performer each. A wedge of
 * the ring facing the audience stays clear so a visitor sees the fire.
 * Angles are degrees in the sim's x/z plane, atan2(dz, dx): 0 is +x, 90 is +z.
 */
export interface VillageCampfireRules {
	x: number;
	z: number;
	// Nobody stands inside this; matches the forest campsite's cleared circle.
	clearRadius: number;
	// The seats come from the forest campsite contract
	// (scripts/forest-campsite-layout.json, communalZone), so the chairs the
	// campsite model draws are exactly where the sim seats people.
	seatRadius: number;
	seatAnglesDegrees: number[];
	ringInnerRadius: number;
	ringOuterRadius: number;
	laneCount: number;
	audienceAngleDegrees: number;
	// Width of the wedge kept free of lanes on the audience side.
	audienceGapDegrees: number;
	// How far from the fire a visitor stands to watch.
	audienceDistance: number;
}

export interface VillageStoneRules {
	sequenceId: string;
	colour: string;
	// Steps in the seed sequence (its variations have as many). The lesson's
	// timing counts them; a test checks them against the exhibit sequences.
	steps: number;
	x: number;
	z: number;
}

/**
 * The visitor teaches like a villager who knows the sequence this well and
 * has this much patience, and their lesson fumbles once, on this learner
 * step, like the opening's. Each sequence they can carry joins the catalogue
 * as a seed (its variations included) but founds no one. `stone` is the slot
 * behind the fire where a stone stands once the visitor first teaches one;
 * its colour is the colour of everything they carry.
 */
export interface VillageVisitorRules {
	// What the visitor can carry. The table lists exhibit sequences only;
	// withCarriedSequences adds a visitor's own, with its word and colour.
	sequences: { sequenceId: string; steps: number; word?: string; colour?: string }[];
	proficiency: number;
	patience: number;
	fumbleAtStep: number;
	stone: { colour: string; x: number; z: number };
}

type NumericGroup = Exclude<
	{
		[K in keyof VillageRules]: VillageRules[K] extends Record<string, number>
			? K
			: never;
	}[keyof VillageRules],
	undefined
>;

// The validator walks this list rather than trusting the JSON's own keys, so a
// typo'd or missing field fails loudly at load instead of reading as undefined
// and turning a whole system into NaN.
const NUMERIC_FIELDS: { [G in NumericGroup]: (keyof VillageRules[G])[] } = {
	population: [
		"target",
		"lifespanTicks",
		"lifespanJitterMin",
		"lifespanJitterMax",
		"traitMean",
		"traitStdDev",
		"capacityBase",
		"capacityCuriosityBonus",
		"seedProficiency",
		"passingTicks",
		"inheritChance",
		"inheritProficiency",
	],
	phases: ["youth", "adult", "elder"],
	arena: ["radius", "newbornRadiusMinRatio"],
	movement: [
		"stepPerTick",
		"speedYouth",
		"speedAdult",
		"speedElder",
		"arrivalThreshold",
		"avoidanceRadius",
		"repulsionStrength",
		"personalSpaceRadius",
	],
	social: [
		"idleTicksBase",
		"idleSociabilityDamping",
		"interactionCooldownTicks",
		"seekRadius",
		"seekWindowTicks",
		"inventChancePerCreativity",
		"performChance",
		"seekChanceBase",
		"seekChancePerSociability",
		"socializeTicks",
		"practiceTicks",
		"rehearsalGainPerTick",
		"performTicksAdult",
		"performTicksElder",
		"watchTicks",
		"mourningTicks",
		"giftSociabilityMin",
		"giftChancePerSociability",
		"giftProficiencyScale",
		"divaEgo",
		"hierarchyEgo",
		"egoDecayPerTick",
	],
	teaching: [
		"ticksPerStep",
		"proficiencyThreshold",
		"fumbleBaseProbability",
		"frustrationPerFumble",
		"frustrationDecay",
		"giveUpFrustration",
		"giveUpImpatience",
		"egoGainPerLesson",
		"teacherQualityFloor",
	],
	lesson: [
		"demonstratePasses",
		"followSteps",
		"fumbleTicks",
		"recognitionTicks",
		"soloPasses",
		"progressPerStep",
		"fumbleTempo",
	],
	passing: ["retireAge", "walkSpeed", "studentRadius", "studentStandRadius", "studentSpacing"],
	decay: [
		"graceTicks",
		"perTick",
		"forgetThreshold",
		"floor",
		"patienceDamping",
		"structuralBonusPerTransform",
		"structuralBonusMax",
	],
	performance: ["attractionRadius", "minWatcherCuriosity"],
	funeral: ["radius", "panicCuriosityMin", "panicRadiusScale"],
	monument: ["generationThreshold"],
	proximityLearning: ["radius", "absorptionRate", "absorptionThreshold"],
	invention: ["inventedProficiency"],
	memory: ["carryOnTicks"],
	prologue: ["founderAgeSpread", "preRunTicks", "teacherMinAge", "lessonDistance", "fumbleAtStep", "clearTicks"],
};

export class VillageRulesError extends Error {
	constructor(message: string) {
		super(`Invalid village rules: ${message}`);
		this.name = "VillageRulesError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNumber(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new VillageRulesError(`${path} must be a finite number >= 0`);
	}
	return value;
}

function requireStringList(value: unknown, path: string): string[] {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		!value.every((item) => typeof item === "string" && item.length > 0)
	) {
		throw new VillageRulesError(`${path} must be a non-empty list of strings`);
	}
	return value as string[];
}

/** Checks an untrusted table and returns it typed, or throws VillageRulesError. */
export function parseVillageRules(raw: unknown): VillageRules {
	if (!isRecord(raw)) throw new VillageRulesError("table must be an object");

	requireNumber(raw.version, "version");
	if (requireNumber(raw.ticksPerSecond, "ticksPerSecond") === 0) {
		throw new VillageRulesError("ticksPerSecond must be above 0");
	}
	requireStringList(raw.seedSequenceIds, "seedSequenceIds");
	requireStringList(raw.names, "names");
	requireStringList(raw.propTypes, "propTypes");
	requireStringList(raw.effectLooks, "effectLooks");

	for (const [group, fields] of Object.entries(NUMERIC_FIELDS)) {
		const block = raw[group];
		if (!isRecord(block)) throw new VillageRulesError(`${group} is missing`);
		for (const field of fields as string[]) {
			requireNumber(block[field], `${group}.${field}`);
		}
	}

	const catalogue = raw.catalogue;
	if (!isRecord(catalogue)) throw new VillageRulesError("catalogue is missing");
	for (const name of requireStringList(catalogue.transforms, "catalogue.transforms")) {
		if (!isVillageTransform(name)) {
			throw new VillageRulesError(`catalogue.transforms has unknown transform "${name}"`);
		}
	}
	requireNumber(catalogue.rotateEighths, "catalogue.rotateEighths");

	parseCampfire(raw.campfire);
	parseVisitor(raw.visitor, raw.seedSequenceIds as string[]);
	parseStones(raw.stones, raw.seedSequenceIds as string[]);

	const rules = raw as unknown as VillageRules;
	const { target, lifespanTicks, lifespanJitterMin, lifespanJitterMax } =
		rules.population;
	if (!Number.isInteger(target) || target < 1) {
		throw new VillageRulesError("population.target must be a whole number >= 1");
	}
	if (lifespanTicks < 1 || lifespanJitterMin > lifespanJitterMax) {
		throw new VillageRulesError("population lifespan range is empty");
	}
	const { preRunTicks, fumbleAtStep, clearTicks } = rules.prologue;
	if (!Number.isInteger(preRunTicks) || !Number.isInteger(fumbleAtStep) || !Number.isInteger(clearTicks)) {
		throw new VillageRulesError("prologue tick and step counts must be whole numbers");
	}
	const ring = rules.campfire;
	const { lessonDistance } = rules.prologue;
	if (lessonDistance < ring.ringInnerRadius || lessonDistance > ring.ringOuterRadius) {
		throw new VillageRulesError("prologue.lessonDistance must fall inside the performers' ring");
	}
	const phaseSum = rules.phases.youth + rules.phases.adult + rules.phases.elder;
	if (Math.abs(phaseSum - 1) > 1e-6) {
		throw new VillageRulesError(`phases must add up to 1 (got ${phaseSum})`);
	}
	return rules;
}

const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

function parseCampfire(value: unknown): void {
	if (!isRecord(value)) throw new VillageRulesError("campfire is missing");
	const numbers = [
		"x",
		"z",
		"clearRadius",
		"seatRadius",
		"ringInnerRadius",
		"ringOuterRadius",
		"laneCount",
		"audienceAngleDegrees",
		"audienceGapDegrees",
		"audienceDistance",
	];
	for (const field of numbers) {
		// The fire may sit anywhere, including at negative coordinates.
		if (field === "x" || field === "z") {
			if (typeof value[field] !== "number" || !Number.isFinite(value[field])) {
				throw new VillageRulesError(`campfire.${field} must be a finite number`);
			}
			continue;
		}
		requireNumber(value[field], `campfire.${field}`);
	}
	const angles = value.seatAnglesDegrees;
	if (!Array.isArray(angles) || !angles.every((a) => typeof a === "number" && Number.isFinite(a))) {
		throw new VillageRulesError("campfire.seatAnglesDegrees must be a list of numbers");
	}
	const fire = value as unknown as VillageCampfireRules;
	if (!(fire.clearRadius < fire.ringInnerRadius && fire.ringInnerRadius < fire.ringOuterRadius)) {
		throw new VillageRulesError(
			"campfire radii must grow outward: clearRadius < ringInnerRadius < ringOuterRadius",
		);
	}
	if (!Number.isInteger(fire.laneCount) || fire.laneCount < 1) {
		throw new VillageRulesError("campfire.laneCount must be a whole number >= 1");
	}
	if (fire.audienceGapDegrees >= 360) {
		throw new VillageRulesError("campfire.audienceGapDegrees must leave room for lanes");
	}
}

function parseStones(value: unknown, seedIds: readonly string[]): void {
	if (!Array.isArray(value)) throw new VillageRulesError("stones must be a list");
	const seen = new Set<string>();
	for (const stone of value) {
		if (!isRecord(stone) || typeof stone.sequenceId !== "string") {
			throw new VillageRulesError("each stone needs a sequenceId");
		}
		if (typeof stone.colour !== "string" || !COLOUR_PATTERN.test(stone.colour)) {
			throw new VillageRulesError(`stone ${stone.sequenceId} needs a #rrggbb colour`);
		}
		if (typeof stone.steps !== "number" || !Number.isInteger(stone.steps) || stone.steps < 1) {
			throw new VillageRulesError(`stone ${stone.sequenceId} needs a whole number of steps >= 1`);
		}
		for (const axis of ["x", "z"]) {
			if (typeof stone[axis] !== "number" || !Number.isFinite(stone[axis])) {
				throw new VillageRulesError(`stone ${stone.sequenceId} needs a finite ${axis}`);
			}
		}
		seen.add(stone.sequenceId);
	}
	// Exactly one stone per seed: a seed without a stone would have no colour
	// and nowhere for its loss to show.
	const matches =
		seen.size === value.length &&
		seen.size === seedIds.length &&
		seedIds.every((id) => seen.has(id));
	if (!matches) {
		throw new VillageRulesError("stones must name each seed sequence exactly once");
	}
}

function parseVisitor(value: unknown, seedIds: readonly string[]): void {
	if (!isRecord(value)) throw new VillageRulesError("visitor is missing");
	for (const field of ["proficiency", "patience", "fumbleAtStep"]) {
		requireNumber(value[field], `visitor.${field}`);
	}
	if (!Number.isInteger(value.fumbleAtStep)) {
		throw new VillageRulesError("visitor.fumbleAtStep must be a whole number");
	}
	const stone = value.stone;
	if (!isRecord(stone) || typeof stone.colour !== "string" || !COLOUR_PATTERN.test(stone.colour)) {
		throw new VillageRulesError("visitor.stone needs a #rrggbb colour");
	}
	for (const axis of ["x", "z"]) {
		if (typeof stone[axis] !== "number" || !Number.isFinite(stone[axis])) {
			throw new VillageRulesError(`visitor.stone needs a finite ${axis}`);
		}
	}
	if (!Array.isArray(value.sequences)) throw new VillageRulesError("visitor.sequences must be a list");
	const seen = new Set<string>(seedIds);
	for (const sequence of value.sequences) {
		if (!isRecord(sequence) || typeof sequence.sequenceId !== "string") {
			throw new VillageRulesError("each visitor sequence needs a sequenceId");
		}
		// One id, one catalogue entry: a carried sequence cannot also be a seed.
		if (seen.has(sequence.sequenceId)) {
			throw new VillageRulesError(`visitor sequence ${sequence.sequenceId} is listed twice`);
		}
		seen.add(sequence.sequenceId);
		const steps = sequence.steps;
		if (typeof steps !== "number" || !Number.isInteger(steps) || steps < 1) {
			throw new VillageRulesError(
				`visitor sequence ${sequence.sequenceId} needs a whole number of steps >= 1`,
			);
		}
	}
}

/**
 * A sequence the visitor brings that the rules table does not list, such as
 * one they made in the Composer. The sim needs only its step count; `steps`
 * is the SequenceData steps JSON, kept as is so the input log can carry it
 * and a return can rebuild its motion.
 */
export interface VillageCarriedSequence {
	sequenceId: string;
	word: string;
	stepCount: number;
	colour: string;
	steps?: readonly unknown[];
}

/**
 * These rules with the visitor also carrying each of `carried`. Ids the
 * visitor already carries are skipped, so an exhibit sequence passed here
 * changes nothing; an id that is a founder's seed is refused. With nothing to
 * add, the same rules object comes back, so a village without a visitor's own
 * sequence runs on exactly the table.
 */
export function withCarriedSequences(
	rules: VillageRules,
	carried: readonly VillageCarriedSequence[],
): VillageRules {
	const known = new Set(rules.visitor.sequences.map((s) => s.sequenceId));
	const added: VillageVisitorRules["sequences"] = [];
	for (const sequence of carried) {
		checkCarried(sequence, rules);
		if (known.has(sequence.sequenceId)) continue;
		known.add(sequence.sequenceId);
		added.push({
			sequenceId: sequence.sequenceId,
			steps: sequence.stepCount,
			word: sequence.word,
			colour: sequence.colour,
		});
	}
	if (added.length === 0) return rules;
	return { ...rules, visitor: { ...rules.visitor, sequences: [...rules.visitor.sequences, ...added] } };
}

function checkCarried(sequence: VillageCarriedSequence, rules: VillageRules): void {
	const id = sequence.sequenceId;
	// A colon marks a variation (village-catalogue.ts), so a seed id cannot hold one.
	if (typeof id !== "string" || id === "" || id.includes(":")) {
		throw new VillageRulesError("a carried sequence needs an id without a colon");
	}
	if (rules.seedSequenceIds.includes(id)) {
		throw new VillageRulesError(`carried sequence ${id} is a founder's seed`);
	}
	if (typeof sequence.word !== "string") throw new VillageRulesError(`carried sequence ${id} needs a word`);
	if (!Number.isInteger(sequence.stepCount) || sequence.stepCount < 1) {
		throw new VillageRulesError(`carried sequence ${id} needs a whole number of steps >= 1`);
	}
	if (typeof sequence.colour !== "string" || !COLOUR_PATTERN.test(sequence.colour)) {
		throw new VillageRulesError(`carried sequence ${id} needs a #rrggbb colour`);
	}
	if (sequence.steps !== undefined && sequence.steps.length !== sequence.stepCount) {
		throw new VillageRulesError(`carried sequence ${id} has ${sequence.steps.length} steps, not ${sequence.stepCount}`);
	}
}

/** Every id the catalogue treats as a seed: the founders' seeds, then what a visitor can carry. */
export function catalogueSeedIds(rules: VillageRules): string[] {
	return [...rules.seedSequenceIds, ...rules.visitor.sequences.map((s) => s.sequenceId)];
}

// Objects merge key by key; anything else (numbers, lists) is replaced whole.
function mergeOverrides(base: unknown, overrides: unknown): unknown {
	if (!isRecord(base) || !isRecord(overrides)) return overrides;
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(overrides)) {
		merged[key] = mergeOverrides(base[key], value);
	}
	return merged;
}

/**
 * Resolves the table, optionally with a named preset applied on top, and
 * validates the result. Pass `table` to load something other than the shipped
 * village-rules.json (tests, tuning experiments).
 */
export function loadVillageRules(
	preset?: string,
	table: unknown = rulesJson,
): VillageRules {
	if (!isRecord(table)) throw new VillageRulesError("table must be an object");
	const { presets, ...base } = table;
	let resolved: unknown = base;
	if (preset) {
		const override = isRecord(presets) ? presets[preset] : undefined;
		if (!isRecord(override)) {
			throw new VillageRulesError(`unknown preset "${preset}"`);
		}
		resolved = mergeOverrides(base, override);
	}
	return parseVillageRules(resolved);
}
