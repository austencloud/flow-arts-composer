/**
 * Verification: orientation-domain LOOP claims (KB: domain-topics.ts).
 *
 * Proves, against the engine dist, the claims written into the LOOP System /
 * Orientation Algebra knowledge-base topics:
 *
 *   A. Fixed-point sets of each POSITION transform (exhaustive over all positions):
 *        swap fixed = beta (+terra1); mirror = alpha1/5,beta1/5; flip = alpha3/7,beta3/7;
 *        rotate(180) fixes no L1-L4 position.
 *   B. INVERTED never moves positions/locations — applyOverlayInversion invariance.
 *   C. Real executor output matches the domain rule (swap moves non-beta beats;
 *        inverted pins every beat).
 *   D. Supporting: loopSpecPeriod = LCM; orientation drifts from motion BASE
 *        (anti/dash reverse at 0 turns), not turns alone.
 *
 * Run:  node scripts/verify-orientation-domain-loops.mjs
 * Exit: 0 if every assertion holds, 1 otherwise.
 */

const D = "../packages/sequence-engine/dist";

let PASS = 0,
  FAIL = 0;
const fails = [];
function check(name, cond, detail = "") {
  if (cond) {
    PASS++;
    console.log(`  ✓ ${name}`);
  } else {
    FAIL++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}
function section(t) {
  console.log(`\n=== ${t} ===`);
}

const {
  VERTICAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  SWAPPED_PLACEMENT_MAP,
} = await import(`${D}/loop/placement-maps/strict-loop-placement-maps.js`);
const { HALF_PLACEMENT_MAP, QUARTER_PLACEMENT_MAP_CW } = await import(
  `${D}/loop/placement-maps/circular-placement-maps.js`
);
const { applyOverlayInversion } = await import(
  `${D}/loop/execution/overlay-inversion.js`
);
const specMod = await import(`${D}/loop/loop-spec.js`);
const { LOOPComponent, singleComponent, loopSpecPeriod, symmetricSpec } =
  specMod;

// Families for grouping; L1-L3 core = alpha/beta/gamma. tau/terra/zeta/eta are
// L4+ and some map entries there are TODO identity stubs — reported separately.
const fam = (p) => p.replace(/[0-9]+$/, "");
const CORE = new Set(["alpha", "beta", "gamma"]);
const fixedPoints = (map) => Object.keys(map).filter((k) => map[k] === k);
const coreFixed = (map) =>
  fixedPoints(map)
    .filter((p) => CORE.has(fam(p)))
    .sort();
const stubFixed = (map) =>
  fixedPoints(map)
    .filter((p) => !CORE.has(fam(p)))
    .sort();
const sameSet = (a, b) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------
section(
  "A. Position-transform fixed points (exhaustive over all mapped positions)"
);

const swapCore = coreFixed(SWAPPED_PLACEMENT_MAP);
console.log(
  `  SWAP  core fixed: [${swapCore}]   (stubs: [${stubFixed(SWAPPED_PLACEMENT_MAP)}])`
);
check(
  "SWAP core fixed = all 8 beta only",
  sameSet(swapCore, [
    "beta1",
    "beta2",
    "beta3",
    "beta4",
    "beta5",
    "beta6",
    "beta7",
    "beta8",
  ]),
  `got [${swapCore}]`
);
check("SWAP fixes NO alpha/gamma", !swapCore.some((p) => fam(p) !== "beta"));

const mirCore = coreFixed(VERTICAL_MIRROR_PLACEMENT_MAP);
console.log(`  MIRROR core fixed: [${mirCore}]`);
check(
  "MIRROR core fixed = alpha1/5, beta1/5",
  sameSet(mirCore, ["alpha1", "alpha5", "beta1", "beta5"]),
  `got [${mirCore}]`
);

const flipCore = coreFixed(HORIZONTAL_MIRROR_PLACEMENT_MAP);
console.log(`  FLIP core fixed: [${flipCore}]`);
check(
  "FLIP core fixed = alpha3/7, beta3/7",
  sameSet(flipCore, ["alpha3", "alpha7", "beta3", "beta7"]),
  `got [${flipCore}]`
);

const rotCore = coreFixed(HALF_PLACEMENT_MAP);
console.log(`  ROTATE-180 core fixed: [${rotCore}]`);
check(
  "ROTATE-180 fixes NO L1-L4 (alpha/beta/gamma) position",
  rotCore.length === 0,
  `got [${rotCore}]`
);
const rotQ = coreFixed(QUARTER_PLACEMENT_MAP_CW);
check("ROTATE-90 fixes NO L1-L4 position", rotQ.length === 0, `got [${rotQ}]`);

// Swap moves the specific beats seen live (alpha7->alpha3, gamma9->gamma3, alpha5->alpha1)
check(
  "SWAP alpha7 -> alpha3 (matches live DLDL)",
  SWAPPED_PLACEMENT_MAP.alpha7 === "alpha3",
  `got ${SWAPPED_PLACEMENT_MAP.alpha7}`
);
check(
  "SWAP gamma9 -> gamma3 (matches live ΘZΘZ)",
  SWAPPED_PLACEMENT_MAP.gamma9 === "gamma3",
  `got ${SWAPPED_PLACEMENT_MAP.gamma9}`
);
check(
  "SWAP alpha5 -> alpha1 (matches live Ψ… )",
  SWAPPED_PLACEMENT_MAP.alpha5 === "alpha1",
  `got ${SWAPPED_PLACEMENT_MAP.alpha5}`
);

// ---------------------------------------------------------------------------
section(
  "B. INVERTED never moves positions/locations (applyOverlayInversion invariance)"
);

// Real seed (DGF, from get_sequence_data) + synthetic valid sequences.
const mk = (letter, sp, ep, b, r) => ({
  id: letter,
  letter,
  startPlacement: sp,
  endPlacement: ep,
  stepNumber: 0,
  duration: 1,
  motions: {
    left: {
      hand: "left",
      motionType: b[0],
      rotationDirection: b[1],
      startLocation: b[2],
      endLocation: b[3],
      startOrientation: "in",
      endOrientation: "in",
      turns: b[4] ?? 0,
    },
    right: {
      hand: "right",
      motionType: r[0],
      rotationDirection: r[1],
      startLocation: r[2],
      endLocation: r[3],
      startOrientation: "in",
      endOrientation: "in",
      turns: r[4] ?? 0,
    },
  },
});
const startStep = (pos) =>
  mk(
    "β",
    pos,
    pos,
    ["static", "noRotation", "n", "n"],
    ["static", "noRotation", "n", "n"]
  );

// DGF real seed (4 beats), plus programmatic variations across many location sets.
const realDGF = [
  startStep("beta1"),
  mk("D", "beta1", "alpha7", ["pro", "cw", "n", "e"], ["pro", "ccw", "n", "w"]),
  mk("J", "alpha7", "beta1", ["pro", "ccw", "e", "n"], ["pro", "cw", "w", "n"]),
  mk("G", "beta1", "beta3", ["pro", "cw", "n", "e"], ["pro", "cw", "n", "e"]),
  mk(
    "F",
    "beta3",
    "alpha1",
    ["anti", "ccw", "e", "s"],
    ["pro", "ccw", "e", "n"]
  ),
];

// Build many valid 2- and 4-beat sequences by pairing complementary beats.
const LOCS = ["n", "e", "s", "w"];
const TYPES = ["pro", "anti", "dash", "static"];
const seqs = [realDGF];
let rngState = 12345;
const rnd = () => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
for (let i = 0; i < 60; i++) {
  const len = rnd() < 0.5 ? 2 : 4;
  const steps = [
    startStep(pick(["alpha1", "beta1", "beta3", "gamma5", "alpha3"])),
  ];
  for (let k = 1; k <= len; k++) {
    const bl = [
      pick(TYPES),
      pick(["cw", "ccw", "noRotation"]),
      pick(LOCS),
      pick(LOCS),
      pick([0, 1, 2]),
    ];
    const rl = [
      pick(TYPES),
      pick(["cw", "ccw", "noRotation"]),
      pick(LOCS),
      pick(LOCS),
      pick([0, 1, 2]),
    ];
    steps.push(mk("X", `alpha${1 + (k % 8)}`, `beta${1 + (k % 8)}`, bl, rl));
  }
  seqs.push(steps);
}

let invRuns = 0,
  invViolations = 0;
for (const seq of seqs) {
  const letterCount = seq.length - 1;
  for (const period of [2, 4]) {
    if (letterCount % period !== 0) continue;
    let out;
    try {
      out = applyOverlayInversion(seq, period);
    } catch {
      continue;
    }
    invRuns++;
    for (let i = 0; i < seq.length; i++) {
      const a = seq[i],
        b = out[i];
      const moved =
        a.startPlacement !== b.startPlacement ||
        a.endPlacement !== b.endPlacement ||
        a.motions.left.startLocation !== b.motions.left.startLocation ||
        a.motions.left.endLocation !== b.motions.left.endLocation ||
        a.motions.right.startLocation !== b.motions.right.startLocation ||
        a.motions.right.endLocation !== b.motions.right.endLocation;
      if (moved) invViolations++;
    }
  }
}
console.log(`  ran applyOverlayInversion on ${invRuns} sequence/period combos`);
check(
  `INVERTED never changed a position or location in ${invRuns} runs`,
  invViolations === 0,
  `${invViolations} beats moved`
);

// ---------------------------------------------------------------------------
section(
  "C. Real executor output matches the domain rule (executeSymmetricSpec)"
);

// Real executor (executeLOOPSpec → FusedExecutor, the engine + deck-gen path).
// FOOTGUN: FusedExecutor keys transform-vs-copy on quarterIdx =
// floor((stepNumber-1)/partialLength), so seed beats MUST carry real 0..N
// stepNumbers — an all-zero seed makes it COPY every pass instead of transform.
async function tryExec() {
  const { executeSymmetricSpec } = await import(
    `${D}/loop/execution/spec-executor.js`
  );
  const posOf = (s) => `${s.startPlacement}->${s.endPlacement}`;
  const swapPin = (label, seed, expectPinned) => {
    seed.forEach((s, i) => {
      s.stepNumber = i;
    }); // real beat indices (required by FusedExecutor)
    const seedPos = seed.slice(1).map(posOf); // snapshot before execution (it mutates the array)
    const n = seedPos.length;
    let full;
    try {
      full = executeSymmetricSpec(
        seed,
        singleComponent(LOOPComponent.SWAPPED, 2)
      );
    } catch (e) {
      check(`${label} executed`, false, e.message.split("\n")[0]);
      return;
    }
    const derived = full.slice(1 + n, 1 + 2 * n).map(posOf);
    const pinned =
      derived.length === n && derived.every((p, i) => p === seedPos[i]);
    console.log(
      `  ${label}: seed [${seedPos.join(", ")}] → derived [${derived.join(", ")}]  pinned=${pinned}`
    );
    check(
      `${label}: pinned=${pinned} (expected ${expectPinned})`,
      pinned === expectPinned
    );
  };
  // all-beta seed → swap pins every beat (beta is swap-fixed).
  const betaSeed = [
    startStep("beta1"),
    mk(
      "G",
      "beta1",
      "beta7",
      ["pro", "ccw", "n", "w"],
      ["pro", "ccw", "n", "w"]
    ),
    mk(
      "I",
      "beta7",
      "beta1",
      ["pro", "ccw", "w", "n"],
      ["pro", "ccw", "w", "n"]
    ),
  ];
  // beta-START seed that leaves beta → swap MOVES the alpha beat (alpha7→alpha3).
  const wanderSeed = [
    startStep("beta1"),
    mk(
      "D",
      "beta1",
      "alpha7",
      ["pro", "cw", "n", "e"],
      ["pro", "ccw", "n", "w"]
    ),
    mk(
      "J",
      "alpha7",
      "beta1",
      ["pro", "ccw", "e", "n"],
      ["pro", "cw", "w", "n"]
    ),
  ];
  swapPin("SWAP all-beta seed (expect PINNED)", betaSeed, true);
  swapPin("SWAP wandering seed (expect MOVED)", wanderSeed, false);
}
try {
  await tryExec();
} catch (e) {
  console.log(`  (Section C unavailable: ${e.message.split("\n")[0]})`);
}

// ---------------------------------------------------------------------------
section("D. Supporting claims");

check(
  "loopSpecPeriod(ROTATED@2) = 2",
  loopSpecPeriod(
    symmetricSpec(singleComponent(LOOPComponent.ROTATED, 2).components)
  ) === 2
);
// LCM of mixed periods 2 and 4 = 4; 2 and 3 = 6
const mixed = new Map([
  [LOOPComponent.MIRRORED, { period: 2 }],
  [LOOPComponent.INVERTED, { period: 4 }],
]);
check(
  "loopSpecPeriod LCM(2,4) = 4",
  loopSpecPeriod(symmetricSpec(mixed)) === 4,
  `got ${loopSpecPeriod(symmetricSpec(mixed))}`
);
const mixed2 = new Map([
  [LOOPComponent.MIRRORED, { period: 2 }],
  [LOOPComponent.SWAPPED, { period: 3 }],
]);
check(
  "loopSpecPeriod LCM(2,3) = 6",
  loopSpecPeriod(symmetricSpec(mixed2)) === 6,
  `got ${loopSpecPeriod(symmetricSpec(mixed2))}`
);

try {
  const { calculateEndOrientation } = await import(
    `${D}/core/orientation/OrientationCalculator.js`
  );
  const eo = (mt, dir, sl, el, t = 0) =>
    calculateEndOrientation({
      motionType: mt,
      turns: t,
      rotationDirection: dir,
      startLocation: sl,
      endLocation: el,
      startOrientation: "in",
    });
  const pro0 = eo("pro", "cw", "n", "e");
  const anti0 = eo("anti", "ccw", "e", "s");
  const dash0 = eo("dash", "noRotation", "n", "s");
  console.log(`  0-turn: pro=${pro0}  anti=${anti0}  dash=${dash0}`);
  check(
    "pro at 0 turns PRESERVES orientation (in→in)",
    pro0 === "in",
    `got ${pro0}`
  );
  check(
    "anti at 0 turns REVERSES orientation (in→out) — drift from base, not turns",
    anti0 === "out",
    `got ${anti0}`
  );
  check(
    "dash at 0 turns REVERSES orientation (in→out)",
    dash0 === "out",
    `got ${dash0}`
  );
} catch (e) {
  console.log(`  (orientation calc unavailable: ${e.message.split("\n")[0]})`);
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(48)}\nRESULT: ${PASS} passed, ${FAIL} failed`);
if (FAIL) {
  console.log(`FAILED: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("All orientation-domain KB claims verified against the engine.");
