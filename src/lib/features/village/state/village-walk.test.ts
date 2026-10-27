/**
 * How a village body walks where the sim sends it (village-walk.ts): the
 * last steps of a walk are a planned stop that lands on the mark, a body
 * facing the wrong way turns on the spot with the turn clips first, and
 * nothing slides once it has stopped.
 *
 * The animator is faked by its gait clock: the authored step count advances
 * at the walk's cadence and a terminal plan brakes and lands at its own
 * gait steps, which is all the walker reads from it.
 */

import { describe, expect, it } from "vitest";
import type { LocomotionGaitClock, TerminalStepPlan } from "@austencloud/scene-3d";
import { exactStepRange } from "#lib/shared/3d/locomotion/straight-travel-constraints.js";
import {
	planStepCount,
	turnClipAngle,
	VillageWalker,
	type VillageWalkFrame,
	type VillageWalkPose,
} from "./village-walk";

const FRAME = 1 / 60;
const TICKS_PER_SECOND = 10;
const ARRIVAL = 0.3;
const FIRE = { x: 0, z: 0, clearRadius: 3.05 };
const STEP_METRES = 0.7;

/** The animator, as far as its gait clock goes. */
class FakeGait {
	private step = 0;
	private landedFor = 0;

	clock(pose: VillageWalkPose, delta: number): LocomotionGaitClock {
		const plan: TerminalStepPlan | null = pose.terminalStepPlan;
		let cadence = 0;
		let status: "armed" | "braking" | "landed" | "settled" | undefined;
		if (plan) {
			if (this.step < plan.landAtGaitStep) {
				cadence = plan.cadence;
				this.step = Math.min(plan.landAtGaitStep, this.step + cadence * delta);
				this.landedFor = 0;
			}
			if (this.step >= plan.landAtGaitStep) {
				this.landedFor += delta;
				status = this.landedFor > 0.3 ? "settled" : "landed";
			} else {
				status = this.step >= plan.startAtGaitStep ? "braking" : "armed";
			}
		} else if (pose.isMoving) {
			cadence = pose.moveSpeed / STEP_METRES;
			this.step += cadence * delta;
		} else {
			// Standing, the walk finishes on a footfall.
			this.step = Math.round(this.step);
		}
		return {
			phase: this.step % 1,
			step: this.step,
			distanceStep: this.step,
			cadence,
			strideScale: 1,
			tier: "walk",
			moving: cadence > 0,
			...(status && plan
				? { terminal: { status, foot: plan.terminalFoot, phase: 0 } }
				: {}),
		} as unknown as LocomotionGaitClock;
	}
}

/** The sim's movement system for one walker: a step per tick to the target. */
class FakeSim {
	x: number;
	z: number;
	moving = true;
	private sinceTick = 0;

	constructor(
		from: { x: number; z: number },
		public target: { x: number; z: number },
		public metresPerTick: number,
	) {
		this.x = from.x;
		this.z = from.z;
	}

	advance(delta: number): void {
		this.sinceTick += delta;
		while (this.sinceTick >= 1 / TICKS_PER_SECOND) {
			this.sinceTick -= 1 / TICKS_PER_SECOND;
			if (!this.moving) continue;
			const dx = this.target.x - this.x;
			const dz = this.target.z - this.z;
			const dist = Math.hypot(dx, dz);
			if (dist < ARRIVAL) {
				this.moving = false;
				continue;
			}
			const step = Math.min(this.metresPerTick, dist);
			this.x += (dx / dist) * step;
			this.z += (dz / dist) * step;
		}
	}

	frame(restYaw: number, clock: LocomotionGaitClock | null): VillageWalkFrame {
		return {
			delta: FRAME,
			sim: { x: this.x, z: this.z },
			sinceTick: this.sinceTick,
			intent: this.moving
				? { target: this.target, speed: this.metresPerTick * TICKS_PER_SECOND }
				: null,
			restYaw,
			clock,
			authored: true,
		};
	}
}

function walker(x: number, z: number, yaw: number): VillageWalker {
	return new VillageWalker({ id: "elder", x, z, yaw, arrivalThreshold: ARRIVAL, fire: FIRE });
}

interface Run {
	poses: VillageWalkPose[];
	plans: TerminalStepPlan[];
	steps: number[];
	distances: number[];
	departures: number[];
}

