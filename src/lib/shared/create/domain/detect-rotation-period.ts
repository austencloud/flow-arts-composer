import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { GridPlacement, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { QUARTER_PLACEMENT_MAP_CW, QUARTER_PLACEMENT_MAP_CCW } from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";

const periodCache = new Map<string, number>();

function derivePlacement(step: StepData): GridPlacement | null {
	const left = step.motions?.[HandSide.LEFT];
	const right = step.motions?.[HandSide.RIGHT];
	// Invisible placeholder = hand not really there (both-required Step shape).
	if (!isVisibleMotion(left) || !isVisibleMotion(right)) return null;
	if (!left.startLocation || !right.startLocation) return null;
	try {
		return getGridPlacementFromLocations(
			left.startLocation as GridLocation,
			right.startLocation as GridLocation
		);
	} catch {
		return null;
	}
}

export function detectRotationPeriod(seqId: string, steps: readonly StepData[]): number {
	const cached = periodCache.get(seqId);
	if (cached !== undefined) return cached;

	let period = 2;
	const len = steps.length;

	if (len >= 4 && len % 4 === 0) {
		const q = len / 4;
		const s0 = steps[0];
		const s1 = steps[q];
		const s2 = steps[q * 2];
		const s3 = steps[q * 3];
		const p0 = s0 ? derivePlacement(s0) : null;
		const p1 = s1 ? derivePlacement(s1) : null;
		const p2 = s2 ? derivePlacement(s2) : null;
		const p3 = s3 ? derivePlacement(s3) : null;

		if (p0 && p1 && p2 && p3) {
			const cw =
				QUARTER_PLACEMENT_MAP_CW[p0] === p1 &&
				QUARTER_PLACEMENT_MAP_CW[p1] === p2 &&
				QUARTER_PLACEMENT_MAP_CW[p2] === p3;
			const ccw =
				QUARTER_PLACEMENT_MAP_CCW[p0] === p1 &&
				QUARTER_PLACEMENT_MAP_CCW[p1] === p2 &&
				QUARTER_PLACEMENT_MAP_CCW[p2] === p3;
			if (cw || ccw) period = 4;
		}
	}

	periodCache.set(seqId, period);
	return period;
}
