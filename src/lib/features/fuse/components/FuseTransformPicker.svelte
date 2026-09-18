<!--
  FuseTransformPicker — the symmetry rule editor.

  Two decisions, in order: which path you edit, and how the two hands relate
  in time and direction. The relationship is one of six timing-and-direction
  modes; the rotation and reflection that produce it are resolved by
  fuse-tnd-rule.ts and never shown. Quarter modes add one more choice, which
  way round the circle the other hand sits. Invert and Rewind stay as
  independent operations: Invert never touches timing or direction, and
  Rewind keeps them only for symmetric paths, which the composer checks.

  Both values are owned + persisted by fuse-state as a FuseRule; the composer
  passes drafts.
-->
<script lang="ts">
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import FuseTnDModePicker from "./FuseTnDModePicker.svelte";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { getFuseContext } from "../context/fuse-context";
  import { fuseComponentColor } from "../domain/fuse-transform-presentation";
  import type { FuseRule } from "../domain/fuse-rule";
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    isQuarterMode,
    resolveFuseRule,
    type FuseQuarterOffset,
    type FuseTnDMode,
    type FuseTnDSelection,
  } from "../domain/fuse-tnd-rule";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    driver,
    rule,
    onDriverChange,
    onRuleChange,
  }: {
    driver?: FuseSide;
    rule?: FuseRule;
    onDriverChange?: (side: FuseSide) => void;
    onRuleChange?: (rule: FuseRule) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const selectedDriver = $derived(driver ?? fuseState.driverSide);
  const selectedRule = $derived(rule ?? fuseState.rule);

  // The rule is the source of truth; the selection is a view of it. A rule
  // the picker cannot express (odd rotation) reads as the default so the
  // panel never renders with nothing chosen.
  const selection = $derived<FuseTnDSelection>(
    classifyFuseRule(selectedRule) ?? DEFAULT_TND_SELECTION
  );

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );

  const driverOptions = $derived(
    (
      [
        { value: "left", label: "Left", tone: "blue" },
        { value: "right", label: "Right", tone: "red" },
      ] as {
        value: FuseSide;
        label: string;
        tone: "blue" | "red";
      }[]
    ).map((option) => ({ ...option, disabled }))
  );

  const offsetOptions = $derived(
    (
      [
        { value: "cw", label: "Quarter clockwise" },
        { value: "ccw", label: "Quarter counterclockwise" },
      ] as { value: FuseQuarterOffset; label: string }[]
    ).map((option) => ({ ...option, disabled }))
  );

  type Operation = {
    id: string;
    label: string;
    ariaLabel: string;
    color: string;
    glyph: Set<LOOPComponent>;
    active: boolean;
    toggle: () => void;
  };

  const operations = $derived<Operation[]>([
    {
      id: "invert",
      label: "Invert",
      ariaLabel: "Invert — reverse every turn",
      color: fuseComponentColor(LOOPComponent.INVERTED),
      glyph: new Set([LOOPComponent.INVERTED]),
      active: selection.invert,
      toggle: () =>
        commitSelection({ ...selection, invert: !selection.invert }),
    },
    {
      id: "rewind",
      label: "Rewind",
      ariaLabel: "Rewind — reverse the step order",
      color: fuseComponentColor(LOOPComponent.REWOUND),
      glyph: new Set([LOOPComponent.REWOUND]),
      active: selection.rewind,
      toggle: () =>
        commitSelection({ ...selection, rewind: !selection.rewind }),
    },
  ]);

  const followerLabel = $derived(selectedDriver === "left" ? "Right" : "Left");
  const driverLabel = $derived(selectedDriver === "left" ? "Left" : "Right");
  const showOffset = $derived(isQuarterMode(selection.mode));

  function handleDriver(value: FuseSide): void {
    if (onDriverChange) onDriverChange(value);
    else fuseState.setDriver(value);
  }

  function commit(next: FuseRule): void {
    if (onRuleChange) onRuleChange(next);
    else fuseState.setRule(next);
  }

  function commitSelection(next: FuseTnDSelection): void {
    commit(resolveFuseRule(next));
  }

  function chooseMode(mode: FuseTnDMode): void {
    commitSelection({ ...selection, mode });
  }

  function chooseOffset(quarterOffset: FuseQuarterOffset): void {
    commitSelection({ ...selection, quarterOffset });
  }
</script>