function run(body: VillageWalker, sim: FakeSim, seconds: number, restYaw = 0): Run {
	const gait = new FakeGait();
	let clock: LocomotionGaitClock | null = null;
	const out: Run = { poses: [], plans: [], steps: [], distances: [], departures: [] };
	for (let t = 0; t < seconds; t += FRAME) {
		sim.advance(FRAME);
		const pose = body.step(sim.frame(restYaw, clock));
		out.poses.push(pose);
		const plan = pose.terminalStepPlan;
		if (plan && !out.plans.some((p) => p.id === plan.id)) {
			out.plans.push(plan);
			out.steps.push(body.activePlan!.steps);
			out.distances.push(body.activePlan!.distance);
			out.departures.push(plan.landAtGaitStep - body.activePlan!.steps);
		}
		// One frame late, as PerformerRig's onGaitClock reports it.
		clock = gait.clock(pose, FRAME);
	}
	return out;
}

describe("planStepCount", () => {
	it("lands a stop in the current stride, inside the step counts the Walk Lab proved", () => {
		expect(planStepCount(2.1, 0.7)).toBe(3);
		expect(planStepCount(2.8, 0.7)).toBe(4);
		// A stride too long for the lab's steps takes the fewest it allows.
		expect(planStepCount(2.0, 1.2)).toBe(exactStepRange(2.0)!.min);
		// A long way is held to the lab's longest plan.
		expect(planStepCount(12, 0.7)).toBe(16);
		expect(planStepCount(20, 0.7)).toBe(16);
		// Too short for three proven steps: the two braking placements alone.
		expect(planStepCount(1.2, 0.7)).toBe(2);
		expect(planStepCount(0.6, 0.7)).toBe(2);
	});

	it("never plans a count outside the proven range when one exists", () => {
		for (let d = 0.5; d <= 9; d += 0.37) {
			for (const stride of [0.4, 0.6, 0.8, 1.1]) {
				const steps = planStepCount(d, stride);
				const range = exactStepRange(d);
				if (range) {
					expect(steps).toBeGreaterThanOrEqual(range.min);
					expect(steps).toBeLessThanOrEqual(range.max);
				} else {
					expect(steps).toBe(d < 1.65 ? 2 : 16);
				}
			}
		}
	});
});

