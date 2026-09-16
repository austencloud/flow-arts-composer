import type {
	VtgModeGroup,
	VtgPatternEntry,
	RotationGroup,
	CompoundInfo,
	TerminologyRow,
	TurnRatioMapping,
	BeyondVtgItem,
} from "./vtg-lab-types";

function entry(
	letter: string,
	rotationStyle: "pro/pro" | "anti/anti" | "hybrid",
	placementTransition: string,
	isPlacementDependent = false,
	placementNote?: string
): VtgPatternEntry {
	return { letter, rotationStyle, placementTransition, isPlacementDependent, placementNote };
}

const SS_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [entry("A", "pro/pro", "alpha \u2192 alpha")],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [entry("B", "anti/anti", "alpha \u2192 alpha")],
	},
	{
		style: "hybrid",
		label: "Hybrid",
		entries: [entry("C", "hybrid", "alpha \u2192 alpha")],
	},
];

const TS_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [entry("G", "pro/pro", "beta \u2192 beta")],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [entry("H", "anti/anti", "beta \u2192 beta")],
	},
	{
		style: "hybrid",
		label: "Hybrid",
		entries: [entry("I", "hybrid", "beta \u2192 beta")],
	},
];

const TO_NOTE =
	"At beta3/beta7 in Diamond mode, these classify as Split-Opp instead.";

const TO_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [entry("D", "pro/pro", "beta \u2192 alpha", true, TO_NOTE)],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [entry("E", "anti/anti", "beta \u2192 alpha", true, TO_NOTE)],
	},
	{
		style: "hybrid",
		label: "Hybrid",
		entries: [entry("F", "hybrid", "beta \u2192 alpha", true, TO_NOTE)],
	},
];

const TO_COMPOUNDS: CompoundInfo[] = [
	{
		name: "DJ",
		components: ["D", "J"],
		mnemonic: "Disco Jam",
		rotationStyle: "pro/pro",
		cycle: "beta \u2192 alpha \u2192 beta (full LOOP)",
	},
	{
		name: "EK",
		components: ["E", "K"],
		mnemonic: "Exploding Kitten",
		rotationStyle: "anti/anti",
		cycle: "beta \u2192 alpha \u2192 beta (full LOOP)",
	},
	{
		name: "FL",
		components: ["F", "L"],
		mnemonic: "Fruity Loops",
		rotationStyle: "hybrid",
		cycle: "beta \u2192 alpha \u2192 beta (full LOOP)",
	},
];

const SO_NOTE =
	"At alpha1/alpha5 in Diamond mode, these classify as Split-Opp. At other alpha placements, they classify as Tog-Opp.";

const SO_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [entry("J", "pro/pro", "alpha \u2192 beta", true, SO_NOTE)],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [entry("K", "anti/anti", "alpha \u2192 beta", true, SO_NOTE)],
	},
	{
		style: "hybrid",
		label: "Hybrid",
		entries: [entry("L", "hybrid", "alpha \u2192 beta", true, SO_NOTE)],
	},
];

const SO_COMPOUNDS: CompoundInfo[] = TO_COMPOUNDS;

const QS_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [
			entry("S", "pro/pro", "gamma \u2192 gamma"),
			entry("T", "pro/pro", "gamma \u2192 gamma"),
		],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [
			entry("U", "anti/anti", "gamma \u2192 gamma"),
			entry("V", "anti/anti", "gamma \u2192 gamma"),
		],
	},
];

const QO_GROUPS: RotationGroup[] = [
	{
		style: "pro/pro",
		label: "Pro / Pro",
		entries: [
			entry("M", "pro/pro", "gamma \u2192 gamma"),
			entry("P", "pro/pro", "gamma \u2192 gamma"),
		],
	},
	{
		style: "anti/anti",
		label: "Anti / Anti",
		entries: [
			entry("N", "anti/anti", "gamma \u2192 gamma"),
			entry("Q", "anti/anti", "gamma \u2192 gamma"),
		],
	},
	{
		style: "hybrid",
		label: "Hybrid",
		entries: [
			entry("O", "hybrid", "gamma \u2192 gamma"),
			entry("R", "hybrid", "gamma \u2192 gamma"),
		],
	},
];

