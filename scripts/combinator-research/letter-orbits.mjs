// Complete letter-orbit map under ONE-HAND rotation.
// For every pictograph, hold one hand fixed, rotate the other hand's locations
// by 90/180/270, and record which letter the result becomes.
// Answers: what is A to G, is K to E as A is to G, is S its own partner.

import { readFileSync } from "node:fs";

const DIR = "E:/tka-platform/mcp-server-pkg/assets/data/pictographs";
const RING = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const rot = (loc, steps) => {
  const i = RING.indexOf(loc);
  return i < 0 ? loc : RING[(i + steps + 8) % 8];
};

const rows = [];
const table = new Map();
for (const file of [
  "DiamondPictographDataframe.csv",
  "BoxPictographDataframe.csv",
]) {
  const text = readFileSync(`${DIR}/${file}`, "utf8").trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split(",");
  for (const line of lines) {
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
    r._grid = file.startsWith("Diamond") ? "diamond" : "box";
    rows.push(r);
    const key = [
      r.leftMotionType,
      r.leftRotationDirection,
      r.leftStartLocation,
      r.leftEndLocation,
      r.rightMotionType,
      r.rightRotationDirection,
      r.rightStartLocation,
      r.rightEndLocation,
    ].join("|");
    if (!table.has(key)) table.set(key, r);
  }
}

const posFamily = (p) => (p ?? "?").replace(/[0-9]+$/, "");

function mapAt(steps, hand) {
  // letter -> Map(resultLetter -> count), plus miss count
  const out = new Map();
  for (const r of rows) {
    const moved =
      hand === "right"
        ? [
            r.leftMotionType,
            r.leftRotationDirection,
            r.leftStartLocation,
            r.leftEndLocation,
            r.rightMotionType,
            r.rightRotationDirection,
            rot(r.rightStartLocation, steps),
            rot(r.rightEndLocation, steps),
          ]
        : [
            r.leftMotionType,
            r.leftRotationDirection,
            rot(r.leftStartLocation, steps),
            rot(r.leftEndLocation, steps),
            r.rightMotionType,
            r.rightRotationDirection,
            r.rightStartLocation,
            r.rightEndLocation,
          ];
    const hit = table.get(moved.join("|"));
    if (!out.has(r.letter)) out.set(r.letter, { to: new Map(), miss: 0, n: 0 });
    const e = out.get(r.letter);
    e.n++;
    if (!hit) {
      e.miss++;
      continue;
    }
    e.to.set(hit.letter, (e.to.get(hit.letter) ?? 0) + 1);
  }
  return out;
}

const LETTER_ORDER = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "Σ",
  "Δ",
  "Θ",
  "Ω",
  "Φ",
  "Ψ",
  "Λ",
  "W-",
  "X-",
  "Y-",
  "Z-",
  "Σ-",
  "Δ-",
  "Θ-",
  "Ω-",
  "Φ-",
  "Ψ-",
  "Λ-",
  "α",
  "β",
  "Γ",
];
const order = (l) => {
  const i = LETTER_ORDER.indexOf(l);
  return i < 0 ? 999 : i;
};

for (const deg of [90, 180, 270]) {
  const steps = deg / 45;
  const m = mapAt(steps, "right");
  console.log(`\n########## rotate RIGHT by ${deg} ##########`);
  console.log("letter -> result(s)                     coverage");
  [...m.keys()]
    .sort((a, b) => order(a) - order(b))
    .forEach((letter) => {
      const e = m.get(letter);
      const targets = [...e.to.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([t, c]) => `${t}(${c})`)
        .join(" ");
      const cov = `${e.n - e.miss}/${e.n}`;
      console.log(
        `${letter.padEnd(4)} -> ${(targets || "—").padEnd(34)} ${cov}${e.miss ? "  MISS " + e.miss : ""}`
      );
    });
}

// Orbit classes: group letters by their 90-rotation cycle (right hand).
console.log(
  "\n\n########## ORBIT CLASSES (right rotated 90 repeatedly) ##########"
);
const m90 = mapAt(2, "right");
const next = new Map();
for (const [letter, e] of m90) {
  const best = [...e.to.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) next.set(letter, best[0]);
}
const seen = new Set();
const classes = [];
for (const letter of [...m90.keys()].sort((a, b) => order(a) - order(b))) {
  if (seen.has(letter)) continue;
  const cycle = [];
  let cur = letter;
  while (cur && !cycle.includes(cur)) {
    cycle.push(cur);
    seen.add(cur);
    cur = next.get(cur);
  }
  classes.push(cycle);
}
classes.forEach((c, i) =>
  console.log(
    `${String(i + 1).padStart(2)}. ${c.join(" -> ")} -> (back to ${c[0]})`
  )
);
console.log(`\n${classes.length} orbit classes over ${m90.size} letters.`);

// Position-family shape of each letter, to explain WHY the map lands where it does.
console.log("\n\n########## position families ##########");
const fam = new Map();
for (const r of rows) {
  const k = `${posFamily(r.startPlacement)}>${posFamily(r.endPlacement)}`;
  if (!fam.has(r.letter)) fam.set(r.letter, new Set());
  fam.get(r.letter).add(k);
}
[...fam.keys()]
  .sort((a, b) => order(a) - order(b))
  .forEach((l) => {
    console.log(
      `${l.padEnd(4)} ${[...fam.get(l)].join(", ")}  (${rows.filter((r) => r.letter === l).length} rows)`
    );
  });

// Undirected connected components: letters joined by ANY one-hand rotation.
console.log("\n\n########## FAMILIES (undirected components) ##########");
const adj = new Map();
const link = (a, b) => {
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(b);
  adj.get(b).add(a);
};
for (const steps of [2, 4, 6]) {
  for (const [letter, e] of mapAt(steps, "right"))
    for (const t of e.to.keys()) if (letter.trim() && t.trim()) link(letter, t);
}
const done = new Set();
let n = 0;
for (const l of [...adj.keys()].sort((a, b) => order(a) - order(b))) {
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
  n++;
  console.log(
    `${String(n).padStart(2)}. { ${comp.sort((a, b) => order(a) - order(b)).join(", ")} }`
  );
}
console.log(`\n${n} families covering ${done.size} letters.`);
