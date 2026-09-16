// Which real English words can carry which LOOP, at which count?
//
// The festival sample pack needs beginner-legible cards. Released catalog data
// can't supply them: festival-pack-census.cjs showed words are either 100%
// Type 1 or jump straight to 4+ Greek/dash letters, and the all-Type-1 pools
// bottom out at 1-3 candidates per slot. Generating from an arbitrary word
// doesn't help either — the builder inserts Greek bridge letters when
// consecutive letters don't chain (ABCDEFGH -> ABCJDJEJFJGHΦ, 26 steps).
//
// Bridge-free words dodge both problems. Every transition is direct, so step
// count == letter count exactly, and the word stays a readable English word:
//   4 letters halved -> 8 counts    4 letters quartered -> 16 counts
//   8 letters halved -> 16 counts
//
// Source pool: docs/reference/tka-valid-words.md (1137 bridge-free words).
//
//   npx tsx scripts/festival-word-loop-search.ts
//
// Writes scripts/.cache/festival-word-loop-search.json (gitignored).
import fs from "node:fs";
import path from "node:path";
import { ensureDataLoaded } from "../mcp-server-pkg/src/shared/server-context.js";
import {
  buildSequenceFromLetters,
  parseWordToLetters,
} from "../mcp-server-pkg/src/core/sequence-builder.js";
import { isLOOPValidForPlacementPair } from "@tka/sequence-engine/loop";

const REPO = path.join(import.meta.dirname, "..");
const DOC = path.join(REPO, "docs/reference/tka-valid-words.md");
const OUT_DIR = path.join(REPO, "scripts/.cache");
const OUT = path.join(OUT_DIR, "festival-word-loop-search.json");

/** Bridge-free words from the reference doc, grouped by letter count. */
function loadWords(): Map<number, string[]> {
  const text = fs.readFileSync(DOC, "utf8");
  const byLen = new Map<number, string[]>();
  const section = text.split("## Bridge-Free Words")[1] ?? "";
  for (const m of section.matchAll(/###\s+(\d+)\s+letters[^\n]*\n\n([\s\S]*?)(?=\n###|\n##|$)/g)) {
    const len = Number(m[1]);
    const words = (m[2] ?? "")
      .replace(/\*\*/g, "") // the doc bolds its curated picks
      .split(/[,\n]/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w) && w.length === len);
    if (words.length) byLen.set(len, words);
  }
  return byLen;
}

const SLOTS = [
  { key: "mirrored-8", loop: "mirrored", period: "halved", letters: 4 },
  { key: "mirrored-16", loop: "mirrored", period: "halved", letters: 8 },
  { key: "rotated-8", loop: "rotated", period: "halved", letters: 4 },
  // 4-letter quartered yields nothing, so 16-count rotated comes from an
  // 8-letter halved seed instead.
  { key: "rotated-16q", loop: "rotated", period: "quartered", letters: 4 },
  { key: "rotated-16", loop: "rotated", period: "halved", letters: 8 },
  { key: "mirrored_swapped-8", loop: "mirrored_swapped", period: "halved", letters: 4 },
  { key: "mirrored_swapped-16", loop: "mirrored_swapped", period: "halved", letters: 8 },
  { key: "mirrored_swapped-16q", loop: "mirrored_swapped", period: "quartered", letters: 4 },
  { key: "mirrored_inverted-8", loop: "mirrored_inverted", period: "halved", letters: 4 },
  { key: "mirrored_inverted-16", loop: "mirrored_inverted", period: "halved", letters: 8 },
] as const;

// A word can be realized at several start positions depending on which
// pictograph variation each letter takes. The builder picks randomly, so
// sample it repeatedly to map the reachable (start,end) pairs.
const ATTEMPTS = 60;

const pictographs = ensureDataLoaded("diamond" as never);
const byLen = loadWords();
const results: Record<string, { word: string; pair: string }[]> = {};
for (const s of SLOTS) results[s.key] = [];

for (const len of [...new Set(SLOTS.map((s) => s.letters))]) {
  const words = byLen.get(len) ?? [];
  process.stderr.write(`length ${len}: ${words.length} bridge-free words\n`);
  for (const word of words) {
    const letters = parseWordToLetters(word);
    if (letters.length !== len) continue;
    const pairs = new Set<string>();
    for (let i = 0; i < ATTEMPTS; i++) {
      const r = buildSequenceFromLetters(letters, pictographs, 1, undefined, true);
      // steps[0] is the start-placement step, so a bridge-free build of an
      // N-letter word has N+1 entries.
      if (r.isValid && r.steps.length === len + 1) pairs.add(`${r.startPlacement},${r.endPlacement}`);
    }
    for (const s of SLOTS) {
      if (s.letters !== len) continue;
      const hit = [...pairs].find((p) => isLOOPValidForPlacementPair(s.loop as never, p, s.period as never));
      if (hit) results[s.key].push({ word, pair: hit });
    }
  }
}

for (const s of SLOTS) {
  const hits = results[s.key];
  console.log(
    s.key.padEnd(22) +
      String(hits.length).padStart(4) +
      " words   " +
      hits.slice(0, 10).map((h) => h.word).join(", ")
  );
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nwrote ${OUT}`);
