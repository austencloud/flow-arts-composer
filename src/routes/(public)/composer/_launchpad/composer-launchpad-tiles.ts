/**
 * composer-launchpad-tiles.ts — the composer bento launchpad's tile defs +
 * target manifest (spec: docs/superpowers/specs/2026-07-20-composer-launchpad-morph-design.md §4).
 *
 * PARKED PROTOTYPE. Rev. 3 keeps /composer's wings and ships the dive across
 * homepage route navigation. This remains wired only to the visual test route
 * as the completed LaunchpadGrid decoupling proof.
 *
 * Two exports:
 *   - COMPOSER_TILES: 9 per-section tiles (16 grid cells) for the decoupled
 *     LaunchpadGrid (`variant="composer"`). Every tile keeps a real hash link
 *     and opts into `onActivate(tile)` as a progressive enhancement that opens
 *     the dive without sacrificing no-JS or modified-click behavior.
 *   - COMPOSER_TARGETS: the expand target manifest keyed by tile id. Each entry
 *     is a CLIENT-ONLY dynamic import of the rich section (or Outputs demo) the
 *     dive full-bleeds into, plus `needsDemoSeq` — true only for the two targets
 *     that take a runtime SequenceData (Tunnel + 3D).
 *
 * Import discipline (spec §8, zod trap): the loaders are lazy `() => import()`
 * arrows — never top-level static imports — so importing THIS module pulls in
 * only the array + manifest object. The heavy pictograph graph (special-arrow-
 * placement → zod) is dragged in only when a loader is actually invoked,
 * client-side, through LazyMount. That keeps the module node-safe to import and
 * the /composer prerender clean. Preview media follows the same rule via
 * LaunchpadTile's own LazyMount branches.
 */

import type { LaunchpadTileDef } from "#lib/shared/landing/components/launchpad/launchpad-tiles.js";

/** The five /composer wing-band colors (see (public)/composer/+page.svelte). */
const WING = {
	create: "#8b8cff",
	outputs: "#ec6ba8",
	learn: "#f0a83c",
	connect: "#35c7d6",
	library: "#5bd6a8",
} as const;

/**
 * 9 tiles → 16 cells against the grid's `repeat(4, 1fr)` dense layout:
 * Construct 2×2 (4) + Mandala 2×2 (4) + 3D 2×1 (2) + six 1×1 (6) = 16, a clean
 * multiple of 4 so the last row ships no holes.
 *
 * `href` is the graceful-degradation fallback. The enhanced click opens the
 * same hash-synced target in place; without JavaScript, the fragment lands on
 * the matching tile anchor.
 */
export const COMPOSER_TILES: LaunchpadTileDef[] = [
	{
		id: "construct",
		href: "/composer#construct",
		heading: "Construct",
		descriptor: "Build a sequence step by step. Only valid options appear.",
		span: "2x2",
		color: WING.create,
		icon: "fa-hammer",
		media: "pictograph",
		magnetic: true,
		activate: true,
	},
	{
		id: "mandala",
		href: "/composer#mandala",
		heading: "Mandala",
		descriptor: "The shape a sequence traces. Change the movement, change the shape.",
		span: "2x2",
		color: WING.outputs,
		icon: "fa-atom",
		media: "mandala",
		magnetic: true,
		activate: true,
	},
	{
		id: "3d",
		href: "/composer#3d",
		heading: "3D Viewer",
		descriptor: "Watch it performed on a stage you can orbit.",
		span: "2x1",
		color: WING.outputs,
		icon: "fa-cube",
		media: "pictograph",
		activate: true,
	},
	{
		id: "generate",
		href: "/composer#generate",
		heading: "Generate",
		descriptor: "Skip the building. Set parameters, get a valid sequence.",
		span: "1x1",
		color: WING.create,
		icon: "fa-wand-magic-sparkles",
		media: "pictograph-fade",
		activate: true,
	},
	{
		id: "tunnel",
		href: "/composer#tunnel",
		heading: "Tunnel",
		descriptor: "Multiply one pattern across a ring of performers.",
		span: "1x1",
		color: WING.outputs,
		icon: "fa-circle-nodes",
		media: "mandala",
		activate: true,
	},
	{
		id: "card",
		href: "/composer#card",
		heading: "Choreo Cards",
		descriptor: "The alphabet on a physical card. Scan it and it plays.",
		span: "1x1",
		color: WING.outputs,
		icon: "fa-layer-group",
		media: "choreo-card",
		activate: true,
	},
	{
		id: "games",
		href: "/composer#games",
		heading: "Games",
		descriptor: "An arcade built from the alphabet. Learn it by playing.",
		span: "1x1",
		color: WING.learn,
		icon: "fa-gamepad",
		media: "alphabet-strip",
		activate: true,
	},
	{
		id: "connect",
		href: "/composer#connect",
		heading: "Connect",
		descriptor: "Follow the flow you like. Their new sequences surface for you.",
		span: "1x1",
		color: WING.connect,
		icon: "fa-users",
		// Spec §4 lists a "(creators preview)" here, which is not one of the
		// existing media kinds — using the lightweight neutral pictograph glyph
		// until a dedicated creators preview lands.
		media: "pictograph",
		activate: true,
	},
	{
		id: "library",
		href: "/composer#library",
		heading: "Library",
		descriptor: "Browse everyone's sequences and collect what you like.",
		span: "1x1",
		color: WING.library,
		icon: "fa-book-open",
		media: "dictionary",
		activate: true,
	},
];

/**
 * The dive/expand target for each tile: the rich section (or Outputs demo) the
 * takeover full-bleeds into. Keyed by tile id (1:1 with COMPOSER_TILES).
 *
 * `loader` — client-only lazy import (§8). Sections live in `../_sections`,
 * the three Outputs demos in `../_components`.
 * `needsDemoSeq` — true only for targets that take a runtime `SequenceData`
 * prop (Tunnel + 3D); the takeover host supplies/awaits `demoSeq` for those and
 * omits it for the rest.
 */
export interface ComposerTargetManifest {
	// A heterogeneous registry: the section/demo components have differing prop
	// shapes (Tunnel/3D require a runtime `sequence`), supplied at mount and
	// gated by needsDemoSeq. `Component<any>` is what lets those typed-props
	// components sit in one map (bare `Component` = no-props and rejects them).
	loader: () => Promise<{ default: import("svelte").Component<any> }>;
	needsDemoSeq: boolean;
}

export const COMPOSER_TARGETS: Record<string, ComposerTargetManifest> = {
	construct: {
		loader: () => import("../_sections/ConstructSection.svelte"),
		needsDemoSeq: false,
	},
	mandala: {
		loader: () => import("../_sections/MandalaSection.svelte"),
		needsDemoSeq: false,
	},
	"3d": {
		loader: () => import("../_components/Composer3DViewerDemo.svelte"),
		needsDemoSeq: true,
	},
	generate: {
		loader: () => import("../_sections/GenerateSection.svelte"),
		needsDemoSeq: false,
	},
	tunnel: {
		loader: () => import("../_components/ComposerTunnelDemo.svelte"),
		needsDemoSeq: true,
	},
	card: {
		loader: () => import("../_components/ComposerChoreoCardsDemo.svelte"),
		needsDemoSeq: false,
	},
	games: {
		loader: () => import("../_sections/GamesStripSection.svelte"),
		needsDemoSeq: false,
	},
	connect: {
		loader: () => import("../_sections/ConnectSection.svelte"),
		needsDemoSeq: false,
	},
	library: {
		loader: () => import("../_sections/LibrarySection.svelte"),
		needsDemoSeq: false,
	},
};
