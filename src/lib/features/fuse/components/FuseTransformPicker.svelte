<!--
  FuseTransformPicker — the symmetry rule editor.

  Two decisions, in order: which path you edit, and how the two hands relate
  in time and direction. The relationship is one of six timing-and-direction
  modes; the rotation and reflection that produce it are resolved by
  fuse-tnd-rule.ts and never shown. Quarter modes add one more choice, which
  way round the circle the other hand sits. Invert and Rewind stay as
  independent operations: Invert never touches timing or direction, and
  Rewind keeps them only for symmetric paths, which the composer checks and
  reports under the Rewind switch.

  Both values are owned + persisted by fuse-state as a FuseRule; the composer
  passes drafts.
-->
<script lang="ts">
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
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
    rewindNote = null,
    onDriverChange,
    onRuleChange,
  }: {
    driver?: FuseSide;
    rule?: FuseRule;
    /** What Rewind did to timing and direction on this path, once it is on. */
    rewindNote?: { text: string; breaks: boolean } | null;
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
    detail: string;
    color: string;
    glyph: Set<LOOPComponent>;
    active: boolean;
    toggle: () => void;
  };

  const followerLabel = $derived(selectedDriver === "left" ? "Right" : "Left");
  const driverLabel = $derived(selectedDriver === "left" ? "Left" : "Right");

  const operations = $derived<Operation[]>([
    {
      id: "invert",
      label: "Invert",
      detail: "Swaps pro and anti on every beat",
      color: fuseComponentColor(LOOPComponent.INVERTED),
      glyph: new Set([LOOPComponent.INVERTED]),
      active: selection.invert,
      toggle: () =>
        commitSelection({ ...selection, invert: !selection.invert }),
    },
    {
      id: "rewind",
      label: "Rewind",
      detail: `${followerLabel} plays ${driverLabel} backwards, last beat first`,
      color: fuseComponentColor(LOOPComponent.REWOUND),
      glyph: new Set([LOOPComponent.REWOUND]),
      active: selection.rewind,
      toggle: () =>
        commitSelection({ ...selection, rewind: !selection.rewind }),
    },
  ]);

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
  <!-- Named for what it does to both paths, not for the one it leaves alone.
       "Path you will edit" read as a view toggle, so switching it looked like
       the workspace had swapped to a different fuse: it is a source-of-truth
       switch, and the path that stops leading stops being shown. Neither
       sequence is lost — each side keeps its own in its pool, and the one that
       leads is the one on screen — but the control has to say that changing it
       replaces the other path rather than just moving the cursor. -->
  <div class="field" role="group" aria-label="Which path leads">
    <div class="field-heading">
      <span class="step-number">1</span>
      <div>
        <span class="field-label">Which path leads</span>
        <span class="field-help">
          {driverLabel} keeps its own path; {followerLabel} is rebuilt from it
        </span>
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

    <!-- Modifiers on the mode, so they sit a step below it: content-height
         rows that say what they do, not tiles sharing the mode grid's spare
         height. Stretched to fill, two words sat in the middle of 130px pills
         and read as the same size of decision as the six modes. They are
         switches because each is on or off on its own. -->
    <div class="axis operations-axis">
      <span class="axis-label" id="fuse-operations-label">Also</span>
      <div
        class="operation-list"
        role="group"
        aria-labelledby="fuse-operations-label"
      >
        {#each operations as operation (operation.id)}
          <button
            type="button"
            role="switch"
            class="operation-toggle"
            class:active={operation.active}
            style:--op-color={operation.color}
            aria-checked={operation.active}
            aria-describedby="fuse-op-{operation.id}-detail"
            title={operation.detail}
            {disabled}
            onclick={operation.toggle}
          >
            <span class="op-glyph" aria-hidden="true">
              <LOOPIconStrip
                activeComponents={operation.glyph}
                size={18}
                showFreeformWhenEmpty={false}
              />
            </span>
            <span class="op-copy">
              <strong>{operation.label}</strong>
              <span class="op-detail" id="fuse-op-{operation.id}-detail">
                {operation.detail}
              </span>
            </span>
            <span class="op-switch" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
      <!-- The consequence, measured on the live preview: Rewind pairs each
           beat with one from the other end, so whether timing and direction
           survive depends on the leading path, and the switch alone cannot
           say. -->
      {#if rewindNote}
        <p
          class="operation-note"
          class:breaks={rewindNote.breaks}
          role="status"
        >
          {rewindNote.text}
        </p>
      {/if}
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

  /* The mode grid takes all of the card's spare height; the operations keep
     their natural height under it. */
  .mode-axis {
    flex: 1 0 auto;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .axis-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .operation-list {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  /* Quieter than a mode choice at rest and when on: a tinted ring and a lit
     switch, no glow and no check. The mode is the decision; these adjust it. */
  .operation-toggle {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 7px 12px;
    border: 1px solid color-mix(in srgb, var(--op-color) 20%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--op-color) 4%, transparent);
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .operation-toggle:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--op-color) 50%, transparent);
    background: color-mix(in srgb, var(--op-color) 10%, transparent);
  }

  .operation-toggle.active {
    border-color: color-mix(in srgb, var(--op-color) 75%, transparent);
    background: color-mix(in srgb, var(--op-color) 16%, transparent);
  }

  .operation-toggle:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .operation-toggle:focus-visible {
    outline: 2px solid var(--op-color);
    outline-offset: 2px;
  }

  .op-glyph {
    display: grid;
    place-items: center;
    opacity: 0.7;
  }

  .operation-toggle.active .op-glyph {
    opacity: 1;
  }

  .op-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .op-copy strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .op-detail {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .op-switch {
    position: relative;
    width: 34px;
    height: 20px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text, #fff) 16%, transparent);
    transition: background var(--duration-fast, 150ms) ease;
  }

  .op-switch::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #fff) 70%, transparent);
    transition:
      transform var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .operation-toggle.active .op-switch {
    background: var(--op-color);
  }

  .operation-toggle.active .op-switch::after {
    background: #fff;
    transform: translateX(14px);
  }

  .operation-note {
    margin: 2px 2px 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .operation-note.breaks {
    color: color-mix(
      in srgb,
      var(--semantic-warning, #f97316) 55%,
      var(--theme-text, #fff)
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .operation-toggle,
    .op-switch,
    .op-switch::after {
      transition: none;
    }
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

  /* Short panes drop the operation descriptions with the step help and put
     the two switches back on one row. The description stays the switch's
     accessible description and its tooltip. Rewind's all-clear goes too; the
     warning when it breaks timing and direction stays. */
  @media (max-height: 950px) {
    .field-help,
    .op-detail,
    .operation-note:not(.breaks) {
      display: none;
    }

    .operation-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
