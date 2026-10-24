/**
 * Golden replay for the village sim, and the parity target for the C++ port.
 *
 * Hash input contract (a port must build the same string to compare hashes):
 *   1. Run `new VillageOrchestrator({ rules: loadVillageRules(), seed: SEED,
 *      avatarModels: MODELS })`, then call `tick()` HASH_TICKS times.
 *      The constructor includes the staged opening (village-opening.ts), in
 *      this order: spawn the founders and light the stones at tick 0;
 *      spread the founders' ages; run `prologue.preRunTicks` full ticks
 *      (every system, the director's hooks, extinctions and playback, no
 *      snapshot); drop the pre-run's events; stage the opening on that tick;
 *      then update playback and build the entry snapshot. Its events hold
 *      only the opening's `teaching:started`. Ticks are numbered on from
 *      the pre-run, so the entry snapshot's tick is `prologue.preRunTicks`
 *      and the hashed one is that plus HASH_TICKS.
 *   2. Take the final VillageSnapshot (world, avatars, events of that tick).
 *   3. Round every number to 6 decimal places (`Math.round(n * 1e6) / 1e6`,
 *      with -0 written as 0). Cross-language sin/cos/log may differ in the
 *      last bits; rounding keeps those from flipping the hash.
 *   4. Serialise with canonicalJSON: object keys sorted, arrays kept in order,
 *      numbers in JavaScript's shortest round-trip form.
 *   5. Hash the string with cyrb128 and write the four words as 8-digit
 *      lowercase hex, joined in order.
 *
 * The event fixture holds every event from the entry snapshot through
 * FIXTURE_TICKS more ticks, rounded the same way, one JSON array.
 *
 * Changing the rules table, a system, or the order of random draws changes
 * these values. That is expected: rerun with `-u` to refresh the event
 * fixture, check its diff tells the story you meant to change, then paste the
 * new hash from the failure into the golden test.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "./village-orchestrator";
import type { VillageEvent } from "../domain/village-types";
import {
	roundSnapshotNumbers as roundNumbers,
	villageSnapshotHash as hashOf,
} from "./village-snapshot-hash";

const SEED = "village-replay-v1";
const MODELS = ["x-bot", "y-bot", "remy"];
// Three lifespans, so the hashed run holds deaths, births and lessons.
const HASH_TICKS = 12600;
const FIXTURE_TICKS = 600;

function createSim(seed = SEED, opening = true): VillageOrchestrator {
	return new VillageOrchestrator({ rules: loadVillageRules(), seed, avatarModels: MODELS, opening });
}

function runToHash(seed: string): string {
	const sim = createSim(seed);
	for (let i = 0; i < HASH_TICKS; i++) sim.tick();
	return hashOf(sim.snapshot);
}

describe("village replay", () => {
	it("reproduces the golden final snapshot for the reference seed", () => {
		expect(runToHash(SEED)).toBe("030581a37f094a601888967364845db0");
	});

	it("gives identical runs for the same seed and different runs for another", () => {
		expect(runToHash(SEED)).toBe(runToHash(SEED));
		expect(runToHash("village-replay-other")).not.toBe(runToHash(SEED));
	});

	it("matches the checked-in event stream for the first ticks", async () => {
		const sim = createSim();
		const events: VillageEvent[] = [...sim.snapshot.events];
		for (let i = 0; i < FIXTURE_TICKS; i++) events.push(...sim.tick().events);

		await expect(
			`${JSON.stringify(roundNumbers(events), null, "\t")}\n`,
		).toMatchFileSnapshot("./__fixtures__/village-replay-events.json");
	});
});

describe("village snapshot", () => {
	it("is plain data that survives a JSON round trip", () => {
		const sim = createSim();
		for (let i = 0; i < 300; i++) sim.tick();
		const snapshot = sim.snapshot;
		expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
	});

	// Guards the frozen-label bug: the renderer used to hold live sim objects,
	// so an avatar growing up never reached the screen. Each tick must hand
	// out new values, and an older snapshot must not change underneath.
	it("reports a phase change as a new value without rewriting older snapshots", () => {
		// From the founding, where everyone starts young.
		const sim = createSim(SEED, false);
		const before = sim.snapshot;
		const founder = before.avatars[0]!;
		expect(founder.phase).toBe("youth");

		let after = before;
		while (after.avatars.find((a) => a.id === founder.id)?.phase === "youth") {
			after = sim.tick();
			// Youth is the first fifth of a life, at most 1.1 lifespans long.
			expect(after.world.tick).toBeLessThan(sim.rules.population.lifespanTicks * 0.25);
		}

		expect(after.avatars.find((a) => a.id === founder.id)?.phase).toBe("adult");
		expect(before.avatars[0]!.phase).toBe("youth");
		expect(before.world.tick).toBe(0);
	});

	it("announces when the last carrier of a sequence is gone", () => {
		const sim = createSim();
		const seeds = new Set(sim.rules.seedSequenceIds);
		const extinct: string[] = [];
		for (let i = 0; i < HASH_TICKS && extinct.length === 0; i++) {
			for (const event of sim.tick().events) {
				if (event.type === "sequence:extinct") extinct.push(event.sequenceId);
			}
		}

		expect(extinct.length).toBeGreaterThan(0);
		const lost = extinct[0]!;
		expect(sim.snapshot.avatars.some((a) => a.knownSequenceIds.includes(lost))).toBe(false);
		if (seeds.has(lost)) expect(sim.snapshot.world.stats.extinctionCount).toBeGreaterThan(0);
	});

	it("names the sequence an avatar plays and when it started", () => {
		const sim = createSim();
		for (let i = 0; i < HASH_TICKS; i++) {
			const snapshot = sim.tick();
			const player = snapshot.avatars.find((a) => a.activeSequenceId !== null);
			if (!player) continue;
			expect(player.knownSequenceIds.includes(player.activeSequenceId!) || player.state === "learning").toBe(true);
			expect(player.playbackStartTick).toBeLessThanOrEqual(snapshot.world.tick);
			return;
		}
		throw new Error("no avatar played a sequence");
	});
});
