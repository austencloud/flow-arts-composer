<!--
  PhaseOverview - Status cards for phases 1-5 of the Skel2TKA pipeline

  Shows each phase as a card with status indicator.
  Only Phase 1 is active. Others show description + "Coming soon".
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PhaseInfo } from "../domain/models";

  interface Props {
    phases: PhaseInfo[];
    activePhase: number;
    onPhaseSelect: (phase: number) => void;
  }

  const { phases, activePhase, onPhaseSelect }: Props = $props();

  function statusIcon(status: string): string {
    switch (status) {
      case "complete":
        return "fas fa-check-circle";
      case "active":
        return "fas fa-play-circle";
      case "pending":
        return "fas fa-clock";
      default:
        return "fas fa-lock";
    }
  }
</script>

<div class="phase-overview">
  {#each phases as phase}
    <button
      class="phase-card"
      class:active={phase.number === activePhase}
      class:locked={phase.status === "locked"}
      disabled={phase.status === "locked"}
      onclick={() => onPhaseSelect(phase.number)}
    >
      <div class="phase-indicator">
        <span class="phase-number">{phase.number}</span>
        <i class={statusIcon(phase.status)} style="color: {phase.color}"></i>
      </div>
      <div class="phase-content">
        <div class="phase-title">
          <i class={phase.icon} style="color: {phase.color}"></i>
          <span>{phase.title}</span>
        </div>
        <p class="phase-description">{phase.description}</p>
      </div>
      {#if phase.status === "locked"}
        <span class="coming-soon">{t('skel2tka_coming_soon')}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .phase-overview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .phase-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    text-align: left;
    flex: 1 1 260px;
    min-width: 240px;
    color: var(--theme-text, #ffffff);
    font-family: inherit;
  }

  .phase-card:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: rgba(255, 255, 255, 0.06);
  }

  .phase-card:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .phase-card.active {
    border-color: var(--theme-accent, #3b82f6);
    background: rgba(59, 130, 246, 0.08);
  }

  .phase-card.locked {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .phase-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 32px;
  }

  .phase-number {
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .phase-indicator i {
    font-size: 14px;
  }

  .phase-content {
    flex: 1;
    min-width: 0;
  }

  .phase-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .phase-title i {
    font-size: 14px;
  }

  .phase-description {
    margin: 4px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    line-height: 1.3;
  }

  .coming-soon {
    font-size: var(--font-size-xs, 11px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    white-space: nowrap;
    font-style: italic;
  }
</style>