const QO_COMPOUNDS: CompoundInfo[] = [
	{
		name: "MP",
		components: ["M", "P"],
		mnemonic: "Magic Potion",
		rotationStyle: "pro/pro",
		cycle: "gamma \u2192 gamma (internal cycle)",
	},
	{
		name: "NQ",
		components: ["N", "Q"],
		mnemonic: "Never Quit",
		rotationStyle: "anti/anti",
		cycle: "gamma \u2192 gamma (internal cycle)",
	},
	{
		name: "OR",
		components: ["O", "R"],
		mnemonic: "Open Road",
		rotationStyle: "hybrid",
		cycle: "gamma \u2192 gamma (internal cycle)",
	},
];

export const VTG_MODE_GROUPS: VtgModeGroup[] = [
	{
		mode: "SS",
		name: "Split-Same",
		tkaPlacementDescription: "Alpha \u2192 Alpha (hands at opposite points, stay opposite)",
		tkaMotionDescription: "Both hands shift, same rotation direction",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: SS_GROUPS,
		compounds: [],
		hasPlacementDependentLetters: false,
	},
	{
		mode: "TS",
		name: "Together-Same",
		tkaPlacementDescription: "Beta \u2192 Beta (hands at same point, stay together)",
		tkaMotionDescription: "Both hands shift, same rotation direction",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: TS_GROUPS,
		compounds: [],
		hasPlacementDependentLetters: false,
	},
	{
		mode: "TO",
		name: "Together-Opposite",
		tkaPlacementDescription: "Beta \u2192 Alpha (hands start together, end opposite)",
		tkaMotionDescription: "Both hands shift, opposite rotation directions",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: TO_GROUPS,
		compounds: TO_COMPOUNDS,
		hasPlacementDependentLetters: true,
		placementDependenceNote:
			"In Diamond mode, D/E/F classify as TO at most placements, but as SO at beta3/beta7.",
	},
	{
		mode: "SO",
		name: "Split-Opposite",
		tkaPlacementDescription: "Alpha \u2192 Beta (hands start opposite, end together)",
		tkaMotionDescription: "Both hands shift, opposite rotation directions",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: SO_GROUPS,
		compounds: SO_COMPOUNDS,
		hasPlacementDependentLetters: true,
		placementDependenceNote:
			"In Diamond mode, J/K/L classify as SO at alpha1/alpha5, but as TO at other alpha placements.",
	},
	{
		mode: "QS",
		name: "Quarter-Same",
		tkaPlacementDescription: "Gamma \u2192 Gamma (hands at right angle, stay at right angle)",
		tkaMotionDescription: "Both hands shift, same rotation direction, 90\u00b0 phase offset",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: QS_GROUPS,
		compounds: [],
		hasPlacementDependentLetters: false,
	},
	{
		mode: "QO",
		name: "Quarter-Opposite",
		tkaPlacementDescription: "Gamma \u2192 Gamma (hands at right angle, stay at right angle)",
		tkaMotionDescription: "Both hands shift, opposite rotation directions, 90\u00b0 phase offset",
		letterType: "Type 1 (Dual-Shift)",
		rotationGroups: QO_GROUPS,
		compounds: QO_COMPOUNDS,
		hasPlacementDependentLetters: false,
	},
];

