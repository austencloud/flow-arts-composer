<!--
  Half-Arrow Positioning — Phase 2a Visual Proof

  Renders the seven guide half-motions' `_half` arrow glyphs at their real
  pipeline-computed [x, y, rotation] (calculateArrowPoint → getArrowSvgPath),
  over the same diamond-grid dot layout LiftedTurnFrame uses, so Austen can
  eyeball fidelity against the guide's drawn frames.

  This page's correctness is a screenshot (Phase 2b), not an assertion — the
  numbers themselves are already proven exact against the poseAt ground-truth
  oracle by half-arrow-pipeline.test.ts (../../lib/shared/pictograph/arrow/
  positioning/__tests__/half-arrow-pipeline.test.ts). The TARGETS list below is
  kept in lockstep with that test's TARGETS.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { calculateArrowPoint } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.js";
  import { getArrowSvgPath } from "#lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.js";
  import { calculateOrientationAt } from "#lib/shared/animation-engine/services/orientation-at.js";
  import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

  type Target = {
    name: string;
    motionType: MotionType;
    start: GridLocation;
    end: GridLocation;
    halfwayLoc: GridLocation;
    turns: number;
  };

  // Same seven half-motions as half-arrow-pipeline.test.ts (all RED, staff,
  // diamond, CLOCKWISE, IN→IN across the full motion). The two "ANTI E→S t2"
  // entries share identical inputs by design — see the test's comment.
  const TARGETS: Target[] = [
    {
      name: "PRO E→S t1",
      motionType: MotionType.PRO,
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      halfwayLoc: GridLocation.SOUTHEAST,
      turns: 1,
    },
    {
      name: "ANTI E→S t1",
      motionType: MotionType.ANTI,
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      halfwayLoc: GridLocation.SOUTHEAST,
      turns: 1,
    },
    {
      name: "PRO E→S t2",
      motionType: MotionType.PRO,
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      halfwayLoc: GridLocation.SOUTHEAST,
      turns: 2,
    },
    {
      name: "ANTI E→S t2 (a)",
      motionType: MotionType.ANTI,
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      halfwayLoc: GridLocation.SOUTHEAST,
      turns: 2,
    },
    {
      name: "ANTI E→S t2 (b, dup)",
      motionType: MotionType.ANTI,
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      halfwayLoc: GridLocation.SOUTHEAST,
      turns: 2,
    },
    {
      name: "DASH S→N t2",
      motionType: MotionType.DASH,
      start: GridLocation.SOUTH,
      end: GridLocation.NORTH,
      halfwayLoc: GridLocation.CENTER,
      turns: 2,
    },
    {
      name: "STATIC E→E t2",
      motionType: MotionType.STATIC,
      start: GridLocation.EAST,
      end: GridLocation.EAST,
      halfwayLoc: GridLocation.EAST,
      turns: 2,
    },
  ];

  // Diamond hand-point dots (same coords as LiftedTurnFrame's 950 viewBox grid).
  const HAND_POINTS = [
    { cx: 475, cy: 331.9 }, // N
    { cx: 618.1, cy: 475 }, // E
    { cx: 475, cy: 618.1 }, // S
    { cx: 331.9, cy: 475 }, // W
  ];
  const INTERCARDINAL_POINTS = [
    { cx: 618.1, cy: 331.9 }, // NE
    { cx: 618.1, cy: 618.1 }, // SE
    { cx: 331.9, cy: 618.1 }, // SW
    { cx: 331.9, cy: 331.9 }, // NW
  ];
  const CENTER_POINT = { cx: 475, cy: 475 };

  type Cell = {
    name: string;
    x: number;
    y: number;
    rotation: number;
    href: string;
  };

  let cells = $state<Cell[]>([]);
  let skipped = $state<string[]>([]);
  let buildError = $state<string | null>(null);

  onMount(async () => {
    const built: Cell[] = [];
    const skippedNames: string[] = [];

    for (const t of TARGETS) {
      try {
        const halfwayOri = calculateOrientationAt(
          {
            motionType: t.motionType,
            rotationDirection: RotationDirection.CLOCKWISE,
            startLocation: t.start,
            endLocation: t.end,
            startOrientation: Orientation.IN,
            endOrientation: Orientation.IN,
            turns: t.turns,
          },
          0.5
        );

        if (!halfwayOri) {
          console.warn(
            `[half-arrows] ${t.name}: halfway orientation is null (off-lattice) — skipping`
          );
          skippedNames.push(t.name);
          continue;
        }

        const motion = createMotionData({
          motionType: t.motionType,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: t.start,
          endLocation: t.halfwayLoc,
          startOrientation: Orientation.IN,
          endOrientation: halfwayOri,
          turns: t.turns,
          hand: HandSide.RIGHT,
          segment: { t0: 0, t1: 0.5 },
        });

        const picto = {
          letter: null,
          gridMode: motion.gridMode,
          motions: { right: motion, left: undefined },
        } as unknown as PictographData;

        const [x, y, rotation] = await calculateArrowPoint(picto, motion);

        built.push({
          name: t.name,
          x,
          y,
          rotation,
          href: getArrowSvgPath(motion),
        });
      } catch (e) {
        console.error(`[half-arrows] ${t.name}: failed to build cell`, e);
        skippedNames.push(t.name);
      }
    }

    cells = built;
    skipped = skippedNames;
  });
