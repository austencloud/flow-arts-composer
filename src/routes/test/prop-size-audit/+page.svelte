<!--
  Prop size audit

  Every animated prop drawn at TRUE animation-canvas scale against the engine
  grid, so a prop that reads awkward is visibly awkward rather than a number in
  a table.

  Each cell is a 950-unit viewBox — the animation canvas's own coordinate space
  (VIEWBOX_SIZE). The hand orbit ring is radius 150 (ENGINE_GRID_RADIUS); the
  prop sits on the east hand point at 1:1, exactly the size the canvas draws it.
  The dashed ring is the mandala radius that prop produces: hand orbit + its
  furthest tip. Mandala scale is fixed, not fit-to-content, so that ring IS how
  big its mandala comes out. A ring near the canvas edge means a mandala that
  crowds or clips.

  The club is the tuned reference — its ring is the one every regular prop
  should be sitting near.
-->
<script lang="ts">
  import { page } from "$app/state";
  import PropPickerReview from "./PropPickerReview.svelte";
  import FireFanFidelityReview from "./FireFanFidelityReview.svelte";
  import CompactStageComparison from "./CompactStageComparison.svelte";
  import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";
  import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
  import {
    CLUB_TIP_REACH,
    getTipPointsBaseline,
  } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
  import {
    getAllPropTypes,
    getPropTypeDisplayInfo,
    isPropActive,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { propTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  const CENTER = VIEWBOX_SIZE / 2;
  const HAND_ORBIT = 150;
  // The reference: the club's furthest tip. Every regular prop is tuned to sit
  // near this.
  const CLUB_REACH = CLUB_TIP_REACH;

  /** Mirrors resolvePropSvgPath in svg-generator.ts — keep the two in step. */
  function propSvgHref(type: string): string {
    const t = type.toLowerCase();
    const animatedOnly =
      t === "torch" ||
      t === "bigtorch" ||
      t === "triquetra2" ||
      t.startsWith("sword-");
    return `/images/props/${animatedOnly ? "animated" : "pictograph"}/${t}.svg`;
  }

  interface Row {
    type: PropType;
    label: string;
    href: string;
    width: number;
    height: number;
    reach: number;
    ends: 1 | 2;
    /** How far off the club's reach, as a signed percentage. */
    drift: number;
  }

  const rows: Row[] = getAllPropTypes()
    .filter(isPropActive)
    .map((type) => {
      const { width, height } = getPropDimensions(type);
      const points = getTipPointsBaseline(type).points;
      const reach = points.length
        ? Math.max(...points.map((p) => Math.hypot(p.dx, p.dy)))
        : 0;
      return {
        type,
        label: getPropTypeDisplayInfo(type).label,
        href: propSvgHref(type),
        width,
        height,
        reach,
        ends: propTipEnds(type),
        drift: reach === 0 ? 0 : ((reach - CLUB_REACH) / CLUB_REACH) * 100,
      };
    })
    .sort((a, b) => a.reach - b.reach);

  let showBig = $state(true);
  const reviewingPicker = $derived(
    page.url.searchParams.get("review") === "picker"
  );
  const reviewingFireFans = $derived(
    page.url.searchParams.get("review") === "fire-fans"
  );
  const visible = $derived(
    showBig ? rows : rows.filter((r) => !r.type.toString().startsWith("big"))
  );

  function driftClass(r: Row): string {
    if (r.reach === 0) return "none";
    const d = Math.abs(r.drift);
    if (d <= 5) return "on";
    if (d <= 25) return "near";
    return "off";
  }
</script>

<svelte:head
  ><title
    >{reviewingPicker
      ? "Prop Picker Review"
      : reviewingFireFans
        ? "Fire Fan Fidelity Review"
        : "Prop size audit"}</title
  ></svelte:head
>

{#if reviewingPicker}
  <PropPickerReview />
{:else if reviewingFireFans}
  <FireFanFidelityReview />
{/if}

<div class="page" class:review-hidden={reviewingPicker || reviewingFireFans}>
  <header>
    <h1>Prop size audit</h1>
    <p>
      The fan gate tests inward landing on strict animation points. The full
      inventory below keeps true 950-unit prop dimensions and the club reach
      reference.
    </p>
  </header>

  <CompactStageComparison />

  <div class="inventory-heading">
    <div>
      <span>Full inventory</span>
      <h2>Every active prop at production scale</h2>
    </div>
    <button class="toggle" onclick={() => (showBig = !showBig)}>
      {showBig ? "Hide" : "Show"} big variants
    </button>
  </div>

  <div class="grid">
    {#each visible as r (r.type)}
      <figure class="cell" class:reference={r.type.toString() === "club"}>
        <svg
          viewBox="0 0 {VIEWBOX_SIZE} {VIEWBOX_SIZE}"
          role="img"
          aria-label={r.label}
        >
          <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} class="bg" />
          <!-- Mandala radius this prop produces -->
          {#if r.reach > 0}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={HAND_ORBIT + r.reach}
              class="reach-ring {driftClass(r)}"
            />
          {/if}
          <!-- Club reference ring, on every cell so drift is readable at a glance -->
          <circle
            cx={CENTER}
            cy={CENTER}
            r={HAND_ORBIT + CLUB_REACH}
            class="ref-ring"
          />
          <!-- Hand orbit -->
          <circle cx={CENTER} cy={CENTER} r={HAND_ORBIT} class="orbit" />
          <circle cx={CENTER + HAND_ORBIT} cy={CENTER} r="6" class="hand" />
          <!-- The prop, drawn exactly as the canvas draws it: centred on the
               hand point at 1:1 in this 950 space. -->
          <image
            href={r.href}
            x={CENTER + HAND_ORBIT - r.width / 2}
            y={CENTER - r.height / 2}
            width={r.width}
            height={r.height}
          />
        </svg>
        <figcaption>
          <span class="name">{r.label}</span>
          <span class="meta">
            {r.width}×{r.height} · reach {Math.round(r.reach)} ·
            {r.ends === 2 ? "bilateral" : "unilateral"}
          </span>
          <span class="drift {driftClass(r)}">
            {r.reach === 0
              ? "no tips"
              : `${r.drift >= 0 ? "+" : ""}${r.drift.toFixed(0)}% vs club`}
          </span>
        </figcaption>
      </figure>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e8e6f4;
    padding: 2rem clamp(1rem, 3vw, 3rem) 4rem;
    font-family: system-ui, sans-serif;
  }

  .review-hidden {
    display: none;
  }

  header {
    max-width: 60rem;
    margin: 0 auto 2rem;
    text-align: center;
  }

  h1 {
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    margin: 0 0 0.5rem;
  }

  header p {
    color: rgba(255, 255, 255, 0.55);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  .inventory-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    max-width: 2600px;
    margin: 0 auto 1rem;
  }

  .inventory-heading span {
    color: var(--theme-accent, #9b8cff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .inventory-heading h2 {
    margin: 0.25rem 0 0;
    font-size: clamp(1.2rem, 2vw, 1.65rem);
  }

  .toggle {
    min-height: 44px;
    padding: 0.625rem 1.25rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.07);
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  /* Fixed counts per tier, never auto-fill — an orphan row is the thing this
     page exists to spot, so the page itself shouldn't have one. */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: clamp(1rem, 1.5vw, 2rem);
    max-width: 2600px;
    margin: 0 auto;
  }

  @media (min-width: 700px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (min-width: 1100px) {
    .grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  @media (min-width: 1680px) {
    .grid {
      grid-template-columns: repeat(6, 1fr);
    }
  }
  @media (min-width: 2600px) {
    .grid {
      grid-template-columns: repeat(8, 1fr);
    }
  }

  @media (max-width: 560px) {
    .inventory-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .toggle {
      align-self: flex-start;
    }
  }

  .cell {
    margin: 0;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  .cell.reference {
    border-color: rgba(120, 220, 160, 0.5);
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .bg {
    fill: #101018;
  }
  .orbit {
    fill: none;
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 2;
  }
  .hand {
    fill: rgba(255, 255, 255, 0.45);
  }
  .ref-ring {
    fill: none;
    stroke: rgba(120, 220, 160, 0.35);
    stroke-width: 2;
  }
  .reach-ring {
    fill: none;
    stroke-width: 4;
    stroke-dasharray: 14 10;
  }
  .reach-ring.on {
    stroke: rgba(120, 220, 160, 0.9);
  }
  .reach-ring.near {
    stroke: rgba(240, 200, 90, 0.9);
  }
  .reach-ring.off {
    stroke: rgba(240, 110, 110, 0.9);
  }

  figcaption {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.625rem 0.75rem 0.75rem;
  }

  .name {
    font-weight: 700;
    font-size: 0.95rem;
  }
  .meta {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    font-variant-numeric: tabular-nums;
  }
  .drift {
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .drift.on {
    color: rgb(120, 220, 160);
  }
  .drift.near {
    color: rgb(240, 200, 90);
  }
  .drift.off {
    color: rgb(240, 110, 110);
  }
  .drift.none {
    color: rgba(255, 255, 255, 0.3);
  }
</style>
