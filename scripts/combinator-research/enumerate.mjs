// Shared core for the combinator research scripts.
//
// Extracted from theory-512.mjs (2026-08-05) so the fingerprint oracle and the
// class-prediction harness cannot drift apart. theory-512.mjs now imports this;
// re-running it must still report 256 for A+G.
//
// LIMITS — the README's list applies to everything in here:
//   diamond only · closure is a local reimplementation of the app's rule ·
//   counts depend on the equivalence relation (cyclic + D4xswap + orbit) ·
//   no skew · 0 turns · connectors are ANY non-card letter, not the 24-base roster.

import { readFileSync } from "node:fs";

const DIR = "E:/tka-platform/mcp-server-pkg/assets/data/pictographs";
export const RING = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const ri = (l) => RING.indexOf(l);
export const rotL = (l, s) => (ri(l) < 0 ? l : RING[(ri(l) + s + 8) % 8]);
const mirL = (l) => (ri(l) < 0 ? l : RING[(8 - ri(l)) % 8]);


function parse(file) {
	const rows = [];
	for (const line of readFileSync(`${DIR}/${file}`, "utf8").trim().split(/\r?\n/).slice(1)) {
		const [letter, startPlacement, endPlacement, , , bT, bR, bS, bE, rT, rR, rS, rE] = line.split(",");
		if (!letter || !startPlacement) continue;
		rows.push({ letter, startPlacement, endPlacement, bT, bR, bS, bE, rT, rR, rS, rE });
	}
	return rows;
}

export const diamond = parse("DiamondPictographDataframe.csv");
export const box = parse("BoxPictographDataframe.csv");

export const posPair = new Map();
for (const r of diamond) if (!posPair.has(r.startPlacement)) posPair.set(r.startPlacement, [r.bS, r.rS]);
for (const r of diamond) if (!posPair.has(r.endPlacement)) posPair.set(r.endPlacement, [r.bE, r.rE]);

const out = new Map();
for (const r of diamond) {
	if (!out.has(r.startPlacement)) out.set(r.startPlacement, []);
	out.get(r.startPlacement).push(r);
}

export const tuple = (r) => [r.bT, r.bR, r.bS, r.bE, r.rT, r.rR, r.rS, r.rE].join("|");
const byTuple = new Map();
for (const r of diamond) if (!byTuple.has(tuple(r))) byTuple.set(tuple(r), r);

// ---------------------------------------------------------------- closure group

// D4 x colour-swap acting on a position pair. Verified 2026-08-05 to agree with
// the app's isLOOPValidForPlacementPair; the shipping engine must call that, not this.
export const OPS = [];
for (let k = 0; k < 4; k++)
	for (const refl of [false, true])
		for (const swap of [false, true])
			OPS.push({
				k,
				refl,
				swap,
				apply: ([b, r]) => {
					let bb = refl ? mirL(b) : b;
					let rr = refl ? mirL(r) : r;
					bb = rotL(bb, k * 2);
					rr = rotL(rr, k * 2);
					return swap ? [rr, bb] : [bb, rr];
				},
			});

const eqPair = (a, b) => a[0] === b[0] && a[1] === b[1];
export const closes = (s, e) => {
	const sp = posPair.get(s);
	const ep = posPair.get(e);
	return sp && ep && OPS.some((op) => eqPair(op.apply(sp), ep));
};

// ---------------------------------------------------------------- enumeration