<div class="transform-picker">
  <div class="field" role="group" aria-label="Path you will edit">
    <div class="field-heading">
      <span class="step-number">1</span>
      <div>
        <span class="field-label">Path you will edit</span>
        <span class="field-help">{driverLabel} stays editable</span>
      </div>
    </div>
    <div class="field-control driver-control">
      <SegmentedControl
        options={driverOptions}
        value={selectedDriver}
        onchange={handleDriver}
        color="accent"
        size="md"
      />
    </div>
  </div>

  <div class="rule-field">
    <div class="field-heading">
      <span class="step-number">2</span>
      <div>
        <span class="field-label"
          >How {followerLabel} relates to {driverLabel}</span
        >
        <span class="field-help">
          Every change previews a new {followerLabel} path
        </span>
      </div>
    </div>

    <div class="axis mode-axis">
      <span class="axis-label" id="fuse-mode-label">Timing and direction</span>
      <FuseTnDModePicker
        selected={selection.mode}
        {disabled}
        onpick={chooseMode}
      />
    </div>

    {#if showOffset}
      <div class="axis">
        <span class="axis-label" id="fuse-offset-label">Which way round</span>
        <SegmentedControl
          options={offsetOptions}
          value={selection.quarterOffset}
          onchange={chooseOffset}
          color="accent"
          size="md"
          ariaLabelledby="fuse-offset-label"
        />
      </div>
    {/if}

    <div class="axis operations-axis">
      <span class="axis-label" id="fuse-operations-label">Also</span>
      <div
        class="operation-row"
        role="group"
        aria-labelledby="fuse-operations-label"
      >
        {#each operations as operation (operation.id)}
          <FilterChipBase
            mode="toggle"
            label={operation.label}
            ariaLabel={operation.ariaLabel}
            title={operation.ariaLabel}
            active={operation.active}
            chipColor={operation.color}
            {disabled}
            onclick={operation.toggle}
          >
            {#snippet iconSnippet()}
              <LOOPIconStrip
                activeComponents={operation.glyph}
                size={14}
                showFreeformWhenEmpty={false}
              />
            {/snippet}
          </FilterChipBase>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* The picker takes whatever height the editor has to spare, and hands it to
     the rule card below, so a tall pane fills with taller chips instead of a
     band of nothing between the last row and the pinned footer. `1 0 auto`:
     grow, never shrink, so a pane shorter than the form still scrolls it. */
  .transform-picker {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: var(--settings-spacing-md, 14px);
    width: 100%;
    min-width: 0;
  }

  .field,
  .rule-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: clamp(12px, 0.45cqw, 17px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  /* The rule card grows to the pinned footer, and the spare height goes into
     the chip rows themselves rather than between them: the four rows of chips
     (three modes, one of operations) share it evenly, so every chip gets
     taller by the same amount and the rows stay one block. Stretching the card
     without stretching the rows is what used to leave a gap between the mode
     grid and the chips. */
  .rule-field {
    flex: 1 0 auto;
    container-type: inline-size;
  }

  .axis {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .mode-axis,
  .operations-axis {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .mode-axis {
    flex: 3 0 auto;
  }

  .operations-axis {
    flex: 1 0 auto;
  }

  .axis-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Two chips, one row, equal shares. */
  .operation-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    min-width: 0;
  }

  .operation-row :global(.filter-chip) {
    width: 100%;
    height: 100%;
    justify-content: center;
  }

  .field-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .field-heading > div {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .step-number {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b6cff) 55%, transparent);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 18%,
      transparent
    );
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
  }

  .field-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 750;
  }

  .field-help {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .field-control {
    display: flex;
    min-width: 0;
  }

  .driver-control {
    width: 100%;
  }

  .field-control :global(.segmented-control) {
    width: 100%;
  }

  /* Same trade as the composer's short-viewport tiers: the step cards keep their
     numbers and their frames and give up padding first, then the helper line.
     The drawer is portalled out of the `fuse` container, so these are media
     queries. */
  @media (max-height: 1250px) {
    .field,
    .rule-field {
      gap: 8px;
      padding: 8px 10px;
    }
  }

  @media (max-height: 950px) {
    .field-help {
      display: none;
    }
  }

  @media (min-width: 2600px) and (min-height: 1400px) {
    .field,
    .rule-field {
      padding: 20px;
    }

    .step-number {
      width: 36px;
      height: 36px;
    }
  }
</style>
