/**
 * The hash the replay tests compare, and the parity target for the C++ port;
 * engine/village-replay.test.ts documents the contract. Round every number to
 * 6 decimal places (-0 written as 0), serialise with canonicalJSON, hash with
 * cyrb128, and write the four words as 8-digit lowercase hex.
 */

import { canonicalJSON } from "#lib/shared/foundation/utils/canonical-json.js";
import { cyrb128 } from "#lib/shared/foundation/utils/seeded-rng.js";

export function roundSnapshotNumbers(value: unknown): unknown {
	if (typeof value === "number") {
		const rounded = Math.round(value * 1e6) / 1e6;
		return Object.is(rounded, -0) ? 0 : rounded;
	}
	if (Array.isArray(value)) return value.map(roundSnapshotNumbers);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, roundSnapshotNumbers(v)]),
		);
	}
	return value;
}

export function villageSnapshotHash(value: unknown): string {
	return cyrb128(canonicalJSON(roundSnapshotNumbers(value)))
		.map((word) => word.toString(16).padStart(8, "0"))
		.join("");
}
