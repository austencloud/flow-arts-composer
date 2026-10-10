<!--
  Who is on stage and how they hold the prop, built from the app's own
  controls.

  Nothing here owns a choice. The character gallery is the product's
  PerformerCharacterPicker over CHARACTER_DEFINITIONS and the prop gallery is
  the canonical ScenePropPicker over the shared 3D catalog. This component only
  arranges them and writes each choice into the URL.
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ScrubbableNumber from "#lib/shared/ui/components/ScrubbableNumber.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PerformerCharacterPicker from "#lib/shared/3d/components/controls/PerformerCharacterPicker.svelte";
  import ScenePropPicker from "#lib/shared/3d/components/controls/ScenePropPicker.svelte";
  import { scenePropFixedLengthCm } from "#lib/shared/3d/domain/scene-prop-catalog.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  import LabSection from "./LabSection.svelte";
  import {
    isLocalOnlyCharacter,
    labCharacterName,
    labPropLabel,
  } from "./lab-catalog";
  import {
    LAB_LENGTH_MAX_CM,
    LAB_LENGTH_MIN_CM,
    type LabBodyClearance,
    type LabGridStyle,
    type StaffLabState,
  } from "./lab-state.svelte";

  interface Props {
    lab: StaffLabState;
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

  let { lab, bodyLengthCm, bodyMeasured }: Props = $props();

  let characterOpen = $state(false);
  let propOpen = $state(false);

  const characterName = $derived(labCharacterName(lab.character));
  const propLabel = $derived(labPropLabel(lab.prop));

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

  function chooseCharacter(id: CharacterId): void {
    lab.setCharacter(id);
    characterOpen = false;
  }

  function chooseProp(prop: PropType): void {
    lab.setProp(prop);
    propOpen = false;
  }
</script>

<LabSection
  id="lab-performer"
  title="Performer"
  icon="fa-person"
  summary={`${characterName} · ${propLabel}`}
>
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
    <p class="note">Local rig, not in the deployable catalog.</p>
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
    <!--
      Both length modes occupy the same reserved row, so switching between the
      scrubber and the derived readout cannot shove the fields beneath it.
    -->
    <div class="length-value">
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
        {propLabel} is drawn from a model at {fixedLengthCm.toFixed(0)} cm and ignores
        this. Pick Staff to size the mesh.
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
</LabSection>

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

<style>
  /* A labelled sub-group: its own quiet label, then its control. */
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

  /* A chip sizes to its label instead of stretching across the rail. */
  .chip-row :global(> *) {
    flex: 0 0 auto;
    max-width: 100%;
  }

  .note {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

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
