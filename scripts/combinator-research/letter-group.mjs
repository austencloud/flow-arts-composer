// The group behind the letter algebra.
//
// The handoff (2026-08-05) left one thing unexplored: the GAP involution
// (A<->G, one hand rotated 180) and the TWIN involution (A<->B, pro<->anti)
// act on the same letter set, and nobody had composed them. This script
// composes them -- and every other structural transform in the system -- as
// honest permutations of PICTOGRAPHS, then projects the result onto letters.
//
// Working at the pictograph level is the whole trick. On letters the maps are
// many-valued (A rotated 90 is S, but so is A rotated 270), so "the group on
// letters" is not well defined. On pictographs each transform is a bijection,
// the group is a real group, and LETTERS ARE THE QUOTIENT.
//
//   node scripts/combinator-research/letter-group.mjs

import { readFileSync } from "node:fs";

const DIR = "E:/tka-platform/mcp-server-pkg/assets/data/pictographs";
const RING = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

const rows = [];
for (const file of [
  "DiamondPictographDataframe.csv",
  "BoxPictographDataframe.csv",
]) {
  const text = readFileSync(`${DIR}/${file}`, "utf8").trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split(",");
  for (const line of lines) {
    if (!line.trim()) continue; // the dataframes carry blank separator lines
    const v = line.split(",");
    const r = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    r.leftMotionType ||= r.blueMotionType;
    r.leftRotationDirection ||= r.blueRotationDirection;
    r.leftStartLocation ||= r.blueStartLocation;
    r.leftEndLocation ||= r.blueEndLocation;
    r.rightMotionType ||= r.redMotionType;
    r.rightRotationDirection ||= r.redRotationDirection;
    r.rightStartLocation ||= r.redStartLocation;
    r.rightEndLocation ||= r.redEndLocation;
    if (!r.leftMotionType) continue;
    r._grid = file.startsWith("Diamond") ? "diamond" : "box";
    rows.push(r);
  }
}

const keyOf = (r) =>
  [
    r.leftMotionType,
    r.leftRotationDirection,
    r.leftStartLocation,
    r.leftEndLocation,
    r.rightMotionType,
    r.rightRotationDirection,
    r.rightStartLocation,
    r.rightEndLocation,
  ].join("|");

// Index by pictograph signature. Signature determines the pictograph; letter,
// start/end position and grid mode are all functions of it.
const index = new Map();
const units = [];
for (const r of rows) {
  const k = keyOf(r);
  if (index.has(k)) continue;
  index.set(k, units.length);
  units.push({
    key: k,
    letter: r.letter,
    start: r.startPlacement,
    end: r.endPlacement,
    grid: r._grid,
    // Canonical VTG columns. Do NOT re-derive direction from the two
    // rotationDirection fields: for a hybrid (one pro, one anti) the props
    // counter-rotate while the hands travel together, so prop-direction
    // agreement is the INVERSE of hand-direction agreement. Deriving it that
    // way labels C/I/U/V "opposite" and F/L/O/R "same", which is backwards.
    timing: r.timing,
    direction: r.direction,
  });
}
const N = units.length;

// ---------------------------------------------------------------- transforms

const rot = (loc, steps) => {
  const i = RING.indexOf(loc);
  return i < 0 ? loc : RING[(i + steps + 8) % 8];
};
const flip = (rd) => (rd === "cw" ? "ccw" : rd === "ccw" ? "cw" : rd);
// Twin: pro <-> anti at fixed hand path. The hand travels the same arc, so the
// prop's rotation direction flips with the motion type. static/dash have no
// prop rotation and are left alone.
const twin = (mt, rd) =>
  mt === "pro"
    ? ["anti", flip(rd)]
    : mt === "anti"
      ? ["pro", flip(rd)]
      : [mt, rd];

const parts = (k) => k.split("|");
const build = (p) => p.join("|");

