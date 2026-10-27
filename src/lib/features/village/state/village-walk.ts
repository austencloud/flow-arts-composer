/**
 * How one villager's body walks where the sim sends them: starts, steady
 * travel and stops. Renderer only; the sim and its replay hashes never see it.
 *
 * The sim moves people a step per tick and says where they are headed
 * (engine/village-walk-intent.ts). The body used to chase each tick's
 * position with a fixed lerp, so its speed decayed toward every stop: the
 * walk clip shrank its stride to nothing and the feet slid in. Now:
 *
 * - Leaving: a body facing well away from where it is going first turns on
 *   the spot with the authored quarter-turn or about-face clips, then walks.
 * - Travel: the body follows the sim's path at the sim's own pace, a little
 *   behind, and tells the animator the speed it actually moves at.
 * - Arriving: within a few steps of the target it hands its last steps to a
 *   destination walk plan (shared/3d/locomotion/destination-walk-plan.ts) and
 *   the animator's terminal stop, so it brakes over two placements and lands
 *   on the mark on a footfall.
 * - Standing: it settles its gaze as before (village-rest-facing.ts), with the
 *   turn clips for anything wider than a glance.
 *
 * The animator's gait clock arrives one frame late through PerformerRig's
 * onGaitClock, exactly as in the Walk Lab (routes/test/walk-lab/WalkDriver).
 * Without a clock, or when the village runs faster than the clips can keep
 * up with, the body falls back to plain following.
 */

import type { LocomotionGaitClock, TerminalStepPlan, TurnRequest } from "@austencloud/scene-3d";
import {
	createDestinationWalkPlan,
	createTerminalStepPlan,
	sampleDestinationWalkPlan,
	type DestinationWalkPlan,
	type GroundPoint,
} from "#lib/shared/3d/locomotion/destination-walk-plan.js";
import {
	DEFAULT_EXACT_CADENCE,
	exactStepRange,
	MAX_EXACT_CADENCE,
	MAX_EXACT_STEPS,
	MIN_EXACT_CADENCE,
	MIN_EXACT_STEP_LENGTH_METERS,
	MIN_EXACT_STEPS,
} from "#lib/shared/3d/locomotion/straight-travel-constraints.js";
import { turnToward } from "./village-rest-facing";

/** What the sim says this frame, all in the rig's frame (yaw 0 faces +z). */
export interface VillageWalkFrame {
	/** Real seconds since the last frame, already capped. */
	delta: number;
	/** Where the sim has them at its latest tick. */
	sim: GroundPoint;
	/** Real seconds since that tick. */
	sinceTick: number;
	/** Where the sim is taking them and at how many metres per real second;
	 *  null while it has them standing (or the village is paused). */
	intent: { target: GroundPoint; speed: number } | null;
	/** The yaw to rest at while standing. */
	restYaw: number;
	/** The animator's clock from its last frame, once the body has one. */
	clock: LocomotionGaitClock | null;
	/** Whether turn clips and planned stops may run. */
	authored: boolean;
}

export interface VillageWalkPose {
	x: number;
	z: number;
	yaw: number;
	isMoving: boolean;
	moveSpeed: number;
	terminalStepPlan: TerminalStepPlan | null;
	/** Undefined when no turn runs, so the rig keeps its own beat turns. */
	turnRequest: TurnRequest | undefined;
	/** Bumped when the body is put somewhere rather than walked there. */
	resetKey: number;
}

export interface VillageWalkerOptions {
	id: string;
	x: number;
	z: number;
	yaw: number;
	/** How close the sim calls arrived (rules.movement.arrivalThreshold). */
	arrivalThreshold: number;
	/** The fire's clear circle: a planned last stretch never cuts through it. */
	fire: { x: number; z: number; clearRadius: number };
}

// Turning rates kept from B1: brisk into a walk's heading, unhurried when
// settling to look at someone.
const WALK_TURN_RADIANS_PER_SECOND = 4;
const REST_TURN_RADIANS_PER_SECOND = 2;

