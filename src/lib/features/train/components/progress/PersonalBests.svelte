<!--
  PersonalBests.svelte - Personal Best Scores

  Displays best performance for each sequence.
-->
<script lang="ts">
  import type { PersonalBest } from "../../services/performance-history-tracker";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    bests: PersonalBest[];
  }

  let { bests }: Props = $props();

  function getGradeColor(grade: string): string {
    switch (grade.toUpperCase()) {
      case "S":
        return "#fbbf24"; // Gold
      case "A":
        return "#22c55e"; // Green
      case "B":
        return "#3b82f6"; // Blue
      case "C":
        return "#f59e0b"; // Orange
      case "D":
        return "#ef4444"; // Red
      default:
        return "#9ca3af"; // Gray
    }
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return t('train_time_today');
    if (days === 1) return t('train_time_yesterday');
    if (days < 7) return t('train_time_days_ago', { count: days });
    return date.toLocaleDateString();
  }
</script>

<div class="personal-bests">
  {#each bests as best}
    <div class="best-card">
      <div class="best-header">
        <h3>{best.sequenceName}</h3>
        <div
          class="grade-badge"
          style="--grade-color: {getGradeColor(best.bestGrade)}"
        >
          {best.bestGrade}
        </div>
      </div>
      <div class="best-stats">
        <div class="stat">
          <i class="fas fa-bullseye"></i>
          <span>{best.bestAccuracy.toFixed(1)}%</span>
        </div>
        <div class="stat">
          <i class="fas fa-fire"></i>
          <span>{best.bestCombo} {t('train_combo_label').toLowerCase()}</span>
        </div>
        <div class="stat date">
          <i class="fas fa-calendar"></i>
          <span>{formatDate(best.achievedAt)}</span>
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .personal-bests {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .best-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    transition: all var(--duration-normal);
  }

  .best-card:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-2px);
  }

  .best-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .best-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  }

  .best-stats {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    opacity: 0.9;
  }

  .stat i {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .stat.date {
    margin-left: auto;
    opacity: 0.6;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .personal-bests {
      grid-template-columns: 1fr;
    }
  }
</style>