const rotateHand = (steps, hand) => (k) => {
  const p = parts(k);
  const o = hand === "left" ? 2 : 6; // location fields start at index 2 / 6
  p[o] = rot(p[o], steps);
  p[o + 1] = rot(p[o + 1], steps);
  return build(p);
};
const twinHand = (hand) => (k) => {
  const p = parts(k);
  const o = hand === "left" ? 0 : 4;
  [p[o], p[o + 1]] = twin(p[o], p[o + 1]);
  return build(p);
};
const twinBoth = (k) => twinHand("right")(twinHand("left")(k));
// Reflection across the N–S axis. Locations mirror, and both props' rotation
// directions flip with them; pro/anti survive, since they are defined relative
// to the hand path and reflection carries the path along. Sends gap g to -g,
// so it is the natural candidate for swapping the two gamma slots.
const mirror = (k) => {
  const p = parts(k);
  const mir = (l) => {
    const i = RING.indexOf(l);
    return i < 0 ? l : RING[(8 - i) % 8];
  };
  p[1] = flip(p[1]);
  p[2] = mir(p[2]);
  p[3] = mir(p[3]);
  p[5] = flip(p[5]);
  p[6] = mir(p[6]);
  p[7] = mir(p[7]);
  return build(p);
};
const swapHands = (k) => {
  const p = parts(k);
  return build([...p.slice(4), ...p.slice(0, 4)]);
};

const GENERATORS = [
  { id: "r_right", label: "rotate RIGHT hand 90", fn: rotateHand(2, "right") },
  { id: "r_left", label: "rotate LEFT hand 90", fn: rotateHand(2, "left") },
  {
    id: "R_right180",
    label: "rotate RIGHT hand 180  (the GAP involution)",
    fn: rotateHand(4, "right"),
  },
  {
    id: "t_both",
    label: "twin both hands      (the TWIN involution)",
    fn: twinBoth,
  },
  { id: "t_left", label: "twin LEFT hand only", fn: twinHand("left") },
  { id: "t_right", label: "twin RIGHT hand only", fn: twinHand("right") },
  { id: "swap", label: "swap hand roles", fn: swapHands },
  { id: "mirror", label: "reflect across N–S", fn: mirror },
  {
    id: "g45",
    label: "rotate BOTH hands 45 (diamond <-> box)",
    fn: (k) => rotateHand(1, "right")(rotateHand(1, "left")(k)),
  },
  {
    id: "skew45",
    label: "rotate RIGHT hand 45   (SKEW)",
    fn: rotateHand(1, "right"),
  },
];

// ---------------------------------------------------------------- closure

console.log(
  `Loaded ${N} distinct pictographs (${units.filter((u) => u.grid === "diamond").length} diamond, ${units.filter((u) => u.grid === "box").length} box).\n`
);
console.log("########## GENERATOR CLOSURE ##########");
console.log("A transform is usable as a group generator only if it maps every");
console.log("legal pictograph to another legal pictograph.\n");

const perms = new Map();
for (const g of GENERATORS) {
  const perm = new Int32Array(N);
  let miss = 0;
  let fixed = 0;
  let letterKept = 0;
  for (let i = 0; i < N; i++) {
    const t = index.get(g.fn(units[i].key));
    if (t === undefined) {
      miss++;
      perm[i] = -1;
      continue;
    }
    perm[i] = t;
    if (t === i) fixed++;
    if (units[t].letter === units[i].letter) letterKept++;
  }
  const closed = miss === 0;
  if (closed) perms.set(g.id, perm);
  const pct = (100 * (N - miss)) / N;
  console.log(
    `${closed ? "  CLOSED" : "  OPEN  "}  ${g.label.padEnd(42)} ${pct.toFixed(1).padStart(5)}% land legal` +
      (closed
        ? `  ·  ${((100 * letterKept) / N).toFixed(0).padStart(3)}% keep their letter  ·  ${fixed} fixed points`
        : `  ·  ${miss} of ${N} fall off the map`)
  );
}

// ---------------------------------------------------------------- group BFS