export const TERMINOLOGY_ROWS: TerminologyRow[] = [
	{
		vtgTerm: "Together (tog)",
		vtgMeaning: "Both props pass through the downbeat (south) at the same moment",
		tkaTerm: "Beta",
		tkaMeaning: "Both hands at the same grid point",
	},
	{
		vtgTerm: "Split",
		vtgMeaning: "Props 180\u00b0 out of phase: one at bottom when the other is at top",
		tkaTerm: "Alpha",
		tkaMeaning: "Hands at opposite grid points",
	},
	{
		vtgTerm: "Quarter",
		vtgMeaning: "Props 90\u00b0 out of phase (between together and split)",
		tkaTerm: "Gamma",
		tkaMeaning: "Hands form a right angle on the grid",
	},
	{
		vtgTerm: "Same direction",
		vtgMeaning: "Both props rotate the same way (both CW or both CCW)",
		tkaTerm: "Same rotation",
		tkaMeaning: "Both hands pro/pro or anti/anti",
	},
	{
		vtgTerm: "Opposite direction",
		vtgMeaning: "Props rotate contrary to each other (one CW, one CCW)",
		tkaTerm: "Opposite rotation",
		tkaMeaning: "One hand pro, the other anti (hybrid)",
	},
	{
		vtgTerm: "Inspin (prospin)",
		vtgMeaning: "Prop rotates the same direction as the hand's circular path",
		tkaTerm: "Pro",
		tkaMeaning: "Prop rotates with the hand's path direction",
	},
	{
		vtgTerm: "Antispin",
		vtgMeaning: "Prop rotates opposite to the hand's circular path",
		tkaTerm: "Anti",
		tkaMeaning: "Prop rotates against the hand's path direction",
	},
	{
		vtgTerm: "Downbeat",
		vtgMeaning: "The lowest point of the prop's circle (south / 6 o'clock). Anchor for all VTG timing.",
		tkaTerm: "(no equivalent)",
		tkaMeaning: "TKA is center-referenced, not ground-referenced",
	},
	{
		vtgTerm: "Extension",
		vtgMeaning: "1:1 inspin. Prop follows the arm with no extra rotation. Looks like a longer arm.",
		tkaTerm: "Pro, 0 turns",
		tkaMeaning: "Pro motion with zero additional prop turns per beat",
	},
	{
		vtgTerm: "Cat-eye",
		vtgMeaning: "1:1 antispin. Prop traces a lens shape (2 petals). The fundamental antispin pattern.",
		tkaTerm: "Anti, 0 turns",
		tkaMeaning: "Anti motion with zero additional prop turns per beat",
	},
	{
		vtgTerm: "Flower",
		vtgMeaning: "Any pattern where the prop traces petals as the hand moves in a circle. Petal count depends on turn ratio.",
		tkaTerm: "(no single term)",
		tkaMeaning: "TKA describes the components: motion type + turns + placement transitions",
	},
	{
		vtgTerm: "Stall",
		vtgMeaning: "Prop stops momentarily, then continues. Used for direction changes and transitions.",
		tkaTerm: "Static",
		tkaMeaning: "Zero-turn static motion (hand at a grid point, prop not rotating)",
	},
	{
		vtgTerm: "Hybrid",
		vtgMeaning: "Each hand performs a different pattern (e.g., one extension, one antispin flower)",
		tkaTerm: "Hybrid rotation",
		tkaMeaning: "One hand pro, the other anti. Letters C, F, I, L, O, R, U, V.",
	},
	{
		vtgTerm: "Wall plane",
		vtgMeaning: "Prop spins in a vertical circle facing the audience",
		tkaTerm: "Wall (plane metadata)",
		tkaMeaning: "Default plane. Optional annotation on motion data, not a level.",
	},
	{
		vtgTerm: "Wheel plane",
		vtgMeaning: "Prop spins in a vertical circle at the spinner's side",
		tkaTerm: "Wheel (plane metadata)",
		tkaMeaning: "Side view plane. Optional annotation on motion data.",
	},
];

