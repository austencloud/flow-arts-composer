<!--
  SessionHistory.svelte - Recent Training Sessions

  Displays a list of recent training sessions.
-->
<script lang="ts">
  import type { StoredPerformance } from "$lib/shared/train/domain/train-database-models";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    sessions: StoredPerformance[];
  }

  let { sessions }: Props = $props();

  function getGradeColor(grade: string): string {
    switch (grade.toUpperCase()) {
      case "S":
        return "var(--semantic-warning)"; // Gold
      case "A":
        return "var(--semantic-success)"; // Green
      case "B":
        return "var(--semantic-info)"; // Blue
      case "C":
        return "var(--semantic-warning)"; // Orange
      case "D":
        return "var(--semantic-error)"; // Red
      default:
        return "#9ca3af"; // Gray
    }
  }

  function formatDateTime(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (sessionDate.getTime() === today.getTime()) {
      return `${t('train_time_today')} ${timeStr}`;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sessionDate.getTime() === yesterday.getTime()) {
      return `${t('train_time_yesterday')} ${timeStr}`;
    }

    return `${date.toLocaleDateString()} ${timeStr}`;
  }

  function formatDuration(ms?: number): string {
    if (!ms) return "N/A";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
</script>

<div class="session-history">
  {#each sessions as session}
    <div class="session-card">
      <div class="session-header">
        <div class="session-info">
          <h4>{session.sequenceName}</h4>
          <span class="session-time">{formatDateTime(session.performedAt)}</span
          >
        </div>
        <div
          class="grade-badge"
          style="--grade-color: {getGradeColor(session.score.grade)}"
        >
          {session.score.grade}
        </div>
      </div>

      <div class="session-stats">
        <div class="stat">
          <i class="fas fa-bullseye" aria-hidden="true"></i>
          <span>{session.score.percentage.toFixed(1)}%</span>
        </div>
        <div class="stat">
          <i class="fas fa-fire" aria-hidden="true"></i>
          <span>{session.score.maxCombo}</span>
        </div>
        <div class="stat">
          <i class="fas fa-clock" aria-hidden="true"></i>
          <span>{formatDuration(session.metadata?.sessionDuration)}</span>
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .session-history {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .session-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 0.75rem;
    transition: all var(--duration-normal);
    cursor: pointer;
  }

  .session-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .session-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .session-info h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-time {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .grade-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: var(--grade-color);
    border-radius: 0.5rem;
    font-size: 1.25rem;
    font-weight: 700;
    color: #000000;
    flex-shrink: 0;
  }

  .session-stats {
    display: flex;
    gap: 1.5rem;
    font-size: 0.875rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.9;
  }

  .stat i {
    font-size: 0.875rem;
    opacity: 0.7;
  }
</style>
