<!--
  Tiny inline SVG showing grid points and hand starting positions.
  Replaces the α/β/γ glyph in the card back bottom-right corner.

  Grid points are drawn as outline circles. Hand positions are filled
  circles in blue (#2E86DE) and red (#E74C3C). The arrangement of
  grid points communicates box vs. diamond mode.
-->
<script lang="ts">
  import type { StartPlacementInfo } from "./card-back-data";

  interface Props {
    info: StartPlacementInfo;
    size?: number;
  }

  let { info, size = 40 }: Props = $props();

  const cx = $derived(size / 2);
  const cy = $derived(size / 2);
  const r = $derived(size * 0.4);
  const dotR = $derived(size * 0.1);
  const centerDotR = $derived(size * 0.04);

  const ANGLES: Record<string, number> = {
    n: -Math.PI / 2,
    ne: -Math.PI / 4,
    e: 0,
    se: Math.PI / 4,
    s: Math.PI / 2,
    sw: (3 * Math.PI) / 4,
    w: Math.PI,
    nw: (-3 * Math.PI) / 4,
  };

  const gridPoints = $derived.by(() => {
    if (info.gridMode === "box") return ["n", "e", "s", "w"];
    if (info.gridMode === "diamond") return ["ne", "se", "sw", "nw"];
    return ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  });

  function pos(direction: string): { x: number; y: number } {
    const angle = ANGLES[direction] ?? 0;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  xmlns="http://www.w3.org/2000/svg"
  aria-label="Starting placement: {info.group ?? 'unknown'}"
>
  <circle cx={cx} cy={cy} r={centerDotR} fill="var(--theme-stroke, rgba(255,255,255,0.3))" />

  {#each gridPoints as dir}
    {@const p = pos(dir)}
    <circle
      cx={p.x}
      cy={p.y}
      r={dotR}
      fill="none"
      stroke="var(--theme-stroke, rgba(255,255,255,0.3))"
      stroke-width="1"
    />
  {/each}

  {#if info.leftLocation && info.rightLocation && info.leftLocation === info.rightLocation}
    <!-- Beta: both hands at same position - render purple dot -->
    {@const bp = pos(info.leftLocation)}
    <circle cx={bp.x} cy={bp.y} r={dotR} fill="#9B59B6" />
  {:else}
    {#if info.leftLocation}
      {@const bp = pos(info.leftLocation)}
      <circle cx={bp.x} cy={bp.y} r={dotR} fill="#2E86DE" />
    {/if}

    {#if info.rightLocation}
      {@const rp = pos(info.rightLocation)}
      <circle cx={rp.x} cy={rp.y} r={dotR} fill="#E74C3C" />
    {/if}
  {/if}
</svg>
