<!--
  Everything the lab can change, built from the app's own controls.

  Nothing here owns a choice. The character gallery is the product's
  PerformerCharacterPicker over CHARACTER_DEFINITIONS, the prop gallery is the
  canonical ScenePropPicker over the shared 3D catalog, and choosing what plays
  goes through SequencePickerModal — the same picker Stage and the effects lab
  open, over the same browse engine. This component only arranges them into the
  app's card vocabulary and writes each choice into the URL.

  The 19 core TnD sequences sit under that picker as the lab's goal list,
  grouped the way VTG groups them. Each carries what the committed continuity
  sweep found for it, so the row answers "which of these still teleport" at a
  glance. The picker above stays the way to reach everything else.
-->
<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PerformerCharacterPicker from "$lib/shared/3d/components/controls/PerformerCharacterPicker.svelte";
  import ScenePropPicker from "$lib/shared/3d/components/controls/ScenePropPicker.svelte";
  import { scenePropFixedLengthCm } from "$lib/shared/3d/domain/scene-prop-catalog";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { CharacterId } from "$lib/shared/3d/domain/character-model";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  import {
    isLocalOnlyCharacter,
    labCharacterName,
    labFixture,
    labPropLabel,
    labSequenceLabel,
  } from "./lab-catalog";
  import {
    labContinuityStatus,
    labGoalContinuitySummary,
  } from "./lab-continuity";
  import { LAB_GOAL_FAMILIES, labGoal } from "./lab-goals";
  import {
    LAB_LENGTH_MAX_CM,
    LAB_LENGTH_MIN_CM,
    type LabBodyClearance,
    type LabGridStyle,
    type LabView,
    type StaffLabState,
  } from "./lab-state.svelte";
  import { INSPECTION_VIEWS } from "./inspection-framing";

  interface Props {
    lab: StaffLabState;
    sequence: SequenceData | null;
    sequenceLoading: boolean;
    /** The length this body would choose, so Body fit can name its value. */
    bodyLengthCm: number | null;
    /**
     * Whether the rig has been measured yet. Without it a body that fits no
     * supported staff is indistinguishable from one still loading, and the
     * caption sits on “Measuring…” forever while the inspector beside it
     * already says the fit failed.
     */
    bodyMeasured: boolean;
  }

  let { lab, sequence, sequenceLoading, bodyLengthCm, bodyMeasured }: Props =
    $props();

  let characterOpen = $state(false);
  let propOpen = $state(false);
  let libraryOpen = $state(false);
  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  const characterName = $derived(labCharacterName(lab.character));
  const propLabel = $derived(labPropLabel(lab.prop));

  /**
   * The loaded sequence, named the way the product names it. A repeating word
   * always shows in its smallest form, which `labSequenceLabel` owns.
   */
  const activeFixture = $derived(labFixture(lab.sequenceId));
  const activeGoal = $derived(labGoal(lab.sequenceId));
  const sequenceWord = $derived(
    activeGoal?.label ??
      activeFixture?.label ??
      (sequence ? labSequenceLabel(sequence) : lab.sequenceId)
  );
  const sequenceStepCount = $derived(
    activeFixture?.stepCount ?? sequence?.steps.length ?? null
  );
  const sequenceSource = $derived(
    activeGoal
      ? `core goal ${activeGoal.order} of 19`
      : activeFixture
        ? "verified fixture"
        : "from the library"
  );

  /** What the committed sweep says about whatever is currently loaded. */
  const activeContinuity = $derived(labContinuityStatus(lab.sequenceId));

  /** How far the goal list is from a teleport-free pass. Static per artifact. */
  const goalSummary = labGoalContinuitySummary();

  const viewOptions = $derived([
    { value: "quad" as LabView, label: "Quad", ariaLabel: "All four cameras" },
    ...INSPECTION_VIEWS.map((view) => ({
      value: view.id as LabView,
      // The abbreviation is visual only; `ariaLabel` still says the full name.
      label: view.pickerLabel ?? view.label,
      ariaLabel: `${view.label} camera only`,
    })),
  ]);

  const lengthMode = $derived(lab.propLength === "body" ? "body" : "pinned");

  const gridStyleOptions: {
    value: LabGridStyle;
    label: string;
    ariaLabel: string;
  }[] = [
    {
      value: "fixed",
      label: "Fixed",
      ariaLabel: "Hands 52 cm from the grid center",
    },
    {
      value: "isolation",
      label: "Isolation",
      ariaLabel: "Hands half a staff from the grid center",
    },
  ];

  const bodyClearanceOptions: {
    value: LabBodyClearance;
    label: string;
    ariaLabel: string;
  }[] = [
    {
      value: "off",
      label: "Stays",
      ariaLabel: "The body stays where the clip puts it",
    },
    {
      value: "shift",
      label: "Hips",
      ariaLabel: "The hips move off the staffs, feet planted",
    },
    {
      value: "step",
      label: "Step",
      ariaLabel: "The whole body steps off the staffs",
    },
  ];

  /**
   * A model the scene does not stretch draws at its authored length and never
   * reads this control, so the control has to say so rather than report a
   * number that reaches nothing. The catalog owns which builds those are.
   */
  const fixedLengthCm = $derived(scenePropFixedLengthCm(lab.prop));
  const pinnedLengthCm = $derived(
    lab.propLength === "body" ? Math.round(bodyLengthCm ?? 91) : lab.propLength
  );

  async function copyLink(): Promise<void> {
    lab.flushPhase();
    const href = lab.fullyQualifiedHref();
    try {
      await navigator.clipboard.writeText(href);
      copied = true;
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (copied = false), 1600);
    } catch {
      // Clipboard permission is not something a lab should fight over; the
      // address bar already carries the same state.
      copied = false;
    }
  }

  function chooseCharacter(id: CharacterId): void {
    lab.setCharacter(id);
    characterOpen = false;
  }

  function chooseProp(prop: PropType): void {
    lab.setProp(prop);
    propOpen = false;
  }

  function chooseLibrarySequence(picked: SequenceData): void {
    lab.setSequence(picked.id);
    libraryOpen = false;
  }
