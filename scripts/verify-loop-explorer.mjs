/**
 * Verification harness for the /notation/loops explorer (Task A3, spec
 * 2026-07-19-notation-loops-destination-design.md).
 *
 * For every implemented LOOP component combo (loop-type-utils.ts
 * IMPLEMENTED_COMBOS) x every legal slice (halved always, quartered gated to
 * ROTATED_LOOP_TYPES), generates K sequences through the same Node-reachable
 * engine path the MCP server's generate_sequence tool uses
 * (mcp-server/dist/src/core/engine-generation-adapter.js + server-context.js
 * -> @tka/sequence-engine SequenceBuilder — the canonical, non-hand-rolled
 * generation pipeline; loop length invariance rule: never hand-build
 * GenerationOptions).
 *
 * Detection cross-check (two independent implementations from the engine):
 *   1. loopDetectorClass.detectLOOPType()  — the class-based detector the
 *      app's loop-detector.ts service delegates to (quartered + compound
 *      pattern aware). Treated as the PRIMARY / canonical detector.
 *   2. detectLOOPFromSteps()               — the standalone functional
 *      detector (halved-uniform-relation only). Cross-checked where it
 *      applies (even letter-step count); a real second implementation of the
 *      pair-relation algebra, not a re-derivation of #1.
 *
 * KNOWN LIMITATION (documented per plan A3 instructions, not silently
 * dropped): the app's isSeamlesslyLoopable() circularity gate (orientation
 * closure, not just position closure) lives in
 * src/lib/shared/foundation/services/sequence-loopability-checker.ts, which
 * is SvelteKit-alias-resolved ($lib) app code, not reachable from a plain
 * Node script without a Vite/SvelteKit runtime. This harness approximates it:
 * position closure (first step startPlacement === last step endPlacement) AND
 * orientation closure (first letter step's start orientation === last step's
 * end orientation, both hands) computed directly off the generated
 * SequenceStep array. This is the same two conditions isSeamlesslyLoopable
 * checks, just inlined rather than imported — flagged here so a future
 * session doesn't assume literal code reuse.
 *
 * MCP `detect_loop_pattern` (the third, live-server cross-check) is
 * explicitly out of scope for this script per the plan (item 4) — the
 * orchestrator runs that separately afterward on a sample.
 *
 * Run:  node scripts/verify-loop-explorer.mjs [--k=25]
 * Emits:
 *   scripts/output/loop-explorer-verification-report.md
 *   src/lib/shared/loop-explorer/domain/curated-seeds.json
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const K = Number(process.argv.find((a) => a.startsWith("--k="))?.slice(4) ?? 25);
const RETRIES = 3; // matches spec's self-verifying generation N=3 before curated fallback

// Imports — Node-reachable engine + MCP-server generation path only.

const serverContext = await import(
  path.join(ROOT, "mcp-server/dist/src/shared/server-context.js").replace(/\\/g, "/").replace(/^([A-Za-z]:)/, "file:///$1")
);
const { SequenceBuilder, getPresetOptions } = await import("@tka/sequence-engine/generation");
const {
  loopSpecFromWire,
  Period: EnginePeriod,
  LOOPType: EngineLOOPType,
  loopDetectorClass,
  detectLOOPFromSteps,
  isSequenceCircular,
} = await import("@tka/sequence-engine/loop");
const { MCPVariationProvider } = await import(
  path.join(ROOT, "mcp-server/dist/src/core/MCPVariationProvider.js").replace(/\\/g, "/").replace(/^([A-Za-z]:)/, "file:///$1")
);

// 17-combo table (mirrors loop-type-utils.ts IMPLEMENTED_COMBOS exactly —
// the SSOT for which component sets are real/generatable). The app strings
// ARE the engine LOOPType enum values except STRICT_REWOUND (app) which maps
// to the engine's REWOUND ("rewound"), so combo.appLoopType is used for
// display/report labels and combo.engineLoopType drives generation.

const COMBOS = [
  { components: ["rotated"], appLoopType: "rotated" },
  { components: ["mirrored"], appLoopType: "mirrored" },
  { components: ["flipped"], appLoopType: "flipped" },
  { components: ["swapped"], appLoopType: "swapped" },
  { components: ["inverted"], appLoopType: "inverted" },
  { components: ["rewound"], appLoopType: "strict_rewound" },
  { components: ["mirrored", "inverted"], appLoopType: "mirrored_inverted" },
  { components: ["rotated", "inverted"], appLoopType: "rotated_inverted" },
  { components: ["swapped", "inverted"], appLoopType: "swapped_inverted" },
  { components: ["mirrored", "rotated"], appLoopType: "mirrored_rotated" },
  { components: ["mirrored", "swapped"], appLoopType: "mirrored_swapped" },
  { components: ["rotated", "swapped"], appLoopType: "rotated_swapped" },
  { components: ["mirrored", "inverted", "rotated"], appLoopType: "mirrored_inverted_rotated" },
  { components: ["mirrored", "rotated", "swapped"], appLoopType: "mirrored_rotated_swapped" },
  { components: ["mirrored", "swapped", "inverted"], appLoopType: "mirrored_swapped_inverted" },
  { components: ["rotated", "swapped", "inverted"], appLoopType: "rotated_swapped_inverted" },
  {
    components: ["mirrored", "rotated", "inverted", "swapped"],
    appLoopType: "mirrored_rotated_inverted_swapped",
  },
];

const ROTATED_LOOP_TYPES = new Set([
  "rotated",
  "rotated_inverted",
  "rotated_swapped",
  "rotated_swapped_inverted",
  "mirrored_rotated",
  "mirrored_inverted_rotated",
  "mirrored_rotated_swapped",
  "mirrored_rotated_inverted_swapped",
]);

function toEngineLoopType(appLoopType) {
  return appLoopType === "strict_rewound" ? EngineLOOPType.REWOUND : appLoopType;
}

// Generation: same Node path as generateViaEngine (mcp-server), rebuilt here
// with the FULL 17-combo table (the MCP tool's own LOOP_TYPE_MAP is missing
// mirrored_rotated_swapped, which is the harness's whole point to catch).

/**
 * Wire-form spec builder — mirrors loop-type-utils.ts buildLoopSpec() exactly
 * (the canonical path resolveLoopConfig/config-mapper.ts uses): only ROTATED
 * gets the requested period (2 for halved, 4 for quartered); every other
 * active component (mirrored/flipped/swapped/inverted) stays at period 2
 * (expand mode). Using loopSpecFromLegacy's uniform-period shortcut instead
 * (applying period 4 to every component) is what breaks quartered composite
 * combos — this is the fix.
 */
