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
  import { MediaQuery } from "svelte/reactivity";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FuseTnDModePicker from "./FuseTnDModePicker.svelte";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { getFuseContext } from "../context/fuse-context";
  import { fuseComponentColor } from "../domain/fuse-transform-presentation";
  import type { FuseRule } from "../domain/fuse-rule";
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    isQuarterMode,
    resolveFuseRule,
    fuseTnDAxes,
    withFuseTnDAxes,
    type FuseTiming,
    type FuseDirection,
    type FuseQuarterOffset,
    type FuseTnDMode,
    type FuseTnDSelection,
  } from "../domain/fuse-tnd-rule";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    driver,
    rule,
    rewindNote = null,
    inline = false,
    onDriverChange,
    onRuleChange,
  }: {
    driver?: FuseSide;
    rule?: FuseRule;
    /** What Rewind did to timing and direction on this path, once it is on. */
    rewindNote?: { text: string; breaks: boolean } | null;
    /** Dense, persistent presentation beside the Linked canvas. */
    inline?: boolean;
    onDriverChange?: (side: FuseSide) => void;
    onRuleChange?: (rule: FuseRule) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();

  // The phone form of the editor: the drawer is a screen of its own there and
  // every row has to fit without a scroll, so the controls take the phone's
  // 36px size and step 1 sits on one row. The drawer is portalled out of the
  // fuse container, so the viewport decides, at the same 480px the composer
  // uses for its phone layout.
  const phoneQuery = new MediaQuery("(max-width: 480px)");
  const phoneForm = $derived(!inline && phoneQuery.current);
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
        { value: "left", label: t("fuse_side_left"), tone: "blue" },
        { value: "right", label: t("fuse_side_right"), tone: "red" },
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
        { value: "cw", label: t("fuse_picker_offset_cw") },
        { value: "ccw", label: t("fuse_picker_offset_ccw") },
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

  // Left and Right are named whole in each sentence, so a language can order
  // and inflect them as it needs; the two variants are two keys.
  const leftLeads = $derived(selectedDriver === "left");

  const operations = $derived<Operation[]>([
    {
      id: "invert",
      label: t("fuse_rule_invert"),
      detail: t("fuse_picker_invert_detail"),
      color: fuseComponentColor(LOOPComponent.INVERTED),
      glyph: new Set([LOOPComponent.INVERTED]),
      active: selection.invert,
      toggle: () =>
        commitSelection({ ...selection, invert: !selection.invert }),
    },
    {
      id: "rewind",
      label: t("fuse_rule_rewind"),
      detail: t(leftLeads ? "fuse_picker_rewind_detail_left_leads" : "fuse_picker_rewind_detail_right_leads"),
      color: fuseComponentColor(LOOPComponent.REWOUND),
      glyph: new Set([LOOPComponent.REWOUND]),
      active: selection.rewind,
      toggle: () =>
        commitSelection({ ...selection, rewind: !selection.rewind }),
    },
  ]);

  const showOffset = $derived(isQuarterMode(selection.mode));
  const axes = $derived(fuseTnDAxes(selection));
  const timingOptions = $derived(
    (
      [
        {
          value: "together",
          label: t(leftLeads ? "fuse_picker_together_left_leads" : "fuse_picker_together_right_leads"),
        },
        {
          value: "split",
          label: t(leftLeads ? "fuse_picker_split_left_leads" : "fuse_picker_split_right_leads"),
        },
        {
          value: "quarter-cw",
          label: t(leftLeads ? "fuse_picker_quarter_cw_left_leads" : "fuse_picker_quarter_cw_right_leads"),
        },
        {
          value: "quarter-ccw",
          label: t(leftLeads ? "fuse_picker_quarter_ccw_left_leads" : "fuse_picker_quarter_ccw_right_leads"),
        },
      ] as { value: FuseTiming; label: string }[]
    ).map((option) => ({ ...option, disabled }))
  );
  const directionOptions = $derived(
    (
      [
        {
          value: "same",
          label: t(leftLeads ? "fuse_picker_same_left_leads" : "fuse_picker_same_right_leads"),
        },
        {
          value: "opposite",
          label: t(leftLeads ? "fuse_picker_opposite_left_leads" : "fuse_picker_opposite_right_leads"),
        },
      ] as { value: FuseDirection; label: string }[]
    ).map((option) => ({ ...option, disabled }))
  );

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

  function chooseMode(
    mode: FuseTnDMode,
    quarterOffset: FuseQuarterOffset = selection.quarterOffset
  ): void {
    commitSelection({ ...selection, mode, quarterOffset });
  }

  function chooseOffset(quarterOffset: FuseQuarterOffset): void {
    commitSelection({ ...selection, quarterOffset });
  }

  function chooseTiming(timing: FuseTiming): void {
    commitSelection(withFuseTnDAxes(selection, { timing }));
  }

  function chooseDirection(direction: FuseDirection): void {
    commitSelection(withFuseTnDAxes(selection, { direction }));
  }
</script>

<div class="transform-picker" class:inline class:phone-form={phoneForm}>
  <!-- Switching never changes what is on screen: the path that takes the lead
       keeps the one it is showing, and the rule is turned round to match. What
       changes is which of the two a later edit starts from, so the help says
       that, and says that switching is safe. -->
  <div class="field" role="group" aria-label={t("fuse_picker_which_leads")}>
    <div class="field-heading">
      {#if !inline}<span class="step-number">1</span>{/if}
      <div>
        <span class="field-label">{t("fuse_picker_which_leads")}</span>
        <span class="field-help" class:inline-help={inline}>
          {t(
            leftLeads
              ? "fuse_picker_driver_help_left_leads"
              : "fuse_picker_driver_help_right_leads"
          )}
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
    {#if !inline}<div class="field-heading">
        <span class="step-number">2</span>
        <div>
          <span class="field-label"
            >{t(
              leftLeads
                ? "fuse_picker_relates_left_leads"
                : "fuse_picker_relates_right_leads"
            )}</span
          >
          <span class="field-help" class:inline-help={inline}>
            {t(
              leftLeads
                ? "fuse_picker_preview_new_left_leads"
                : "fuse_picker_preview_new_right_leads"
            )}
          </span>
        </div>
      </div>{/if}

    {#if inline}
      <div class="axis timing-axis">
        <span class="axis-label" id="fuse-timing-label"
          >{t("fuse_picker_timing")}</span
        >
        <SegmentedControl
          options={timingOptions}
          value={axes.timing}
          onchange={chooseTiming}
          color="accent"
          size="md"
          semantics="radiogroup"
          ariaLabel={t(
            leftLeads
              ? "fuse_picker_timing_aria_left_leads"
              : "fuse_picker_timing_aria_right_leads"
          )}
        >
          {#snippet optionContent(timing: FuseTiming)}
            {#if timing === "together"}{t("fuse_picker_timing_together")}
            {:else if timing === "split"}{t("fuse_picker_timing_split")}
            {:else}<span class="quarter-choice"
                ><span>{t("fuse_picker_timing_quarter")}</span><span aria-hidden="true"
                  >{timing === "quarter-cw" ? "↻" : "↺"}</span
                ></span
              >{/if}
          {/snippet}
        </SegmentedControl>
      </div>
      <div class="axis direction-axis">
        <span class="axis-label" id="fuse-direction-label"
          >{t("fuse_picker_direction")}</span
        >
        <SegmentedControl
          options={directionOptions}
          value={axes.direction}
          onchange={chooseDirection}
          color="accent"
          size="md"
          semantics="radiogroup"
          ariaLabel={t(
            leftLeads
              ? "fuse_picker_direction_aria_left_leads"
              : "fuse_picker_direction_aria_right_leads"
          )}
        >
          {#snippet optionContent(direction: FuseDirection)}
            {direction === "same"
              ? t("fuse_picker_direction_same")
              : t("fuse_picker_direction_opposite")}
          {/snippet}
        </SegmentedControl>
      </div>
    {:else}
      <div class="axis mode-axis">
        <span class="axis-label" id="fuse-mode-label"
          >{t("fuse_picker_timing_and_direction")}</span
        >
        <FuseTnDModePicker
          selected={selection.mode}
          {disabled}
          size={phoneForm ? "sm" : "md"}
          onpick={chooseMode}
        />
      </div>
    {/if}

    {#if showOffset && !inline}
      <div class="axis offset-axis" transition:growFade={{ axis: "y" }}>
        <span class="axis-label" id="fuse-offset-label"
          >{t(
            leftLeads
              ? "fuse_picker_rotate_path_left_leads"
              : "fuse_picker_rotate_path_right_leads"
          )}</span
        >
        <SegmentedControl
          options={offsetOptions}
          value={selection.quarterOffset}
          onchange={chooseOffset}
          color="accent"
          size="md"
          ariaLabelledby="fuse-offset-label"
        >
          {#snippet optionContent(offset: FuseQuarterOffset)}
            <span class="offset-option">
              <span class="offset-arrow" aria-hidden="true"
                >{offset === "cw" ? "↻" : "↺"}</span
              >
              <span
                >{offset === "cw"
                  ? t("fuse_picker_offset_cw")
                  : t("fuse_picker_offset_ccw")}</span
              >
            </span>
          {/snippet}
        </SegmentedControl>
      </div>
    {/if}

    <!-- Each modifier is independent of the timing and direction selection. -->
    <div class="axis operations-axis">
      <span class="axis-label" id="fuse-operations-label"
        >{t("fuse_picker_options")}</span
      >
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
    </div>
    <!-- The consequence, measured on the live preview: Rewind pairs each
           beat with one from the other end, so whether timing and direction
           survive depends on the leading path, and the switch alone cannot
           say. -->
    {#if rewindNote}
      <p class="operation-note" class:breaks={rewindNote.breaks} role="status">
        {rewindNote.text}
      </p>
    {/if}
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
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
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
    transition: background var(--duration-fast) var(--ease-standard);
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
      transform var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
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

  /* The Linked controls are one row, the height of the Separate/Linked
     switch above them. Each label sits beside its control instead of over it,
     and nothing is stretched: this band used to be 115px of a 900px window,
     three times the header's own controls, and the path grids below paid for
     it. */
  .transform-picker.inline {
    flex: none;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 18px;
  }
  .inline .field,
  .inline .rule-field {
    flex: none;
    border: 0;
    border-radius: 0;
    background: none;
    padding: 0;
  }
  .inline .rule-field {
    display: contents;
    container-type: normal;
  }
  /* Each group grows to fill its row, weighted by how many choices it holds,
     so a band that wraps to two rows fills both instead of leaving the
     remainder on the right, and every button in a row is the same width. */
  .inline .field,
  .inline .timing-axis,
  .inline .direction-axis,
  .inline .operations-axis {
    display: flex;
    flex: 2 1 auto;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .inline .timing-axis {
    flex-grow: 4;
  }
  .inline .field-heading,
  .inline .axis-label {
    flex: none;
  }
  .inline .field-control,
  .inline .timing-axis :global(.segmented-control),
  .inline .direction-axis :global(.segmented-control),
  .inline .operation-list {
    flex: 1 1 auto;
  }
  .inline .axis-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    letter-spacing: normal;
    text-transform: none;
  }
  .inline .driver-control {
    width: auto;
  }
  .inline .operation-list {
    display: flex;
    gap: 6px;
  }
  .inline .operation-toggle {
    display: flex;
    flex: 1 1 0;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    white-space: nowrap;
  }
  .inline .op-glyph,
  .inline .op-detail,
  .inline .inline-help {
    display: none;
  }
  .inline .op-switch {
    width: 28px;
  }
  .inline .operation-toggle.active .op-switch::after {
    transform: translateX(8px);
  }
  .inline .operation-note {
    flex-basis: 100%;
    margin: 0;
  }
  .quarter-choice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .quarter-choice > span:last-child {
    font-size: 1.4rem;
    line-height: 1;
  }
  .offset-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .offset-arrow {
    font-size: 1.75rem;
    line-height: 1;
  }
  .offset-axis > .axis-label {
    font-size: var(--font-size-min, 14px);
    letter-spacing: normal;
    text-transform: none;
  }
  .offset-axis :global(.segment) {
    min-height: 48px;
  }
  /* Narrower bands wrap group by group, the four-way timing control first
     since it is the widest; each label stays beside its control. */
  @container (max-width: 40rem) {
    .inline .timing-axis,
    .inline .operations-axis {
      flex-basis: 100%;
    }
  }
  @container (max-width: 28rem) {
    .inline .field,
    .inline .direction-axis {
      flex-basis: 100%;
    }
    /* Four nowrap timing choices run past a phone's edge beside their label,
       so the label takes a line of its own and the control the full width. */
    .inline .timing-axis {
      flex-wrap: wrap;
    }
    .inline .timing-axis .axis-label {
      flex-basis: 100%;
      min-width: 0;
    }
    .inline .timing-axis :global(.segmented-control) {
      flex: 1 1 100%;
    }
    .inline .axis-label,
    .inline .field-heading {
      min-width: 5.5rem;
    }
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

  /* The phone form, which has to fit a 360 x 591 window without a scroll:
     step 1 is one 44px row (its heading, on two lines if it has to be, beside
     a 36px Left / Right switch as wide as its two names),
     the six modes are 36px chips (TnDModeGrid size sm), the Quarter rotation
     and the two options are 36px, and the gaps between groups tighten. The
     card stops growing into spare height, so the chips stay 36px and the
     spare height sits above Cancel instead. */
  .phone-form {
    flex: none;
    gap: 8px;
  }

  .phone-form .field,
  .phone-form .rule-field {
    flex: none;
    gap: 6px;
    padding: 6px 10px;
  }

  .phone-form .field {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .phone-form .field > .field-heading {
    flex: 1 1 0;
    gap: 8px;
  }

  .phone-form .step-number {
    width: 24px;
    height: 24px;
  }

  .phone-form .field .field-label {
    line-height: 1.2;
    text-wrap: balance;
  }

  /* Never narrower than its two names side by side: the question beside it
     wraps instead, so neither runs out of its box. */
  .phone-form .driver-control {
    flex: 0 0 auto;
    width: max-content;
  }

  .phone-form .driver-control :global(.segment) {
    padding-inline: 7px;
  }

  .phone-form .driver-control :global(.segment),
  .phone-form .offset-axis :global(.segment) {
    min-height: var(--alt-touch-target, 36px);
    padding-block: 0;
  }

  /* A two-line direction stays inside the 36px the one-line one takes. */
  .phone-form .offset-option {
    gap: 6px;
    line-height: 1.2;
  }

  .phone-form .offset-arrow {
    font-size: var(--font-size-xl, 1.25rem);
  }

  .phone-form .axis {
    gap: 4px;
  }

  .phone-form .mode-axis {
    flex: none;
    grid-template-rows: auto auto;
  }

  .phone-form .axis-label {
    line-height: 1.25;
  }

  /* Two to a row where both names fit on one line, else one to a row. */
  .phone-form .operation-list {
    display: flex;
    flex-wrap: wrap;
  }

  .phone-form .operation-toggle {
    flex: 1 1 40%;
    gap: 8px;
    min-width: max-content;
    min-height: var(--alt-touch-target, 36px);
    padding: 0 10px;
    white-space: nowrap;
  }

  .phone-form .operation-note {
    margin: 0 2px;
  }

  @media (max-height: 620px) {
    .phone-form {
      gap: 6px;
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
