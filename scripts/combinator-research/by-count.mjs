// Bucket combination results by FULL CIRCLE length (the count), not unit length.
// circle length = unit length x order of the closing transform.
// plain=1, 180/mirror/flip/swap=2, 90 or 270=4.  So a 4-step unit is a 4-count,
// an 8-count or a 16-count depending on how it closes.

import { readFileSync } from "node:fs";

const DIR = "E:/tka-platform/mcp-server-pkg/assets/data/pictographs";
const RING = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const ri = (l) => RING.indexOf(l);

const rows = [];
for (const line of readFileSync(`${DIR}/DiamondPictographDataframe.csv`, "utf8").trim().split(/\r?\n/).slice(1)) {
  const [letter, startPlacement, endPlacement, , , bT, bR, bS, bE, rT, rR, rS, rE] = line.split(",");
  if (!letter || !startPlacement) continue;
  rows.push({ letter, startPlacement, endPlacement, bT, bR, bS, bE, rT, rR, rS, rE });
}
const posPair = new Map();
for (const r of rows) if (!posPair.has(r.startPlacement)) posPair.set(r.startPlacement, [r.bS, r.rS]);
for (const r of rows) if (!posPair.has(r.endPlacement)) posPair.set(r.endPlacement, [r.bE, r.rE]);
const out = new Map();
for (const r of rows) {
  if (!out.has(r.startPlacement)) out.set(r.startPlacement, []);
  out.get(r.startPlacement).push(r);
}

const rotL = (l, s) => (ri(l) < 0 ? l : RING[(ri(l) + s + 8) % 8]);
const mirL = (l) => (ri(l) < 0 ? l : RING[(8 - ri(l)) % 8]);

const OPS = [];
for (let k = 0; k < 4; k++) for (const refl of [false, true]) for (const swap of [false, true]) {
  const apply = ([b, r]) => {
    let bb = refl ? mirL(b) : b, rr = refl ? mirL(r) : r;
    bb = rotL(bb, k * 2); rr = rotL(rr, k * 2);
    return swap ? [rr, bb] : [bb, rr];
  };
  const label =
    [refl ? "mirrored" : null,
     k === 1 ? "rotated90" : k === 2 ? "rotated180" : k === 3 ? "rotated270" : null,
     swap ? "swapped" : null].filter(Boolean).join("/") || "plain";
  // order = how many passes until it returns to identity
  let order = 1;
  for (let n = 1; n <= 8; n++) {
    let ok = true;
    for (const p of [["n", "e"], ["n", "n"], ["n", "s"], ["e", "sw"]]) {
      let q = p;
      for (let i = 0; i < n; i++) q = apply(q);
      if (q[0] !== p[0] || q[1] !== p[1]) { ok = false; break; }
    }
    if (ok) { order = n; break; }
  }
  OPS.push({ label, order, apply, k, refl, swap });
}

const eqPair = (a, b) => a[0] === b[0] && a[1] === b[1];
const closures = (s, e) => {
  const sp = posPair.get(s), ep = posPair.get(e);
  if (!sp || !ep) return [];
  return OPS.filter((op) => eqPair(op.apply(sp), ep));
};

const tuple = (r) => [r.bT, r.bR, r.bS, r.bE, r.rT, r.rR, r.rS, r.rE].join("|");
const byTuple = new Map();
for (const r of rows) if (!byTuple.has(tuple(r))) byTuple.set(tuple(r), r);

// smallest repeating unit of a word, i.e. what the user actually reads
const simplify = (w) => {
  for (let len = 1; len <= w.length / 2; len++) {
    if (w.length % len) continue;
    const u = w.slice(0, len);
    if (u.repeat(w.length / len) === w) return u;
  }
  return w;
};

function run({ lettersA, lettersB, maxLen = 6, maxConnectors = 2 }) {
  const A = new Set(lettersA), B = new Set(lettersB);
  const kind = (l) => (A.has(l) ? "A" : B.has(l) ? "B" : "C");
  const found = [];
  for (const startPos of posPair.keys()) {
    const walk = [];
    (function dfs(pos, conn, uA, uB) {
      if (walk.length >= 1 && uA && uB) {
        const ops = closures(startPos, pos);
        if (ops.length) found.push({ steps: [...walk], ops });
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
    return op.swap ? [r.rT, r.rR, bS, bE, r.bT, r.bR, rS, rE].join("|")
                   : [r.bT, r.bR, bS, bE, r.rT, r.rR, rS, rE].join("|");
  };
  const neck = (a) => { let b = null; for (let i = 0; i < a.length; i++) { const s = a.slice(i).concat(a.slice(0, i)).join("::"); if (b === null || s < b) b = s; } return b; };
  const canon = (st) => { let b = null; for (const op of OPS) { const k = neck(st.map((r) => applyOp(r, op))); if (b === null || k < b) b = k; } return b; };

  const seen = new Map();
  for (const f of found) { const k = canon(f.steps); if (!seen.has(k)) seen.set(k, f); }
  const famSeen = new Set(); const reps = [];
  for (const [key, f] of seen) {
    if (famSeen.has(key)) continue;
    famSeen.add(key);
    for (const s of [2, 4, 6]) {
      const rot = f.steps.map((r) => byTuple.get([r.bT, r.bR, r.bS, r.bE, r.rT, r.rR, rotL(r.rS, s), rotL(r.rE, s)].join("|")));
      if (rot.some((x) => !x)) continue;
      famSeen.add(canon(rot));
    }
    reps.push(f);
  }

  // bucket by full circle length
  const buckets = new Map();
  for (const f of reps) {
    const word = simplify(f.steps.map((s) => s.letter).join(""));
    for (const op of f.ops) {
      const count = f.steps.length * op.order;
      if (!buckets.has(count)) buckets.set(count, new Map());
      const b = buckets.get(count);
      if (!b.has(word)) b.set(word, new Set());
      b.get(word).add(op.label);
    }
  }
  return buckets;
}

function report(name, cfg) {
  const buckets = run(cfg);
  console.log(`\n${"=".repeat(74)}\n${name}   —   box: unit <= ${cfg.maxLen}, connectors <= ${cfg.maxConnectors}, diamond\n${"=".repeat(74)}`);
  for (const count of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(count);
    const words = [...b.keys()].sort((x, y) => x.length - y.length || x.localeCompare(y));
    console.log(`\n--- ${count}-count ---  ${words.length} words`);
    console.log("   " + words.slice(0, 24).join("  ") + (words.length > 24 ? `  ... +${words.length - 24}` : ""));
    const types = new Map();
    for (const w of words) for (const t of b.get(w)) types.set(t, (types.get(t) ?? 0) + 1);
    console.log("   closes as: " + [...types.entries()].sort((x, y) => y[1] - x[1]).map(([t, c]) => `${t}(${c})`).join("  "));
  }
}

report("A card + G card", { lettersA: ["A"], lettersB: ["G"], maxLen: 6, maxConnectors: 2 });