export function countPair({ lettersA, lettersB, maxLen = 6, maxConnectors = 2 }) {
	const A = new Set(lettersA);
	const B = new Set(lettersB);
	const kind = (l) => (A.has(l) ? "A" : B.has(l) ? "B" : "C");
	const found = [];
	let explored = 0;
	for (const startPos of posPair.keys()) {
		const walk = [];
		(function dfs(pos, conn, uA, uB) {
			if (walk.length >= 1) {
				explored++;
				if (uA && uB && closes(startPos, pos)) found.push([...walk]);
			}
			if (walk.length >= maxLen) return;
			for (const e of out.get(pos) ?? []) {
				const k = kind(e.letter);
				if (k === "C" && conn >= maxConnectors) continue;
				walk.push(e);
				dfs(e.endPlacement, conn + (k === "C" ? 1 : 0), uA || k === "A", uB || k === "B");
				walk.pop();
			}
		})(startPos, 0, false, false);
	}

	const applyOp = (r, op) => {
		const [bS, rS] = op.apply([r.bS, r.rS]);
		const [bE, rE] = op.apply([r.bE, r.rE]);
		return op.swap
			? [r.rT, r.rR, bS, bE, r.bT, r.bR, rS, rE].join("|")
			: [r.bT, r.bR, bS, bE, r.rT, r.rR, rS, rE].join("|");
	};
	const neck = (arr) => {
		let b = null;
		for (let i = 0; i < arr.length; i++) {
			const s = arr.slice(i).concat(arr.slice(0, i)).join("::");
			if (b === null || s < b) b = s;
		}
		return b;
	};
	const canon = (steps) => {
		let b = null;
		for (const op of OPS) {
			const k = neck(steps.map((r) => applyOp(r, op)));
			if (b === null || k < b) b = k;
		}
		return b;
	};

	const seen = new Map();
	for (const st of found) {
		const k = canon(st);
		if (!seen.has(k)) seen.set(k, st);
	}

	// orbit dedup: a discovery and its one-hand-rotation faces are one entry
	const famSeen = new Set();
	const reps = [];
	for (const [key, st] of seen) {
		if (famSeen.has(key)) continue;
		famSeen.add(key);
		for (const s of [2, 4, 6]) {
			const rot = st.map((r) =>
				byTuple.get([r.bT, r.bR, r.bS, r.bE, r.rT, r.rR, rotL(r.rS, s), rotL(r.rE, s)].join("|")),
			);
			if (rot.some((x) => !x)) continue;
			famSeen.add(canon(rot));
		}
		reps.push(st);
	}
	const words = new Set(reps.map((st) => st.map((s) => s.letter).join("")));
	const byLen = {};
	for (const w of words) byLen[w.length] = (byLen[w.length] ?? 0) + 1;
	return { explored, closed: found.length, reps: reps.length, words: words.size, byLen };
}

// ---------------------------------------------------------------- structure

/** Position family of a position label: alpha3 -> alpha. */
export const worldOf = (p) => (p ?? "?").replace(/[0-9]+$/, "");

/** A letter's (startWorld, endWorld). Card letters are the ones where they match. */
export const letterWorlds = new Map();
for (const r of [...diamond, ...box]) {
	if (!letterWorlds.has(r.letter)) letterWorlds.set(r.letter, new Set());
	letterWorlds.get(r.letter).add(`${worldOf(r.startPlacement)}>${worldOf(r.endPlacement)}`);
}

/**
 * The 13 letter-gap families, derived at runtime by rotating one hand 90 over
 * both dataframes. Same computation as letter-group.mjs, kept here so the
 * prediction harness reads structure from data rather than a hardcoded table.
 */
export function gapFamilies() {
	const index = new Map();
	for (const r of [...diamond, ...box]) if (!index.has(tuple(r))) index.set(tuple(r), r);
	const adj = new Map();
	const link = (a, b) => {
		if (!adj.has(a)) adj.set(a, new Set());
		if (!adj.has(b)) adj.set(b, new Set());
		adj.get(a).add(b);
		adj.get(b).add(a);
	};
	for (const r of [...diamond, ...box]) {
		for (const steps of [2, 4, 6]) {
			const hit = index.get(
				[r.bT, r.bR, r.bS, r.bE, r.rT, r.rR, rotL(r.rS, steps), rotL(r.rE, steps)].join("|"),
			);
			if (hit) link(r.letter, hit.letter);
		}
	}
	const done = new Set();
	const fams = [];
	for (const l of adj.keys()) {
		if (done.has(l)) continue;
		const comp = [];
		const stack = [l];
		while (stack.length) {
			const c = stack.pop();
			if (done.has(c)) continue;
			done.add(c);
			comp.push(c);
			for (const nb of adj.get(c) ?? []) if (!done.has(nb)) stack.push(nb);
		}
		fams.push(comp);
	}
	return fams;
}

export const familyOf = (() => {
	const map = new Map();
	gapFamilies().forEach((f, i) => f.forEach((l) => map.set(l, i)));
	return (l) => map.get(l);
})();