describe("turnClipAngle", () => {
	it("leaves a glance to the walk and asks the clips for anything wider", () => {
		expect(turnClipAngle(0.5)).toBeNull();
		expect(turnClipAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
		expect(turnClipAngle(-Math.PI)).toBeCloseTo(-Math.PI);
		// Between the two clips the quarter turn goes as far as it reaches.
		expect(turnClipAngle((130 * Math.PI) / 180)).toBeCloseTo((112.5 * Math.PI) / 180);
	});
});

describe("VillageWalker", () => {
	it.each([
		// An elder retiring: 0.8 walk speed x 0.5 elder pace x 0.3 per tick.
		["an elder retiring to a chair", 0.8 * 0.5 * 0.3],
		// An adult at the sim's own pace, which is brisk.
		["an adult at the sim's pace", 0.8 * 0.3],
	])("walks %s and stops on the mark in a planned stop, without a slide", (_, perTick) => {
		const chair = { x: 0, z: -3.1 };
		const body = walker(0, -9, Math.PI);
		const sim = new FakeSim({ x: 0, z: -9 }, chair, perTick);
		const { poses, plans, steps, distances, departures } = run(body, sim, 9);

		// One planned stop, in a count the lab proved, two braking placements.
		expect(plans).toHaveLength(1);
		const plan = plans[0]!;
		expect(steps[0]).toBe(planStepCount(distances[0]!, STEP_METRES));
		const range = exactStepRange(distances[0]!);
		expect(range).not.toBeNull();
		expect(steps[0]).toBeGreaterThanOrEqual(range!.min);
		expect(steps[0]).toBeLessThanOrEqual(range!.max);
		expect(plan.landAtGaitStep - plan.startAtGaitStep).toBe(2);
		expect(plan.landAtGaitStep - departures[0]!).toBe(steps[0]);
		// The plan departs on a footfall, so the right foot lands it.
		expect(Number.isInteger(departures[0])).toBe(true);

		// It lands on the chair itself, not the sim's arrival distance short.
		const last = poses.at(-1)!;
		expect(last.x).toBeCloseTo(chair.x, 9);
		expect(last.z).toBeCloseTo(chair.z, 9);
		expect(last.isMoving).toBe(false);

		// Never a step back, and not a millimetre once it has stopped.
		for (let i = 1; i < poses.length; i += 1) {
			expect(poses[i]!.z).toBeGreaterThanOrEqual(poses[i - 1]!.z - 1e-6);
		}
		const stoppedAt = poses.findIndex(
			(p) => Math.hypot(p.x - chair.x, p.z - chair.z) < 1e-9,
		);
		expect(stoppedAt).toBeGreaterThan(0);
		for (const pose of poses.slice(stoppedAt)) {
			expect(pose.x).toBe(chair.x);
			expect(pose.z).toBe(chair.z);
			expect(pose.moveSpeed).toBe(0);
		}
	});

	it("turns on the spot with a turn clip before walking off the way it is not facing", () => {
		const body = walker(0, -9, 0);
		// Facing +z, sent toward -z: an about-face first.
		const sim = new FakeSim({ x: 0, z: -9 }, { x: 0, z: -14 }, 0.15);
		const { poses } = run(body, sim, 4);

		const first = poses[0]!;
		expect(first.turnRequest).toBeDefined();
		expect(first.turnRequest!.requireAuthored).toBe(true);
		expect(Math.abs(first.turnRequest!.toHeading - first.turnRequest!.fromHeading)).toBeCloseTo(
			Math.PI,
		);

		const turning = poses.filter((p) => p.turnRequest !== undefined);
		// The feet stay put through the turn.
		for (const pose of turning) {
			expect(pose.x).toBe(0);
			expect(pose.z).toBe(-9);
			expect(pose.isMoving).toBe(false);
		}
		// Then it walks, already facing the way it goes.
		const walking = poses.slice(turning.length).find((p) => p.isMoving)!;
		expect(walking).toBeDefined();
		expect(Math.abs(Math.cos(walking.yaw) + 1)).toBeLessThan(1e-6);
		expect(poses.at(-1)!.z).toBeLessThan(-10);
	});

	it("turns into the walk instead when standing to turn would leave it far behind", () => {
		const body = walker(0, -9, 0);
		// A youth at a run: an about-face on the spot would cost metres.
		const sim = new FakeSim({ x: 0, z: -9 }, { x: 0, z: -20 }, 0.3);
		const { poses } = run(body, sim, 1);
		expect(poses.every((p) => p.turnRequest === undefined)).toBe(true);
		expect(poses.at(-1)!.z).toBeLessThan(-9);
	});

	it("stops on its feet when the sim halts it mid-walk, never walking back", () => {
		const body = walker(-10, 0, Math.PI / 2);
		const sim = new FakeSim({ x: -10, z: 0 }, { x: 10, z: 0 }, 0.15);
		const gait = new FakeGait();
		let clock: LocomotionGaitClock | null = null;
		const poses: VillageWalkPose[] = [];
		for (let t = 0; t < 6; t += FRAME) {
			if (t >= 2 && sim.moving) sim.moving = false;
			sim.advance(FRAME);
			const pose = body.step(sim.frame(Math.PI / 2, clock));
			poses.push(pose);
			clock = gait.clock(pose, FRAME);
		}
		const plans = new Set(poses.map((p) => p.terminalStepPlan?.id).filter(Boolean));
		expect(plans.size).toBe(1);
		for (let i = 1; i < poses.length; i += 1) {
			expect(poses[i]!.x).toBeGreaterThanOrEqual(poses[i - 1]!.x - 1e-6);
		}
		const last = poses.at(-1)!;
		expect(last.isMoving).toBe(false);
		// Within a stride or so of where the sim stopped them.
		expect(Math.abs(last.x - sim.x)).toBeLessThan(1.2);
	});

	it("is put where the sim is, not walked there, after a jump", () => {
		const body = walker(0, 0, 0);
		const pose = body.step({
			delta: FRAME,
			sim: { x: 20, z: 5 },
			sinceTick: 0,
			intent: null,
			restYaw: 0,
			clock: null,
			authored: true,
		});
		expect(pose.x).toBe(20);
		expect(pose.z).toBe(5);
		expect(pose.resetKey).toBe(1);
		expect(pose.isMoving).toBe(false);
	});

	it("just follows when the clips cannot run, and stands where the sim stops", () => {
		const body = walker(0, -9, Math.PI);
		const sim = new FakeSim({ x: 0, z: -9 }, { x: 0, z: -3.1 }, 0.12);
		const poses: VillageWalkPose[] = [];
		for (let t = 0; t < 9; t += FRAME) {
			sim.advance(FRAME);
			poses.push(body.step({ ...sim.frame(0, null), authored: false }));
		}
		expect(poses.every((p) => p.terminalStepPlan === null && p.turnRequest === undefined)).toBe(
			true,
		);
		const last = poses.at(-1)!;
		expect(last.x).toBeCloseTo(sim.x, 6);
		expect(last.z).toBeCloseTo(sim.z, 6);
		expect(last.isMoving).toBe(false);
	});
});
