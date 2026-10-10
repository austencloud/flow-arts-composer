/**
 * Dumps solo prop path diagnostics for mandala shape analysis.
 * Each prop's paths are analyzed independently — the atomic unit is one prop's mandala.
 *
 * Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/solo-path-diagnostic.ts [deckFilter] [limit]
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { MandalaGeometryCalculator } from "#lib/shared/mandala/services/implementations/MandalaGeometryCalculator";
import type { MandalaPaths, SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = resolve(__dirname, "../serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const calc = new MandalaGeometryCalculator();

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

function subsample(pts: [number, number][], target: number): [number, number][] {
  if (pts.length <= target) return pts;
  const step = (pts.length - 1) / (target - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < target; i++) out.push(pts[Math.round(i * step)]!);
  return out;
}

interface SoloPath {
  word: string;
  prop: "left" | "right";
  tips: Array<{
    tipIndex: number;
    d: string;
    minR: number;
    maxR: number;
    samplePoints: [number, number][];
  }>;
}

function extractSolos(word: string, paths: MandalaPaths): SoloPath[] {
  const solos: SoloPath[] = [];
  for (const [prop, group] of [["left", paths.left], ["right", paths.right]] as const) {
    const tips = group.map(p => {
      const allPts = samplePathPoints(p.d);
      const radii = allPts.map(([x, y]) => Math.sqrt(x * x + y * y));
      return {
        tipIndex: p.tipIndex,
        d: p.d,
        minR: Math.round(Math.min(...radii)),
        maxR: Math.round(Math.max(...radii)),
        samplePoints: subsample(allPts, 12),
      };
    });
    solos.push({ word, prop, tips });
  }
  return solos;
}

function soloDigest(solo: SoloPath): string {
  const parts = solo.tips
    .sort((a, b) => a.tipIndex - b.tipIndex)
    .map(t => {
      const coords = t.samplePoints
        .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)
        .join(" ");
      return `  tip${t.tipIndex} r:[${t.minR}..${t.maxR}]: ${coords}`;
    });
  return `${solo.word} [${solo.prop}]\n${parts.join("\n")}`;
}

async function main() {
  const deckFilter = process.argv[2] ?? "8beat";
  const limit = parseInt(process.argv[3] ?? "80", 10);

  console.log(`Loading decks matching "${deckFilter}"...`);
  const decksSnap = await db.collection("catalogs").get();
  const allDecks = decksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const filteredDecks = allDecks.filter(d =>
    d.collection === "LOOPs" &&
    d.loopType === "rotated" &&
    d.sliceType === "quartered" &&
    (!d.reversalPattern || d.reversalPattern === "continuous") &&
    d.id.includes(deckFilter)
  );

  if (filteredDecks.length === 0) {
    console.log("No matching decks found.");
    process.exit(1);
  }

  for (const deck of filteredDecks) {
    console.log(`\nDECK: ${deck.name ?? deck.id}`);
    console.log("=".repeat(60));

    let q = db.collection(`catalogs/${deck.id}/sequences`).orderBy("__name__").limit(limit);
    const snap = await q.get();
    console.log(`Loaded ${snap.docs.length} sequences\n`);

    const allSolos: SoloPath[] = [];

    for (const doc of snap.docs) {
      const seq = { id: doc.id, ...doc.data() } as any;
      if (!seq.steps || seq.steps.length === 0) continue;

      try {
        const paths = calc.calculate(seq.steps, "staff", "staff");
        const solos = extractSolos(seq.word ?? seq.id, paths);
        allSolos.push(...solos);
      } catch {
        // skip
      }
    }

    // Print each solo
    console.log(`--- ALL SOLOS (${allSolos.length} total, ${allSolos.length / 2} sequences) ---\n`);
    for (const solo of allSolos) {
      console.log(soloDigest(solo));
      console.log();
    }

    // Group solos by rounded sample points to see what clusters emerge
    const clusters = new Map<string, SoloPath[]>();
    for (const solo of allSolos) {
      // Naive cluster key: sorted rounded coords of all tips
      const key = solo.tips
        .sort((a, b) => a.tipIndex - b.tipIndex)
        .flatMap(t => t.samplePoints.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`))
        .join("|");
      const arr = clusters.get(key) ?? [];
      arr.push(solo);
      clusters.set(key, arr);
    }

    console.log(`--- CLUSTERS BY EXACT SAMPLE POINTS (${clusters.size} groups) ---\n`);
    const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [key, members] of sorted) {
      const words = members.map(m => `${m.word}[${m.prop}]`).join(", ");
      console.log(`[${members.length}x] ${words}`);
      // Show one representative
      console.log(soloDigest(members[0]!));
      console.log();
    }
  }

  process.exit(0);
}

main().catch(console.error);
