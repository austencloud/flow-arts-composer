<!--
  TransformVisualMapping.svelte

  Visual data representation of what each transform does.
  Shows mappings as chips in a centered, flowing layout.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TransformId } from "../../domain/transforms/transform-help-content";

  interface Props {
    transformId: TransformId;
  }

  let { transformId }: Props = $props();

  // All chips for each transform - flat list, no categories
  const mappings: Record<
    TransformId,
    Array<{ from: string; to: string; type?: "blue" | "red" }>
  > = {
    mirror: [
      { from: "W", to: "E" },
      { from: "NW", to: "NE" },
      { from: "SW", to: "SE" },
      { from: "CW", to: "CCW" },
    ],
    flip: [
      { from: "N", to: "S" },
      { from: "NW", to: "SW" },
      { from: "NE", to: "SE" },
      { from: "CW", to: "CCW" },
    ],
    invert: [
      { from: "CW", to: "CCW" },
      { from: "Pro", to: "Anti" },
    ],
    rotate: [
      { from: "N", to: "NE" },
      { from: "E", to: "SE" },
      { from: "S", to: "SW" },
      { from: "W", to: "NW" },
    ],
    swap: [{ from: "left", to: "right", type: "blue" }],
    rewind: [
      { from: "start", to: "end" },
      { from: "CW", to: "CCW" },
    ],
  };

  const chips = $derived(mappings[transformId] ?? []);

  function chipLabel(label: string): string {
    switch (label) {
      case "left": return t("guide_l2_print_left");
      case "right": return t("guide_l2_print_right");
      case "start": return t("guide_l2_frame_start");
      case "end": return t("guide_l2_frame_end");
      default: return label;
    }
  }
</script>

<div class="visual-mapping">
  {#each chips as chip}
    <div class="chip">
      <span class="from" class:blue={chip.type === "blue"}>{chipLabel(chip.from)}</span>
      <span class="arrow">↔</span>
      <span class="to" class:red={chip.type === "blue"}>{chipLabel(chip.to)}</span>
    </div>
  {/each}
</div>

<style>
  .visual-mapping {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 20px;
    font-size: var(--font-size-min, 14px);
    font-family: var(--font-mono, monospace);
  }

  .from,
  .to {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .arrow {
    color: rgba(255, 255, 255, 0.75); /* AAA contrast: ~6:1 */
    font-size: 14px; /* AAA minimum text size */
  }

  /* Color coding for swap - lighter shades for AAA contrast */
  .from.blue {
    color: #93c5fd; /* AAA contrast: ~8:1 */
  }

  .to.red {
    color: #fca5a5; /* AAA contrast: ~7:1 */
  }
</style>
