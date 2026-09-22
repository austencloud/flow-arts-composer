<!--
  TnDPanel: the grown TnD card. Two sections, Hands and Props, each group Free
  with the shared 3x2 TnDModeGrid. Turn matching is a panel-wide rule because
  prop timing constrains both hands, so it sits in a shared footer instead of
  looking like a seventh prop choice. Presentation only: every change goes
  straight back through a handler and the stage re-renders from the config.

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
  import RelationshipChoiceChip from "$lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte";
  import {
    describeTnDSelection,
    type TnDSelection,
  } from "$lib/shared/create/domain/hand-relationship";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

  const MATCH_HAND_TURNS_LABEL = "Match turns";
  const MATCH_HAND_TURNS_REQUIRED_LABEL = "Match turns · Required";
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
  const turnsLabel = $derived(
    timingSet ? MATCH_HAND_TURNS_REQUIRED_LABEL : MATCH_HAND_TURNS_LABEL
  );
  const turnsAriaLabel = $derived(
    timingSet ? "Match turns, required by prop timing" : MATCH_HAND_TURNS_LABEL
  );
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
        <div class="choice-stack">
          <RelationshipChoiceChip
            compact
            accent="var(--theme-accent, #38bdf8)"
            timing="Free"
            direction="No constraints"
            active={handRelationship === "free"}
            ariaLabel="Free hands"
            onpick={() => onHandRelationshipChange("free")}
          />
          <TnDModeGrid
            fullLabels
            selected={handRelationship === "free" ? null : handRelationship}
            disabledModes={blockedModes}
            reasons={blockedHandModes}
            ariaLabel="Hand timing and direction"
            onpick={onHandRelationshipChange}
          />
        </div>
      </section>

      <section class="tnd-section" aria-labelledby="tnd-props-heading">
        <div class="section-head">
          <h4 class="section-title" id="tnd-props-heading">Props</h4>
          <span class="section-value"
            >{describeTnDSelection(propRelationship)}</span
          >
        </div>
        <div class="choice-stack">
          <RelationshipChoiceChip
            compact
            accent="var(--theme-accent, #38bdf8)"
            timing="Free"
            direction="No constraints"
            active={propRelationship === "free"}
            ariaLabel="Free props"
            onpick={() => onPropRelationshipChange("free")}
          />
          <TnDModeGrid
            fullLabels
            selected={propRelationship === "free" ? null : propRelationship}
            ariaLabel="Prop timing and direction"
            onpick={onPropRelationshipChange}
          />
        </div>
      </section>

      <div class="turns-row" aria-labelledby="turn-matching-title">
        <div class="turns-copy">
          <h4 class="turns-title" id="turn-matching-title">Turn matching</h4>
          <p class="turns-hint">{turnsHint}</p>
        </div>
        <FilterChipBase
          label={turnsLabel}
          icon={timingSet ? "fas fa-lock" : undefined}
          mode="toggle"
          emphasis="soft"
          size="sm"
          labelScale="readable"
          active={matchHandTurns || timingSet}
          disabled={!turnsAvailable || timingSet}
          ariaLabel={turnsAriaLabel}
          onclick={() => onMatchHandTurnsChange(!matchHandTurns)}
        />
      </div>
    </div>
  </div>
</GenerationSettingsOverlay>

<style>
  /* The overlay chrome is absolute inset 0 in the stage; this host scrolls
     inside it and is the container the two-column split reads. */
  .tnd-host {
    container-type: size;
    container-name: tnd-panel;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .tnd-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(12px, 3cqi, 24px);
    min-height: 100%;
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

  .choice-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
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
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "copy control";
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .turns-row :global(.filter-chip) {
    grid-area: control;
    justify-self: end;
  }

  .turns-copy {
    grid-area: copy;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .turns-title {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .turns-hint {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }

  @container tnd-panel (max-width: 560px) {
    .turns-row {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "control"
        "copy";
    }

    .turns-row :global(.filter-chip) {
      justify-self: start;
    }
  }

  /* Roomy expanded stages should feel like a control surface, not a compact
     popover stranded at the top. Once there is enough height to preserve the
     labels and the Match turns explanation, the six choices share the
     remaining room. Short stages keep the content-sized layout and scroll. */
  @container tnd-panel (min-width: 561px) and (min-height: 22rem) {
    .tnd-panel {
      grid-template-rows: minmax(0, 1fr) auto;
      column-gap: clamp(20px, 4cqi, 48px);
      padding: clamp(12px, 2cqi, 24px);
    }

    .tnd-section {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: clamp(12px, 1.5cqh, 24px);
    }

    .choice-stack {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: clamp(10px, 1.25cqh, 18px);
    }

    .choice-stack :global(.mode-grid) {
      width: 100%;
      height: 100%;
      max-height: 34rem;
      align-self: start;
    }

    .turns-row {
      grid-row: 2;
      margin-top: 0;
      padding-top: clamp(12px, 1.5cqh, 20px);
    }
  }
</style>
