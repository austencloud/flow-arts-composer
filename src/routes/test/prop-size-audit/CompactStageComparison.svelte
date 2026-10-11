<script lang="ts">
  import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    AUTHORED_BIG_FAN_HEIGHT,
    AUTHORED_BIG_FAN_SPAN,
    DEFAULT_FAN_BLEND,
    HAND_ORBIT,
    MAX_FAN_BLEND,
    MIN_FAN_BLEND,
    fanLandingMetrics,
  } from "./compact-stage";

  const CENTER = VIEWBOX_SIZE / 2;
  const BIG_FAN_HREF = "/images/props/animated/bigfan.svg";
  const FAN_HREF = "/images/props/animated/fan.svg";

  let blend = $state(DEFAULT_FAN_BLEND);
  const proposal = $derived(fanLandingMetrics(blend));

  function updateBlend(event: Event): void {
    blend = Number((event.currentTarget as HTMLInputElement).value);
  }

  function gridScaleTransform(scale: number): string {
    return `translate(${CENTER} ${CENTER}) scale(${scale}) translate(${-CENTER} ${-CENTER})`;
  }

  function fanRotationTransform(orbit: number): string {
    return `rotate(180 ${CENTER + orbit} ${CENTER})`;
  }

  function targetX(orbit: number): number {
    return CENTER - orbit;
  }

  function originX(orbit: number): number {
    return CENTER + orbit;
  }
</script>

<section class="comparison" aria-labelledby="fan-landing-title">
  <div class="section-heading">
    <div>
      <span class="eyebrow">Exact spatial contract</span>
      <h2 id="fan-landing-title">Inward edge to opposite hand point</h2>
      <p>
        Only strict animation points are shown. Both examples place the fan at
        the east hand point, orient it IN, and test its far edge against the
        opposite hand point.
      </p>
    </div>
    <div class="landing-status">
      <span>Landing error</span>
      <strong>{proposal.landingError.toFixed(1)} units</strong>
    </div>
  </div>

  <div class="stage-legend" aria-label="Comparison diagram legend">
    <span><i class="strict-swatch"></i>Strict animation points</span>
    <span><i class="path-swatch"></i>Opposite-point span</span>
    <span><i class="target-swatch"></i>Inward landing target</span>
  </div>

  <div class="comparison-grid">
    <figure class="stage-card current-card">
      <figcaption>
        <span class="card-kicker">Authored contract</span>
        <strong>Big Fan · full grid</strong>
        <span>200% fan · 100% grid · IN</span>
      </figcaption>
      <svg
        viewBox="0 0 {VIEWBOX_SIZE} {VIEWBOX_SIZE}"
        role="img"
        aria-label="Authored Big Fan oriented inward from the east strict hand point to the west strict hand point"
        data-stage="current"
      >
        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} class="stage-bg" />
        <g class="production-grid strict-only">
          <GridSvg gridMode={GridMode.DIAMOND} showNonRadialPoints={true} />
        </g>
        <line
          x1={originX(HAND_ORBIT)}
          y1={CENTER}
          x2={targetX(HAND_ORBIT)}
          y2={CENTER}
          class="landing-span"
        />
        <image
          href={BIG_FAN_HREF}
          x={originX(HAND_ORBIT) - AUTHORED_BIG_FAN_SPAN / 2}
          y={CENTER - AUTHORED_BIG_FAN_HEIGHT / 2}
          width={AUTHORED_BIG_FAN_SPAN}
          height={AUTHORED_BIG_FAN_HEIGHT}
          transform={fanRotationTransform(HAND_ORBIT)}
          data-fan="current"
        />
        <circle
          cx={targetX(HAND_ORBIT)}
          cy={CENTER}
          r="20"
          class="landing-target"
          data-target="current"
        />
      </svg>
    </figure>

    <figure class="stage-card proposal-card">
      <figcaption>
        <span class="card-kicker">Proposed continuum</span>
        <strong>Fan · compact grid</strong>
        <span>
          {Math.round(proposal.propScale * 100)}% fan ·
          {Math.round(proposal.stageScale * 100)}% grid · IN
        </span>
      </figcaption>
      <svg
        viewBox="0 0 {VIEWBOX_SIZE} {VIEWBOX_SIZE}"
        role="img"
        aria-label="Regular Fan scaled to {Math.round(
          proposal.propScale * 100
        )} percent and oriented inward on a {Math.round(
          proposal.stageScale * 100
        )} percent strict animation grid"
        data-stage="proposal"
      >
        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} class="stage-bg" />
        <g
          class="production-grid compact strict-only"
          transform={gridScaleTransform(proposal.stageScale)}
          style:--grid-mark-counter-scale={1 / proposal.stageScale}
        >
          <GridSvg gridMode={GridMode.DIAMOND} showNonRadialPoints={true} />
        </g>
        <line
          x1={originX(proposal.compactOrbit)}
          y1={CENTER}
          x2={targetX(proposal.compactOrbit)}
          y2={CENTER}
          class="landing-span"
        />
        <image
          href={FAN_HREF}
          x={originX(proposal.compactOrbit) - proposal.scaledFanSpan / 2}
          y={CENTER - proposal.scaledFanHeight / 2}
          width={proposal.scaledFanSpan}
          height={proposal.scaledFanHeight}
          transform={fanRotationTransform(proposal.compactOrbit)}
          data-fan="proposal"
        />
        <circle
          cx={targetX(proposal.compactOrbit)}
          cy={CENTER}
          r="20"
          class="landing-target"
          data-target="proposal"
        />
      </svg>
    </figure>
  </div>

  <div class="controls-card">
    <div class="slider-heading">
      <div>
        <span class="card-kicker">Exact landing continuum</span>
        <label for="fan-grid-blend">Meet the fan and grid in the middle</label>
      </div>
      <button type="button" onclick={() => (blend = DEFAULT_FAN_BLEND)}>
        Reset to 150% / 75%
      </button>
    </div>
    <input
      id="fan-grid-blend"
      type="range"
      min={MIN_FAN_BLEND}
      max={MAX_FAN_BLEND}
      step="0.01"
      value={proposal.blend}
      oninput={updateBlend}
    />
    <div class="scale-axis" aria-hidden="true">
      <span>200% fan · 100% grid</span>
      <span>100% fan · 50% grid</span>
    </div>

    <div class="metric-row" aria-live="polite">
      <div>
        <span>Fan scale</span>
        <strong>{Math.round(proposal.propScale * 100)}%</strong>
      </div>
      <div>
        <span>Grid scale</span>
        <strong>{Math.round(proposal.stageScale * 100)}%</strong>
      </div>
      <div>
        <span>Inward reach</span>
        <strong>{proposal.inwardFanReach.toFixed(1)} units</strong>
      </div>
      <p>
        The fan edge and the opposite strict hand point remain coincident across
        the entire control.
      </p>
    </div>
  </div>
