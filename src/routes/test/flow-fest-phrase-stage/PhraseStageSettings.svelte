<script lang="ts">
  /**
   * The stage's settings, in the app's drawer: tempo, each spinner's traits,
   * what may be played while walking, and how hard material has to be before
   * it stays planted. Every change replans the night at once; the clock
   * carries on, so a change shows on the phrase each spinner is in now.
   */
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { PhrasePersonality } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
  import {
    PHRASE_MOVE_KINDS,
    PHRASE_PLANES,
    type PhraseMotionType,
    type PhraseMoveKind,
    type PhrasePlane,
    type WalkSafeMove,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";

  interface PerformerOption {
    id: string;
    name: string;
  }

  interface Props {
    isOpen: boolean;
    tempoBpm: number;
    performers: readonly PerformerOption[];
    personalities: PhrasePersonality[];
    walkMoves: WalkSafeMove[];
    maxTotalTurns: number;
    maxDifficulty: number;
    hardMotionTypes: PhraseMotionType[];
    hardDifficulty: number;
    walkSafeCount: number;
    /** Each performer's share of the night by mode, in percent. */
    shares: readonly { planted: number; turning: number; travelling: number }[];
    fps: number;
    onReseed: () => void;
  }

  let {
    isOpen = $bindable(false),
    tempoBpm = $bindable(),
    performers,
    personalities = $bindable(),
    walkMoves = $bindable(),
    maxTotalTurns = $bindable(),
    maxDifficulty = $bindable(),
    hardMotionTypes = $bindable(),
    hardDifficulty = $bindable(),
    walkSafeCount,
    shares,
    fps,
    onReseed,
  }: Props = $props();

  // Empty until one is picked: the first spinner.
  let performerId = $state("");
  const performerIndex = $derived(
    Math.max(
      0,
      performers.findIndex((p) => p.id === performerId)
    )
  );

  const TRAITS = [
    { key: "skill", label: "Skill" },
    { key: "style", label: "Wander" },
    { key: "energy", label: "Energy" },
  ] as const;
  const MOVE_LABEL: Record<PhraseMoveKind, string> = {
    spin: "Spins",
    "figure-eight": "Figure-eights",
    pass: "Passes",
    other: "Other",
  };
  const PLANE_LABEL: Record<PhrasePlane | "any", string> = {
    wall: "Wall",
    wheel: "Wheel",
    floor: "Floor",
    any: "Any plane",
  };
  const MOVE_PLANES: readonly (PhrasePlane | "any")[] = [
    ...PHRASE_PLANES,
    "any",
  ];
  const HARD_TYPES: readonly PhraseMotionType[] = ["float", "dash", "static"];
  const HARD_LABEL: Record<string, string> = {
    float: "Floats",
    dash: "Dashes",
    static: "Statics",
  };

  function hasMove(kind: PhraseMoveKind, plane: PhrasePlane | "any"): boolean {
    return walkMoves.some((m) => m.kind === kind && m.plane === plane);
  }

  function toggleMove(kind: PhraseMoveKind, plane: PhrasePlane | "any"): void {
    walkMoves = hasMove(kind, plane)
      ? walkMoves.filter((m) => !(m.kind === kind && m.plane === plane))
      : [...walkMoves, { kind, plane }];
  }

  function toggleHard(type: PhraseMotionType): void {
    hardMotionTypes = hardMotionTypes.includes(type)
      ? hardMotionTypes.filter((t) => t !== type)
      : [...hardMotionTypes, type];
  }

  const percent = (value: number) => `${Math.round(value * 100)}%`;
</script>

<Drawer
  bind:isOpen
  placement="right"
  responsivePlacement
  showHandle={false}
  focusContainerOnOpen
  ariaLabel="Stage settings"
  class="phrase-stage-settings"
>
  <DrawerHeader title="Stage settings" onClose={() => (isOpen = false)} />
  <div class="settings themed-scrollbar">
    <section aria-labelledby="stage-tempo-heading">
      <h3 id="stage-tempo-heading">Music</h3>
      <ValueSlider
        label="Tempo"
        value={tempoBpm}
        min={30}
        max={90}
        step={1}
        format={(v) => `${v} bpm`}
        onchange={(v) => (tempoBpm = v)}
      />
      <div class="row">
        <PanelButton variant="secondary" onclick={onReseed}>
          <i class="fas fa-shuffle" aria-hidden="true"></i> New night
        </PanelButton>
        <span class="readout" aria-label="Frames per second">{fps} fps</span>
      </div>
    </section>

    <section aria-labelledby="stage-spinner-heading">
      <h3 id="stage-spinner-heading">Spinners</h3>
      <SegmentedControl
        options={performers.map((p) => ({ value: p.id, label: p.name }))}
        value={performers[performerIndex]?.id ?? ""}
        onchange={(id) => (performerId = id)}
        color="accent"
        ariaLabel="Spinner to tune"
      />
      {#each TRAITS as trait (trait.key)}
        <ValueSlider
          label={trait.label}
          value={personalities[performerIndex]![trait.key]}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onchange={(v) => (personalities[performerIndex]![trait.key] = v)}
        />
      {/each}
      {#if shares[performerIndex]}
        {@const share = shares[performerIndex]!}
        <p class="readout">
          Planted {share.planted}% · turning {share.turning}% · walking {share.travelling}%
        </p>
      {/if}
    </section>

    <section aria-labelledby="stage-walk-heading">
      <h3 id="stage-walk-heading">
        While walking <span class="readout">{walkSafeCount} sequences</span>
      </h3>
      {#each PHRASE_MOVE_KINDS as kind (kind)}
        <div
          class="chip-row"
          role="group"
          aria-label={`${MOVE_LABEL[kind]} while walking`}
        >
          <span class="row-label">{MOVE_LABEL[kind]}</span>
          <div class="chips">
            {#each MOVE_PLANES as plane (plane)}
              <FilterChipBase
                mode="toggle"
                size="sm"
                label={PLANE_LABEL[plane]}
                ariaLabel={`${MOVE_LABEL[kind]} in ${plane === "any" ? "any plane" : `the ${plane} plane`}`}
                active={hasMove(kind, plane)}
                onclick={() => toggleMove(kind, plane)}
              />
            {/each}
          </div>
        </div>
      {/each}
      <ValueSlider
        label="Turns allowed"
        value={maxTotalTurns}
        min={0}
        max={8}
        step={0.5}
        onchange={(v) => (maxTotalTurns = v)}
      />
      <ValueSlider
        label="Difficulty allowed"
        value={maxDifficulty}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onchange={(v) => (maxDifficulty = v)}
      />
      <div class="chip-row" role="group" aria-label="Motion types never walked">
        <span class="row-label">Never walk</span>
        <div class="chips">
          {#each HARD_TYPES as type (type)}
            <FilterChipBase
              mode="toggle"
              size="sm"
              label={HARD_LABEL[type] ?? type}
              active={hardMotionTypes.includes(type)}
              onclick={() => toggleHard(type)}
            />
          {/each}
        </div>
      </div>
    </section>

    <section aria-labelledby="stage-hard-heading">
      <h3 id="stage-hard-heading">Hard material</h3>
      <ValueSlider
        label="Planted only above"
        value={hardDifficulty}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onchange={(v) => (hardDifficulty = v)}
      />
    </section>
  </div>
</Drawer>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 4px 16px 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    color: var(--theme-text);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h3 {
    margin: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .readout {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .chip-row {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .row-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  :global(.phrase-stage-settings.drawer-content) {
    --sheet-bg: var(--theme-panel-bg);
    --sheet-width: min(440px, 92vw);
    --sheet-max-height: 85dvh;
    --sheet-border-radius-top-left: 16px;
    --sheet-border-radius-top-right: 16px;
  }

  :global(.phrase-stage-settings.drawer-content) {
    display: flex;
    flex-direction: column;
  }
</style>
