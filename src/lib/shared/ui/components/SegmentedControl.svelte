<script lang="ts" generics="T extends string">
  import type { Snippet } from "svelte";
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";
  import { SegmentedControl as SharedSegmentedControl } from "@austencloud/ui";

  interface Option {
    value: T;
    label: string;
    shortLabel?: string;
    ariaLabel?: string;
    icon?: string | IconDefinition;
    count?: number | null;
    disabled?: boolean;
    tone?: "blue" | "red" | "both" | "accent";
    id?: string;
    controls?: string;
  }
  interface Props {
    options: Option[];
    value: T;
    onchange: (value: T) => void;
    color?: "blue" | "red" | "accent";
    size?: "sm" | "md";
    density?: "standard" | "compact" | "tight";
    columns?: number;
    ariaLabel?: string;
    ariaLabelledby?: string;
    semantics?: "button-group" | "tabs" | "radiogroup";
    optionContent?: Snippet<[T]>;
    toggleOnActivate?: boolean;
    ghostKind?: "turn" | "option-filter" | "tempo" | "curio" | "step-edit";
  }
  let {
    options,
    value,
    onchange,
    color = "blue",
    size = "md",
    density = "standard",
    columns,
    ariaLabel,
    ariaLabelledby,
    semantics = "button-group",
    optionContent,
    toggleOnActivate = false,
    ghostKind,
  }: Props = $props();

  const sharedOptions = $derived(
    options.map((option) => ({
      ...option,
      tone: option.tone ?? color,
      count: null,
    }))
  );
  const tokens = [
    "--ui-surface: var(--theme-card-bg, rgba(255,255,255,.05))",
    "--ui-surface-hover: var(--theme-card-hover-bg, rgba(255,255,255,.12))",
    "--ui-stroke: var(--theme-stroke, rgba(255,255,255,.12))",
    "--ui-text: var(--theme-text, white)",
    "--ui-focus: var(--theme-accent, #8b6cff)",
    "--ui-accent: var(--theme-accent, #8b6cff)",
    "--ui-segment-selected-bg: var(--theme-accent, #8b6cff)",
    // Every tone selects with a wash over the surface, so the name stays in the
    // theme's text colour (dark on the light theme), as before the shared control.
    "--ui-segment-selected-text: var(--segmented-selected-ink, var(--theme-text, white))",
    "--ui-tone-blue-wash: var(--dm-motion-blue-wash, color-mix(in srgb, var(--dm-motion-blue, #3575e2) 25%, var(--theme-card-bg)))",
    "--ui-tone-red-wash: var(--dm-motion-red-wash, color-mix(in srgb, var(--dm-motion-red, #ed1c24) 25%, var(--theme-card-bg)))",
    "--ui-tone-both-wash: var(--dm-motion-both-wash, color-mix(in srgb, var(--dm-motion-blue, #3575e2) 20%, var(--theme-card-bg)))",
    "--ui-tone-accent-wash: color-mix(in srgb, var(--theme-accent, #8b6cff) 25%, var(--theme-card-bg))",
    "--ui-motion-duration: var(--duration-normal, 180ms)",
  ].join("; ");
</script>

<SharedSegmentedControl
  options={sharedOptions}
  {value}
  {onchange}
  {size}
  {density}
  {columns}
  {ariaLabel}
  {ariaLabelledby}
  {semantics}
  {toggleOnActivate}
  {ghostKind}
  class="segmented-control {size} {density} {color}"
  optionClass="segment"
  style={tokens}
  optionContent={segmentContent}
/>

{#snippet segmentContent(optionValue: T)}
  {@const option = options.find((candidate) => candidate.value === optionValue)}
  <span class="segment-label">
    {#if optionContent}
      {@render optionContent(optionValue)}
    {:else if option?.icon}
      {#if typeof option.icon === "string"}
        <i class={option.icon} aria-hidden="true"></i>
      {:else}
        <Icon icon={option.icon} />
      {/if}
    {:else}
      {option?.shortLabel ?? option?.label ?? optionValue}
    {/if}
  </span>
  {#if option?.count != null}<span class="segment-count">{option.count}</span
    >{/if}
{/snippet}

<style>
  .segment-count {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-width: 1.1rem;
    padding: 0.05rem 0.3rem;
    border-radius: 99px;
    background: color-mix(in srgb, currentColor 14%, transparent);
    font-size: max(12px, var(--font-size-compact, 12px));
  }
</style>