// The turn clips: ±90° and ±180°, each used within 22.5° of its angle
// (scene-3d ClipBasedTurnAnimator). Timing as the Walk Lab drives them
// (shared/3d/diagnostics/gait/walk-patterns.ts, turnLeg).
const TURN_SNAP = (22.5 * Math.PI) / 180;
const QUARTER_TURN_SECONDS = 1;
const ABOUT_FACE_SECONDS = 50 / 30;
const TURN_ENTRY_SECONDS = 0.3;
const TURN_RELEASE_SECONDS = 0.3;

/** Further than this from the sim and the body is put there, not walked. */
const SNAP_METRES = 4;
/** Hand over to a planned stop when the target is this many steps away. */
const ARM_STEPS = 4;
/** The shortest stop a walking body can make: two braking placements. */
const MIN_STOP_METRES = 0.9;
/** Below this a planned stop is not worth it; the body just stands. */
const MIN_PLAN_METRES = 0.4;
/** A standing body this far from where the sim stands them walks over.
 *  Wider than a stop's overshoot, so a stop never walks itself back. */
const SETTLE_GAP_METRES = 1.2;
/** A departure turn that would leave the body further behind the sim than
 *  this gives way to turning while walking. */
const TURN_LAG_METRES = 3;
/** A walking pace to assume before the sim has given one. */
const DEFAULT_PACE = 1.2;
/** A step length to assume before the animator has reported one. */
const DEFAULT_STEP_METRES = 0.7;
/** How far behind its chase point the body rides, in seconds of travel. */
const FOLLOW_SECONDS = 0.2;
const FOLLOW_GAIN_MIN = 0.7;
const FOLLOW_GAIN_MAX = 1.3;
/** Seconds for the follow speed to settle on a new pace. */
const SPEED_SMOOTHING_SECONDS = 0.25;
/** How long a settled stop pose holds before idle takes it back. */
const SETTLED_HOLD_SECONDS = 0.6;
/** A planned target the sim has moved this far from is dropped. */
const RETARGET_METRES = 0.5;
/** How far inside the fire's clear circle a straight last stretch may dip. */
const FIRE_MARGIN_METRES = 0.35;

/**
 * How many footfalls to land a stop of this length in: the current stride,
 * held inside the step counts the Walk Lab proved (straight-travel-
 * constraints.ts). Shorter than three proven steps, it shortens to two.
 */
export function planStepCount(distance: number, stepLength: number): number {
	const wanted = Math.max(2, Math.round(distance / Math.max(0.1, stepLength)));
	const range = exactStepRange(distance);
	if (range) return Math.min(range.max, Math.max(range.min, wanted));
	// Too short for three proven steps: the two braking placements alone.
	// Too long for the proven plans: the longest of them.
	return distance < MIN_EXACT_STEPS * MIN_EXACT_STEP_LENGTH_METERS ? 2 : MAX_EXACT_STEPS;
}

/**
 * The turn clip that covers a heading change, as the signed angle to ask
 * for: exact inside a clip's reach, the quarter turn's widest reach for the
 * gap between the two clips (the walk turns the rest), null for a glance.
 */
export function turnClipAngle(delta: number): number | null {
	const size = Math.abs(delta);
	const sign = Math.sign(delta);
	if (size < Math.PI / 2 - TURN_SNAP) return null;
	if (size <= Math.PI / 2 + TURN_SNAP) return delta;
	if (size < Math.PI - TURN_SNAP) return sign * (Math.PI / 2 + TURN_SNAP);
	return delta;
}

function wrap(angle: number): number {
	let a = angle;
	while (a > Math.PI) a -= Math.PI * 2;
	while (a < -Math.PI) a += Math.PI * 2;
	return a;
}

