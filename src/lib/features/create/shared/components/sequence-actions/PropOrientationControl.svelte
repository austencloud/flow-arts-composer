<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    hand: "left" | "right";
    orientation: string;
    onOrientationChange: (orientation: string) => void;
    /** Enable interradial orientations (Level 4). */
    showInterradial?: boolean;
    /** Restrict the control to the vocabulary allowed by its host. */
    allowedOrientations?: readonly string[];
    compact?: boolean;
    disabled?: boolean;
    /**
     * Opt this control into the attract presenter, per host. Absent by default:
     * the same control sits in the generate customizer, which the presenter is
     * not meant to reach. Only the step editor passes it.
     */
    ghostKind?: "step-edit";
  }

  let {
    hand,
    orientation,
    onOrientationChange,
    showInterradial = false,
    allowedOrientations,
    compact = false,
    disabled = false,
    ghostKind,
  }: Props = $props();

  const tone = $derived(hand === "left" ? "blue" : "red");
  const handLabel = $derived(
    hand === "left" ? t("shared_controls_left") : t("shared_controls_right")
  );
  const accessibleHand = $derived(tDynamic(`create_action_hand_${hand}`));

  interface OrientationOption {
    value: string;
    icon: string;
  }

  const cardinalOptions: OrientationOption[] = [
    { value: "in", icon: "fa-compress-alt" },
    { value: "out", icon: "fa-expand-alt" },
    { value: "clock", icon: "fa-rotate-right" },
    {
      value: "counter",
      icon: "fa-rotate-left",
    },
  ];

  const interradialOptions: OrientationOption[] = [
    {
      value: "clockIn",
      icon: "fa-rotate-right",
    },
    {
      value: "clockOut",
      icon: "fa-rotate-right",
    },
    {
      value: "counterIn",
      icon: "fa-rotate-left",
    },
    {
      value: "counterOut",
      icon: "fa-rotate-left",
    },
  ];

  const allOrientationOptions = $derived(
    showInterradial
      ? [...cardinalOptions, ...interradialOptions]
      : cardinalOptions
  );

  const options = $derived(
    allOrientationOptions
      .filter(
        (option) =>
          !allowedOrientations || allowedOrientations.includes(option.value)
      )
      .map((option) => ({
        value: option.value,
        label: tDynamic(`create_action_orientation_${option.value}_name`),
        // The label is short and ambiguous on its own — CW could be a rotation
        // direction anywhere. The full name is what a screen reader announces.
        ariaLabel: tDynamic("create_action_set_orientation", {
          hand: accessibleHand,
          orientation: tDynamic(
            `create_action_orientation_${option.value}_name`
          ),
        }),
        tone,
        disabled,
      }))
  );
</script>

<div class="orientation-control" class:compact>
  <SegmentedControl
    {options}
    value={orientation}
    onchange={onOrientationChange}
    color={tone}
    density="tight"
    columns={options.length > 4 ? 4 : undefined}
    semantics="radiogroup"
    ariaLabel={tDynamic("create_action_start_orientation", { hand: handLabel })}
    {ghostKind}
  >
    {#snippet optionContent(value)}
      {@const option = allOrientationOptions.find(
        (item) => item.value === value
      )}
      <span class="orientation-option">
        <i class="fas {option?.icon}" aria-hidden="true"></i>
        <span
          >{option
            ? tDynamic(
                option.value === "in" || option.value === "out"
                  ? `create_ui_orientation_${option.value}_short`
                  : `create_action_orientation_${option.value}_short`
              )
            : ""}</span
        >
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .orientation-control {
    width: 100%;
    max-width: 24rem;
    min-width: 0;
  }

  .orientation-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 52px;
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1.25;
  }

  .orientation-option i {
    font-size: 20px;
    line-height: 1;
  }

  /* Short landscape editors keep the same choices and 44px targets. */
  .compact .orientation-option {
    min-height: 28px;
    gap: 4px;
  }

  .compact .orientation-option i {
    font-size: 16px;
  }
</style>