function buildLoopSpecWire(components, period) {
  const rotationInterval = period === "quartered" ? 4 : 2;
  const prop = {};
  for (const comp of components) {
    if (comp === "rewound") {
      prop.rewound = { period: rotationInterval };
    } else if (comp === "rotated") {
      prop.rotated = { period: rotationInterval };
    } else if (comp === "inverted") {
      prop.inverted = { period: 2 };
    } else {
      prop[comp] = { period: 2 };
    }
  }
  return { left: prop, right: prop };
}

function assembleBuildOptions({ appLoopType, components, period, length, level, allPictographs }) {
  const enginePeriod = period === "quartered" ? EnginePeriod.QUARTERED : EnginePeriod.HALVED;
  const sliceMultiplier = period === "quartered" ? 4 : 2;
  const engineLoopType = toEngineLoopType(appLoopType);

  const options = {
    gridMode: "diamond",
    level,
    length: Math.max(1, Math.floor(length / sliceMultiplier)),
    loop: {
      type: engineLoopType,
      period: enginePeriod,
      useTargetedGeneration: true,
      loopSpec: loopSpecFromWire(buildLoopSpecWire(components, period)),
    },
  };

  const preset = getPresetOptions("smooth");
  options.constraintOptions = preset ? { ...preset } : {};

  return options;
}

function generateOne({ appLoopType, components, period, length, level, allPictographs }) {
  const provider = new MCPVariationProvider(allPictographs, "diamond");
  const builder = new SequenceBuilder(provider);
  const buildOptions = assembleBuildOptions({ appLoopType, components, period, length, level, allPictographs });
  const buildResult = builder.build(buildOptions);

  // The engine returns step 0 = the start-placement pseudo-step (stepNumber 0,
  // startPlacement === endPlacement, real letter steps follow with stepNumber
  // 1..n). Both engine detectors (LOOPDetectorClass, detectLOOPFromSteps)
  // expect EXACTLY this shape — see LOOPDetector.js docstring: "Takes an
  // array of SequenceStep where step 0 is the start position". So the raw
  // buildResult.sequence is passed straight through, unmodified, to the
  // detectors AND used as-is for the circularity gate below. No re-derivation.
  return { rawSteps: buildResult.sequence };
}

// Circularity gate (position + orientation closure) — see file header on why
// this is inlined rather than importing the app's isSeamlesslyLoopable.

