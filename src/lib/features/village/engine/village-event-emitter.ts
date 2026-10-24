import type { VillageEventInput } from "../domain/village-types";

export interface VillageEventEmitter {
	emit(event: VillageEventInput): void;
}
