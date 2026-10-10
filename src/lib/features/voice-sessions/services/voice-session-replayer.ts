/**
 * Replay engine for voice command regression testing.
 *
 * Takes a recorded VoiceSession and re-runs each event's transcript
 * through the current CommandInterpreter. Compares the current
 * interpretation against what was originally recorded to detect
 * regressions, improvements, and changes.
 *
 * Does NOT call the dispatcher. Zero side effects.
 */

import type { VoiceSession, VoiceSessionEvent } from "#lib/shared/voice-control/domain/voice-session-types.js";
import type { CommandInterpreter } from "#lib/shared/voice-control/services/command-interpreter.js";
import type { VoiceCommand, CommandContext } from "#lib/shared/voice-control/domain/voice-command-types.js";
import type {
  ReplayResult,
  ReplayEventComparison,
  ReplaySessionSummary,
  ReplayDiffType,
} from "../domain/replay-types";

export class VoiceSessionReplayer {
  constructor(private readonly interpreter: CommandInterpreter) {}

  replaySession(session: VoiceSession): ReplayResult {
    const comparisons: ReplayEventComparison[] = session.events.map((event) =>
      this.compareEvent(event)
    );

    const summary = this.computeSummary(comparisons);

    return {
      sessionId: session.id,
      comparisons,
      summary,
    };
  }

  // Per-Event Comparison

  private compareEvent(event: VoiceSessionEvent): ReplayEventComparison {
    const context: CommandContext = {
      currentModule: event.context.module,
      currentTab: event.context.tab,
    };

    // Re-interpret through the current pipeline
    const currentCommand = this.interpreter.interpret(event.transcript, context);

    // Determine if the current interpretation resolves or not
    const currentIsUnresolved =
      currentCommand.category === "system" && currentCommand.action === "unknown";

    const currentTier = currentIsUnresolved ? "unresolved" as const : "tier1_regex" as const;

    // The original command from the recorded session
    const originalCommand = event.interpretedCommand;
    const originalWasUnresolved = event.tier === "unresolved";

    // Classify the diff
    const diff = this.classifyDiff(
      originalWasUnresolved,
      currentIsUnresolved,
      originalCommand,
      currentIsUnresolved ? null : currentCommand
    );

    return {
      eventIndex: event.index,
      transcript: event.transcript,
      originalTier: event.tier,
      currentTier,
      originalCommand,
      currentCommand: currentIsUnresolved ? null : currentCommand,
      diff,
      originalEvent: event,
    };
  }

  // Diff Classification

  private classifyDiff(
    originalWasUnresolved: boolean,
    currentIsUnresolved: boolean,
    originalCommand: VoiceCommand | null,
    currentCommand: VoiceCommand | null
  ): ReplayDiffType {
    // Both unresolved -> same
    if (originalWasUnresolved && currentIsUnresolved) {
      return "SAME";
    }

    // Was unresolved, now resolves -> improved
    if (originalWasUnresolved && !currentIsUnresolved) {
      return "IMPROVED";
    }

    // Was resolved, now unresolved -> regressed
    if (!originalWasUnresolved && currentIsUnresolved) {
      return "REGRESSED";
    }

    // Both resolve - compare the commands
    if (originalCommand && currentCommand) {
      if (this.commandsEqual(originalCommand, currentCommand)) {
        return "SAME";
      }
      // Different command interpretation
      return "CHANGED";
    }

    // Original had a dispatch failure but still interpreted a command
    // and now produces a different result
    if (!originalCommand && currentCommand) {
      return "IMPROVED";
    }

    if (originalCommand && !currentCommand) {
      return "REGRESSED";
    }

    return "SAME";
  }

  private commandsEqual(a: VoiceCommand, b: VoiceCommand): boolean {
    return (
      a.category === b.category &&
      a.action === b.action &&
      a.target === b.target
    );
  }

  // Summary

  private computeSummary(comparisons: ReplayEventComparison[]): ReplaySessionSummary {
    let sameCount = 0;
    let improvedCount = 0;
    let regressedCount = 0;
    let changedCount = 0;

    for (const comparison of comparisons) {
      switch (comparison.diff) {
        case "SAME":
          sameCount++;
          break;
        case "IMPROVED":
          improvedCount++;
          break;
        case "REGRESSED":
          regressedCount++;
          break;
        case "CHANGED":
          changedCount++;
          break;
      }
    }

    return {
      sameCount,
      improvedCount,
      regressedCount,
      changedCount,
      totalCount: comparisons.length,
    };
  }
}
