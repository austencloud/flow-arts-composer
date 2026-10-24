/**
 * Write the Flow Fest phrase library: library sequences a staff spinner can
 * play, tagged for the phrase brain.
 *
 *   node --import tsx scripts/flow-fest/build-phrase-library.ts
 *
 * Source: the committed export of the public library,
 * `static/data/snapshots/public-sequences.json` (the `publicSequences`
 * Firestore collection, the same documents `PublicSequencesLoader` reads).
 * Reading it needs no network or credentials. Each sequence is rebuilt with
 * `deriveSteps`, the owner the app's own loader uses, then tagged by
 * `tagPhraseSequence`.
 *
 * Kept: up to 320 sequences that rebuild, run 4 to 16 beats, and are not mostly held
 * props; one copy per content hash. The file stores the compositional form
 * (two hand tracks and pairings, empty fields left out), so it stays small;
 * both engines rebuild the steps with `rebuildPhraseSequence`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLegacySequence } from "@tka/tka-types";
import { deriveSteps } from "#lib/shared/foundation/services/step-deriver.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import {
  DEFAULT_WALK_SAFE,
  tagPhraseSequence,
  type PhraseLibrary,
  type PhraseLibraryEntry,
  type PhraseStepLike,
} from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
import { compactPhraseSequence } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-sequence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = "static/data/snapshots/public-sequences.json";
const outputPath = "static/data/flow-fest/phrase-library.json";

const MIN_BEATS = 4;
const MAX_BEATS = 16;
const MAX_ENTRIES = 320;

interface SnapshotDocument {
  id?: string;
  _id?: string;
  name?: string;
  word?: string;
  level?: number;
  gridMode?: string;
  isCircular?: boolean;
  contentHash?: string;
  startPlacement?: unknown;
  leftSoloProp?: { steps: unknown[] };
  rightSoloProp?: { steps: unknown[] };
  stepPairings?: unknown[];
}

const snapshot = JSON.parse(
  readFileSync(resolve(root, sourcePath), "utf8")
) as {
  _meta?: { exportedAt?: string };
  documents: SnapshotDocument[];
};

const seen = new Set<string>();
const entries: PhraseLibraryEntry[] = [];
const skipped = { rebuild: 0, length: 0, held: 0, duplicate: 0, prop: 0 };

for (const raw of snapshot.documents) {
  const doc = normalizeLegacySequence(raw) as SnapshotDocument;
  const id = doc.id ?? doc._id;
  const left = doc.leftSoloProp;
  const right = doc.rightSoloProp;
  const pairings = doc.stepPairings;
  if (
    !id ||
    !left?.steps?.length ||
    !right?.steps?.length ||
    !pairings?.length
  ) {
    skipped.rebuild++;
    continue;
  }
  let steps: PhraseStepLike[];
  try {
    steps = deriveSteps(
      left as never,
      right as never,
      pairings as never
    ) as unknown as PhraseStepLike[];
  } catch {
    skipped.rebuild++;
    continue;
  }
  if (steps.length < MIN_BEATS || steps.length > MAX_BEATS) {
    skipped.length++;
    continue;
  }
  const propTypes = new Set(
    steps.flatMap((s) =>
      [s.motions.left, s.motions.right].map(
        (m) => (m as { propType?: string } | null)?.propType
      )
    )
  );
  if (![...propTypes].every((p) => p === "staff")) {
    skipped.prop++;
    continue;
  }
  const hash = doc.contentHash ?? id;
  if (seen.has(hash)) {
    skipped.duplicate++;
    continue;
  }
  const level = doc.level ?? 1;
  const tags = tagPhraseSequence(steps, level);
  const held = tags.motionCounts.static / (tags.beats * 2);
  if (held > 0.5) {
    skipped.held++;
    continue;
  }
  seen.add(hash);
  entries.push({
    id,
    // The label both engines show: the sequence word, simplified, as every
    // display of a word is; a saved name only when there is no word.
    name: doc.word ? simplifyRepeatedWord(doc.word) : doc.name || id,
    word: doc.word ?? "",
    level,
    beats: tags.beats,
    tags,
    sequence: compactPhraseSequence({
      ...doc,
      leftSoloProp: left,
      rightSoloProp: right,
      stepPairings: pairings,
    }),
  });
}

// A few hundred is plenty for a performer. Every walk-safe sequence stays (the
// travelling phrases have the fewest to choose from); the rest are an even
// spread across difficulty, so the techer still has the hard end to draw on.
const walkSafeEntries = entries.filter((e) => e.tags.walkSafe);
const others = entries
  .filter((e) => !e.tags.walkSafe)
  .sort(
    (a, b) => a.tags.difficulty - b.tags.difficulty || a.id.localeCompare(b.id)
  );
const otherSlots = Math.max(0, MAX_ENTRIES - walkSafeEntries.length);
const spread =
  others.length <= otherSlots
    ? others
    : Array.from(
        { length: otherSlots },
        (_, i) => others[Math.floor((i * others.length) / otherSlots)]!
      );
const total = entries.length;
entries.length = 0;
entries.push(...walkSafeEntries, ...spread);
entries.sort((a, b) => a.id.localeCompare(b.id));

const library: PhraseLibrary = {
  version: "flow-fest-phrase-library-v1",
  source: sourcePath,
  sourceExportedAt: snapshot._meta?.exportedAt ?? null,
  propFamily: "staff",
  walkSafeDefaults: DEFAULT_WALK_SAFE,
  entries,
};

mkdirSync(dirname(resolve(root, outputPath)), { recursive: true });
writeFileSync(resolve(root, outputPath), `${JSON.stringify(library)}\n`);

const kinds: Record<string, number> = {};
for (const e of entries) kinds[e.tags.kind] = (kinds[e.tags.kind] ?? 0) + 1;
const walkSafe = entries.filter((e) => e.tags.walkSafe).length;
console.log(
  `Wrote ${entries.length} of ${total} usable sequences to ${outputPath} (${walkSafe} walk-safe; kinds ${JSON.stringify(kinds)}; skipped ${JSON.stringify(skipped)})`
);