const compose = (a, b) => {
  // (a then b)
  const out = new Int32Array(N);
  for (let i = 0; i < N; i++) out[i] = b[a[i]];
  return out;
};
const idPerm = () => {
  const p = new Int32Array(N);
  for (let i = 0; i < N; i++) p[i] = i;
  return p;
};
const hash = (p) => {
  // FNV-1a over the permutation; collisions are checked against the stored perm.
  let h = 0x811c9dc5;
  for (let i = 0; i < N; i++) {
    h ^= p[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

function generate(ids, cap = 4096) {
  const gens = ids.map((id) => perms.get(id)).filter(Boolean);
  if (gens.length !== ids.length) return null;
  const seen = new Map();
  const put = (p) => {
    const h = hash(p);
    let bucket = seen.get(h);
    if (!bucket) seen.set(h, (bucket = []));
    for (const q of bucket) {
      let same = true;
      for (let i = 0; i < N; i++)
        if (q[i] !== p[i]) {
          same = false;
          break;
        }
      if (same) return false;
    }
    bucket.push(p);
    return true;
  };
  const elems = [];
  const start = idPerm();
  put(start);
  elems.push(start);
  for (let head = 0; head < elems.length; head++) {
    if (elems.length > cap) return { overflow: true, order: elems.length };
    for (const g of gens) {
      const next = compose(elems[head], g);
      if (put(next)) elems.push(next);
    }
  }
  return { overflow: false, order: elems.length, elems };
}

function orbits(elems) {
  const owner = new Int32Array(N).fill(-1);
  const groups = [];
  for (let i = 0; i < N; i++) {
    if (owner[i] !== -1) continue;
    const id = groups.length;
    const members = [];
    for (const e of elems) {
      const t = e[i];
      if (owner[t] === -1) {
        owner[t] = id;
        members.push(t);
      }
    }
    groups.push(members);
  }
  return groups;
}

const LETTER_ORDER =
  "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z Σ Δ Θ Ω Φ Ψ Λ W- X- Y- Z- Σ- Δ- Θ- Ω- Φ- Ψ- Λ- α β γ Γ".split(
    " "
  );
const lorder = (l) => {
  const i = LETTER_ORDER.indexOf(l);
  return i < 0 ? 999 : i;
};
const lettersOf = (members) =>
  [...new Set(members.map((m) => units[m].letter))].sort(
    (a, b) => lorder(a) - lorder(b)
  );

function report(title, ids, note) {
  const g = generate(ids);
  console.log(`\n\n########## ${title} ##########`);
  console.log(`generators: ${ids.join(" , ")}`);
  if (!g) {
    console.log("  SKIPPED — one or more generators is not closed.");
    return null;
  }
  if (g.overflow) {
    console.log(`  group order exceeds cap (> ${g.order}) — not enumerated.`);
    return null;
  }
  const orbs = orbits(g.elems);
  const sizes = {};
  for (const o of orbs) sizes[o.length] = (sizes[o.length] ?? 0) + 1;
  console.log(`  |G| = ${g.order}`);
  console.log(`  ${orbs.length} orbits over ${N} pictographs`);
  console.log(
    `  orbit sizes: ${Object.entries(sizes)
      .map(([s, c]) => `${s}x${c}`)
      .join("  ")}`
  );
  if (note) console.log(`  ${note}`);

  // Project orbits onto letters: which letter sets does the group fuse?
  const letterSets = new Map();
  for (const o of orbs) {
    const ls = lettersOf(o);
    const k = ls.join(",");
    if (!letterSets.has(k))
      letterSets.set(k, { letters: ls, orbits: 0, picts: 0 });
    const e = letterSets.get(k);
    e.orbits++;
    e.picts += o.length;
  }
  const sorted = [...letterSets.values()].sort(
    (a, b) => lorder(a.letters[0]) - lorder(b.letters[0])
  );
  console.log(`\n  letter classes (${sorted.length}):`);
  for (const s of sorted)
    console.log(
      `    { ${s.letters.join(", ").padEnd(26)} }  ${String(s.picts).padStart(4)} pictographs in ${s.orbits} orbit(s)`
    );
  return { g, orbs, letterClasses: sorted };
}

// The gap action on its own — this is what produced the 13 families.
report(
  "GAP ALONE — one-hand 90 rotation",
  ["r_right"],
  "the 13 letter-gap families, re-derived"
);

// The literal question the handoff asked.
report(
  "THE HANDOFF'S QUESTION — gap involution x twin involution",
  ["R_right180", "t_both"],
  "A->G is gap, A->B is twin, so A->H is the composite."
);

// The honest version: the gap operation is order 4, not order 2.
report(
  "THE FULL GAP ACTION — one-hand 90 rotation x twin",
  ["r_right", "t_both"],
  "90 is the real gap step; 180 is only its square."
);

// Everything structural that is closed on shipped data.
report("EVERY CLOSED TRANSFORM", [
  "r_right",
  "r_left",
  "t_left",
  "t_right",
  "swap",
  "g45",
]);

// ---------------------------------------------------------------- gap coordinate

console.log("\n\n########## THE GAP COORDINATE, MEASURED ##########");
console.log(
  "If a letter really is (motion character, gap), then fixing the character"
);
console.log(
  "and stepping the gap should walk the family. Gap = ring distance between"
);
console.log(
  "the hands, which changes as one hand rotates and the other holds.\n"
);

const ringGap = (a, b) => {
  const i = RING.indexOf(a);
  const j = RING.indexOf(b);
  if (i < 0 || j < 0) return null;
  return (j - i + 8) % 8;
};
const gapName = (g) =>
  g === 0
    ? "beta (same point)"
    : g === 4
      ? "alpha (opposite)"
      : g === 2 || g === 6
        ? "gamma (right angle)"
        : `${g * 45}deg`;

const byLetter = new Map();
for (const u of units) {
  const p = parts(u.key);
  const g = ringGap(p[2], p[6]); // start gap, left -> right
  if (!byLetter.has(u.letter)) byLetter.set(u.letter, new Map());
  const m = byLetter.get(u.letter);
  m.set(g, (m.get(g) ?? 0) + 1);
}
console.log("letter   start gaps present");
for (const l of [...byLetter.keys()].sort((a, b) => lorder(a) - lorder(b))) {
  const m = byLetter.get(l);
  const gs = [...m.keys()].sort((a, b) => a - b);
  console.log(
    `${l.padEnd(6)}   ${gs.map((g) => `${g}=${gapName(g)}`).join("  ")}`
  );
}

console.log("\n\n########## CHARACTERS x GAPS ##########");
console.log(
  "One orbit of the 90 gap step = one MOTION CHARACTER, seen at all four"
);
console.log(
  "even gaps. If letter = (character, gap), every orbit should hold exactly"
);
console.log(
  "one pictograph per gap, and the letters it shows are that family.\n"
);

const rotateRight = perms.get("r_right");
const startGap = (i) => {
  const p = parts(units[i].key);
  return ringGap(p[2], p[6]);
};

const charOrbits = [];
{
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seen[i]) continue;
    const orb = [];
    let cur = i;
    do {
      seen[cur] = 1;
      orb.push(cur);
      cur = rotateRight[cur];
    } while (cur !== i);
    charOrbits.push(orb);
  }
}
const orbSizes = {};
for (const o of charOrbits) orbSizes[o.length] = (orbSizes[o.length] ?? 0) + 1;
console.log(
  `  ${charOrbits.length} motion characters; orbit sizes ${Object.entries(
    orbSizes
  )
    .map(([s, c]) => `${s}x${c}`)
    .join(" ")}`
);

let oneEach = 0;
const patterns = new Map();
for (const o of charOrbits) {
  const atGap = new Map();
  for (const m of o) {
    const g = startGap(m);
    if (!atGap.has(g)) atGap.set(g, []);
    atGap.get(g).push(units[m].letter);
  }
  if ([...atGap.values()].every((v) => v.length === 1)) oneEach++;
  const pat = [0, 2, 4, 6]
    .map((g) => (atGap.get(g) ?? ["-"]).join("/"))
    .join("  ");
  if (!patterns.has(pat)) patterns.set(pat, { n: 0, traits: new Set() });
  const e = patterns.get(pat);
  e.n++;
  // Character traits. Motion mix from the signature; direction from the
  // dataframe's own VTG column (see the note where units are built).
  const p = parts(units[o[0]].key);
  const mts = [p[0], p[4]].sort().join("+");
  const mix =
    mts === "pro+pro"
      ? "both pro"
      : mts === "anti+anti"
        ? "both anti"
        : mts === "anti+pro"
          ? "hybrid"
          : mts;
  const dirs = [...new Set(o.map((m) => units[m].direction).filter(Boolean))];
  e.traits.add(`${mix}, ${dirs.length ? dirs.join("/") : "—"}`);
}
console.log(
  `  ${oneEach} of ${charOrbits.length} characters hit each gap exactly once (${((100 * oneEach) / charOrbits.length).toFixed(0)}%)\n`
);
console.log(`  distinct (gap -> letter) patterns: ${patterns.size}`);
console.log(
  `  ${"gap 0 (beta)".padEnd(14)}${"gap 2 (gamma)".padEnd(14)}${"gap 4 (alpha)".padEnd(14)}${"gap 6 (gamma)".padEnd(14)}  characters`
);
const patRows = [...patterns.entries()].sort((a, b) => {
  const la = a[0].split(/\s+/);
  const lb = b[0].split(/\s+/);
  return lorder(la[0]) - lorder(lb[0]);
});
for (const [pat, e] of patRows) {
  const cells = pat.split("  ");
  const names = new Set(cells.filter((c) => c !== "-"));
  console.log(
    `  ${cells.map((c) => c.padEnd(14)).join("")}  x${String(e.n).padStart(3)}   size ${names.size}   ${[...e.traits].join(" | ")}`
  );
}
console.log(
  "\n  A family is size 3 when the two gamma slots share one letter name,"
);
console.log("  size 4 when they carry different names. Nothing else varies.");

// WHY do the two gamma slots sometimes fuse? Colour swap is letter-preserving
// (100%, measured above), so if swapping hands carries the gap-2 pictograph onto
// the gap-6 one, the two MUST share a name. Test whether that is the mechanism.
// WHY do the two gamma slots sometimes fuse? Each candidate below is a
// letter-preserving or gap-reversing symmetry that could carry gap 2 onto gap 6.
// If one of them links exactly the fused characters and no others, that is the
// mechanism.
console.log("\n  Mechanism test: which symmetry carries gap 2 onto gap 6?\n");
// An 8-point ring has eight reflections: i -> (c - i) mod 8 for c = 0..7.
// Any of them reverses the gap, so the axis is a free parameter — test whether
// SOME reflection links the slots rather than assuming which one.
const reflectAt = (c) => (k) => {
  const p = parts(k);
  const m = (l) => {
    const i = RING.indexOf(l);
    return i < 0 ? l : RING[(c - i + 16) % 8];
  };
  p[1] = flip(p[1]);
  p[2] = m(p[2]);
  p[3] = m(p[3]);
  p[5] = flip(p[5]);
  p[6] = m(p[6]);
  p[7] = m(p[7]);
  return build(p);
};
const anyReflection = (i, alsoSwap) => {
  for (let c = 0; c < 8; c++) {
    let t = index.get(reflectAt(c)(units[i].key));
    if (t === undefined) continue;
    if (alsoSwap) t = perms.get("swap")[t];
    yieldSet.add(t);
  }
};
const yieldSet = new Set();
const reachedBySomeReflection = (i, alsoSwap) => {
  yieldSet.clear();
  anyReflection(i, alsoSwap);
  return yieldSet;
};

const CANDIDATES = [
  ["colour swap", (i) => perms.get("swap")[i]],
  ["reflection (N–S axis)", (i) => perms.get("mirror")[i]],
  ["reflection then swap", (i) => perms.get("swap")[perms.get("mirror")[i]]],
  [
    "SOME reflection",
    (i, target) =>
      reachedBySomeReflection(i, false).has(target) ? target : -1,
  ],
  [
    "SOME reflection + swap",
    (i, target) => (reachedBySomeReflection(i, true).has(target) ? target : -1),
  ],
];
console.log(
  `    ${"symmetry".padEnd(22)}${"fused+linked".padStart(13)}${"fused, NOT linked".padStart(19)}${"split BUT linked".padStart(18)}   verdict`
);
for (const [name, step] of CANDIDATES) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const o of charOrbits) {
    const at = new Map();
    for (const m of o) at.set(startGap(m), m);
    const g2 = at.get(2);
    const g6 = at.get(6);
    if (g2 === undefined || g6 === undefined) continue;
    const sameName = units[g2].letter === units[g6].letter;
    const links = step(g2, g6) === g6;
    if (sameName && links) a++;
    else if (sameName) b++;
    else if (links) c++;
  }
  const exact = b === 0 && c === 0 && a > 0;
  console.log(
    `    ${name.padEnd(22)}${String(a).padStart(13)}${String(b).padStart(19)}${String(c).padStart(18)}   ${exact ? "EXACT MATCH" : "no"}`
  );
}
console.log(
  "\n    An EXACT row means: the two gamma slots share a name precisely when that"
);
console.log(
  "    symmetry carries one onto the other. Any other row is not the mechanism."
);

