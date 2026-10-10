/**
 * Produces structured markdown from a VoiceSession that Claude can analyze
 * to identify failure patterns, suggest new regex rules, and assess voice UX.
 */

import type {
  VoiceSession,
  VoiceSessionEvent,
  VoiceSessionStats,
  ResolutionTier,
} from "#lib/shared/voice-control/domain/voice-session-types.js";

const TIER_LABELS: Record<ResolutionTier, string> = {
  tier1_regex: "Tier 1 (Regex)",
  tier2_llm: "Tier 2 (LLM)",
  tier3_chat: "Tier 3 (Chat)",
  unresolved: "Unresolved",
};

export function formatForAnalysis(session: VoiceSession): string {
  const lines: string[] = [];

  addHeader(lines, session);
  addSummary(lines, session.stats, session.durationMs);
  addTierBreakdown(lines, session.stats);
  addEvents(lines, session.events);
  addAnalysisPrompt(lines);

  return lines.join("\n");
}

function addHeader(lines: string[], session: VoiceSession): void {
  lines.push("# Voice Session Analysis");
  lines.push("");
  lines.push(`**Session ID:** ${session.id}`);
  lines.push(`**Date:** ${session.startedAt.toLocaleString()}`);
  lines.push(`**Duration:** ${formatDuration(session.durationMs)}`);
  lines.push(`**Events:** ${session.events.length}`);
  lines.push("");
}

function addSummary(lines: string[], stats: VoiceSessionStats, durationMs: number): void {
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Duration | ${formatDuration(durationMs)} |`);
  lines.push(`| Total commands | ${stats.totalEvents} |`);
  lines.push(`| Succeeded | ${stats.successCount} |`);
  lines.push(`| Failed | ${stats.failureCount} |`);
  lines.push(`| Unresolved | ${stats.unresolvedCount} |`);
  lines.push(`| Success rate | ${pct(stats.successCount, stats.totalEvents)} |`);
  lines.push(`| Avg latency | ${stats.avgLatencyMs}ms |`);
  lines.push("");
}

function addTierBreakdown(lines: string[], stats: VoiceSessionStats): void {
  lines.push("## Tier Breakdown");
  lines.push("");
  lines.push("| Tier | Count | Avg Latency |");
  lines.push("|------|-------|-------------|");

  for (const tier of ["tier1_regex", "tier2_llm", "tier3_chat", "unresolved"] as ResolutionTier[]) {
    const count = stats.tierBreakdown[tier];
    if (count === 0) continue;
    const avgLatency = stats.avgLatencyByTier[tier];
    lines.push(
      `| ${TIER_LABELS[tier]} | ${count} | ${avgLatency != null ? `${avgLatency}ms` : "N/A"} |`
    );
  }
  lines.push("");
}

function addEvents(lines: string[], events: VoiceSessionEvent[]): void {
  lines.push("## Event Log");
  lines.push("");

  for (const event of events) {
    const status = getEventStatus(event);
    const tierLabel = TIER_LABELS[event.tier];

    lines.push(`### Event ${event.index + 1} — ${status}`);
    lines.push("");
    lines.push(`- **Time:** +${formatDuration(event.offsetMs)}`);
    lines.push(`- **Transcript:** "${event.transcript}"`);
    lines.push(`- **Speech confidence:** ${(event.speechConfidence * 100).toFixed(0)}%`);
    lines.push(`- **Tier:** ${tierLabel}`);
    lines.push(`- **Context:** ${event.context.module}/${event.context.tab || "(none)"}`);
    lines.push(`- **Latency:** ${event.latencyMs}ms`);

    if (event.interpretedCommand) {
      const cmd = event.interpretedCommand;
      lines.push(`- **Interpreted:** ${cmd.category}:${cmd.action} → "${cmd.target}"`);
      if (cmd.args && Object.keys(cmd.args).length > 0) {
        lines.push(`- **Args:** ${JSON.stringify(cmd.args)}`);
      }
    }

    if (event.dispatchResult) {
      const icon = event.dispatchResult.success ? "✅" : "❌";
      lines.push(`- **Result:** ${icon} ${event.dispatchResult.message}`);
    }

    if (event.llmDetails) {
      lines.push(`- **LLM confidence:** ${(event.llmDetails.confidence * 100).toFixed(0)}%`);
      lines.push(`- **LLM commands:** ${event.llmDetails.commandCount}`);
      if (event.llmDetails.escalatedToChat) {
        lines.push(`- **Escalated to chat:** yes`);
      }
    }

    if (event.chatDetails) {
      const preview = event.chatDetails.responseText.length > 100
        ? event.chatDetails.responseText.slice(0, 100) + "..."
        : event.chatDetails.responseText;
      lines.push(`- **Chat response:** "${preview}"`);
      lines.push(`- **TTS spoken:** ${event.chatDetails.spokeTTS ? "yes" : "no"}`);
    }

    lines.push("");
  }
}

function addAnalysisPrompt(lines: string[]): void {
  lines.push("---");
  lines.push("");
  lines.push("## Analysis Instructions");
  lines.push("");
  lines.push("Review this voice session and provide:");
  lines.push("");
  lines.push("1. **Failure patterns** — Which transcripts failed, and why? Group by root cause.");
  lines.push("2. **Tier 2 → Tier 1 candidates** — Which LLM-resolved commands appear frequently enough to deserve a regex pattern? Suggest the regex.");
  lines.push("3. **UX assessment** — Was the voice experience smooth? Were there confusing failure messages?");
  lines.push("4. **Latency concerns** — Any commands taking too long? Which tier is the bottleneck?");
  lines.push("5. **Suggested improvements** — Specific, actionable changes to improve voice control reliability.");
}

function getEventStatus(event: VoiceSessionEvent): string {
  if (event.tier === "unresolved") return "❌ Unresolved";
  if (event.tier === "tier3_chat") return "💬 Chat";
  if (event.dispatchResult?.success) return "✅ Success";
  return "❌ Failed";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "N/A";
  return `${Math.round((numerator / denominator) * 100)}%`;
}
