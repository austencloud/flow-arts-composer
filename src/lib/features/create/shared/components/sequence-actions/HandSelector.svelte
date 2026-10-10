<!--
  HandSelector.svelte

  Hand selector shared by Sequence Actions and the mandala viewer.
  Defaults to Left / Both / Right; callers can supply labels for the same
  left / both / right states.

  Thin domain wrapper around the shared SegmentedControl. Prop tones live in
  that primitive, so every Left/Blue and Right/Red option follows the same
  color policy instead of rebuilding it here.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TargetHand } from "../../state/panel-coordination-state.svelte.ts";

  interface Props {
    value: TargetHand;
    onChange: (hand: TargetHand) => void;
    sectionLabel?: string;
    labelId?: string;
    labels?: Record<TargetHand, string>;
  }

  let {
    value,
    onChange,
    sectionLabel,
    labelId = "apply-to-label",
    labels,
  }: Props = $props();

  const displayedLabels = $derived(
    labels ?? {
      left: t("shared_controls_left"),
      both: tDynamic("create_action_both_hands"),
      right: t("shared_controls_right"),
    }
  );

  const options = $derived.by(
    (): {
      value: TargetHand;
      label: string;
      tone: "blue" | "red" | "both";
    }[] => [
      { value: "left", label: displayedLabels.left, tone: "blue" },
      { value: "both", label: displayedLabels.both, tone: "both" },
      { value: "right", label: displayedLabels.right, tone: "red" },
    ]
  );
</script>

<div class="hand-selector-section">
  <span class="section-label" id={labelId}
    >{sectionLabel ?? tDynamic("create_action_apply_to")}</span
  >

  <SegmentedControl
    {options}
    {value}
    onchange={onChange}
    color="accent"
    ariaLabelledby={labelId}
  />
</div>

<style>
  .hand-selector-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }
</style>
