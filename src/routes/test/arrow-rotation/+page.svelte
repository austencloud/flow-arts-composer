<!--
  Arrow Rotation Debug Page

  Renders REAL pictographs from the sequence index to debug rotation issues.
  Uses actual X pictographs with static CW arrows at different locations.
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    MotionType,
    RotationDirection,
    Orientation,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  // Helper to convert lowercase location string to GridLocation enum
  function toGridLocation(loc: string): GridLocation {
    const map: Record<string, GridLocation> = {
      n: GridLocation.NORTH,
      e: GridLocation.EAST,
      s: GridLocation.SOUTH,
      w: GridLocation.WEST,
      ne: GridLocation.NORTHEAST,
      se: GridLocation.SOUTHEAST,
      sw: GridLocation.SOUTHWEST,
      nw: GridLocation.NORTHWEST,
    };
    return map[loc] || GridLocation.NORTH;
  }

  // Helper to convert lowercase orientation string to Orientation enum
  function toOrientation(ori: string): Orientation {
    const map: Record<string, Orientation> = {
      in: Orientation.IN,
      out: Orientation.OUT,
      clock: Orientation.CLOCK,
      counter: Orientation.COUNTER,
    };
    return map[ori] || Orientation.IN;
  }

  // Helper to convert lowercase rotation direction string to RotationDirection enum
  function toRotationDirection(dir: string): RotationDirection {
    const map: Record<string, RotationDirection> = {
      cw: RotationDirection.CLOCKWISE,
      ccw: RotationDirection.COUNTER_CLOCKWISE,
      norotation: RotationDirection.NO_ROTATION,
    };
    return (
      map[dir.toLowerCase().replace("_", "")] || RotationDirection.NO_ROTATION
    );
  }

  // Helper to convert lowercase motion type string to MotionType enum
  function toMotionType(type: string): MotionType {
    const map: Record<string, MotionType> = {
      static: MotionType.STATIC,
      pro: MotionType.PRO,
      anti: MotionType.ANTI,
      dash: MotionType.DASH,
      float: MotionType.FLOAT,
    };
    return map[type] || MotionType.STATIC;
  }

  // Real pictograph data from sequence index
  // These are actual X pictographs with static CW red arrows at different locations

  // X at EAST - red static CW at east, blue anti ccw from s to w
  const xAtEast: PictographData = {
    id: "x-at-east",
    letter: Letter.X,
    startPlacement: GridPlacement.GAMMA11,
    endPlacement: GridPlacement.ALPHA3,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.SOUTHWEST,
        gridMode: GridMode.DIAMOND,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.EAST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.EAST,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };

  // X at WEST - red static CW at west, blue anti ccw from n to e
  const xAtWest: PictographData = {
    id: "x-at-west",
    letter: Letter.X,
    startPlacement: GridPlacement.GAMMA15,
    endPlacement: GridPlacement.ALPHA7,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.NORTHEAST,
        gridMode: GridMode.DIAMOND,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.WEST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.WEST,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };

  // X at NORTH - red static CW at north, blue anti ccw from e to s
  const xAtNorth: PictographData = {
    id: "x-at-north",
    letter: Letter.X,
    startPlacement: GridPlacement.GAMMA9,
    endPlacement: GridPlacement.ALPHA1,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.SOUTH,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.SOUTHEAST,
        gridMode: GridMode.DIAMOND,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.NORTH,
        turns: 1,
        endOrientation: Orientation.IN,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.NORTH,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };

  // Θ (box) — the disputed instance: blue static SE turns=1 (in→out), red pro SE→NE ccw.
  // Left arrow shows rotationAngle 45° with "Rotation Override: YES".
  // Normal staticRadialCounterClockwise map at SE = 135°; the (s,0,1) special-placement
  // override forces 45° instead — the 90° swing the user is questioning.
  const thetaBoxSE: PictographData = {
    id: "theta-box-se",
    letter: Letter.THETA,
    startPlacement: GridPlacement.BETA4,
    endPlacement: GridPlacement.GAMMA10,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTHEAST,
        endLocation: GridLocation.SOUTHEAST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.SOUTHEAST,
        gridMode: GridMode.BOX,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTHEAST,
        endLocation: GridLocation.NORTHEAST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.EAST,
        gridMode: GridMode.BOX,
      }),
    },
  };

  // Θ (box) at SW — blue static SW turns=1 (in→out), red pro SW→SE ccw.
  const thetaBoxSW: PictographData = {
    id: "theta-box-sw",
    letter: Letter.THETA,
    startPlacement: GridPlacement.BETA6,
    endPlacement: GridPlacement.GAMMA12,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTHWEST,
        endLocation: GridLocation.SOUTHWEST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.SOUTHWEST,
        gridMode: GridMode.BOX,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTHWEST,
        endLocation: GridLocation.SOUTHEAST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.SOUTH,
        gridMode: GridMode.BOX,
      }),
    },
  };

  // Θ (box) at NE — blue static NE turns=1 (in→out), red pro NE→NW ccw.
  const thetaBoxNE: PictographData = {
    id: "theta-box-ne",
    letter: Letter.THETA,
    startPlacement: GridPlacement.BETA2,
    endPlacement: GridPlacement.GAMMA4,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTHEAST,
        endLocation: GridLocation.NORTHEAST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.NORTHEAST,
        gridMode: GridMode.BOX,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTHEAST,
        endLocation: GridLocation.NORTHWEST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.NORTH,
        gridMode: GridMode.BOX,
      }),
    },
  };

  // Θ (box) at NW — blue static NW turns=1 (in→out), red pro NW→SW ccw.
  const thetaBoxNW: PictographData = {
    id: "theta-box-nw",
    letter: Letter.THETA,
    startPlacement: GridPlacement.BETA8,
    endPlacement: GridPlacement.GAMMA16,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.STATIC,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTHWEST,
        endLocation: GridLocation.NORTHWEST,
        turns: 1,
        endOrientation: Orientation.OUT,
        hand: HandSide.LEFT,
        arrowLocation: GridLocation.NORTHWEST,
        gridMode: GridMode.BOX,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTHWEST,
        endLocation: GridLocation.SOUTHWEST,
        turns: 0,
        endOrientation: Orientation.IN,
        hand: HandSide.RIGHT,
        arrowLocation: GridLocation.WEST,
        gridMode: GridMode.BOX,
      }),
    },
  };

  // Expected angles from staticRadialClockwiseMap
  const expectedAngles: Record<string, number> = {
    n: 0,
    e: 90,
    s: 180,
    w: 270,
    ne: 45,
    se: 135,
    sw: 225,
    nw: 315,
  };

  const testPictographs = [
    {
      id: "east",
      label: "X at EAST",
      pictograph: xAtEast,
      staticLocation: "e",
      expectedAngle: expectedAngles.e,
      description: "Right static CW at East, Left anti CCW S→W",
    },
    {
      id: "west",
      label: "X at WEST",
      pictograph: xAtWest,
      staticLocation: "w",
      expectedAngle: expectedAngles.w,
      description: "Right static CW at West, Left anti CCW N→E",
    },
    {
      id: "north",
      label: "X at NORTH",
      pictograph: xAtNorth,
      staticLocation: "n",
      expectedAngle: expectedAngles.n,
      description: "Right static CW at North, Left anti CCW E→S",
    },
    {
      id: "theta-box-se",
      label: "Θ (box) SE — fixed",
      pictograph: thetaBoxSE,
      staticLocation: "se",
      expectedAngle: 315,
      description: "Left static SE turns=1 in→out (ccw). Override now 315°.",
    },
    {
      id: "theta-box-sw",
      label: "Θ (box) SW — fixed",
      pictograph: thetaBoxSW,
      staticLocation: "sw",
      expectedAngle: 45,
      description:
        "Left static SW turns=1 in→out (ccw). Override 315→45° (CW 90).",
    },
    {
      id: "theta-box-ne",
      label: "Θ (box) NE — fixed",
      pictograph: thetaBoxNE,
      staticLocation: "ne",
      expectedAngle: 225,
      description:
        "Left static NE turns=1 in→out (ccw). Override 135→225° (CW 90).",
    },
    {
      id: "theta-box-nw",
      label: "Θ (box) NW — fixed",
      pictograph: thetaBoxNW,
      staticLocation: "nw",
      expectedAngle: 135,
      description:
        "Left static NW turns=1 in→out (ccw). Override 225→135° (CCW 90).",
    },
  ];
