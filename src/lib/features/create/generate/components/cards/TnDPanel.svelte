<!--
  TnDPanel: the grown TnD card. Two sections, Hands and Props, each a Free
  chip beside the shared 3x2 TnDModeGrid, and the Match turns toggle under
  Props. Presentation only: every change goes straight back through a
  handler and the stage re-renders from the config.

  Hand modes the current LOOP cannot keep arrive in `blockedHandModes` and
  show disabled with the reason; the LOOP overlay does the mirror image for
  its own buttons, so the two cards never let the config hold a pair the
  engine cannot satisfy.

  Match turns is forced on while a prop timing is set: the prop constraint
  needs equal turns on every beat, so the switch would be a lie.
-->
<script lang="ts">
  import GenerationSettingsOverlay from "./GenerationSettingsOverlay.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TnDModeGrid from "$lib/features/choreo-card/components/TnDModeGrid.svelte";
  import {
    describeTnDSelection,
    type TnDSelection,
  } from "$lib/shared/create/domain/hand-relationship";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

  const MATCH_HAND_TURNS_LABEL = "Match turns";
  const MATCH_HAND_TURNS_HINT =
    "Both hands take the same turns on every step, and a mirrored dash spins the mirror way.";
  const MATCH_HAND_TURNS_LEVEL_HINT = "Level 1 has no turns to match.";
  const MATCH_HAND_TURNS_FORCED_HINT =
    "A prop timing needs equal turns, so turns stay matched.";

  let {
    handRelationship,
    propRelationship,
    matchHandTurns,
    level,
    blockedHandModes = {},
    titleId,
    onHandRelationshipChange,
    onPropRelationshipChange,
    onMatchHandTurnsChange,
    onClose,
  }: {
    handRelationship: TnDSelection;
    propRelationship: TnDSelection;
    matchHandTurns: boolean;
    level: number;
    /** Hand modes the current LOOP rules out, each with its reason. */
    blockedHandModes?: Partial<Record<VtgMode, string>>;
    /** The heading's id, so the host stage's aria-labelledby points here. */
    titleId?: string;
    onHandRelationshipChange: (value: TnDSelection) => void;
    onPropRelationshipChange: (value: TnDSelection) => void;
    onMatchHandTurnsChange: (value: boolean) => void;
    onClose: () => void;
  } = $props();

  const blockedModes = $derived(Object.keys(blockedHandModes) as VtgMode[]);
  const timingSet = $derived(propRelationship !== "free");
  const turnsAvailable = $derived(level >= 2);
  const turnsHint = $derived(
    !turnsAvailable
      ? MATCH_HAND_TURNS_LEVEL_HINT
      : timingSet
        ? MATCH_HAND_TURNS_FORCED_HINT
        : MATCH_HAND_TURNS_HINT
  );
</script>

<GenerationSettingsOverlay
  title="Timing and direction"
  {titleId}
  closeLabel="Close timing and direction"
  entrance="none"
  {onClose}
>
  <div class="tnd-host">
    <div class="tnd-panel">
      <section class="tnd-section" aria-labelledby="tnd-hands-heading">
        <div class="section-head">
          <h4 class="section-title" id="tnd-hands-heading">Hands</h4>
          <span class="section-value"
            >{describeTnDSelection(handRelationship)}</span
          >
        </div>
        <FilterChipBase
          label="Free"
          mode="toggle"
          emphasis="solid"
          size="sm"
          active={handRelationship === "free"}
          ariaLabel="Free hands"
          onclick={() => onHandRelationshipChange("free")}
        />
        <TnDModeGrid
          selected={handRelationship === "free" ? null : handRelationship}
          disabledModes={blockedModes}
          reasons={blockedHandModes}
          ariaLabel="Hand timing and direction"
          onpick={onHandRelationshipChange}
        />
      </section>

      <section class="tnd-section" aria-labelledby="tnd-props-heading">
        <div class="section-head">
          <h4 class="section-title" id="tnd-props-heading">Props</h4>
          <span class="section-value"
            >{describeTnDSelection(propRelationship)}</span
          >
        </div>
        <FilterChipBase
          label="Free"
          mode="toggle"
          emphasis="solid"
          size="sm"
          active={propRelationship === "free"}
          ariaLabel="Free props"
          onclick={() => onPropRelationshipChange("free")}
        />
        <TnDModeGrid
          selected={propRelationship === "free" ? null : propRelationship}
          ariaLabel="Prop timing and direction"
          onpick={onPropRelationshipChange}
        />
        <div class="turns-row">
          <FilterChipBase
            label={MATCH_HAND_TURNS_LABEL}
            mode="toggle"
            emphasis="solid"
            size="sm"
            active={matchHandTurns || timingSet}
            disabled={!turnsAvailable || timingSet}
            ariaLabel={MATCH_HAND_TURNS_LABEL}
            onclick={() => onMatchHandTurnsChange(!matchHandTurns)}
          />
          <p class="turns-hint">{turnsHint}</p>
        </div>
      </section>
    </div>
  </div>
</GenerationSettingsOverlay>

<style>
  /* The overlay chrome is absolute inset 0 in the stage; this host scrolls
     inside it and is the container the two-column split reads. */
  .tnd-host {
    container-type: inline-size;
    container-name: tnd-panel;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .tnd-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(12px, 3cqi, 24px);
    padding: clamp(8px, 2cqi, 16px);
  }

  @container tnd-panel (max-width: 560px) {
    .tnd-panel {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .tnd-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--theme-text, #fff);
  }

  .section-value {
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }

  .turns-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .turns-hint {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }
</style>
