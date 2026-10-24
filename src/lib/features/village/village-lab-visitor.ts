/**
 * The lab's stand-in for the museum visitor (VillageControls' Visitor panel).
 *
 * The lab has no player body, so "Teach nearest idle" picks for them: the
 * free villager nearest the audience spot who does not yet know the pocket's
 * sequence, with the visitor standing a little way in front of them, between
 * them and the audience. The museum's own pick (museum-village-visitor.ts)
 * works from where the player stands and faces instead.
 *
 * Leave and come back: the lab keeps the village's input log
 * (domain/village-input-log.ts), as a file or one of the engine's two
 * fixtures, and rebuilds the village from it by replay. A log replays only
 * under its own seed, preset and opening, so a lab log comes back as a lab
 * village and a fixture as the museum's.
 */

import { loadVillageRules, type VillageRules } from "./domain/village-rules";
import {
  parseVillageInputLog,
  VillageInputLogError,
  type VillageInputLog,
} from "./domain/village-input-log";
import keptFixture from "./engine/__fixtures__/village-memory-kept.json";
import lostFixture from "./engine/__fixtures__/village-memory-lost.json";
import type { VillageStoryLine } from "./state/village-story";
import type { AvatarBehaviorState } from "./domain/village-types";
import { planCampLayout } from "./domain/village-campfire";
import type {
  VillageAvatarSnapshot,
  VillageMemorySnapshot,
  VillageSnapshot,
} from "./engine/village-snapshot";
import type { VisitorLessonRequest } from "./engine/village-visitor";
import type {
  CreateVillageStateOptions,
  VillageState,
} from "./state/village-state.svelte";

// Past being taught (the sim refuses them too, engine/village-visitor.ts).
// Anyone else not already in a lesson counts as idle here: the village is
// small and busy, and someone strictly idle is rare.
const NEAR_THEIR_END: ReadonlySet<AvatarBehaviorState> = new Set([
  "passing",
  "retiring",
  "seated",
]);

/** How far in front of the learner the visitor stands, in metres. */
export const LAB_VISITOR_STAND_OFF = 1.5;

/** The villager nearest the audience spot who is free to learn this sequence. */
export function nearestIdleLearner(
  snapshot: VillageSnapshot,
  rules: VillageRules,
  sequenceId: string
): VillageAvatarSnapshot | null {
  const { audience } = planCampLayout(rules);
  let best: VillageAvatarSnapshot | null = null;
  let bestDistance = Infinity;
  for (const avatar of snapshot.avatars) {
    if (NEAR_THEIR_END.has(avatar.state) || avatar.lessonRole !== null)
      continue;
    if (avatar.knownSequenceIds.includes(sequenceId)) continue;
    const distance = Math.hypot(avatar.x - audience.x, avatar.z - audience.z);
    if (distance < bestDistance) {
      best = avatar;
      bestDistance = distance;
    }
  }
  return best;
}

/** The lesson request: the visitor faces the learner from the audience side. */
export function labVisitorLesson(
  learner: VillageAvatarSnapshot,
  rules: VillageRules,
  sequenceId: string
): VisitorLessonRequest {
  const { audience } = planCampLayout(rules);
  const dx = audience.x - learner.x;
  const dz = audience.z - learner.z;
  const length = Math.hypot(dx, dz);
  // A learner standing on the audience spot gets the visitor on the fire's side.
  const ux = length > 1e-6 ? dx / length : Math.cos(audience.facing);
  const uz = length > 1e-6 ? dz / length : Math.sin(audience.facing);
  return {
    learnerId: learner.id,
    sequenceId,
    x: learner.x + ux * LAB_VISITOR_STAND_OFF,
    z: learner.z + uz * LAB_VISITOR_STAND_OFF,
    facing: Math.atan2(-uz, -ux),
  };
}

export type LabTeachResult =
  | { started: true; learner: VillageAvatarSnapshot }
  | { started: false; learner: VillageAvatarSnapshot | null };

/**
 * "Teach nearest idle": starts the visitor's lesson with the nearest free
 * villager. Not started when nobody is free, or when the sim refuses.
 */
export function teachNearestIdle(
  village: Pick<VillageState, "snapshot" | "rules" | "teachFromVisitor">,
  sequenceId: string
): LabTeachResult {
  const learner = nearestIdleLearner(
    village.snapshot,
    village.rules,
    sequenceId
  );
  if (!learner) return { started: false, learner: null };
  const started = village.teachFromVisitor(
    labVisitorLesson(learner, village.rules, sequenceId)
  );
  return started ? { started: true, learner } : { started: false, learner };
}

// ---------------------------------------------------------------------------
// Leave and come back

/** The lab's own village: the base rules, this seed. */
export const LAB_SEED = "village-lab-1";

/** The engine's two museum logs: OOGA still carried at the return, and lost. */
export const LAB_FIXTURES = {
  kept: parseVillageInputLog(keptFixture),
  lost: parseVillageInputLog(lostFixture),
} as const;
export type LabFixture = keyof typeof LAB_FIXTURES;

/** The rules a log's village ran: its preset, or the base table. */
export function labRulesFor(log: VillageInputLog): VillageRules {
  return loadVillageRules(log.preset ?? undefined);
}

/**
 * The village state options for a village: the lab's own, or the one a log
 * comes back to, under the log's own rules, seed, preset and opening.
 */
export function labVillageOptions(
  log: VillageInputLog | null
): CreateVillageStateOptions {
  if (!log) return { rules: loadVillageRules(), seed: LAB_SEED };
  return {
    rules: labRulesFor(log),
    seed: log.seed,
    preset: log.preset,
    opening: log.opening,
    replay: log,
  };
}

export type LabLogRead =
  | { ok: true; log: VillageInputLog }
  | { ok: false; error: string };

/** A log file's text, checked; a bad file gets a plain sentence, never a throw. */
export function readLabLog(text: string): LabLogRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That file is not a village log: it isn't JSON.",
    };
  }
  let log: VillageInputLog;
  try {
    log = parseVillageInputLog(raw);
  } catch (error) {
    if (!(error instanceof VillageInputLogError)) throw error;
    const reason = error.message.replace(/^Invalid village input log: /, "");
    return { ok: false, error: `That file is not a village log: ${reason}.` };
  }
  try {
    labRulesFor(log);
  } catch {
    return {
      ok: false,
      error: `That log is for a village this lab can't build (the "${log.preset}" rules).`,
    };
  }
  return { ok: true, log };
}

/** The file a kept log downloads as. */
export function labLogFileName(log: VillageInputLog): string {
  return `village-log-${log.seed}-${log.lastTick}.json`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The return as the story tells it, to the visitor. */
export function memoryStoryLine(
  memory: VillageMemorySnapshot,
  tick: number,
  word: string
): VillageStoryLine {
  const generations = count(memory.generations, "generation", "generations");
  return memory.lost
    ? {
        tick,
        kind: "loss",
        text: `You came back. Nobody carries ${word} any more. It lasted ${generations}.`,
      }
    : {
        tick,
        kind: "change",
        text: `You came back. ${word} is still here: ${count(memory.carrierCount, "person carries", "people carry")} it, ${generations} on.`,
      };
}

/** The memory block in plain words, label then value. */
export function memoryFacts(
  memory: VillageMemorySnapshot,
  word: string
): [label: string, value: string][] {
  return [
    ["What you brought", word],
    [
      "Carried by",
      memory.carrierCount === 0
        ? "nobody"
        : count(memory.carrierCount, "person", "people"),
    ],
    ["Generations", String(memory.generations)],
    ["Lost", memory.lost ? "yes" : "no"],
  ];
}
