import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFestivalSamplerTurnAssignment,
  findCompatibleFestivalSamplerTurnAssignment,
  loadFestivalSamplerBaseSequence,
} from "#lib/features/choreo-card/services/festival-sampler-turns.js";
import type { FestivalSamplerCardManifest } from "#lib/features/choreo-card/services/festival-sampler-manifest.js";

interface PackManifest {
  rank?: number;
  cards: FestivalSamplerCardManifest[];
}

interface ManifestDocument {
  cards?: FestivalSamplerCardManifest[];
  candidates?: PackManifest[];
  selected?: PackManifest | boolean;
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDirectory, "..");
const evidenceDirectory = path.join(
  repo,
  "docs/superpowers/specs/festival-sample-pack/evidence"
);
const manifestPaths = [
  path.join(evidenceDirectory, "festival-pack-50-candidates.json"),
  path.join(evidenceDirectory, "festival-pack-selected.json"),
  path.join(evidenceDirectory, "festival-pack-unique-manifests.json"),
  path.join(
    repo,
    "src/lib/features/choreo-card/data/festival-sampler-manifests.json"
  ),
];

function sourceKey(card: FestivalSamplerCardManifest): string {
  return [card.source, card.sourceRef, card.id, card.name].join("|");
}

interface CardList {
  cards: FestivalSamplerCardManifest[];
  rank: number;
}

function cardLists(document: ManifestDocument): CardList[] {
  const lists: CardList[] = [];
  if (document.cards) {
    lists.push({ cards: document.cards, rank: 1 });
  }
  if (document.candidates) {
    lists.push(
      ...document.candidates.map((candidate, index) => ({
        cards: candidate.cards,
        rank: candidate.rank ?? index + 1,
      }))
    );
  }
  if (document.selected && typeof document.selected === "object") {
    lists.push({
      cards: document.selected.cards,
      rank: document.selected.rank ?? 1,
    });
  }
  return lists;
}

async function freezeDocument(document: ManifestDocument): Promise<number> {
  const baseSequences = new Map<
    string,
    Awaited<ReturnType<typeof loadFestivalSamplerBaseSequence>>
  >();
  let patternedCards = 0;
  for (const { cards, rank } of cardLists(document)) {
    for (const card of cards) {
      const intensity = card.turnIntensity ?? 0;
      if (intensity === 0) {
        delete card.turnPatternId;
        delete card.turnPattern;
        continue;
      }
      const key = sourceKey(card);
      let base = baseSequences.get(key);
      if (!base) {
        base = await loadFestivalSamplerBaseSequence(card);
        baseSequences.set(key, base);
      }
      const assignment = findCompatibleFestivalSamplerTurnAssignment(
        card,
        base,
        `festival-pack-${rank}|${sourceKey(card)}|${card.slot}|level-${card.level}`
      );
      card.turnPatternId = assignment.id;
      card.turnPattern = assignment.pattern;
      applyFestivalSamplerTurnAssignment(card, base);
      patternedCards += 1;
    }
  }
  return patternedCards;
}

async function main(): Promise<void> {
  for (const manifestPath of manifestPaths) {
    const document = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    ) as ManifestDocument;
    const patternedCards = await freezeDocument(document);
    fs.writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(
      `froze ${patternedCards} loop-closing turn patterns in ${path.relative(repo, manifestPath)}`
    );
  }
}

void main().catch((cause: unknown) => {
  console.error(cause);
  process.exitCode = 1;
});
