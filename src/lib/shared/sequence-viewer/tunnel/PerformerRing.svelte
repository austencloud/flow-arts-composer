<!--
  PerformerRing — the schematic, countable cast of a tunnel config.

  A tiny inline SVG: one blue+red hand-dot pair per performer (= per rendered
  copy), placed around a ring. Fold spaces the base performers; Mirror/Flip each
  seat a reflected twin on a tighter concentric ring, so every one of the
  `imageCount` copies is a distinct, countable dot-pair. Changing a count-builder
  springs twins in/out; a motion toggle changes nothing here (its dots never
  appear), which is the "motion is free" teaching moment.

  Sibling of card-back/StartPlacementMiniGrid (same blue/red hand convention);
  count/twin structure comes from performer-ring-model.
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { scale } from "svelte/transition";
  import type { TunnelConfig } from "./tunnel-config";
  import { performerRing, depthRadiusFraction } from "./performer-ring-model";

  let {
    config,
    size = 96,
    animate = true,
  }: { config: TunnelConfig; size?: number; animate?: boolean } = $props();

  const reduced = $derived(
    browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dur = $derived(animate && !reduced ? 260 : 0);

  const cx = $derived(size / 2);
  const cy = $derived(size / 2);
  const ringR = $derived(size * 0.4);
  const endR = $derived(size * 0.052); // blue/red hand cap radius
  const staffHalf = $derived(size * 0.075); // half the staff body length

  const performers = $derived(performerRing(config));

  /** Center of one performer on the ring. */
  function centerOf(angleDeg: number, depth: number) {
    const a = (angleDeg * Math.PI) / 180;
    const r = ringR * depthRadiusFraction(depth);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), a };
  }

  /** One performer = a little staff: a bar with a blue end and a red end,
   *  laid tangent to the ring. Count staves = performers; count ends = props. */
  function hands(angleDeg: number, depth: number) {
    const c = centerOf(angleDeg, depth);
    const tx = -Math.sin(c.a);
    const ty = Math.cos(c.a);
    return {
      left: { x: c.x + tx * staffHalf, y: c.y + ty * staffHalf },
      right: { x: c.x - tx * staffHalf, y: c.y - ty * staffHalf },
    };
  }
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="{performers.length} performers"
>
  <!-- Guide ring + center -->
  <circle
    cx={cx}
    cy={cy}
    r={ringR}
    fill="none"
    stroke="var(--theme-stroke-strong, rgba(255,255,255,0.22))"
    stroke-width="1"
  />
  <circle cx={cx} cy={cy} r={size * 0.028} fill="var(--theme-text-dim, rgba(255,255,255,0.4))" />

  {#each performers as p (p.id)}
    {@const h = hands(p.angleDeg, p.depth)}
    {@const c = centerOf(p.angleDeg, p.depth)}
    <g
      class="performer"
      style="transform-box: fill-box; transform-origin: center;"
      transition:scale={{ duration: dur, start: 0.3 }}
    >
      {#if p.id === "f0"}
        <!-- The base performer ("you") — the seed everything multiplies from. -->
        <circle
          class="halo"
          cx={c.x}
          cy={c.y}
          r={staffHalf + endR + size * 0.022}
          fill="none"
          stroke="var(--theme-accent, #c79bff)"
          stroke-width="1.75"
          opacity="0.95"
        />
      {/if}
      <!-- Staff body (the prop) — bright neutral so it reads on a dark stage. -->
      <line
        x1={h.left.x}
        y1={h.left.y}
        x2={h.right.x}
        y2={h.right.y}
        stroke="var(--theme-text, rgba(255,255,255,0.85))"
        stroke-width={endR * 0.8}
        stroke-linecap="round"
        opacity="0.75"
      />
      <!-- Hand ends (blue thumb / red pinky), semantic prop colors. -->
      <circle class="end" cx={h.left.x} cy={h.left.y} r={endR} fill="var(--prop-blue, #2E86DE)" />
      <circle class="end" cx={h.right.x} cy={h.right.y} r={endR} fill="var(--prop-red, #E74C3C)" />
    </g>
  {/each}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
  }
  /* Light seat on the hand ends ONLY (not the accent "you" halo) so overlapping
     twins on tighter rings stay separated, and the dots pop off a dark stage.
     paint-order keeps the fill on top of the seat for a clean edge. */
  .performer :global(circle.end) {
    stroke: rgba(255, 255, 255, 0.45);
    stroke-width: 0.75;
    paint-order: stroke;
  }
</style>
