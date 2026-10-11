import type {
  VoiceSession,
  VoiceSessionEvent,
  ResolutionTier,
} from "#lib/shared/voice-control/domain/voice-session-types.js";
import type { VoiceCommandCategory } from "#lib/shared/voice-control/domain/voice-command-types.js";
import type {
  SessionAnalysis,
  FailingTranscript,
  Tier2Candidate,
  SessionSuccessPoint,
  LatencyByTier,
  UnresolvedPattern,
} from "./types";

const TIER2_CANDIDATE_THRESHOLD = 3;

const MAX_RESULTS_PER_CATEGORY = 20;

export function analyzeSessions(sessions: VoiceSession[]): SessionAnalysis {
  if (sessions.length === 0) {
    return emptyAnalysis();
  }

  const allEvents = sessions.flatMap((s) => s.events);

  return {
    sessionCount: sessions.length,
    totalEvents: allEvents.length,
    topFailingTranscripts: findTopFailingTranscripts(sessions),
    tier2Candidates: findTier2Candidates(sessions),
    successRateTrend: computeSuccessRateTrend(sessions),
    latencyByTier: computeLatencyByTier(allEvents),
    unresolvedPatterns: findUnresolvedPatterns(sessions),
  };
}

function findTopFailingTranscripts(
  sessions: VoiceSession[]
): FailingTranscript[] {
  const transcriptMap = new Map<
    string,
    {
      occurrences: number;
      tierHistory: ResolutionTier[];
      lastSeenSessionId: string;
    }
  >();

  for (const session of sessions) {
    for (const event of session.events) {
      if (event.tier === "unresolved" || event.dispatchResult?.success === false) {
        const normalized = normalizeTranscript(event.transcript);
        const existing = transcriptMap.get(normalized);

        if (existing) {
          existing.occurrences++;
          existing.tierHistory.push(event.tier);
          existing.lastSeenSessionId = session.id;
        } else {
          transcriptMap.set(normalized, {
            occurrences: 1,
            tierHistory: [event.tier],
            lastSeenSessionId: session.id,
          });
        }
      }
    }
  }

  return Array.from(transcriptMap.entries())
    .map(([transcript, data]) => ({
      transcript,
      ...data,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_RESULTS_PER_CATEGORY);
}

function findTier2Candidates(sessions: VoiceSession[]): Tier2Candidate[] {
  const transcriptCommandMap = new Map<
    string,
    Map<
      string,
      {
        category: VoiceCommandCategory;
        action: string;
        target: string;
        hits: number;
        sessionIds: Set<string>;
        confidenceSum: number;
      }
    >
  >();

  for (const session of sessions) {
    for (const event of session.events) {
      if (event.tier !== "tier2_llm" || !event.interpretedCommand) continue;

      const normalized = normalizeTranscript(event.transcript);
      const cmd = event.interpretedCommand;
      const commandKey = `${cmd.category}:${cmd.action}:${cmd.target}`;

      let commandMap = transcriptCommandMap.get(normalized);
      if (!commandMap) {
        commandMap = new Map();
        transcriptCommandMap.set(normalized, commandMap);
      }

      const existing = commandMap.get(commandKey);
      if (existing) {
        existing.hits++;
        existing.sessionIds.add(session.id);
        existing.confidenceSum += cmd.confidence;
      } else {
        commandMap.set(commandKey, {
          category: cmd.category,
          action: cmd.action,
          target: cmd.target,
          hits: 1,
          sessionIds: new Set([session.id]),
          confidenceSum: cmd.confidence,
        });
      }
    }
  }

  const candidates: Tier2Candidate[] = [];

  for (const [transcript, commandMap] of transcriptCommandMap) {
    let dominant:
      | {
          category: VoiceCommandCategory;
          action: string;
          target: string;
          hits: number;
          sessionIds: Set<string>;
          confidenceSum: number;
        }
      | undefined;

    for (const entry of commandMap.values()) {
      if (!dominant || entry.hits > dominant.hits) {
        dominant = entry;
      }
    }

    if (dominant && dominant.hits >= TIER2_CANDIDATE_THRESHOLD) {
      candidates.push({
        transcript,
        resolvedCategory: dominant.category,
        resolvedAction: dominant.action,
        resolvedTarget: dominant.target,
        consistentHits: dominant.hits,
        sessionIds: Array.from(dominant.sessionIds),
        avgConfidence: dominant.confidenceSum / dominant.hits,
      });
    }
  }

  return candidates
    .sort((a, b) => b.consistentHits - a.consistentHits)
    .slice(0, MAX_RESULTS_PER_CATEGORY);
}

function computeSuccessRateTrend(
  sessions: VoiceSession[]
): SessionSuccessPoint[] {
  return sessions
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((session) => ({
      sessionId: session.id,
      date: session.startedAt,
      successRate:
        session.stats.totalEvents > 0
          ? session.stats.successCount / session.stats.totalEvents
          : 0,
      totalEvents: session.stats.totalEvents,
    }));
}

function computeLatencyByTier(events: VoiceSessionEvent[]): LatencyByTier[] {
  const tierLatencies = new Map<
    ResolutionTier,
    { sum: number; min: number; max: number; count: number }
  >();

  for (const event of events) {
    const existing = tierLatencies.get(event.tier);
    if (existing) {
      existing.sum += event.latencyMs;
      existing.min = Math.min(existing.min, event.latencyMs);
      existing.max = Math.max(existing.max, event.latencyMs);
      existing.count++;
    } else {
      tierLatencies.set(event.tier, {
        sum: event.latencyMs,
        min: event.latencyMs,
        max: event.latencyMs,
        count: 1,
      });
    }
  }

  return Array.from(tierLatencies.entries()).map(([tier, data]) => ({
    tier,
    avgMs: Math.round(data.sum / data.count),
    minMs: data.min,
    maxMs: data.max,
    sampleCount: data.count,
  }));
}

function findUnresolvedPatterns(
  sessions: VoiceSession[]
): UnresolvedPattern[] {
  const patternMap = new Map<
    string,
    {
      occurrences: number;
      contextCounts: Map<string, number>;
    }
  >();

  for (const session of sessions) {
    for (const event of session.events) {
      if (event.tier !== "unresolved") continue;

      const normalized = normalizeTranscript(event.transcript);
      const contextKey = `${event.context.module}:${event.context.tab}`;

      const existing = patternMap.get(normalized);
      if (existing) {
        existing.occurrences++;
        existing.contextCounts.set(
          contextKey,
          (existing.contextCounts.get(contextKey) ?? 0) + 1
        );
      } else {
        const contextCounts = new Map<string, number>();
        contextCounts.set(contextKey, 1);
        patternMap.set(normalized, { occurrences: 1, contextCounts });
      }
    }
  }

  return Array.from(patternMap.entries())
    .map(([transcript, data]) => {
      let primaryContextKey = "";
      let maxCount = 0;
      for (const [key, count] of data.contextCounts) {
        if (count > maxCount) {
          maxCount = count;
          primaryContextKey = key;
        }
      }
      const [module, tab] = primaryContextKey.split(":");

      return {
        transcript,
        occurrences: data.occurrences,
        primaryContext: { module: module ?? "", tab: tab ?? "" },
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_RESULTS_PER_CATEGORY);
}

function normalizeTranscript(transcript: string): string {
  return transcript.toLowerCase().trim().replace(/\s+/g, " ");
}

function emptyAnalysis(): SessionAnalysis {
  return {
    sessionCount: 0,
    totalEvents: 0,
    topFailingTranscripts: [],
    tier2Candidates: [],
    successRateTrend: [],
    latencyByTier: [],
    unresolvedPatterns: [],
  };
}