// Sharper hypothesis. Reflection is letter-preserving (100%, measured above) AND
// gap-reversing, so it must send a character's gap-2 pictograph to a SAME-LETTER
// gap-6 one -- just not necessarily inside the same character orbit. It maps a
// character onto its chirality partner. So the real question is not "does
// reflection link the two slots" but "is the character its OWN reflection?"
console.log(
  "\n  Sharper test: is the character its own reflection (orbit maps onto itself)?\n"
);
const orbitOf = new Int32Array(N).fill(-1);
charOrbits.forEach((o, i) => o.forEach((m) => (orbitOf[m] = i)));
let selfRefFused = 0;
let selfRefSplit = 0;
let otherRefFused = 0;
let otherRefSplit = 0;
for (const o of charOrbits) {
  const at = new Map();
  for (const m of o) at.set(startGap(m), m);
  const g2 = at.get(2);
  const g6 = at.get(6);
  if (g2 === undefined || g6 === undefined) continue;
  const fused = units[g2].letter === units[g6].letter;
  let selfReflective = false;
  for (let c = 0; c < 8 && !selfReflective; c++) {
    const t = index.get(reflectAt(c)(units[o[0]].key));
    if (t !== undefined && orbitOf[t] === orbitOf[o[0]]) selfReflective = true;
  }
  if (selfReflective && fused) selfRefFused++;
  else if (selfReflective) selfRefSplit++;
  else if (fused) otherRefFused++;
  else otherRefSplit++;
}
console.log(
  `    self-reflective AND fused (size 3)       ${String(selfRefFused).padStart(4)}`
);
console.log(
  `    self-reflective BUT split (size 4)       ${String(selfRefSplit).padStart(4)}   <- would break it`
);
console.log(
  `    reflects to its partner, yet fused       ${String(otherRefFused).padStart(4)}   <- would break it`
);
console.log(
  `    reflects to its partner, and split       ${String(otherRefSplit).padStart(4)}`
);
console.log(
  `\n    ${selfRefSplit === 0 && otherRefFused === 0 ? "EXACT. A family is size 3 precisely when its motion character is its\n    OWN reflection; size 4 when reflection carries it to a distinct partner\n    character, and the two chiralities earn separate gamma names." : "Still not exact — reflection self-symmetry is not the mechanism either."}`
);

// ---------------------------------------------------------------- skew prediction

console.log("\n\n########## WHAT SKEW WOULD DO ##########");
const skewPerm = GENERATORS.find((g) => g.id === "skew45");
let skewMiss = 0;
for (const u of units) if (!index.has(skewPerm.fn(u.key))) skewMiss++;
console.log(
  `Rotating one hand 45 lands off the shipped map for ${skewMiss} of ${N} pictographs (${((100 * skewMiss) / N).toFixed(1)}%).`
);
console.log(
  "That transform is the odd gap step. With it closed, gaps 1/3/5/7 join the"
);
console.log(
  "orbit and the families above merge pairwise. Without it, half the gap"
);
console.log("coordinate is simply missing from shipped data.");
