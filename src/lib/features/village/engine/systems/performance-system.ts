import type { VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";

/** Curious idle avatars near a performer stop and watch. */
export class PerformanceSystem {
	constructor(private rules: VillageRules) {}

	tick(world: VillageWorld): void {
		const { attractionRadius, minWatcherCuriosity } = this.rules.performance;

		for (const performer of world.entities) {
			if (performer.social.state !== "performing") continue;

			for (const candidate of world.entities) {
				if (candidate.id === performer.id) continue;
				if (candidate.social.state !== "idle") continue;
				if (candidate.personality.curiosity < minWatcherCuriosity) continue;

				const dx = candidate.transform.x - performer.transform.x;
				const dz = candidate.transform.z - performer.transform.z;
				if (Math.sqrt(dx * dx + dz * dz) > attractionRadius) continue;

				candidate.social.state = "watching";
				candidate.social.partner = performer.id;
				candidate.social.idleTimer = 0;
				candidate.transform.targetX = candidate.transform.x;
				candidate.transform.targetZ = candidate.transform.z;
				candidate.transform.speed = 0;
				candidate.transform.facingAngle = Math.atan2(
					performer.transform.z - candidate.transform.z,
					performer.transform.x - candidate.transform.x,
				);
			}
		}
	}
}