</script>

<div class="controls">
  <section class="card" aria-label="Stage">
    <h2 class="card-title">Stage</h2>
    <div class="chip-row">
      <FilterChipBase
        mode="dropdown"
        icon="fa-person"
        label={characterName}
        expanded={characterOpen}
        ariaLabel={`Character: ${characterName}. Choose another.`}
        onclick={() => (characterOpen = true)}
      />
      <FilterChipBase
        mode="dropdown"
        icon="fa-grip-lines"
        label={propLabel}
        expanded={propOpen}
        ariaLabel={`Prop: ${propLabel}. Choose another.`}
        onclick={() => (propOpen = true)}
      />
    </div>
    {#if isLocalOnlyCharacter(lab.character)}
      <p class="note">Local rig — not in the deployable catalog.</p>
    {/if}

    <div class="field">
      <span class="field-label">Prop length</span>
      <SegmentedControl
        options={[
          {
            value: "body",
            label: "Body fit",
            ariaLabel: "Length this body can hold",
          },
          { value: "pinned", label: "Pinned", ariaLabel: "Fixed length in cm" },
        ]}
        value={lengthMode}
        density="tight"
        ariaLabel="How prop length is chosen"
        onchange={(mode) =>
          lab.setPropLength(mode === "body" ? "body" : pinnedLengthCm)}
      />
      <div class="length-value" class:is-pinned={lengthMode === "pinned"}>
        {#if lengthMode === "pinned"}
          <ScrubbableNumber
            value={pinnedLengthCm}
            min={LAB_LENGTH_MIN_CM}
            max={LAB_LENGTH_MAX_CM}
            step={1}
            label="Pinned prop length"
            unit=" cm"
            onchange={(cm) => lab.setPropLength(cm)}
          />
        {:else}
          <p class="derived">
            {#if bodyLengthCm !== null}
              {bodyLengthCm.toFixed(0)} cm from this body
            {:else if bodyMeasured}
              No supported length fits this body
            {:else}
              Measuring…
            {/if}
          </p>
        {/if}
      </div>
      {#if fixedLengthCm !== null}
        <p class="note">
          {propLabel} is drawn from a model at {fixedLengthCm.toFixed(0)} cm
          and ignores this. Pick Staff to size the mesh.
        </p>
      {/if}
    </div>

    <div class="field">
      <span class="field-label">Grid style</span>
      <SegmentedControl
        options={gridStyleOptions}
        value={lab.gridStyle}
        density="tight"
        ariaLabel="Where the hands sit"
        onchange={(style) => lab.setGridStyle(style)}
      />
      {#if lab.gridStyle === "isolation"}
        <p class="note">
          Each hand sits half the staff from the center, so a staff pointing in
          ends on it.
        </p>
      {/if}
    </div>

    <div class="field">
      <span class="field-label">Body</span>
      <SegmentedControl
        options={bodyClearanceOptions}
        value={lab.bodyClearance}
        density="tight"
        ariaLabel="How the body gets out of the staffs' way"
        onchange={(clearance) => lab.setBodyClearance(clearance)}
      />
      {#if lab.bodyClearance !== "off"}
        <p class="note">
          The chest moves off any staff it would pass through; the staffs stay
          where the score puts them.
        </p>
      {/if}
    </div>
  </section>

  <section class="card" aria-label="Sequence">
    <h2 class="card-title">Sequence</h2>
    <!--
      The front door. Everything the browse engine can reach is one press
      away, which is what lets this lab reproduce a grip failure somebody hit
      on a sequence of their own.
    -->
    <div class="chip-row">
      <FilterChipBase
        mode="dropdown"
        icon="fa-book-open"
        label={sequenceWord}
        count={sequenceStepCount}
        expanded={libraryOpen}
        ariaLabel={`Sequence: ${sequenceWord}. Choose another from the library.`}
        onclick={() => (libraryOpen = true)}
      />
    </div>
    <p class="note" aria-live="polite">
      {#if sequenceLoading}
        Loading sequence…
      {:else if sequenceStepCount !== null}
        {sequenceStepCount} steps · {sequenceSource} · {activeContinuity.summary}
      {:else}
        Nothing loaded
      {/if}
    </p>

    <!--
      The goal list. Nineteen controls in one wrapped row reads as a wall, so
      they keep the six VTG families they already belong to: three or four per
      family, each family one line wide enough to hold it.

      State rides the glyph, never a strip on the container's edge. Selection
      is the solid fill, which is a value contrast rather than a hue, so it
      survives nineteen chips and a colour-blind reader alike.

      No count on the chip. Every sequence the sweep faults carries exactly
      four events, so thirteen identical badges discriminate nothing and cost
      the row about twenty pixels a chip — enough to strand the fourth chip of
      Quarter-Same on a line of its own in a 236px rail. The numbers live on
      the loaded sequence's line, in each chip's accessible name, and under the
      scrub, where they differ from one another.
    -->
    <div class="field">
      <div class="goals-head">
        <span class="field-label" id="lab-goals-label">Core goals</span>
        <span class="goals-summary">
          {goalSummary.clean}/{goalSummary.total} clean
        </span>
      </div>
      <div class="goal-families" role="group" aria-labelledby="lab-goals-label">
        {#each LAB_GOAL_FAMILIES as family (family.id)}
          <div class="goal-family">
            <span class="goal-family-label" id={`lab-goal-${family.id}`}>
              {family.label}
            </span>
            <div class="chip-row" role="group" aria-labelledby={`lab-goal-${family.id}`}>
              {#each family.goals as goal (goal.id)}
                {@const status = labContinuityStatus(goal.id)}
                {@const isActive = lab.sequenceId === goal.id}
                {#snippet goalGlyph()}
                  <span
                    class="goal-glyph"
                    class:on-accent={isActive}
                    style={`--goal-glyph-color: ${status.color};`}
                  >
                    <i class={status.icon} aria-hidden="true"></i>
                  </span>
                {/snippet}
                <FilterChipBase
                  mode="toggle"
                  emphasis="solid"
                  size="sm"
                  labelScale="readable"
                  label={goal.label}
                  iconSnippet={goalGlyph}
                  chipColor={status.color}
                  active={isActive}
                  ariaLabel={`${goal.label}, ${family.label}, ${status.summary}`}
                  onclick={() => lab.setSequence(goal.id)}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <p class="note goals-legend">
        Check: no discontinuities. Bolt: jumps. From the committed sweep, not
        measured live.
      </p>
    </div>
  </section>

  <section class="card" aria-label="View">
    <h2 class="card-title">View</h2>
    <SegmentedControl
      options={viewOptions}
      value={lab.view}
      density="tight"
      columns={3}
      ariaLabel="Camera layout"
      onchange={(view) => lab.setView(view)}
    />
    <div class="chip-row">
      <FilterChipBase
        mode="toggle"
        icon="fa-tag"
        label="Grid labels"
        size="sm"
        active={lab.gridLabels}
        onclick={() => lab.setGridLabels(!lab.gridLabels)}
      />
      <FilterChipBase
        mode="action"
        icon={copied ? "fa-check" : "fa-link"}
        label={copied ? "Link copied" : "Copy link"}
        size="sm"
        ariaLabel="Copy a link that reproduces this exact configuration"
        onclick={copyLink}
      />
    </div>
  </section>
</div>

<BaseModal
  bind:open={characterOpen}
  size="lg"
  labelledBy="lab-character-title"
  onclose={() => (characterOpen = false)}
>
  {#snippet header()}
    <h2 id="lab-character-title" class="modal-title">Character</h2>
  {/snippet}
  <div class="picker-body">
    <PerformerCharacterPicker
      selectedCharacterId={lab.character}
      pendingCharacterId={null}
      previewPerformer={null}
      groupLabel="Lab character"
      onSelect={chooseCharacter}
      onIntent={() => {}}
      onCancelIntent={() => {}}
    />
  </div>
</BaseModal>

<BaseModal
  bind:open={propOpen}
  size="lg"
  labelledBy="lab-prop-title"
  onclose={() => (propOpen = false)}
>
  {#snippet header()}
    <h2 id="lab-prop-title" class="modal-title">Prop</h2>
  {/snippet}
  <div class="picker-body">
    <ScenePropPicker currentProp={lab.prop} onSelect={chooseProp} />
  </div>
</BaseModal>

<SequencePickerModal
  bind:open={libraryOpen}
  title="Choose the sequence this lab plays"
  onClose={() => (libraryOpen = false)}
  onSelect={chooseLibrarySequence}
/>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 1rem);
    min-width: 0;
  }

  /*
   * The app's own settings-card treatment — the one GridSettingsPanel and the
   * scene control inspector use. The lab's sections used to be bare headings
   * on a glass rail, which is what made a page full of real product pickers
   * still read as a debug console.
   */
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .card-title {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  /* A labelled sub-group inside a card: its own quiet label, then its control. */
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }

  .field-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  /*
   * A chip sizes to its label. Without this a chip inside a flex column
   * stretches to the rail's full width, which is the "absurdly wide control"
   * failure the visual-verification rule names first.
   */
  .chip-row :global(> *) {
    flex: 0 0 auto;
    max-width: 100%;
  }

  .note {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    /* The caption changes with the loaded sequence; reserving the line keeps
       the goals below it from stepping up and down as one loads. */
    min-height: 1.15rem;
  }

  /* The goal list's own heading row: its label and how far the list has to go. */
  .goals-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }

  .goals-summary {
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .goal-families {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  /*
   * The family name sits above its goals at every width, so the chips always
   * get the rail's whole measure.
   *
   * A label column beside them was tried and removed. It read well and halved
   * the block's height, but a 6.25rem column plus its gap takes 112px, and the
   * rail's own measure runs from 220px (folded phone) to 470px (4K). At 342px
   * — an 820px tablet — that left 230px for a family, and Quarter-Same's four
   * chips need more, so V dropped to a line of its own. Split-Opp and
   * Quarter-Opp stranded their third chip the same way. Six extra label lines
   * in a rail that already scrolls is the cheaper price.
   */
  .goal-family {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.25rem;
    min-width: 0;
  }

  .goal-family-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    white-space: nowrap;
  }

  /*
   * The continuity glyph. Colour reinforces the state; the icon's shape
   * carries it on its own. On the selected chip the solid
   * accent fill owns the surface, so the glyph switches to on-accent rather
   * than sitting a themed hue on top of one.
   */
  .goal-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    color: var(--goal-glyph-color);
  }

  .goal-glyph.on-accent {
    color: var(--theme-text-on-accent, #fff);
  }

  .goal-glyph i {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .goals-legend {
    min-height: 0;
  }

  /*
   * Both length modes occupy the same reserved row, so switching between the
   * scrubber and the derived readout cannot shove the sections beneath it.
   */
  .length-value {
    display: flex;
    align-items: center;
    min-height: 2.25rem;
  }

  .derived {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .modal-title {
    margin: 0;
    padding: 0.85rem 1.1rem 0;
    font-size: var(--font-size-lg, 1.125rem);
    color: var(--theme-text, #fff);
  }

  .picker-body {
    max-height: min(70dvh, 640px);
    overflow-y: auto;
    padding: 0.85rem 1.1rem 1.1rem;
  }
</style>