</script>

<div class="page">
  <h1>Half-Arrow Positioning — Phase 2a Visual Proof</h1>
  <p class="subtitle">
    Each cell places one guide half-motion's <code>_half</code> arrow glyph at
    its real pipeline-computed position + rotation (<code
      >calculateArrowPoint</code
    >
    → <code>getArrowSvgPath</code>), over the same diamond hand-point dots
    <code>LiftedTurnFrame</code>
    draws. The numbers are already proven exact against the guide's physical
    staff angle by <code>half-arrow-pipeline.test.ts</code> — this page is the human
    eyeball check ahead of Phase 2b's authored pixel nudges.
  </p>

  {#if buildError}
    <p class="error">Failed to build cells: {buildError}</p>
  {/if}

  {#if skipped.length > 0}
    <p class="warning">
      Skipped (off-lattice or build error): {skipped.join(", ")}
    </p>
  {/if}

  {#if cells.length === 0 && skipped.length === 0 && !buildError}
    <p class="loading">Computing cells…</p>
  {/if}

  <div class="grid">
    {#each cells as cell (cell.name)}
      <div class="cell">
        <div class="label">{cell.name}</div>
        <svg viewBox="0 0 950 950" class="stage" aria-hidden="true">
          <g class="grid-dots">
            {#each HAND_POINTS as p (p.cx + "-" + p.cy)}
              <circle cx={p.cx} cy={p.cy} r="12" />
            {/each}
            {#each INTERCARDINAL_POINTS as p (p.cx + "-" + p.cy)}
              <circle cx={p.cx} cy={p.cy} r="8" class="intercardinal" />
            {/each}
            <circle cx={CENTER_POINT.cx} cy={CENTER_POINT.cy} r="5.8" />
          </g>
          <image
            href={cell.href}
            width="120"
            height="120"
            x="-60"
            y="-60"
            transform={`translate(${cell.x} ${cell.y}) rotate(${cell.rotation})`}
          />
          <circle cx={cell.x} cy={cell.y} r="4" class="anchor" />
        </svg>
        <div class="readout">
          x={cell.x.toFixed(1)}, y={cell.y.toFixed(1)}, rotation={cell.rotation.toFixed(
            1
          )}°
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 24px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: white;
  }

  h1 {
    text-align: center;
    margin: 0 0 8px;
  }

  .subtitle {
    max-width: 760px;
    margin: 0 auto 24px;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  .subtitle code {
    background: rgba(255, 255, 255, 0.1);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .error {
    max-width: 760px;
    margin: 0 auto 16px;
    text-align: center;
    color: #ff8a8a;
  }

  .warning {
    max-width: 760px;
    margin: 0 auto 16px;
    text-align: center;
    color: #ffd27a;
  }

  .loading {
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .cell {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }

  .label {
    font-weight: 600;
    font-size: 1.05rem;
    margin-bottom: 10px;
    color: #a855f7;
  }

  .stage {
    width: 100%;
    aspect-ratio: 1;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .grid-dots circle {
    fill: rgba(255, 255, 255, 0.55);
  }

  .grid-dots circle.intercardinal {
    fill: rgba(255, 255, 255, 0.25);
  }

  .anchor {
    fill: #ffd27a;
  }

  .readout {
    margin-top: 10px;
    font-family: monospace;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
