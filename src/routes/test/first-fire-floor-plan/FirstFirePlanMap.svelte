<script lang="ts">
  import type { Point2 } from "#lib/features/museum/data/drowned-gallery-terrain.js";
  import type {
    FireProcessionPathSection,
    FirstFireProcessionPlan,
    FirstFireShrineId,
  } from "#lib/features/museum/data/first-fire-procession-plan.js";
  import type { ReviewStage } from "./first-fire-review";

  type ShrineVisualState = "flame" | "coals" | "off";

  interface Props {
    plan: FirstFireProcessionPlan;
    reviewStage: ReviewStage;
  }

  let { plan, reviewStage }: Props = $props();

  const METRES_TO_PLAN_UNITS = 20;
  const roomWidth = $derived(plan.room.maxX - plan.room.minX);
  const roomDepth = $derived(plan.room.maxZ - plan.room.minZ);

  const stageRank: Record<Exclude<ReviewStage, "overview">, number> = {
    threshold: 0,
    dj: 1,
    ek: 2,
    fl: 3,
    earth: 4,
  };

  const shrineRank: Record<FirstFireShrineId, number> = {
    dj: 1,
    ek: 2,
    fl: 3,
  };

  const stageSections = $derived<Record<ReviewStage, string[]>>({
    overview: plan.pathSections.map((section) => section.id),
    threshold: [
      "water-steam-threshold",
      "ember-bridge",
      "torch-lane-to-dj",
    ],
    dj: ["torch-lane-to-dj", "dj-mouth-in", "dj-orbit", "dj-mouth-out"],
    ek: ["dj-to-ek", "ek-mouth-in", "ek-orbit", "ek-mouth-out"],
    fl: ["ek-to-fl", "fl-mouth-in", "fl-orbit", "fl-mouth-out"],
    earth: ["earth-growth-path"],
  });

  function mapX(value: number): number {
    return (value - plan.room.minX) * METRES_TO_PLAN_UNITS;
  }

  function mapZ(value: number): number {
    return (value - plan.room.minZ) * METRES_TO_PLAN_UNITS;
  }

  function pointList(points: readonly Point2[]): string {
    return points.map((point) => `${mapX(point.x)},${mapZ(point.z)}`).join(" ");
  }

  function sectionIsActive(section: FireProcessionPathSection): boolean {
    return stageSections[reviewStage].includes(section.id);
  }

  function shrineIsFocused(shrineId: FirstFireShrineId): boolean {
    return reviewStage === "overview" || reviewStage === shrineId;
  }

  function shrineState(shrineId: FirstFireShrineId): ShrineVisualState {
    if (reviewStage === "overview" || reviewStage === "threshold") {
      return "flame";
    }
    if (reviewStage === "earth") return "off";

    const currentRank = stageRank[reviewStage];
    const currentShrineRank = shrineRank[shrineId];
    if (currentShrineRank < currentRank) return "coals";
    return "flame";
  }

  function shrineStateLabel(shrineId: FirstFireShrineId): string {
    const state = shrineState(shrineId);
    if (state === "coals") return "LOW COALS";
    if (state === "off") return "COLD";
    return reviewStage === shrineId ? "ACTIVE FIRE" : "TALL FIRE";
  }
</script>

