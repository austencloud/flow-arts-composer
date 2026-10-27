import type {
	AvatarBehaviorState,
	LifecyclePhase,
	VillageWorld,
} from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import { keepToClearing } from "../../domain/village-campfire";

// Heading in to the seats by the fire, or to stand beside one, rather than
// keeping to the performers' ring.
const FIRESIDE_STATES: ReadonlySet<AvatarBehaviorState> = new Set([
	"retiring",
	"seated",
	"attending",
]);

/**
 * Metres a walker covers in one tick before steering: their walk speed, the
 * pace of their age, and the table's step. The renderer reads the same
 * number (village-walk-intent.ts) so a body walks at the sim's pace.
 */
export function walkStepPerTick(
	speed: number,
	phase: LifecyclePhase,
	rules: VillageRules,
): number {
	const movement = rules.movement;
	const phaseSpeed =
		phase === "youth"
			? movement.speedYouth
			: phase === "adult"
				? movement.speedAdult
				: movement.speedElder;
	return speed * phaseSpeed * movement.stepPerTick;
}

export class MovementSystem {
	constructor(private rules: VillageRules) {}

	tick(world: VillageWorld): void {
		const movement = this.rules.movement;

		for (const entity of world.entities) {
			if (entity.social.state === "passing") continue;
			if (entity.transform.speed === 0) continue;

			const dx = entity.transform.targetX - entity.transform.x;
			const dz = entity.transform.targetZ - entity.transform.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			if (dist < movement.arrivalThreshold) {
				entity.transform.speed = 0;
				continue;
			}

			const nx = dx / dist;
			const nz = dz / dist;

			// Steer away from nearby avatars. O(N²), harmless at village size.
			let steerX = 0;
			let steerZ = 0;
			for (const other of world.entities) {
				if (other.id === entity.id) continue;
				const ox = entity.transform.x - other.transform.x;
				const oz = entity.transform.z - other.transform.z;
				const oDist = Math.sqrt(ox * ox + oz * oz);
				if (oDist < movement.avoidanceRadius && oDist > 0.01) {
					// Repulsion increases sharply as distance decreases
					const overlap = (movement.avoidanceRadius - oDist) / movement.avoidanceRadius;
					const force = overlap * overlap * movement.repulsionStrength;
					steerX += (ox / oDist) * force;
					steerZ += (oz / oDist) * force;
				}
			}

			const moveX = nx + steerX;
			const moveZ = nz + steerZ;
			const moveMag = Math.sqrt(moveX * moveX + moveZ * moveZ) || 1;

			const step = walkStepPerTick(
				entity.transform.speed,
				entity.lifecycle.phase,
				this.rules,
			);

			const kept = keepToClearing(
				{
					x: entity.transform.x + (moveX / moveMag) * step,
					z: entity.transform.z + (moveZ / moveMag) * step,
				},
				{ x: entity.transform.targetX, z: entity.transform.targetZ },
				step,
				this.rules,
				FIRESIDE_STATES.has(entity.social.state)
					? this.rules.campfire.clearRadius
					: this.rules.campfire.ringInnerRadius,
			);
			entity.transform.x = kept.x;
			entity.transform.z = kept.z;
		}
	}
}
