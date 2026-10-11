import type { WingDeclaration } from "#lib/features/museum/data/wing-declarations/types.js";

type LocationLabel = WingDeclaration["review"]["locationLabels"][number];

/**
 * The HUD readout for a first-person graybox walk. Entries are ordered from the
 * far end of the route inward; the first one the player is still beyond wins,
 * and the entry without a threshold is the fallback at the near end.
 */
export function resolveLocationLabel(
	labels: readonly LocationLabel[],
	playerZ: number
): string {
	for (const entry of labels) {
		if (entry.whenZAbove === undefined) return entry.label;
		if (playerZ > entry.whenZAbove) return entry.label;
	}
	return labels.at(-1)?.label ?? "";
}
