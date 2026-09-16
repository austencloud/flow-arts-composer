// Bake the generated LOOP slots used by the festival sampler.
// This composes the same SequenceBuilder adapter as the MCP generate_sequence
// tool, but deliberately stops before its image-rendering and PicView step.
import fs from "node:fs";
import path from "node:path";
import { generateViaEngine } from "../mcp-server/src/core/engine-generation-adapter.js";
import { ensureDataLoadedAsync } from "../mcp-server/src/shared/server-context.js";

const REPO = path.join(import.meta.dirname, "..");
const OUTPUT = path.join(
  REPO,
  "docs/superpowers/specs/festival-sample-pack/evidence/festival-pack-local-sequences.json"
);
const RUNTIME_OUTPUT = path.join(
  REPO,
  "static/data/choreo-card/festival-sampler-sequences.json"
);
const PACK_COUNT = 60;
const CLASSIC_POSITIONS = ["alpha1", "beta5", "gamma11"] as const;
const SLOT_CONFIGS = [
  { loopType: "mirrored", sequenceLength: 16, period: "halved" },
  { loopType: "mirrored_swapped", sequenceLength: 8, period: "halved" },
  { loopType: "mirrored_inverted", sequenceLength: 8, period: "halved" },
] as const;

type SlotConfig = (typeof SLOT_CONFIGS)[number];
type LoopType = SlotConfig["loopType"];
type GeneratedStep = {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  leftMotion: Record<string, unknown>;
  rightMotion: Record<string, unknown>;
  stepNumber: number;
};

function hasClosedOrientations(steps: GeneratedStep[]): boolean {
  const start = steps[0];
  const end = steps.at(-1);
  if (!start || !end) return false;
  return (
    start.leftMotion.startOrientation === end.leftMotion.endOrientation &&
    start.rightMotion.startOrientation === end.rightMotion.endOrientation
  );
}

function motionForApp(motion: Record<string, unknown>, hand: "left" | "right") {
  return { ...motion, hand, propType: "staff", isVisible: true };
}

function buildRecord(
  loopType: LoopType,
  sequenceLength: number,
  period: "halved" | "quartered",
  index: number,
  word: string,
  steps: GeneratedStep[],
  components: string[]
) {
  const start = steps[0];
  if (!start) throw new Error(`${loopType} generation returned no start pose`);
  const id = `festival-${loopType}-${String(index + 1).padStart(2, "0")}`;
  const sequenceSteps = steps.slice(1).map((step, stepIndex) => ({
    id: `${id}-step-${stepIndex + 1}`,
    stepNumber: stepIndex + 1,
    isStep: true,
    isBlank: false,
    duration: 1,
    gridMode: "diamond",
    letter: step.letter,
    startPlacement: step.startPlacement,
    endPlacement: step.endPlacement,
    motions: {
      left: motionForApp(step.leftMotion, "left"),
      right: motionForApp(step.rightMotion, "right"),
    },
  }));
  const endPlacement = sequenceSteps.at(-1)?.endPlacement;
  if (
    !CLASSIC_POSITIONS.includes(
      start.startPlacement as (typeof CLASSIC_POSITIONS)[number]
    ) ||
    endPlacement !== start.startPlacement ||
    sequenceSteps.length !== sequenceLength
  ) {
    throw new Error(
      `${loopType} ${word} violated the festival slot: ${start.startPlacement} -> ${endPlacement}, ${sequenceSteps.length} steps`
    );
  }

  return {
    id,
    name: word,
    word,
    level: 1,
    turnIntensity: 0,
    sequenceLength,
    gridMode: "diamond",
    isCircular: true,
    loopType,
    components,
    period: period === "quartered" ? 4 : 2,
    notes: "Festival Sampler 2026",
    startPlacement: {
      id: `${id}-start`,
      isStartPlacement: true,
      gridMode: "diamond",
      gridPlacement: start.startPlacement,
      startPlacement: start.startPlacement,
      endPlacement: start.startPlacement,
      letter: start.letter,
      motions: {
        left: motionForApp(start.leftMotion, "left"),
        right: motionForApp(start.rightMotion, "right"),
      },
    },
    steps: sequenceSteps,
  };
}

const allPictographs = await ensureDataLoadedAsync("diamond");
const records: Record<string, ReturnType<typeof buildRecord>> = {};
const wordsByType = new Map<LoopType, Set<string>>(
  SLOT_CONFIGS.map(({ loopType }) => [loopType, new Set<string>()])
);

for (const { loopType, sequenceLength, period } of SLOT_CONFIGS) {
  const words = wordsByType.get(loopType)!;
  let attempts = 0;
  while (words.size < PACK_COUNT) {
    attempts += 1;
    if (attempts > 12_000) {
      throw new Error(
        `${loopType} produced only ${words.size} unique words after ${attempts} attempts`
      );
    }
    const index = words.size;
    const startPlacement = CLASSIC_POSITIONS[index % CLASSIC_POSITIONS.length];
    let generated;
    try {
      generated = generateViaEngine(
        {
          length: sequenceLength,
          loopType,
          period,
          gridMode: "diamond",
          level: 1,
          turnIntensity: 0,
          propType: "staff",
          constraintPreset: "smooth",
          startPlacement,
        },
        allPictographs as never
      );
    } catch {
      continue;
    }

    const word = generated.result.word;
    const steps = generated.result.steps as GeneratedStep[];
    if (words.has(word) || !hasClosedOrientations(steps)) {
      continue;
    }
    const record = buildRecord(
      loopType,
      sequenceLength,
      period,
      index,
      word,
      steps,
      generated.loopComponents ?? loopType.split("_")
    );
    words.add(word);
    records[record.id] = record;
  }
  process.stdout.write(
    `${loopType}: ${words.size} unique ${sequenceLength}-step LOOPs (${attempts} attempts)\n`
  );
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const payload = `${JSON.stringify(
  {
    schemaVersion: 2,
    generatedBy: "flow-arts SequenceBuilder via MCP generation adapter",
    levelPolicy:
      "Generated records are frozen at Level 1 with zero turns. The pack manifest assigns patterned turns to three Level 2 cards selected from all eight choreography slots and one Level 3 card selected from the six LOOP slots.",
    records,
  },
  null,
  2
)}\n`;
fs.writeFileSync(OUTPUT, payload);
fs.mkdirSync(path.dirname(RUNTIME_OUTPUT), { recursive: true });
fs.writeFileSync(RUNTIME_OUTPUT, payload);
process.stdout.write(`wrote ${OUTPUT}\n`);
process.stdout.write(`wrote ${RUNTIME_OUTPUT}\n`);