function yawToward(from: GroundPoint, to: GroundPoint): number {
	return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Meet an authored pose with zero velocity and acceleration at both seams. */
function smooth(u: number): number {
	const c = Math.min(1, Math.max(0, u));
	return c * c * c * (c * (c * 6 - 15) + 10);
}

function segmentClearsFire(
	a: GroundPoint,
	b: GroundPoint,
	fire: VillageWalkerOptions["fire"],
): boolean {
	const abx = b.x - a.x;
	const abz = b.z - a.z;
	const lengthSq = abx * abx + abz * abz;
	const t =
		lengthSq > 1e-9
			? Math.min(1, Math.max(0, ((fire.x - a.x) * abx + (fire.z - a.z) * abz) / lengthSq))
			: 0;
	const nearest = Math.hypot(a.x + abx * t - fire.x, a.z + abz * t - fire.z);
	return nearest >= fire.clearRadius - FIRE_MARGIN_METRES;
}

interface TurnState {
	request: Omit<TurnRequest, "phase" | "poseWeight">;
	seconds: number;
	elapsed: number;
}

interface PlanState {
	plan: DestinationWalkPlan;
	terminal: TerminalStepPlan;
	departureStep: number;
	departureDistanceStep: number;
	elapsed: number;
	settledFor: number;
}

type Mode = "stand" | "turn" | "follow" | "plan";

export class VillageWalker {
	private x: number;
	private z: number;
	private yaw: number;
	private mode: Mode = "stand";
	private speed = 0;
	private pace = DEFAULT_PACE;
	private turn: TurnState | null = null;
	private planned: PlanState | null = null;
	private lastFootfall: number | null = null;
	private stops = 0;
	private turns = 0;
	private resetKey = 0;

	constructor(private readonly options: VillageWalkerOptions) {
		this.x = options.x;
		this.z = options.z;
		this.yaw = options.yaw;
	}

	/** The stop being walked, for tests and diagnostics. */
	get activePlan(): DestinationWalkPlan | null {
		return this.planned?.plan ?? null;
	}

	get currentMode(): Mode {
		return this.mode;
	}

	step(frame: VillageWalkFrame): VillageWalkPose {
		const here = { x: this.x, z: this.z };
		if (Math.hypot(frame.sim.x - here.x, frame.sim.z - here.z) > SNAP_METRES) {
			this.place(frame.sim);
		}

		let moved = 0;
		let isMoving = false;
		let turnRequest: TurnRequest | undefined;

		if (this.mode === "turn") {
			turnRequest = this.advanceTurn(frame);
		}
		if (this.mode === "stand") {
			turnRequest = this.stand(frame) ?? turnRequest;
		}
		if (this.mode === "follow") {
			const travel = this.follow(frame);
			moved = travel.moved;
			isMoving = travel.moving;
		}
		if (this.mode === "plan") {
			const travel = this.walkPlan(frame);
			moved = travel.speed;
			isMoving = travel.moving;
		}

		if (frame.clock) this.lastFootfall = Math.floor(frame.clock.step);

		return {
			x: this.x,
			z: this.z,
			yaw: this.yaw,
			isMoving,
			moveSpeed: isMoving ? moved : 0,
			terminalStepPlan: this.planned?.terminal ?? null,
			turnRequest,
			resetKey: this.resetKey,
		};
	}

	private place(at: GroundPoint): void {
		this.x = at.x;
		this.z = at.z;
		this.mode = "stand";
		this.speed = 0;
		this.turn = null;
		this.planned = null;
		this.resetKey += 1;
	}

	/** Standing: settle the gaze, or set off when the sim wants them elsewhere. */
	private stand(frame: VillageWalkFrame): TurnRequest | undefined {
		const here = { x: this.x, z: this.z };
		const gap = Math.hypot(frame.sim.x - here.x, frame.sim.z - here.z);
		const goal = frame.intent
			? frame.intent.target
			: gap > SETTLE_GAP_METRES
				? frame.sim
				: null;
		const reach = goal ? Math.hypot(goal.x - here.x, goal.z - here.z) : 0;

		if (goal && reach > this.options.arrivalThreshold) {
			const heading = yawToward(here, goal);
			const pace = frame.intent?.speed ?? DEFAULT_PACE;
			if (this.startTurn(heading, frame, pace)) return this.advanceTurn(frame);
			this.depart(frame);
			return undefined;
		}

		if (this.startTurn(frame.restYaw, frame)) return this.advanceTurn(frame);
		this.yaw = turnToward(this.yaw, frame.restYaw, REST_TURN_RADIANS_PER_SECOND * frame.delta);
		return undefined;
	}

	/** Leave a standstill: walk the sim's path, or plan a short settling walk. */
	private depart(frame: VillageWalkFrame): void {
		if (frame.intent) {
			this.mode = "follow";
			return;
		}
		if (frame.authored && frame.clock) {
			// From a standstill the clock sits on a footfall, so the plan's
			// departure is the clock's own step.
			if (this.arm(frame.sim, frame.clock, frame.clock.step, DEFAULT_STEP_METRES, null)) return;
		}
		this.mode = "follow";
	}

	/** Start a turn clip toward a heading, when one covers it. */
	private startTurn(heading: number, frame: VillageWalkFrame, pace = 0): boolean {
		if (!frame.authored) return false;
		const angle = turnClipAngle(wrap(heading - this.yaw));
		if (angle === null) return false;
		const seconds = Math.abs(angle) > Math.PI * 0.75 ? ABOUT_FACE_SECONDS : QUARTER_TURN_SECONDS;
		// Turning on the spot while the sim walks on would leave the body far
		// behind; past that it turns into the walk instead.
		if (pace * (seconds + TURN_RELEASE_SECONDS) > TURN_LAG_METRES) return false;
		this.turns += 1;
		this.turn = {
			request: {
				planId: `${this.options.id}:turn:${this.turns}`,
				fromHeading: this.yaw,
				toHeading: this.yaw + angle,
				requireAuthored: true,
			},
			seconds,
			elapsed: 0,
		};
		this.planned = null;
		this.mode = "turn";
		return true;
	}

	/**
	 * Play the turn: the rig takes its yaw from the clip, so the facing handed
	 * out holds at the start heading until the clip lets go, then jumps to its
	 * end heading on the same frame the rig snaps there.
	 */
	private advanceTurn(frame: VillageWalkFrame): TurnRequest | undefined {
		const turn = this.turn;
		if (!turn) {
			this.mode = "stand";
			return undefined;
		}
		turn.elapsed += frame.delta;
		if (turn.elapsed >= turn.seconds + TURN_RELEASE_SECONDS) {
			this.yaw = turn.request.toHeading;
			this.turn = null;
			this.mode = "stand";
			return undefined;
		}
		const phase = Math.min(1, turn.elapsed / turn.seconds);
		const poseWeight =
			turn.elapsed <= turn.seconds
				? smooth(turn.elapsed / TURN_ENTRY_SECONDS)
				: 1 - smooth((turn.elapsed - turn.seconds) / TURN_RELEASE_SECONDS);
		this.yaw = turn.request.fromHeading;
		return { ...turn.request, phase, poseWeight };
	}

	/**
	 * Steady travel: ride a little behind where the sim's walker is now
	 * (its last tick, carried on toward its target), at the sim's pace.
	 */
	private follow(frame: VillageWalkFrame): { moved: number; moving: boolean } {
		const here = { x: this.x, z: this.z };
		const intent = frame.intent;
		if (intent) this.pace = intent.speed;
		const canStop = frame.authored && frame.clock !== null;
		const walking = this.speed > 0.05;

		const footfall =
			frame.clock !== null &&
			this.lastFootfall !== null &&
			Math.floor(frame.clock.step) > this.lastFootfall;
		if (canStop && footfall && walking && this.tryArm(frame, here)) {
			const travel = this.walkPlan(frame);
			return { moved: travel.speed, moving: travel.moving };
		}

		let chase: GroundPoint;
		let wanted: number;
		if (intent) {
			// The tick's position carried on toward the target by the time
			// since that tick, so the body never catches the sim and waits.
			chase = frame.sim;
			const left = Math.hypot(intent.target.x - frame.sim.x, intent.target.z - frame.sim.z);
			if (left > 1e-6) {
				const ahead = Math.min(left, intent.speed * frame.sinceTick) / left;
				chase = {
					x: frame.sim.x + (intent.target.x - frame.sim.x) * ahead,
					z: frame.sim.z + (intent.target.z - frame.sim.z) * ahead,
				};
			}
			const lag = Math.hypot(chase.x - here.x, chase.z - here.z);
			wanted = Math.min(
				intent.speed * FOLLOW_GAIN_MAX,
				Math.max(intent.speed * FOLLOW_GAIN_MIN, lag / FOLLOW_SECONDS),
			);
		} else if (canStop && walking) {
			// The sim stopped them: keep walking straight on until the next
			// footfall, where the planned stop takes over.
			const reach = this.speed * frame.delta + 1;
			chase = {
				x: here.x + Math.sin(this.yaw) * reach,
				z: here.z + Math.cos(this.yaw) * reach,
			};
			wanted = this.speed;
		} else {
			chase = frame.sim;
			const lag = Math.hypot(chase.x - here.x, chase.z - here.z);
			wanted = Math.min(lag / FOLLOW_SECONDS, this.pace * FOLLOW_GAIN_MAX);
		}

		const blend = 1 - Math.exp(-frame.delta / SPEED_SMOOTHING_SECONDS);
		this.speed += (wanted - this.speed) * blend;

		const lag = Math.hypot(chase.x - here.x, chase.z - here.z);
		const travel = Math.min(this.speed * frame.delta, lag);
		if (lag > 1e-6 && travel > 0) {
			this.x += ((chase.x - here.x) / lag) * travel;
			this.z += ((chase.z - here.z) / lag) * travel;
			if (lag > 0.02) {
				const heading = yawToward(here, chase);
				this.yaw = turnToward(this.yaw, heading, WALK_TURN_RADIANS_PER_SECOND * frame.delta);
			}
		}

		// Caught up with a sim that has stopped, and no stop was planned (no
		// clock yet, or the village runs too fast): stand where they are.
		const left = Math.hypot(chase.x - this.x, chase.z - this.z);
		if (!intent && left < 1e-3) {
			this.mode = "stand";
			this.speed = 0;
			return { moved: 0, moving: false };
		}
		const moved = frame.delta > 0 ? travel / frame.delta : 0;
		return { moved, moving: travel > 1e-5 };
	}

	/** On a footfall, hand the last steps to a planned stop if it is time. */
	private tryArm(frame: VillageWalkFrame, here: GroundPoint): boolean {
		const clock = frame.clock!;
		const stepLength =
			clock.cadence > 1e-3 ? Math.min(0.85, this.speed / clock.cadence) : DEFAULT_STEP_METRES;
		const heading = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };

		let target: GroundPoint;
		if (frame.intent) {
			target = frame.intent.target;
			const remaining = Math.hypot(target.x - here.x, target.z - here.z);
			if (remaining > ARM_STEPS * Math.max(0.4, stepLength)) return false;
			if (!segmentClearsFire(here, target, this.options.fire)) return false;
			if (remaining < MIN_PLAN_METRES) return false;
		} else {
			// The sim stopped them mid-walk: brake over two placements, on past
			// where it stopped them if a body could not stop shorter.
			const along = (frame.sim.x - here.x) * heading.x + (frame.sim.z - here.z) * heading.z;
			const distance = Math.max(along, MIN_STOP_METRES);
			target = { x: here.x + heading.x * distance, z: here.z + heading.z * distance };
		}

		const footfall = Math.floor(clock.step);
		const into = clock.step - footfall;
		// The plan starts on the footfall just made, a fraction of a step behind.
		const from = {
			x: here.x - heading.x * into * stepLength,
			z: here.z - heading.z * into * stepLength,
		};
		return this.arm(target, clock, footfall, stepLength, from, into);
	}

	private arm(
		target: GroundPoint,
		clock: LocomotionGaitClock,
		departureStep: number,
		stepLength: number,
		from: GroundPoint | null,
		into = 0,
	): boolean {
		const build = (start: GroundPoint): DestinationWalkPlan | null => {
			const distance = Math.hypot(target.x - start.x, target.z - start.z);
			if (distance < MIN_PLAN_METRES) return null;
			const steps = planStepCount(distance, stepLength);
			const mean = distance / steps;
			const cadence = Math.min(
				MAX_EXACT_CADENCE,
				Math.max(MIN_EXACT_CADENCE, this.speed > 0.05 ? this.speed / mean : DEFAULT_EXACT_CADENCE),
			);
			return createDestinationWalkPlan({ from: start, to: target, steps, cadence });
		};
		let plan = build(from ?? { x: this.x, z: this.z });
		// The plan's first step is not quite the stride walked so far: put its
		// start where sampling it `into` that step lands on the body, along the
		// plan's own line, so the hand-over never jumps.
		for (let pass = 0; plan && from && into > 0 && pass < 3; pass += 1) {
			const back = into * plan.stepDistances[0]!;
			plan = build({ x: this.x - plan.direction.x * back, z: this.z - plan.direction.z * back });
		}
		if (!plan) return false;
		this.stops += 1;
		const terminal = createTerminalStepPlan(
			plan,
			departureStep,
			`${this.options.id}:stop:${this.stops}`,
			Math.atan2(plan.direction.x, plan.direction.z),
		);
		this.planned = {
			plan,
			terminal,
			departureStep,
			departureDistanceStep: (clock.distanceStep ?? clock.step) - into,
			elapsed: 0,
			settledFor: 0,
		};
		this.mode = "plan";
		return true;
	}

	/** Walk the planned last steps by the animator's own clock. */
	private walkPlan(frame: VillageWalkFrame): { speed: number; moving: boolean } {
		const planned = this.planned!;
		const { plan } = planned;
		const clock = frame.clock;
		planned.elapsed += frame.delta;

		const status = clock?.terminal?.status ?? null;
		const committed = status === "braking" || status === "landed" || status === "settled";
		const retargeted =
			frame.intent !== null &&
			Math.hypot(frame.intent.target.x - plan.to.x, frame.intent.target.z - plan.to.z) >
				RETARGET_METRES;
		if (!clock || !frame.authored || (retargeted && !committed)) {
			// Dropped before braking: carry on following.
			this.planned = null;
			this.mode = "follow";
			return { speed: this.speed, moving: true };
		}

		const authoredStep = Math.max(0, clock.step - planned.departureStep);
		const distanceStep = Math.max(
			0,
			(clock.distanceStep ?? clock.step) - planned.departureDistanceStep,
		);
		const sample = sampleDestinationWalkPlan(
			plan,
			authoredStep,
			distanceStep,
			clock.cadence > 0 ? clock.cadence : plan.cadence,
		);
		const timedOut = planned.elapsed > plan.duration * 2 + 1;
		const position = timedOut ? plan.to : sample.position;
		this.x = position.x;
		this.z = position.z;
		const heading = Math.atan2(plan.direction.x, plan.direction.z);
		this.yaw = turnToward(this.yaw, heading, WALK_TURN_RADIANS_PER_SECOND * frame.delta);

		if (sample.arrived || timedOut) {
			this.speed = 0;
			planned.settledFor =
				status === "settled" || status === null || timedOut
					? planned.settledFor + frame.delta
					: 0;
			// A new walk, or the stop has held long enough: let idle take it.
			if (retargeted || planned.settledFor >= SETTLED_HOLD_SECONDS) {
				this.planned = null;
				this.mode = "stand";
			}
			return { speed: 0, moving: false };
		}
		this.speed = sample.speed;
		return { speed: sample.speed, moving: true };
	}
}
