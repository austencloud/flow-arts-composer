<!--
  Skel2TKALab - Main lab tab for the video-to-TKA notation pipeline

  Shows a phase overview (5 phases) and the active phase panel.
  Phase 1 (Hand Tracking) is the only interactive phase for now.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PhaseInfo } from "./domain/models";
  import PhaseOverview from "./components/PhaseOverview.svelte";
  import Phase1Panel from "./components/Phase1Panel.svelte";

  let activePhase = $state(1);

  const phases: PhaseInfo[] = [
    {
      number: 1,
      title: "Hand Tracking",
      description: "Upload video, detect hands, extract trajectory data",
      status: "active",
      icon: "fas fa-hand",
      color: "#3b82f6",
    },
    {
      number: 2,
      title: "Position Detection",
      description: "Map hand positions to TKA grid locations with confidence scoring",
      status: "locked",
      icon: "fas fa-crosshairs",
      color: "#8b5cf6",
    },
    {
      number: 3,
      title: "Prop Tracking",
      description: "Segment prop, track endpoints, measure rotation angles",
      status: "locked",
      icon: "fas fa-rotate",
      color: "#f59e0b",
    },
    {
      number: 4,
      title: "Motion Derivation",
      description: "Classify motion types (pro/anti/static/dash), count turns",
      status: "locked",
      icon: "fas fa-wave-square",
      color: "#22c55e",
    },
    {
      number: 5,
      title: "Sequence Assembly",
      description: "Generate PictographData, validate against TKA rules",
      status: "locked",
      icon: "fas fa-puzzle-piece",
      color: "#ec4899",
    },
  ];

  function handlePhaseSelect(phase: number) {
    if (phases[phase - 1]?.status !== "locked") {
      activePhase = phase;
    }
  }
</script>

<div class="skel2tka-lab">
  <header class="lab-header">
    <h2>{t('skel2tka_title')}</h2>
    <p class="subtitle">{t('skel2tka_subtitle')}</p>
  </header>

  <PhaseOverview {phases} {activePhase} onPhaseSelect={handlePhaseSelect} />

  <div class="phase-panel">
    {#if activePhase === 1}
      <Phase1Panel />
    {:else}
      <div class="locked-message">
        <i class="fas fa-lock"></i>
        <span>{t('skel2tka_phase_locked', { phase: String(activePhase) })}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .skel2tka-lab {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    padding: 16px;
    overflow-y: auto;
  }

  .lab-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lab-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .subtitle {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .phase-panel {
    flex: 1;
    min-height: 0;
  }

  .locked-message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 200px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-min, 14px);
  }

  .locked-message i {
    font-size: 18px;
  }
</style>
