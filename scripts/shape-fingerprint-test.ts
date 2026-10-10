/**
 * CLI script to test mandala shape fingerprinting algorithms.
 * Loads sequences from Firestore, computes mandala paths, and reports
 * how many shape groups each fingerprint algorithm produces.
 *
 * Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/shape-fingerprint-test.ts
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { MandalaGeometryCalculator } from "#lib/shared/mandala/services/implementations/MandalaGeometryCalculator";
import type { MandalaPaths, SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Firebase init ---
const serviceAccountPath = resolve(__dirname, "../serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const calc = new MandalaGeometryCalculator();

// --- Path sampling (same as ShapeBrowser) ---
function samplePathPoints(d: string): [number, number][] {
  const pts: [number, number][] = [];
  let cx = 0, cy = 0;
  const commands = d.match(/[MC][^MC]*/g);
  if (!commands) return pts;
  for (const cmd of commands) {
    const nums = cmd.slice(1).match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    if (cmd[0] === "M" && nums.length >= 2) {
      cx = nums[0]!; cy = nums[1]!;
      pts.push([cx, cy]);
    } else if (cmd[0] === "C" && nums.length >= 6) {
      const cp1x = nums[0]!, cp1y = nums[1]!;
      const cp2x = nums[2]!, cp2y = nums[3]!;
      const ex = nums[4]!, ey = nums[5]!;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const u = 1 - t;
        const x = u*u*u*cx + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*ex;
        const y = u*u*u*cy + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*ey;
        pts.push([x, y]);
      }
      cx = ex; cy = ey;
    }
  }
  return pts;
}

type PathType = "DASH" | "ANTISPIN" | "PROSPIN" | "DOT";

function classifyPath(d: string): PathType {
  const pts = samplePathPoints(d);
  if (pts.length < 2) return "DOT";
  const radii = pts.map(([x, y]) => Math.sqrt(x * x + y * y));
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  const range = maxR - minR;

  if (range < 20) {
    return maxR > 100 ? "PROSPIN" : "DOT";
  }
  return minR < 5 ? "DASH" : "ANTISPIN";
}

function fingerprint(paths: MandalaPaths): string {
  let nD = 0, nA = 0, nP = 0, nT = 0;
  for (const group of [paths.left, paths.right, paths.purple]) {
    for (const p of group) {
      const t = classifyPath(p.d);
      if (t === "DASH") nD++;
      else if (t === "ANTISPIN") nA++;
      else if (t === "PROSPIN") nP++;
      else nT++;
    }
  }
  return `D${nD}A${nA}P${nP}T${nT}`;
}

interface ShapeGroup {
  fp: string;
  count: number;
  examples: Array<{ word: string; pathTypes: string[]; pathDetails: string[] }>;
}

// --- Main ---
async function main() {
  // 1. Find quartered rotated LOOP decks
  console.log("Loading decks...");
  const decksSnap = await db.collection("catalogs").get();
  const allDecks = decksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const filteredDecks = allDecks.filter(d =>
    d.collection === "LOOPs" &&
    d.loopType === "rotated" &&
    d.sliceType === "quartered" &&
    (!d.reversalPattern || d.reversalPattern === "continuous")
  );

  console.log(`Found ${filteredDecks.length} quartered rotated LOOP decks:`);
  for (const d of filteredDecks) {
    console.log(`  ${d.id} — ${d.name ?? d.turnPattern ?? "?"}`);
  }

  // 2. Process each deck
  const targetId = process.argv[2];
  const decksToProcess = targetId
    ? filteredDecks.filter(d => d.id.includes(targetId))
    : filteredDecks;

  for (const deck of decksToProcess) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`DECK: ${deck.name ?? deck.id}`);
    console.log("=".repeat(60));

    // Paginate to avoid Firestore timeout on large collections
    const PAGE = 500;
    const allDocs: any[] = [];
    let lastDoc: any = null;
    let hasMore = true;
    while (hasMore) {
      let q = db.collection(`catalogs/${deck.id}/sequences`).orderBy("__name__").limit(PAGE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      allDocs.push(...snap.docs);
      lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      hasMore = snap.docs.length === PAGE;
    }
    console.log(`  ${allDocs.length} sequences loaded`);

    const groups = new Map<string, ShapeGroup>();
    let processed = 0;
    let skipped = 0;

    for (const doc of allDocs) {
      const seq = { id: doc.id, ...doc.data() } as any;
      const steps = seq.steps;
      if (!steps || steps.length === 0) { skipped++; continue; }

      try {
        const paths = calc.calculate(steps, "staff", "staff");
        const fp = fingerprint(paths);

        const pathTypes: string[] = [];
        const pathDetails: string[] = [];
        for (const [label, group] of [["B", paths.left], ["R", paths.right], ["P", paths.purple]] as const) {
          for (const p of group) {
            const t = classifyPath(p.d);
            pathTypes.push(`${label}:${t}`);
            // Compute radial distribution for ARC paths
            if (t === "ARC" || t === "DASH") {
              const pts = samplePathPoints(p.d);
              const radii = pts.map(([x, y]) => Math.sqrt(x * x + y * y));
              const nearOuter = radii.filter(r => r > 130).length;
              const nearCenter = radii.filter(r => r < 30).length;
              const outerPct = Math.round(100 * nearOuter / radii.length);
              const centerPct = Math.round(100 * nearCenter / radii.length);
              pathDetails.push(`${label}:${t}(outer=${outerPct}%,center=${centerPct}%)`);
            }
          }
        }

        const existing = groups.get(fp);
        if (existing) {
          existing.count++;
          if (existing.examples.length < 15) {
            existing.examples.push({ word: seq.word ?? seq.id, pathTypes, pathDetails });
          }
        } else {
          groups.set(fp, {
            fp,
            count: 1,
            examples: [{ word: seq.word ?? seq.id, pathTypes, pathDetails }],
          });
        }
        processed++;
      } catch (e: any) {
        skipped++;
      }
    }

    console.log(`  Processed: ${processed}, Skipped: ${skipped}`);
    console.log(`  → ${groups.size} SHAPE GROUPS\n`);

    const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
    for (const g of sorted) {
      const label = describeFP(g.fp);
      console.log(`  ${g.fp} (${label}) — ${g.count} sequences`);
      for (const ex of g.examples) {
        console.log(`    ${ex.word}  paths=[${ex.pathTypes.join(", ")}]  ${ex.pathDetails.join(" | ")}`);
      }
    }
  }

  process.exit(0);
}

function describeFP(fp: string): string {
  const parts: string[] = [];
  const m = fp.match(/D(\d+)A(\d+)P(\d+)T(\d+)/);
  if (!m) return fp;
  const [, d, a, p, t] = m;
  if (Number(d) > 0) parts.push("dash");
  if (Number(a) > 0) parts.push("antispin");
  if (Number(p) > 0 || Number(t) > 0) parts.push("prospin");
  return parts.join(" + ") || "unknown";
}

main().catch(console.error);
