<!--
LOOPFilterChip.svelte - Dropdown chip for LOOP component filtering.
Color-coded icons per primitive. Rotated splits into halved/quartered.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import FilterChipBase from "./FilterChipBase.svelte";
  import ChipPopoverOption from "./ChipPopoverOption.svelte";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { LOOP_COMPONENT_MAP } from "$lib/shared/browse/domain/constants/loop-constants";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";

  interface Props {
    activeValue: string | null;
    loopTypeCounts: Readonly<Record<string, number>>;
    onSelect: (value: string | null) => void;
  }

  let { activeValue, loopTypeCounts, onSelect }: Props = $props();

  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;
  });

  interface LOOPFilterOption {
    value: string | null;
    label: string;
    icon: string;
    color: string;
    count?: number;
  }

  const rotatedInfo = LOOP_COMPONENT_MAP.get(LOOPComponent.ROTATED)!;

  const filterOptions: LOOPFilterOption[] = [
    { value: null, label: "All", icon: "", color: "" },
    {
      value: "component:rotated_halved",
      label: "Rotated (halved)",
      icon: "fas fa-rotate",
      color: rotatedInfo.color,
    },
    {
      value: "component:rotated_quartered",
      label: "Rotated (quartered)",
      icon: "fas fa-arrows-spin",
      color: rotatedInfo.color,
    },
    ...[
      LOOPComponent.MIRRORED,
      LOOPComponent.FLIPPED,
      LOOPComponent.SWAPPED,
      LOOPComponent.INVERTED,
      LOOPComponent.REWOUND,
    ].map((comp) => {
      const info = LOOP_COMPONENT_MAP.get(comp)!;
      return {
        value: `component:${comp}`,
        label: info.label,
        icon: `fas fa-${info.icon}`,
        color: info.color,
      };
    }),
  ];

  const selectedOption = $derived(
    filterOptions.find((o) => o.value === activeValue) ?? filterOptions[0]
  );

  const chipLabel = $derived(
    activeValue ? (selectedOption?.label ?? "LOOP") : "LOOP"
  );

  const chipColor = $derived(
    activeValue ? (selectedOption?.color ?? "#8b5cf6") : "#8b5cf6"
  );

  const isActive = $derived(activeValue !== null);

  const optionsWithCounts = $derived.by(() => {
    if (!isOpen) return filterOptions;
    return filterOptions.map((opt) => ({
      ...opt,
      count: opt.value ? (loopTypeCounts[opt.value] ?? 0) : undefined,
    }));
  });

  function handleToggle() {
    isOpen = !isOpen;
  }

  function handleSelect(value: string | null) {
    hapticService?.trigger("selection");
    onSelect(value);
    isOpen = false;
  }

  function handlePointerDownOutside(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".loop-chip-wrapper")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (!isOpen) return;
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  });
</script>

<div class="loop-chip-wrapper">
  <FilterChipBase
    label={chipLabel}
    icon="fas fa-sync-alt"
    active={isActive}
    chipColor={chipColor}
    mode="dropdown"
    expanded={isOpen}
    ondismiss={() => (isOpen = false)}
    onclick={handleToggle}
    ghostKind="browse-filter"
  >
    {#snippet children()}
      {#each optionsWithCounts as option}
        <ChipPopoverOption
          label={option.label}
          icon={option.icon || undefined}
          color={option.color || undefined}
          selected={activeValue === option.value}
          count={option.count ?? null}
          ghostKind="filter-option"
          onclick={() => handleSelect(option.value)}
        />
      {/each}
    {/snippet}
  </FilterChipBase>
</div>

<style>
  /* "All" carries no component colour of its own, so it falls back to the
     chip's violet rather than the global accent. Every other row overrides
     this with its own LOOP-component colour. */
  .loop-chip-wrapper {
    --chip-option-color: #8b5cf6;
    position: relative;
  }
</style>
