/**
 * Tier Promotion Engine
 *
 * Analyzes T2 LLM events across multiple voice sessions. When a transcript
 * pattern consistently resolves to the same command via LLM, generates
 * a candidate regex pattern for promotion to T1.
 *
 * Pure computation - no side effects, no file modifications.
 * Candidates are presented for human/Claude review via /voice-review.
 */

import type { VoiceSession, VoiceSessionEvent } from "#lib/shared/voice-control/domain/voice-session-types.js";
import type { VoiceCommandCategory } from "#lib/shared/voice-control/domain/voice-command-types.js";
import type { PromotionCandidate, PromotionEvidence } from "../domain/promotion-types";

/** Minimum T2 hits before generating a promotion candidate */
const PROMOTION_THRESHOLD = 5;

/** Maximum candidates to return */
const MAX_CANDIDATES = 20;

/**
 * Maps command categories to the sub-interpreter files that handle them.
 * Used to suggest where new regex patterns should be added.
 */
const CATEGORY_TO_INTERPRETER: Record<VoiceCommandCategory, string> = {
  navigation: "NavigationSubInterpreter.ts",
  settings: "SettingsSubInterpreter.ts",
  playback: "PlaybackSubInterpreter.ts",
  ui: "UISubInterpreter.ts",
  create: "CreateSubInterpreter.ts",
  generator: "GeneratorSubInterpreter.ts",
  sequence: "SequenceSubInterpreter.ts",
  search: "SearchSubInterpreter.ts",
  prop: "PropSubInterpreter.ts",
  system: "SystemSubInterpreter.ts",
};

const INTERPRETER_BASE_PATH =
  "src/lib/shared/voice-control/services/implementations/interpreters/";

interface TranscriptCommandGroup {
  normalized: string;
  category: VoiceCommandCategory;
  action: string;
  target: string;
  hitCount: number;
  variants: Set<string>;
  confidenceSum: number;
  evidence: PromotionEvidence[];
}

export function findPromotionCandidates(sessions: VoiceSession[]): PromotionCandidate[] {
  const t2Events = collectT2Events(sessions);
  const groups = groupByTranscriptAndCommand(t2Events);
  const candidates = generateCandidates(groups);

  return candidates
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, MAX_CANDIDATES);
}

function collectT2Events(
  sessions: VoiceSession[]
): Array<{ event: VoiceSessionEvent; sessionId: string }> {
  const events: Array<{ event: VoiceSessionEvent; sessionId: string }> = [];

  for (const session of sessions) {
    for (const event of session.events) {
      if (event.tier === "tier2_llm" && event.interpretedCommand) {
        events.push({ event, sessionId: session.id });
      }
    }
  }

  return events;
}

function groupByTranscriptAndCommand(
  events: Array<{ event: VoiceSessionEvent; sessionId: string }>
): Map<string, TranscriptCommandGroup> {
  const groups = new Map<string, TranscriptCommandGroup>();

  for (const { event, sessionId } of events) {
    const cmd = event.interpretedCommand!;
    const normalized = normalizeTranscript(event.transcript);
    const commandKey = `${cmd.category}:${cmd.action}:${cmd.target}`;
    const groupKey = `${normalized}|||${commandKey}`;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.hitCount++;
      existing.variants.add(event.transcript);
      existing.confidenceSum += cmd.confidence;
      existing.evidence.push({
        sessionId,
        transcript: event.transcript,
        confidence: cmd.confidence,
      });
    } else {
      groups.set(groupKey, {
        normalized,
        category: cmd.category,
        action: cmd.action,
        target: cmd.target,
        hitCount: 1,
        variants: new Set([event.transcript]),
        confidenceSum: cmd.confidence,
        evidence: [
          {
            sessionId,
            transcript: event.transcript,
            confidence: cmd.confidence,
          },
        ],
      });
    }
  }

  return groups;
}