function isApproxSeamlesslyLoopable(rawSteps) {
  if (rawSteps.length < 2) return false;
  const startStep = rawSteps[0]; // stepNumber 0, the declared start position + orientation
  const last = rawSteps[rawSteps.length - 1];
  if (startStep.startPlacement !== last.endPlacement) return false;
  const orientClose = (hand) =>
    startStep.motions[hand]?.startOrientation === last.motions[hand]?.endOrientation;
  return orientClose("blue") && orientClose("red");
}

// Detection cross-check

function detectPrimary(rawSteps) {
  try {
    const result = loopDetectorClass.detectLOOPType(rawSteps);
    const components = result.spec
      ? [...(result.spec.left?.components?.keys?.() ?? [])]
      : [];
    return { components: components.sort(), loopType: result.loopType, period: result.period, raw: result };
  } catch (e) {
    return { error: e.message ?? String(e) };
  }
}

function detectSecondary(rawSteps) {
  try {
    const result = detectLOOPFromSteps(rawSteps);
    return { components: [...result.components].sort(), isFreeform: result.isFreeform };
  } catch (e) {
    return { error: e.message ?? String(e) };
  }
}

function sameComponentSet(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((c, i) => c === sb[i]);
}

// Main sweep

const allPictographs = serverContext.ensureDataLoaded("diamond");
console.log(`Loaded ${allPictographs.length} pictographs (diamond).`);

const LEVEL = 3;
const LENGTH = 16;

const report = []; // per combo x slice
const curatedSeeds = {}; // appLoopType -> { halved: [...], quartered: [...] }

let totalRuns = 0;
let totalExactMatches = 0;
let totalCrashes = 0;

for (const combo of COMBOS) {
  const slices = ["halved", ...(ROTATED_LOOP_TYPES.has(combo.appLoopType) ? ["quartered"] : [])];

  for (const slice of slices) {
    const rowKey = `${combo.appLoopType}@${slice}`;
    curatedSeeds[combo.appLoopType] ??= {};
    curatedSeeds[combo.appLoopType][slice] = [];

    let exactMatches = 0;
    let secondaryAgreements = 0;
    let secondaryApplicable = 0;
    let crashes = 0;
    let notCircular = 0;
    const crashMessages = new Set();

    for (let i = 0; i < K; i++) {
      totalRuns++;
      let accepted = false;

      for (let attempt = 0; attempt < RETRIES && !accepted; attempt++) {
        let gen;
        try {
          gen = generateOne({
            appLoopType: combo.appLoopType,
            components: combo.components,
            period: slice,
            length: LENGTH,
            level: LEVEL,
            allPictographs,
          });
        } catch (e) {
          crashes++;
          crashMessages.add((e.message ?? String(e)).split("\n")[0]);
          continue;
        }

        const rawSteps = gen.rawSteps;
        if (!isApproxSeamlesslyLoopable(rawSteps)) {
          notCircular++;
          continue;
        }

        const primary = detectPrimary(rawSteps);
        if (primary.error) {
          crashes++;
          crashMessages.add(`detect: ${primary.error}`);
          continue;
        }

        const exact = sameComponentSet(primary.components, combo.components);
        if (!exact) continue;

        const letterSteps = rawSteps.filter((s) => (s.stepNumber ?? 0) > 0);

        // secondary cross-check only applies to even letter-step counts
        // (detectLOOPFromSteps requires an even count for halved detection).
        if (letterSteps.length % 2 === 0) {
          secondaryApplicable++;
          const secondary = detectSecondary(rawSteps);
          if (!secondary.error && sameComponentSet(secondary.components, combo.components)) {
            secondaryAgreements++;
          }
        }

        exactMatches++;
        totalExactMatches++;
        accepted = true;

        if (curatedSeeds[combo.appLoopType][slice].length < 3) {
          const word = letterSteps.map((s) => s.letter).join("");
          curatedSeeds[combo.appLoopType][slice].push({
            word,
            startPlacement: rawSteps[0].startPlacement,
            steps: letterSteps.map((s) => ({
              letter: s.letter,
              startPlacement: s.startPlacement,
              endPlacement: s.endPlacement,
              stepNumber: s.stepNumber,
              leftMotion: s.motions.left,
              rightMotion: s.motions.right,
            })),
          });
        }
      }
    }

    totalCrashes += crashes;

    report.push({
      rowKey,
      appLoopType: combo.appLoopType,
      components: combo.components,
      slice,
      k: K,
      exactMatches,
      accuracyPct: ((exactMatches / K) * 100).toFixed(1),
      secondaryApplicable,
      secondaryAgreements,
      crashes,
      notCircular,
      crashMessages: [...crashMessages],
      curatedCount: curatedSeeds[combo.appLoopType][slice].length,
    });

    console.log(
      `${rowKey}: ${exactMatches}/${K} exact` +
        (crashes ? `, ${crashes} crashes` : "") +
        (notCircular ? `, ${notCircular} not-circular` : "") +
        ` — curated ${curatedSeeds[combo.appLoopType][slice].length}/3`
    );
  }
}