export const TURN_RATIO_MAPPINGS: TurnRatioMapping[] = [
	{
		vtgRatio: "1:1",
		vtgDescription: "1 prop rotation per arm revolution. Inspin = extension (0 petals). Antispin = cat-eye (2 petals).",
		tkaTurns: "0",
		tkaDescription: "Zero additional turns. VTG 1 covers these 40 patterns.",
	},
	{
		vtgRatio: "2:1",
		vtgDescription: "2 prop rotations per arm revolution. Inspin = 1 petal. Antispin = 3 petals (triquetra).",
		tkaTurns: "0.5",
		tkaDescription: "Half turn per beat",
	},
	{
		vtgRatio: "3:1",
		vtgDescription: "3 prop rotations per arm revolution. Inspin = 2 petals. Antispin = 4 petals.",
		tkaTurns: "1",
		tkaDescription: "One turn per beat. VTG 2 covers these antispin flowers.",
	},
	{
		vtgRatio: "4:1",
		vtgDescription: "4 prop rotations per arm revolution. Inspin = 3 petals. Antispin = 5 petals.",
		tkaTurns: "1.5",
		tkaDescription: "One and a half turns per beat",
	},
	{
		vtgRatio: "5:1",
		vtgDescription: "5 prop rotations per arm revolution. Inspin = 4 petals. Antispin = 6 petals.",
		tkaTurns: "2",
		tkaDescription: "Two turns per beat",
	},
	{
		vtgRatio: "6:1",
		vtgDescription: "6 prop rotations per arm revolution. Inspin = 5 petals. Antispin = 7 petals.",
		tkaTurns: "2.5",
		tkaDescription: "Two and a half turns per beat",
	},
	{
		vtgRatio: "7:1",
		vtgDescription: "7 prop rotations per arm revolution. Inspin = 6 petals. Antispin = 8 petals.",
		tkaTurns: "3",
		tkaDescription: "Three turns per beat",
	},
];

export const BEYOND_VTG_ITEMS: BeyondVtgItem[] = [
	{
		title: "Types 2\u20136",
		description:
			"VTG only covers Type 1 (Dual-Shift) where both hands shift. TKA defines 5 additional letter types: Shift, Cross-Shift, Dash, Dual-Dash, and Static.",
		icon: "fa-layer-group",
		tkaFeature: "Letter Types 2\u20136",
	},
	{
		title: "Interradial Orientations (Level 4)",
		description:
			"Prop orientations at 45° between cardinal orientations: clockIn, clockOut, counterIn, counterOut. Reached by a quarter turn, and relevant for poi gravity and advanced manipulation.",
		icon: "fa-magnet",
		tkaFeature: "Level 4: Interradial",
	},
	{
		title: "Skewed Placements (Level 5)",
		description:
			"One hand on a cardinal point, one on an intercardinal point. Creates Zeta (obtuse angle) and Eta (acute angle) placements that VTG has no classification for.",
		icon: "fa-bezier-curve",
		tkaFeature: "Level 5: Zeta & Eta",
	},
	{
		title: "Centric Placements (Level 6)",
		description:
			"At least one hand at the center of the grid. Creates Tau (one hand center) and Terra (both hands center) placements.",
		icon: "fa-bullseye",
		tkaFeature: "Level 6: Tau & Terra",
	},
	{
		title: "Exact Placement Tracking",
		description:
			"VTG says 'split' or 'together'. TKA tracks exactly which grid points: alpha1 vs alpha5, beta3 vs beta7. Two variations of the same VTG pattern can have different TKA placements.",
		icon: "fa-crosshairs",
		tkaFeature: "Numbered placements (alpha1\u2013alpha8, etc.)",
	},
	{
		title: "Bridge & Transition Letters",
		description:
			"Letters like \u03a3, \u0394, \u0398, \u03a9 that bridge between placements VTG doesn't distinguish. These connect otherwise-unreachable letter combinations.",
		icon: "fa-bridge",
		tkaFeature: "Type 2\u20133 bridge letters",
	},
];
