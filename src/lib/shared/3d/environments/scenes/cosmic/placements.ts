import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";

function q(rotY: number): [number, number, number, number] {
	return [0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2)];
}

export const COSMIC_PLACEMENTS: ComposerPlacement[] = [
	// ── Back-left garden (primary focal — amethyst + emerald zone) ──
	{
		id: "cosmic-0",
		objectKey: "crystal-spire-amethyst",
		position: [-12, 0, -10],
		rotation: q(0.3),
		scale: [0.9, 0.9, 0.9],
	},
	{
		id: "cosmic-1",
		objectKey: "crystal-cluster-emerald",
		position: [-10.5, 0, -11.5],
		rotation: q(1.2),
		scale: [0.6, 0.6, 0.6],
	},
	{
		id: "cosmic-2",
		objectKey: "crystal-spire-amethyst",
		position: [-13.5, 0, -8.5],
		rotation: q(2.1),
		scale: [0.5, 0.5, 0.5],
	},
	{
		id: "cosmic-3",
		objectKey: "crystal-cluster-emerald",
		position: [-11, 0, -9],
		rotation: q(0.8),
		scale: [0.35, 0.35, 0.35],
	},
	{
		id: "cosmic-4",
		objectKey: "crystal-spire-amethyst",
		position: [-14, 0, -11],
		rotation: q(1.5),
		scale: [0.4, 0.4, 0.4],
	},

	// ── Back-left secondary (connecting — cyan zone) ──
	{
		id: "cosmic-5",
		objectKey: "crystal-spire-cyan",
		position: [-8, 0, -14],
		rotation: q(0.6),
		scale: [0.7, 0.7, 0.7],
	},
	{
		id: "cosmic-6",
		objectKey: "crystal-spire-cyan",
		position: [-9.5, 0, -15.5],
		rotation: q(2.4),
		scale: [0.4, 0.4, 0.4],
	},
	{
		id: "cosmic-7",
		objectKey: "crystal-cluster-aurora",
		position: [-7, 0, -13],
		rotation: q(1.8),
		scale: [0.45, 0.45, 0.45],
	},

	// ── Far left wall (prismatic + blue zone) ──
	{
		id: "cosmic-8",
		objectKey: "crystal-spire-prismatic",
		position: [-16, 0, -5],
		rotation: q(0.2),
		scale: [0.8, 0.8, 0.8],
	},
	{
		id: "cosmic-9",
		objectKey: "crystal-pyramid-blue",
		position: [-15, 0, -3.5],
		rotation: q(1.0),
		scale: [0.55, 0.55, 0.55],
	},
	{
		id: "cosmic-10",
		objectKey: "crystal-spire-prismatic",
		position: [-17, 0, -6.5],
		rotation: q(1.6),
		scale: [0.4, 0.4, 0.4],
	},

	// ── Right flank (stage framing — blue/prismatic) ──
	{
		id: "cosmic-11",
		objectKey: "crystal-pyramid-blue",
		position: [9, 0, -7],
		rotation: q(-0.5),
		scale: [0.7, 0.7, 0.7],
	},
	{
		id: "cosmic-12",
		objectKey: "crystal-spire-prismatic",
		position: [10.5, 0, -8.5],
		rotation: q(0.4),
		scale: [0.45, 0.45, 0.45],
	},
	{
		id: "cosmic-13",
		objectKey: "crystal-pyramid-blue",
		position: [8, 0, -6],
		rotation: q(1.2),
		scale: [0.3, 0.3, 0.3],
	},

	// ── Left-front accent (aurora/moonlit) ──
	{
		id: "cosmic-14",
		objectKey: "crystal-cluster-aurora",
		position: [-7, 0, 8],
		rotation: q(2.2),
		scale: [0.6, 0.6, 0.6],
	},
	{
		id: "cosmic-15",
		objectKey: "crystal-branch-moonlit",
		position: [-6, 0, 9.5],
		rotation: q(1.1),
		scale: [0.4, 0.4, 0.4],
	},

	// ── Distant sentinel back-right (amethyst) ──
	{
		id: "cosmic-16",
		objectKey: "crystal-spire-amethyst",
		position: [14, 0, 12],
		rotation: q(-1.8),
		scale: [1.0, 1.0, 1.0],
	},
	{
		id: "cosmic-17",
		objectKey: "crystal-cluster-emerald",
		position: [15, 0, 13],
		rotation: q(0.3),
		scale: [0.35, 0.35, 0.35],
	},

	// ── Far right lone crystal (cyan) ──
	{
		id: "cosmic-18",
		objectKey: "crystal-spire-cyan",
		position: [16, 0, -13],
		rotation: q(-0.5),
		scale: [0.6, 0.6, 0.6],
	},

	// ── Foreground right (moonlit/emerald — small, depth) ──
	{
		id: "cosmic-19",
		objectKey: "crystal-branch-moonlit",
		position: [5, 0, 10],
		rotation: q(1.4),
		scale: [0.45, 0.45, 0.45],
	},
	{
		id: "cosmic-20",
		objectKey: "crystal-cluster-emerald",
		position: [6, 0, 9],
		rotation: q(0.8),
		scale: [0.3, 0.3, 0.3],
	},

	// ── Sparse singles (break up negative space) ──
	{
		id: "cosmic-21",
		objectKey: "crystal-spire-prismatic",
		position: [-4, 0, -16],
		rotation: q(0.9),
		scale: [0.3, 0.3, 0.3],
	},
	{
		id: "cosmic-22",
		objectKey: "crystal-pyramid-blue",
		position: [12, 0, -3],
		rotation: q(1.7),
		scale: [0.35, 0.35, 0.35],
	},
	{
		id: "cosmic-23",
		objectKey: "crystal-cluster-aurora",
		position: [-16, 0, 7],
		rotation: q(0.4),
		scale: [0.4, 0.4, 0.4],
	},
];