</script>

<div class="debug-page">
  <h1>Arrow Rotation Debug - Real Pictographs</h1>
  <p class="subtitle">
    Using actual X pictographs from sequence index with static CW red arrows
  </p>

  <div class="legend">
    <p><strong>Expected angles (staticRadialClockwiseMap):</strong></p>
    <code>N=0° | E=90° | S=180° | W=270°</code>
  </div>

  <div class="grid">
    {#each testPictographs as { id, label, pictograph, staticLocation, expectedAngle, description }}
      <div class="cell">
        <div class="label">{label}</div>
        <div class="description">{description}</div>
        <div class="pictograph-container">
          <PictographContainer pictographData={pictograph} />
        </div>
        <div class="info">
          <span>Static at: <strong>{staticLocation.toUpperCase()}</strong></span
          >
          <span>Expected rotation: <strong>{expectedAngle}°</strong></span>
        </div>
      </div>
    {/each}
  </div>

  <div class="instructions">
    <h2>How to Debug</h2>
    <ol>
      <li>Open browser console (F12)</li>
      <li>Look for <code>🔄 [StaticRotation]</code> messages</li>
      <li>
        Compare the <code>mapAngle</code> in logs to expected angles above
      </li>
      <li>The red arrow should visually "curl" clockwise from its position</li>
      <li>
        If the angle is correct but visual is wrong → SVG or mirroring issue
      </li>
      <li>If the angle is wrong → rotation map or lookup issue</li>
    </ol>

    <h2>What to Look For</h2>
    <ul>
      <li>
        <strong>EAST (90°):</strong> Arrow should point right/down (curling CW from
        east)
      </li>
      <li>
        <strong>WEST (270°):</strong> Arrow should point left/up (curling CW from
        west)
      </li>
      <li>
        <strong>NORTH (0°):</strong> Arrow should point up/right (curling CW from
        north)
      </li>
    </ul>
  </div>
</div>

<style>
  .debug-page {
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
    text-align: center;
    color: var(--theme-text-dim);
    margin: 0 0 24px;
  }

  .legend {
    text-align: center;
    margin-bottom: 24px;
    padding: 12px;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .legend code {
    font-family: monospace;
    color: var(--semantic-success);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 1200px;
    margin: 0 auto 32px;
  }

  .cell {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }

  .label {
    font-weight: 600;
    font-size: 1.1rem;
    margin-bottom: 4px;
    color: #a855f7;
  }

  .description {
    font-size: 0.85rem;
    color: var(--theme-text-dim);
    margin-bottom: 12px;
  }

  .pictograph-container {
    width: 280px;
    height: 280px;
    margin: 0 auto;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }

  .info {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    color: var(--theme-text-dim);
  }

  .info strong {
    color: var(--semantic-success);
  }

  .instructions {
    max-width: 700px;
    margin: 0 auto;
    padding: 20px;
    background: var(--theme-card-bg);
    border-radius: 12px;
  }

  .instructions h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .instructions ol,
  .instructions ul {
    margin: 0 0 16px;
    padding-left: 20px;
  }

  .instructions li {
    margin-bottom: 8px;
    color: rgba(255, 255, 255, 0.8);
  }

  .instructions code {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