// ---------------------------------------------------------------------------
// Emit report
// ---------------------------------------------------------------------------

const reportPath = path.join(ROOT, "scripts/output/loop-explorer-verification-report.md");
const lines = [];
lines.push("# LOOP Explorer Verification Report");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`K=${K} sequences per combo x slice, length=${LENGTH}, level=${LEVEL}, retries=${RETRIES}`);
lines.push("");
lines.push(
  "Generation path: mcp-server engine-generation-adapter pattern (Node-native, " +
    "same SequenceBuilder + engine used by the app and generate_sequence MCP " +
    "tool) — rebuilt locally with the full 17-combo table because the MCP " +
    "server's own LOOP_TYPE_MAP is missing `mirrored_rotated_swapped` (a real " +
    "gap this harness surfaces, see Findings)."
);
lines.push("");
lines.push(
  "Detection: primary = `loopDetectorClass.detectLOOPType` (engine class-based " +
    "detector, same one the app's `loop-detector.ts` delegates to). Secondary " +
    "= `detectLOOPFromSteps` (functional halved-only detector), cross-checked " +
    "where applicable (even letter-step count)."
);
lines.push("");
lines.push(
  "**Limitation:** circularity gate is an inlined approximation of " +
    "`isSeamlesslyLoopable` (position + orientation closure), not a literal " +
    "import — that module is SvelteKit-`$lib`-aliased app code unreachable " +
    "from a plain Node script. See script header for detail."
);
lines.push("");
lines.push("## Per-combo accuracy");
lines.push("");
lines.push("| Combo | Slice | Exact/K | Accuracy | 2nd-detector agree | Crashes | Not-circular | Curated seeds |");
lines.push("|---|---|---|---|---|---|---|---|");
for (const r of report) {
  lines.push(
    `| ${r.components.join("+")} | ${r.slice} | ${r.exactMatches}/${r.k} | ${r.accuracyPct}% | ` +
      `${r.secondaryAgreements}/${r.secondaryApplicable} | ${r.crashes} | ${r.notCircular} | ${r.curatedCount}/3 |`
  );
}
lines.push("");

const failing = report.filter((r) => Number(r.accuracyPct) < 100 || r.crashes > 0);
lines.push("## Findings");
lines.push("");
if (failing.length === 0) {
  lines.push("All combo x slice rows hit 100% exact-match accuracy with zero crashes.");
} else {
  for (const r of failing) {
    lines.push(`- **${r.rowKey}**: ${r.accuracyPct}% exact (${r.exactMatches}/${r.k}).`);
    if (r.crashes) lines.push(`  - ${r.crashes} crash(es): ${r.crashMessages.join(" | ")}`);
    if (r.notCircular) lines.push(`  - ${r.notCircular} run(s) failed the circularity gate.`);
    if (r.curatedCount < 3) {
      lines.push(
        `  - Curated fallback pool incomplete for this combo x slice: only ${r.curatedCount}/3 verified seeds.`
      );
    }
  }
}
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`- Total combo x slice rows: ${report.length}`);
lines.push(`- Total generation runs: ${totalRuns}`);
lines.push(`- Total exact matches: ${totalExactMatches}`);
lines.push(`- Total crashes: ${totalCrashes}`);

writeFileSync(reportPath, lines.join("\n"), "utf-8");
console.log(`\nReport written: ${reportPath}`);

// ---------------------------------------------------------------------------
// Emit curated seeds (only exact-match ones; skip combo x slice with zero)
// ---------------------------------------------------------------------------

const seedsOut = {};
for (const [appLoopType, bySlice] of Object.entries(curatedSeeds)) {
  for (const [slice, seeds] of Object.entries(bySlice)) {
    if (seeds.length === 0) continue;
    seedsOut[appLoopType] ??= {};
    seedsOut[appLoopType][slice] = seeds;
  }
}

const seedsPath = path.join(ROOT, "src/lib/shared/loop-explorer/domain/curated-seeds.json");
writeFileSync(seedsPath, JSON.stringify(seedsOut, null, 2), "utf-8");
console.log(`Curated seeds written: ${seedsPath}`);

console.log(
  `\nDONE. ${totalExactMatches}/${totalRuns} exact-match generations across ${report.length} combo x slice rows.`
);