</section>

<style>
  .comparison {
    container-type: inline-size;
    max-width: 162.5rem;
    margin: 0 auto 3rem;
    color: var(--theme-text, #e8e6f4);
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 1.25rem;
  }

  .eyebrow,
  .card-kicker {
    display: block;
    color: var(--theme-accent, #9b8cff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25rem 0 0.35rem;
    font-size: clamp(1.35rem, 2.5cqi, 2rem);
    line-height: 1.1;
  }

  .section-heading p {
    max-width: 54rem;
    margin: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .landing-status {
    flex: 0 0 auto;
    min-width: 9.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, #78dca0 52%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, #78dca0 8%, transparent);
    text-align: right;
  }

  .landing-status span {
    display: block;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .landing-status strong {
    display: block;
    color: var(--semantic-success, #78dca0);
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }

  .stage-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem 1.1rem;
    margin: 0 0 0.85rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .stage-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .stage-legend i {
    display: inline-block;
    width: 1.25rem;
    height: 0.5rem;
  }

  .strict-swatch {
    border-radius: 999px;
    background: #d0d0d0;
  }

  .path-swatch {
    border-top: 2px dashed rgba(255, 255, 255, 0.4);
  }

  .target-swatch {
    border: 2px solid var(--semantic-success, #78dca0);
    border-radius: 999px;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .stage-card {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 1rem;
    background: var(--theme-card-bg, #101018);
  }

  .proposal-card {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #9b8cff) 55%,
      transparent
    );
  }

  figcaption {
    display: grid;
    min-height: 5.5rem;
    align-content: center;
    gap: 0.15rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  figcaption strong {
    font-size: 1.05rem;
  }

  figcaption > span:last-child {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }

  .stage-bg {
    fill: var(--theme-panel-bg, #0c0c13);
  }

  .production-grid {
    color: #d0d0d0;
  }

  .production-grid :global(.normal-hand-point),
  .production-grid :global(.normal-layer2-point) {
    opacity: 0 !important;
  }

  .production-grid :global(.strict-hand-point),
  .production-grid :global(.strict-layer2-point) {
    fill: #d0d0d0 !important;
    opacity: 1 !important;
  }

  .production-grid.compact :global(circle) {
    transform: scale(var(--grid-mark-counter-scale));
    transform-box: fill-box;
    transform-origin: center;
  }

  .landing-span {
    stroke: rgba(255, 255, 255, 0.28);
    stroke-width: 3;
    stroke-dasharray: 10 12;
    vector-effect: non-scaling-stroke;
  }

  .landing-target {
    fill: color-mix(in srgb, #78dca0 12%, transparent);
    stroke: var(--semantic-success, #78dca0);
    stroke-width: 4;
    vector-effect: non-scaling-stroke;
  }

  .controls-card {
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .slider-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.7rem;
  }

  .slider-heading label {
    display: block;
    margin-top: 0.2rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
  }

  .slider-heading button {
    min-height: 44px;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.75rem;
    background: transparent;
    color: var(--theme-text, #e8e6f4);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    cursor: pointer;
  }

  .slider-heading button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #9b8cff) 65%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #9b8cff) 12%,
      transparent
    );
  }

  .slider-heading button:focus-visible,
  input[type="range"]:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #9b8cff) 55%, transparent);
    outline-offset: 2px;
  }

  input[type="range"] {
    width: 100%;
    min-height: 44px;
    margin: 0;
    accent-color: var(--theme-accent, #9b8cff);
    cursor: pointer;
  }

  .scale-axis {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: -0.4rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .scale-axis span:last-child {
    text-align: right;
  }

  .metric-row {
    display: grid;
    grid-template-columns: repeat(3, auto) minmax(15rem, 1fr);
    align-items: center;
    gap: 1rem 1.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .metric-row > div {
    display: grid;
    gap: 0.1rem;
  }

  .metric-row span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .metric-row strong {
    color: var(--semantic-success, #78dca0);
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .metric-row p {
    margin: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  @container (max-width: 44rem) {
    .section-heading,
    .slider-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .landing-status {
      align-self: flex-start;
      text-align: left;
    }

    .comparison-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .metric-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .metric-row p {
      grid-column: 1 / -1;
    }
  }

  @container (max-width: 28rem) {
    .section-heading {
      gap: 0.85rem;
    }

    .controls-card {
      padding: 0.85rem;
    }

    .metric-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .metric-row p {
      grid-column: 1 / -1;
    }
  }
</style>
