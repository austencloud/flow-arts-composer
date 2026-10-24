/**
 * Where the trees stand round the village clearing. The authored forest's
 * nearest trees are 45 m out, so from the fire the ground ran on to the sky
 * with nothing in between. This ring closes the room: an understory of
 * saplings, then two staggered ranks of canopy trees, with an opening toward
 * each museum door so the walk in reads as a path through the wood.
 *
 * Pure and seeded, so the lab and the museum plant the same trees.
 */

import { childSeed, makeRng } from "#lib/shared/foundation/utils/seeded-rng.js";

export type VillageTreeFamily = "elm" | "oak" | "hornbeam" | "sapling";

export const VILLAGE_TREE_URLS: Record<VillageTreeFamily, string> = {
	elm: "/models/forest/trees/forked-forest-elm.glb",
	oak: "/models/forest/trees/lush-canopy-oak.glb",
	hornbeam: "/models/forest/trees/young-hornbeam.glb",
	sapling: "/models/forest/trees/young-beech-sapling.glb",
};

export interface VillageTreePlacement {
	x: number;
	y: number;
	z: number;
	rotation: number;
	renderedHeightMeters: number;
}

interface TreeRank {
	key: string;
	radius: [number, number];
	stepDegrees: number;
	// Turns the rank against the one inside it, so trunks do not line up.
	offsetDegrees: number;
	families: readonly VillageTreeFamily[];
	height: [number, number];
}

const DEG = Math.PI / 180;

// Angles are the sim's atan2(dz, dx) round the fire. 90 is the audience side,
// which the museum turns to face the west door the visitor walks in by; 0
// faces the gift-shop door on the south wall.
export const VILLAGE_TREE_RING_OPENINGS_DEGREES = [90, 0] as const;
// Half the opening's width. At 16 m this leaves about 8 m clear.
const OPENING_HALF_DEGREES = 15;

// The room's walkable floor reaches 15 m from the fire, so every trunk stands
// outside it.
const RANKS: readonly TreeRank[] = [
	{
		key: "understory",
		radius: [15.2, 16.2],
		stepDegrees: 12,
		offsetDegrees: 6,
		families: ["sapling"],
		height: [3.2, 4.6],
	},
	{
		key: "inner",
		radius: [16.5, 18.5],
		stepDegrees: 14,
		offsetDegrees: 0,
		families: ["elm", "oak", "hornbeam"],
		height: [8.5, 11.5],
	},
	{
		key: "outer",
		radius: [19.5, 22],
		stepDegrees: 20,
		offsetDegrees: 7,
		families: ["oak", "elm", "hornbeam"],
		height: [10, 13.5],
	},
];

// The clearing's terrain is level to within 0.2 m out to 30 m; sinking each
// trunk this far keeps every root in the ground.
const ROOT_SINK = 0.3;

function angularDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

export function isInTreeRingOpening(degrees: number): boolean {
	return VILLAGE_TREE_RING_OPENINGS_DEGREES.some(
		(opening) => angularDistance(degrees, opening) < OPENING_HALF_DEGREES,
	);
}

/** Every tree in the ring, grouped by the model it uses. */
export function planVillageTreeRing(
	centre: { x: number; z: number },
	seed = "village-tree-ring",
): Map<VillageTreeFamily, VillageTreePlacement[]> {
	const byFamily = new Map<VillageTreeFamily, VillageTreePlacement[]>();
	for (const rank of RANKS) {
		const rng = makeRng(childSeed(seed, rank.key));
		const count = Math.round(360 / rank.stepDegrees);
		for (let i = 0; i < count; i++) {
			const jitter = (rng() - 0.5) * rank.stepDegrees * 0.5;
			const degrees = (i * rank.stepDegrees + rank.offsetDegrees + jitter + 360) % 360;
			const radius = rank.radius[0] + rng() * (rank.radius[1] - rank.radius[0]);
			const height = rank.height[0] + rng() * (rank.height[1] - rank.height[0]);
			const family = rank.families[Math.floor(rng() * rank.families.length)]!;
			const rotation = rng() * Math.PI * 2;
			if (isInTreeRingOpening(degrees)) continue;
			const placements = byFamily.get(family) ?? [];
			placements.push({
				x: centre.x + Math.cos(degrees * DEG) * radius,
				y: -ROOT_SINK,
				z: centre.z + Math.sin(degrees * DEG) * radius,
				rotation,
				renderedHeightMeters: height,
			});
			byFamily.set(family, placements);
		}
	}
	return byFamily;
}

// The ground darkens past the fire's reach, so the lit clearing ends in shadow
// under the trees rather than running on as lit grass.
export const VILLAGE_GROUND_FALLOFF = {
	innerRadius: 12,
	fullRadius: 24,
	outerRadius: 40,
	opacity: 0.85,
} as const;

/** How much the falloff darkens the ground at this distance from the fire. */
export function groundFalloffAlpha(distance: number): number {
	const { innerRadius, fullRadius, opacity } = VILLAGE_GROUND_FALLOFF;
	const t = Math.min(1, Math.max(0, (distance - innerRadius) / (fullRadius - innerRadius)));
	return t * t * (3 - 2 * t) * opacity;
}
