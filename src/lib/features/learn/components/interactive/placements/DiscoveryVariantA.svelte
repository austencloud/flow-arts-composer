<!--
PlacementsDiscoveryPhase - Tap grid points to discover alpha, beta, gamma.
The grid IS the experience. Place two hands, see the placement type.
Discover all three to unlock the quiz.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import PlacementGrid from './PlacementGrid.svelte';
  import type { PlacementsExperienceStateManager } from './placement-experience-state.svelte';
  import type { HandPosition, PlacementType } from '../../../domain/constants/placement-quiz-data';
  import { PLACEMENT_TYPE_INFO } from '../../../domain/constants/placement-quiz-data';
  import { GridMode } from '$lib/shared/pictograph/grid/domain/enums/grid-enums';
interface Props {
    experienceState: PlacementsExperienceStateManager;
  }

  let { experienceState }: Props = $props();

  const OPPOSITE_PAIRS: Record<string, string> = {
    N: 'S', S: 'N', E: 'W', W: 'E',
    NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW',
  };

  function detectPlacementType(left: string, right: string): PlacementType {
    if (left === right) return 'beta';
    if (OPPOSITE_PAIRS[left] === right) return 'alpha';
    return 'gamma';
  }

  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let discoveryCount = $state(0);
  let detectedType = $state<PlacementType | null>(null);
  let showResult = $state(false);
  let celebratingSlot = $state<PlacementType | null>(null);
  let gridKey = $state(0);

  let hapticService: { trigger: (type: string) => void } | null = null;
  try {
    hapticService = getHapticFeedback() as { trigger: (type: string) => void } | null;
  } catch { /* desktop */ }

  const PLACEMENT_TYPES: PlacementType[] = ['alpha', 'beta', 'gamma'];
  const TYPE_COLORS: Record<PlacementType, string> = {
    alpha: '#22d3ee', beta: '#f59e0b', gamma: '#a78bfa',
  };

  const remainingCount = $derived(3 - experienceState.discoveredTypes.size);

  function handlePlacementComplete(left: HandPosition, right: HandPosition) {
    const type = detectPlacementType(left, right);
    detectedType = type;
    showResult = true;

    const isNew = !experienceState.discoveredTypes.has(type);
    if (isNew) {
      experienceState.discoverType(type);
      hapticService?.trigger('success');
      celebratingSlot = type;
      setTimeout(() => { celebratingSlot = null; }, 800);
    }

    discoveryCount++;
    // After a few tries on diamond, suggest box
    if (discoveryCount === 3 && gridMode === GridMode.DIAMOND) {
      gridMode = GridMode.BOX;
    }
  }

  function handlePlaceAnother() {
    showResult = false;
    detectedType = null;
    gridKey++;
  }

  function handleSwitchGrid() {
    showResult = false;
    detectedType = null;
    gridMode = gridMode === GridMode.DIAMOND ? GridMode.BOX : GridMode.DIAMOND;
    gridKey++;
  }

  function handleAdvanceToQuiz() {
    hapticService?.trigger('selection');
    experienceState.advanceToQuiz();
  }
</script>

<div class="discovery-phase">
  <div class="grid-area">
    {#key gridKey}
      <PlacementGrid
        {gridMode}
        onPlacementComplete={handlePlacementComplete}
        disabled={showResult}
      />
    {/key}
  </div>

  <!-- Result + actions (shown after placement) -->
  {#if showResult && detectedType}
    {@const info = PLACEMENT_TYPE_INFO[detectedType]}
    <div class="result-section">
      <div class="result-label" style="--type-color: {TYPE_COLORS[detectedType]}">
        <span class="result-symbol">{info.symbol}</span>
        <span class="result-name">{info.label}</span>
      </div>

      <!-- Primary action: place another -->
      {#if !experienceState.allDiscovered}
        <button class="primary-btn" onclick={handlePlaceAnother}>
          Place another ({remainingCount} left to find)
        </button>
      {/if}

      <!-- Secondary: switch grid mode -->
      <button class="secondary-btn" onclick={handleSwitchGrid}>
        Switch to {gridMode === GridMode.DIAMOND ? 'box' : 'diamond'} grid
      </button>
    </div>
  {/if}

  <!-- Discovery tracker -->
  <div class="discovery-tracker">
    {#each PLACEMENT_TYPES as type (type)}
      {@const info = PLACEMENT_TYPE_INFO[type]}
      {@const discovered = experienceState.discoveredTypes.has(type)}
      <div
        class="tracker-slot"
        class:discovered
        class:celebrating={celebratingSlot === type}
        style="--slot-color: {TYPE_COLORS[type]}"
        aria-label={discovered ? `${info.label} discovered` : 'Undiscovered placement type'}
      >
        {#if discovered}
          <span class="slot-symbol">{info.symbol}</span>
        {:else}
          <span class="slot-unknown">?</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if experienceState.allDiscovered}
    <button class="advance-btn" onclick={handleAdvanceToQuiz}>
      All found - ready for the quiz?
    </button>
  {/if}
</div>

<style>
  .discovery-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    flex: 1;
    padding: 1rem;
  }

  .grid-area {
    width: 100%;
    max-width: min(90vw, 500px);
  }

  /* Result section: label + action buttons stacked */
  .result-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    animation: fade-slide-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .result-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .result-symbol {
    font-size: 2rem;
    font-weight: 700;
    color: var(--type-color);
  }

  .result-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--type-color);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  @keyframes fade-slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Primary action - clear, prominent */
  .primary-btn {
    padding: 0.75rem 2rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-on-accent, #000);
    background: var(--theme-accent, #22d3ee);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(34, 211, 238, 0.3);
  }

  /* Secondary action - subtle */
  .secondary-btn {
    padding: 0.4rem 1rem;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .secondary-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
  }

  /* Discovery tracker */
  .discovery-tracker {
    display: flex;
    gap: 1rem;
  }

  .tracker-slot {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 700;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: transparent;
    transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
  }

  .slot-unknown {
    color: var(--theme-text, rgba(255, 255, 255, 0.3));
    font-weight: 400;
  }

  .tracker-slot.discovered {
    background: color-mix(in srgb, var(--slot-color) 20%, transparent);
    color: var(--slot-color);
    border-color: color-mix(in srgb, var(--slot-color) 40%, transparent);
  }

  .tracker-slot.celebrating {
    animation: celebrate-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes celebrate-pop {
    0% { transform: scale(1); }
    40% { transform: scale(1.35); }
    100% { transform: scale(1); }
  }

  /* Advance button */
  .advance-btn {
    padding: 0.75rem 2rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-on-accent, #000);
    background: var(--theme-accent, #22d3ee);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .advance-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(34, 211, 238, 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    .result-section { animation: none; opacity: 1; transform: none; }
    .tracker-slot { transition: none; }
    .tracker-slot.celebrating { animation: none; }
    .primary-btn, .secondary-btn, .advance-btn { transition: none; }
  }
</style>