<div class="plan-scroll" tabindex="0" aria-label="Scrollable floor plan">
  <svg
    class="floor-plan"
    viewBox="-50 -50 1300 700"
    role="img"
    aria-labelledby="floor-plan-svg-title floor-plan-svg-description"
  >
    <title id="floor-plan-svg-title">
      First Fire Torch Procession floor plan
    </title>
    <desc id="floor-plan-svg-description">
      A sixty by thirty metre cave room. The visitor enters from Water at the
      west door, follows an S-shaped route around the DJ, EK, and FL fire
      shrines, then exits east toward Earth. Alternating rock ribs block shared
      performer sightlines.
    </desc>

    <defs>
      <pattern
        id="first-fire-grid"
        width={5 * METRES_TO_PLAN_UNITS}
        height={5 * METRES_TO_PLAN_UNITS}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M ${5 * METRES_TO_PLAN_UNITS} 0 L 0 0 0 ${5 * METRES_TO_PLAN_UNITS}`}
          fill="none"
          stroke="rgba(255, 237, 213, 0.1)"
          stroke-width="1"
        />
      </pattern>

      <pattern
        id="first-fire-rock"
        width="18"
        height="18"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(28)"
      >
        <rect width="18" height="18" fill="#211a18" />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="18"
          stroke="#5b433a"
          stroke-width="4"
          opacity="0.42"
        />
      </pattern>

      <radialGradient id="first-fire-core" cx="50%" cy="38%" r="62%">
        <stop offset="0%" stop-color="#fff4c2" />
        <stop offset="32%" stop-color="#ffb020" />
        <stop offset="72%" stop-color="#ef4a23" />
        <stop offset="100%" stop-color="#7f1d1d" />
      </radialGradient>

      <linearGradient id="first-fire-steam" x1="0" x2="1">
        <stop offset="0%" stop-color="#88c9d8" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#e8dbcf" stop-opacity="0.05" />
      </linearGradient>

      <filter id="first-fire-glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <marker
        id="first-fire-route-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f7d08a" />
      </marker>
    </defs>

    <rect
      x="0"
      y="0"
      width={roomWidth * METRES_TO_PLAN_UNITS}
      height={roomDepth * METRES_TO_PLAN_UNITS}
      rx="18"
      class="room-floor"
    />
    <rect
      x="0"
      y="0"
      width={roomWidth * METRES_TO_PLAN_UNITS}
      height={roomDepth * METRES_TO_PLAN_UNITS}
      rx="18"
      fill="url(#first-fire-grid)"
      class="room-grid"
    />

    <rect
      x="0"
      y={mapZ(plan.westDoor.min) - 32}
      width={10 * METRES_TO_PLAN_UNITS}
      height={(plan.westDoor.max - plan.westDoor.min) * METRES_TO_PLAN_UNITS +
        64}
      fill="url(#first-fire-steam)"
      class:stage-emphasis={reviewStage === "threshold"}
      class="steam-wash"
    />

    {#each plan.pathSections as section (section.id)}
      <polyline
        points={pointList(section.points)}
        fill="none"
        stroke-width={section.width * METRES_TO_PLAN_UNITS}
        stroke-linecap="round"
        stroke-linejoin="round"
        class="path-bed"
        class:growth-bed={section.kind === "growth-path"}
        class:active-section={sectionIsActive(section)}
        class:muted-section={reviewStage !== "overview" &&
          !sectionIsActive(section)}
      />
    {/each}

    {#each plan.occluders as occluder (occluder.id)}
      <g class="occluder">
        <rect
          x={mapX(occluder.rect.minX)}
          y={mapZ(occluder.rect.minZ)}
          width={(occluder.rect.maxX - occluder.rect.minX) *
            METRES_TO_PLAN_UNITS}
          height={(occluder.rect.maxZ - occluder.rect.minZ) *
            METRES_TO_PLAN_UNITS}
          rx={occluder.kind === "torch-curtain" ? 6 : 12}
          class:torch-curtain={occluder.kind === "torch-curtain"}
        />
        <title>
          {occluder.kind === "rock-rib"
            ? "Rock sightline blocker"
            : "Entry torch curtain"}
        </title>
      </g>
    {/each}

    <g class="blocked-sightlines" aria-hidden="true">
      <line
        x1={mapX(plan.shrines[0]!.centre.x)}
        y1={mapZ(plan.shrines[0]!.centre.z)}
        x2={mapX(plan.shrines[1]!.centre.x)}
        y2={mapZ(plan.shrines[1]!.centre.z)}
      />
      <line
        x1={mapX(plan.shrines[1]!.centre.x)}
        y1={mapZ(plan.shrines[1]!.centre.z)}
        x2={mapX(plan.shrines[2]!.centre.x)}
        y2={mapZ(plan.shrines[2]!.centre.z)}
      />
    </g>

    {#each plan.pathSections as section (section.id)}
      <polyline
        points={pointList(section.points)}
        fill="none"
        marker-end={section.id === "earth-growth-path"
          ? "url(#first-fire-route-arrow)"
          : undefined}
        class="route-centreline"
        class:growth-line={section.kind === "growth-path"}
        class:active-section={sectionIsActive(section)}
        class:muted-section={reviewStage !== "overview" &&
          !sectionIsActive(section)}
      />
    {/each}

    {#each plan.shrines as shrine (shrine.id)}
      <g
        class="shrine"
        class:focus-shrine={shrineIsFocused(shrine.id)}
        class:muted-shrine={!shrineIsFocused(shrine.id) &&
          reviewStage !== "earth"}
        data-state={shrineState(shrine.id)}
        transform={`translate(${mapX(shrine.centre.x)} ${mapZ(shrine.centre.z)})`}
      >
        <circle
          class="trench"
          r={((shrine.trenchInnerRadius + shrine.trenchOuterRadius) / 2) *
            METRES_TO_PLAN_UNITS}
          stroke-width={(shrine.trenchOuterRadius - shrine.trenchInnerRadius) *
            METRES_TO_PLAN_UNITS}
        />
        <circle
          class="habitat"
          r={shrine.habitatRadius * METRES_TO_PLAN_UNITS}
        />
        <circle class="performer" r="18" />
        <path class="performer-mark" d="M -8 0 L 0 -11 L 8 0 L 0 11 Z" />
        <text class="shrine-label" y="-7">{shrine.label}</text>
        <text class="shrine-state" y="78">
          {shrineStateLabel(shrine.id)}
        </text>
        {#if reviewStage === "earth" && shrine.id === "fl"}
          <circle
            class="earth-ring"
            r={(shrine.trenchOuterRadius + 0.55) * METRES_TO_PLAN_UNITS}
          />
        {/if}
      </g>
    {/each}

    <g class="door-label west-door">
      <line
        x1="0"
        y1={mapZ(plan.westDoor.min)}
        x2="0"
        y2={mapZ(plan.westDoor.max)}
      />
      <text x="18" y={mapZ(plan.westDoor.min) - 16}>WATER</text>
      <text x="18" y={mapZ(plan.westDoor.max) + 30}>STEAM THRESHOLD</text>
    </g>

    <g class="door-label east-door">
      <line
        x1={roomWidth * METRES_TO_PLAN_UNITS}
        y1={mapZ(plan.eastDoor.min)}
        x2={roomWidth * METRES_TO_PLAN_UNITS}
        y2={mapZ(plan.eastDoor.max)}
      />
      <text
        x={roomWidth * METRES_TO_PLAN_UNITS - 18}
        y={mapZ(plan.eastDoor.min) - 16}>EARTH</text
      >
      <text
        x={roomWidth * METRES_TO_PLAN_UNITS - 18}
        y={mapZ(plan.eastDoor.min) - 42}>GROWTH PATH</text
      >
    </g>

    <g class="scale-mark" transform="translate(30 560)">
      <line x1="0" y1="0" x2={5 * METRES_TO_PLAN_UNITS} y2="0" />
      <line x1="0" y1="-7" x2="0" y2="7" />
      <line
        x1={5 * METRES_TO_PLAN_UNITS}
        y1="-7"
        x2={5 * METRES_TO_PLAN_UNITS}
        y2="7"
      />
      <text x={2.5 * METRES_TO_PLAN_UNITS} y="24">5 METRES</text>
    </g>

    <text class="north-mark" x="30" y="42">N ↑</text>
  </svg>
</div>

<style>
  .plan-scroll {
    overflow-x: auto;
    border: 1px solid rgba(255, 226, 196, 0.13);
    border-radius: 0.85rem;
    background: #080706;
    scrollbar-color: #7c2d12 #15110e;
  }

  .plan-scroll:focus-visible {
    outline: 2px solid #fb923c;
    outline-offset: 3px;
  }

  .floor-plan {
    display: block;
    inline-size: 100%;
    block-size: auto;
    min-inline-size: 46rem;
    background:
      radial-gradient(
        circle at 50% 45%,
        rgba(87, 43, 25, 0.1),
        transparent 58%
      ),
      #080706;
  }

  .room-floor {
    fill: #13100e;
    stroke: #8b6754;
    stroke-width: 5;
  }

  .room-grid {
    stroke: rgba(255, 237, 213, 0.06);
    stroke-width: 1;
  }

  .steam-wash {
    opacity: 0.42;
    transition: opacity 180ms ease;
  }

  .steam-wash.stage-emphasis {
    opacity: 1;
  }

  .path-bed {
    stroke: rgba(105, 79, 61, 0.5);
    transition:
      opacity 180ms ease,
      stroke 180ms ease;
  }

  .path-bed.active-section {
    stroke: rgba(154, 112, 75, 0.74);
  }

  .path-bed.growth-bed {
    stroke: rgba(54, 83, 37, 0.24);
  }

  .path-bed.growth-bed.active-section {
    stroke: rgba(75, 112, 49, 0.7);
  }

  .route-centreline {
    stroke: #f7d08a;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 10 11;
    transition:
      opacity 180ms ease,
      stroke 180ms ease,
      filter 180ms ease;
  }

  .route-centreline.active-section {
    stroke: #ffe1a6;
    stroke-width: 6;
    filter: drop-shadow(0 0 7px rgba(255, 184, 77, 0.48));
  }

  .growth-line {
    stroke: #4d7c0f;
  }

  .growth-line.active-section {
    stroke: #84cc16;
    filter: drop-shadow(0 0 8px rgba(132, 204, 22, 0.52));
  }

  .muted-section {
    opacity: 0.15;
  }

  .occluder rect {
    fill: url(#first-fire-rock);
    stroke: #725548;
    stroke-width: 3;
  }

  .occluder rect.torch-curtain {
    fill: rgba(127, 29, 29, 0.46);
    stroke: #ea580c;
    stroke-dasharray: 7 6;
    filter: drop-shadow(0 0 6px rgba(234, 88, 12, 0.48));
  }

  .blocked-sightlines line {
    stroke: rgba(253, 186, 116, 0.22);
    stroke-width: 2;
    stroke-dasharray: 7 7;
  }

  .shrine {
    transition: opacity 180ms ease;
  }

  .shrine.muted-shrine {
    opacity: 0.46;
  }

  .shrine.focus-shrine .habitat {
    stroke: #f7d08a;
    stroke-width: 4;
  }

  .habitat {
    fill: #241914;
    stroke: #7d5b48;
    stroke-width: 3;
    transition: stroke 180ms ease;
  }

  .trench {
    fill: none;
    transition:
      stroke 180ms ease,
      opacity 180ms ease,
      filter 180ms ease;
  }

  .shrine[data-state="flame"] .trench {
    stroke: #ef4a23;
    filter: url(#first-fire-glow);
  }

  .shrine[data-state="coals"] .trench {
    stroke: #7c2d12;
    opacity: 0.78;
  }

  .shrine[data-state="off"] .trench {
    stroke: #403632;
    opacity: 0.9;
  }

  .performer {
    fill: url(#first-fire-core);
    stroke: #fff1cf;
    stroke-width: 2;
    transition:
      fill 180ms ease,
      stroke 180ms ease;
  }

  .shrine[data-state="off"] .performer {
    fill: #71806c;
    stroke: #a9bd9d;
  }

  .performer-mark {
    fill: #371109;
  }

  .shrine[data-state="off"] .performer-mark {
    fill: #263224;
  }

  .shrine-label,
  .shrine-state,
  .door-label text,
  .scale-mark text,
  .north-mark {
    fill: #fff4e6;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    paint-order: stroke;
    stroke: rgba(8, 7, 6, 0.88);
    stroke-width: 5;
    stroke-linejoin: round;
    text-anchor: middle;
  }

  .shrine-label {
    font-size: 17px;
    font-weight: 820;
  }

  .shrine-state {
    fill: #f5c9ac;
    font-size: 12px;
    font-weight: 760;
    letter-spacing: 1.8px;
  }

  .earth-ring {
    fill: none;
    stroke: #84cc16;
    stroke-width: 10;
    stroke-dasharray: 5 7;
    filter: drop-shadow(0 0 9px rgba(132, 204, 22, 0.72));
  }

  .door-label line {
    stroke: #f7d08a;
    stroke-width: 12;
  }

  .door-label text {
    font-size: 13px;
    font-weight: 760;
    letter-spacing: 1.6px;
    text-anchor: start;
  }

  .east-door text {
    text-anchor: end;
  }

  .scale-mark line {
    stroke: #d6b68c;
    stroke-width: 3;
  }

  .scale-mark text,
  .north-mark {
    fill: #bda990;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.2px;
  }

  .north-mark {
    text-anchor: start;
  }

  @media (prefers-reduced-motion: reduce) {
    .steam-wash,
    .path-bed,
    .route-centreline,
    .shrine,
    .habitat,
    .trench,
    .performer {
      transition: none;
    }
  }
</style>