function generateCandidates(
  groups: Map<string, TranscriptCommandGroup>
): PromotionCandidate[] {
  const candidates: PromotionCandidate[] = [];

  for (const group of groups.values()) {
    if (group.hitCount < PROMOTION_THRESHOLD) continue;

    const variants = Array.from(group.variants);
    const suggestedRegex = buildRegex(variants);
    const interpreterFile = CATEGORY_TO_INTERPRETER[group.category] ?? "SystemSubInterpreter.ts";

    candidates.push({
      transcriptPattern: group.normalized,
      transcriptVariants: variants,
      suggestedRegex,
      targetCategory: group.category,
      targetAction: group.action,
      targetTarget: group.target,
      suggestedInterpreter: `${INTERPRETER_BASE_PATH}${interpreterFile}`,
      hitCount: group.hitCount,
      evidence: group.evidence,
      avgConfidence: group.confidenceSum / group.hitCount,
      status: "pending",
    });
  }

  return candidates;
}

/**
 * Generates a regex pattern from transcript variants.
 *
 * Strategy: Find common structure across variants and build alternation
 * groups for the variable parts.
 *
 * Examples:
 *   ["go to compose", "open compose"] -> /(?:go to|open)\s+compose/i
 *   ["play the sequence", "play sequence"] -> /play\s+(?:the\s+)?sequence/i
 *   ["go to settings"] -> /go\s+to\s+settings/i (single variant)
 */
function buildRegex(variants: string[]): string {
  if (variants.length === 0) return "";

  const normalized = variants.map((v) => v.toLowerCase().trim());

  if (normalized.length === 1) {
    return `/${escapeForRegex(normalized[0]!)}/i`;
  }

  const result = buildAlternationRegex(normalized);
  return `/${result}/i`;
}

/**
 * Builds a regex with alternation groups for differing parts.
 * Splits each variant into words, finds the common suffix (target),
 * then creates alternation for the varying prefixes.
 */
function buildAlternationRegex(variants: string[]): string {
  const wordArrays = variants.map((v) => v.split(/\s+/));
  const commonSuffix = findCommonSuffix(wordArrays);

  if (commonSuffix.length === 0) {
    const escaped = variants.map((v) => escapeForRegex(v));
    return `(?:${escaped.join("|")})`;
  }

  const prefixes = wordArrays.map((words) => {
    const prefixWords = words.slice(0, words.length - commonSuffix.length);
    return prefixWords.join(" ");
  });

  const uniquePrefixes = [...new Set(prefixes)].filter((p) => p.length > 0);
  const suffixStr = commonSuffix.map((w) => escapeWord(w)).join("\\s+");

  if (uniquePrefixes.length === 0) {
    return suffixStr;
  }

  const escapedPrefixes = uniquePrefixes.map((p) => escapeForRegex(p));

  if (uniquePrefixes.length === 1) {
    return `${escapedPrefixes[0]}\\s+${suffixStr}`;
  }

  const optionalResult = detectOptionalWords(uniquePrefixes);
  if (optionalResult) {
    return `${optionalResult}\\s+${suffixStr}`;
  }

  return `(?:${escapedPrefixes.join("|")})\\s+${suffixStr}`;
}

/**
 * Detects when variants differ only by optional words.
 * E.g., ["play", "play the"] -> "play(?:\\s+the)?"
 */
function detectOptionalWords(prefixes: string[]): string | null {
  if (prefixes.length !== 2) return null;

  const sorted = prefixes.sort((a, b) => a.length - b.length);
  const shorter = sorted[0]!;
  const longer = sorted[1]!;
  if (longer.startsWith(shorter + " ")) {
    const optionalPart = longer.slice(shorter.length + 1);
    return `${escapeForRegex(shorter)}(?:\\s+${escapeForRegex(optionalPart)})?`;
  }

  return null;
}

function findCommonSuffix(wordArrays: string[][]): string[] {
  if (wordArrays.length === 0) return [];

  const firstArray = wordArrays[0]!;
  const shortest = Math.min(...wordArrays.map((a) => a.length));
  const suffix: string[] = [];

  for (let i = 1; i <= shortest; i++) {
    const word = firstArray[firstArray.length - i];
    const allMatch = wordArrays.every(
      (arr) => arr[arr.length - i]?.toLowerCase() === word?.toLowerCase()
    );
    if (allMatch && word) {
      suffix.unshift(word);
    } else {
      break;
    }
  }

  return suffix;
}

function normalizeTranscript(transcript: string): string {
  return transcript.toLowerCase().trim().replace(/\s+/g, " ");
}

function escapeForRegex(text: string): string {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
