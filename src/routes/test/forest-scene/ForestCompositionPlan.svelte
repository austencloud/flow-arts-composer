<script lang="ts">
  import campsiteLayout from "../../../../scripts/forest-campsite-layout.json";
  import compositionPlan from "../../../../scripts/forest-composition-revision.json";
  import pathLayout from "../../../../scripts/forest-path-layout.json";
  import stageLayout from "../../../../scripts/forest-stage-layout.json";
  import staticPropLayout from "../../../../scripts/forest-static-prop-layout.json";
  import treeLayout from "../../../../scripts/forest-tree-layout.json";

  type Point = [number, number];

  const MAP_VIEW_BOX = "-45 -44 104 91";
  const SECTION_VERTICAL_SCALE = 3;

  function point(value: number[]): Point {
    return [value[0] ?? 0, value[1] ?? 0];
  }

  function runtimePoint(value: number[]): Point {
    return [value[0] ?? 0, -(value[1] ?? 0)];
  }

  function translate(value: number[], offset: number[]): Point {
    return [
      (value[0] ?? 0) + (offset[0] ?? 0),
      (value[1] ?? 0) + (offset[1] ?? 0),
    ];
  }

  function pointsAttribute(values: Point[]): string {
    return values.map(([x, y]) => `${x},${y}`).join(" ");
  }

  function harmonicRadius(
    angle: number,
    definition: typeof pathLayout.clearingEdge
  ): number {
    return definition.harmonics.reduce((radius, harmonic) => {
      const phase = angle * harmonic.frequency + harmonic.phase;
      const wave =
        harmonic.function === "cos" ? Math.cos(phase) : Math.sin(phase);
      return radius + harmonic.amplitude * wave;
    }, definition.baseRadius);
  }

  function radialOutline(
    definition: typeof pathLayout.clearingEdge,
    samples = 144
  ): Point[] {
    return Array.from({ length: samples }, (_, index) => {
      const angle = (index / samples) * Math.PI * 2;
      const radius = harmonicRadius(angle, definition);
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  }

  function sightlinePolygon(
    sightline: (typeof compositionPlan.sightlines)[number]
  ): string {
    const [fromX, fromZ] = point(sightline.from);
    const [toX, toZ] = point(sightline.to);
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const angle = Math.atan2(toZ - fromZ, toX - fromX);
    const spread = (sightline.halfAngleDegrees * Math.PI) / 180;
    const left: Point = [
      fromX + Math.cos(angle - spread) * distance,
      fromZ + Math.sin(angle - spread) * distance,
    ];
    const right: Point = [
      fromX + Math.cos(angle + spread) * distance,
      fromZ + Math.sin(angle + spread) * distance,
    ];
    return pointsAttribute([[fromX, fromZ], left, right]);
  }

  function tentRotation(position: number[], firePosition: number[]): number {
    const [tentX, tentZ] = point(position);
    const [fireX, fireZ] = point(firePosition);
    return (Math.atan2(fireZ - tentZ, fireX - tentX) * 180) / Math.PI + 90;
  }

  function treeRadius(assetId: string): number {
    return (
      treeLayout.assets.find((asset) => asset.id === assetId)
        ?.footprintRadius ?? 3
    );
  }

  function sectionPoints(): string {
    return compositionPlan.verticalSection.samples
      .map(point)
      .map(
        ([distance, elevation]) =>
          `${distance},${-elevation * SECTION_VERTICAL_SCALE}`
      )
      .join(" ");
  }

  const clearingOutline = radialOutline(pathLayout.clearingEdge);
  const currentFire = point(
    compositionPlan.campRelocation.previousFirePosition
  );
  const campTranslation = point(compositionPlan.campRelocation.translation);
  const proposedFire = point(campsiteLayout.fire.position);
  const shelfCenter = point(compositionPlan.campRelocation.shelf.center);
  const currentDistance = Math.hypot(...currentFire);
  const proposedDistance = Math.hypot(...proposedFire);
  const stageOutline = stageLayout.deckOutline.map(runtimePoint);
  const contactOutline = stageLayout.contactApronOutline.map(runtimePoint);
  const currentTents = campsiteLayout.tents.map((tent) => ({
    ...tent,
    footprint: point(tent.footprint),
    currentPosition: translate(tent.position, [
      -campTranslation[0],
      -campTranslation[1],
    ]),
  }));
  const proposedTents = campsiteLayout.tents.map((tent) => ({
    ...tent,
    footprint: point(tent.footprint),
    proposedPosition: point(tent.position),
  }));
</script>

<svelte:head>
  <title>Forest composition revision plan</title>
</svelte:head>

<main class="plan-shell">
  <header class="plan-header">
    <div>
      <p class="eyebrow">Gate 10.1 · approved measured composition</p>
      <h1>Forest clearing and campsite revision</h1>
    </div>
    <div class="distance-change" aria-label="Campfire distance from stage">
      <span>{currentDistance.toFixed(1)} m current</span>
      <span aria-hidden="true">→</span>
      <strong>{proposedDistance.toFixed(1)} m approved</strong>
    </div>
  </header>

  <div class="board">
    <section class="map-panel" aria-labelledby="plan-map-title">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Top-down plan · runtime metres</p>
          <h2 id="plan-map-title">
            Stage first. Camp second. Forest depth third.
          </h2>
        </div>
        <div
          class="north-mark"
          aria-label="North and upstage are toward the top"
        >
          <span aria-hidden="true">↑</span>
          <span>N · upstage</span>
        </div>
      </div>

      <svg
        class="plan-map"
        viewBox={MAP_VIEW_BOX}
        role="img"
        aria-labelledby="map-svg-title map-svg-description"
      >
        <title id="map-svg-title"
          >Proposed Forest campsite relocation plan</title
        >
        <desc id="map-svg-description">
          The stage remains at the center of the clearing. The campsite moves
          east from seventeen metres to thirty-four metres from the stage,
          beyond two habitat screens. The south entry keeps a clear view of the
          stage, while the northwest trail provides the final forest-depth view.
        </desc>

        <defs>
          <pattern
            id="meadow-hatch"
            width="2"
            height="2"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 2 L2 0" class="meadow-hatch-line" />
          </pattern>
          <filter id="soft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        <path
          d={`M ${clearingOutline.map(([x, z]) => `${x} ${z}`).join(" L ")} Z`}
          class="clearing-outline"
        />

        {#each treeLayout.clusters as cluster}
          {@const [clusterX, clusterZ] = runtimePoint(cluster.center)}
          <ellipse
            cx={clusterX}
            cy={clusterZ}
            rx={cluster.radii[0]}
            ry={cluster.radii[1]}
            transform={`rotate(${-cluster.rotationDegrees} ${clusterX} ${clusterZ})`}
            class="forest-mass"
          />
        {/each}

        {#each compositionPlan.sightlines as sightline}
          <polygon
            points={sightlinePolygon(sightline)}
            class:primary-sightline={sightline.priority === 1}
            class:secondary-sightline={sightline.priority === 2}
            class:depth-sightline={sightline.priority === 3}
            class="sightline"
          />
        {/each}

        {#each pathLayout.paths as path}
          <polyline
            points={pointsAttribute(path.points.map(runtimePoint))}
            class:camp-path={path.id === "camp-spur"}
            class="existing-path-shoulder"
            style={`stroke-width:${(path.halfWidth + path.shoulderWidth) * 2}`}
          />
          <polyline
            points={pointsAttribute(path.points.map(runtimePoint))}
            class:camp-path={path.id === "camp-spur"}
            class="existing-path-core"
            style={`stroke-width:${path.halfWidth * 2}`}
          />
        {/each}

        <polyline
          points={pointsAttribute(
            compositionPlan.campRelocation.spurExtension.map(point)
          )}
          class="proposed-path-shoulder"
        />
        <polyline
          points={pointsAttribute(
            compositionPlan.campRelocation.spurExtension.map(point)
          )}
          class="proposed-path-core"
        />

        {#each compositionPlan.spatialZones as zone}
          <ellipse
            cx={zone.center[0]}
            cy={zone.center[1]}
            rx={zone.radii[0]}
            ry={zone.radii[1]}
            transform={`rotate(${zone.rotationDegrees} ${zone.center[0]} ${zone.center[1]})`}
            class:open-zone={zone.kind === "open"}
            class:habitat-zone={zone.kind === "habitat"}
            class="spatial-zone"
          />
        {/each}

        <ellipse
          cx={shelfCenter[0]}
          cy={shelfCenter[1]}
          rx={compositionPlan.campRelocation.shelf.radii[0]}
          ry={compositionPlan.campRelocation.shelf.radii[1]}
          transform={`rotate(${compositionPlan.campRelocation.shelf.rotationDegrees} ${shelfCenter[0]} ${shelfCenter[1]})`}
          class="camp-shelf"
        />

        {#each staticPropLayout.frameTrees as tree}
          {@const [treeX, treeZ] = runtimePoint(tree.position)}
          <circle
            cx={treeX}
            cy={treeZ}
            r={treeRadius(tree.assetId)}
            class="frame-tree-crown"
          />
          <circle cx={treeX} cy={treeZ} r="0.65" class="frame-tree-trunk" />
        {/each}

        <g class="current-camp">
          <circle
            cx={currentFire[0]}
            cy={currentFire[1]}
            r={campsiteLayout.fire.clearedFuelRadius}
            class="current-fire-clearance"
          />
          <circle
            cx={currentFire[0]}
            cy={currentFire[1]}
            r="0.85"
            class="current-fire"
          />
          {#each currentTents as tent}
            {@const [tentX, tentZ] = tent.currentPosition}
            <rect
              x={tentX - tent.footprint[0] / 2}
              y={tentZ - tent.footprint[1] / 2}
              width={tent.footprint[0]}
              height={tent.footprint[1]}
              transform={`rotate(${tentRotation(tent.currentPosition, currentFire)} ${tentX} ${tentZ})`}
              class="current-tent"
            />
          {/each}
          <text
            x={currentFire[0] - 1.5}
            y={currentFire[1] + 5.8}
            class="ghost-label"
          >
            previous camp
          </text>
        </g>

        <g class="stage-group">
          <polygon
            points={pointsAttribute(contactOutline)}
            class="stage-contact"
          />
          <polygon points={pointsAttribute(stageOutline)} class="stage-deck" />
          <circle
            cx="0"
            cy="0"
            r={compositionPlan.stage.performanceKeepClearRadiusMetres}
            class="performance-clear"
          />
          <text x="0" y="0.5" class="major-label">STAGE</text>
        </g>

        <g class="proposed-camp">
          <circle
            cx={proposedFire[0]}
            cy={proposedFire[1]}
            r={campsiteLayout.fire.clearedFuelRadius}
            class="proposed-fire-clearance"
          />
          <circle
            cx={proposedFire[0]}
            cy={proposedFire[1]}
            r="1.05"
            class="fire-glow"
            filter="url(#soft-glow)"
          />
          <circle
            cx={proposedFire[0]}
            cy={proposedFire[1]}
            r="0.72"
            class="proposed-fire"
          />
          {#each proposedTents as tent}
            {@const [tentX, tentZ] = tent.proposedPosition}
            <rect
              x={tentX - tent.footprint[0] / 2}
              y={tentZ - tent.footprint[1] / 2}
              width={tent.footprint[0]}
              height={tent.footprint[1]}
              rx="0.45"
              transform={`rotate(${tentRotation(tent.proposedPosition, proposedFire)} ${tentX} ${tentZ})`}
              class="proposed-tent"
            />
          {/each}
        </g>

        <line
          x1="0"
          y1="-1.5"
          x2={proposedFire[0]}
          y2={proposedFire[1] - 1.5}
          class="distance-line"
        />
        <text x="17" y="-1.25" class="distance-label"
          >{proposedDistance.toFixed(1)} m</text
        >

        {#each compositionPlan.spatialZones as zone}
          <text
            x={zone.center[0]}
            y={zone.center[1]}
            class:open-zone-label={zone.kind === "open"}
            class="zone-label"
          >
            {zone.label}
          </text>
        {/each}

        <text x={shelfCenter[0]} y={shelfCenter[1] - 7.3} class="camp-label">
          CAMP POCKET
        </text>

        {#each compositionPlan.route as stop}
          <g
            class="route-marker"
            transform={`translate(${stop.position[0]} ${stop.position[1]})`}
          >
            <circle r="1.45" />
            <text y="0.48">{stop.stop}</text>
          </g>
        {/each}

        <g class="scale-bar" transform="translate(-40 41)">
          <line x1="0" y1="0" x2="10" y2="0" />
          <line x1="0" y1="-0.8" x2="0" y2="0.8" />
          <line x1="10" y1="-0.8" x2="10" y2="0.8" />
          <text x="5" y="-1.1">10 m</text>
        </g>
      </svg>

      <div class="legend" aria-label="Plan legend">
        <span><i class="legend-stage"></i>stage and performance core</span>
        <span><i class="legend-open"></i>open audience ground</span>
        <span><i class="legend-habitat"></i>habitat screen</span>
        <span><i class="legend-camp"></i>approved camp shelf</span>
        <span><i class="legend-current"></i>previous camp</span>
      </div>
    </section>

    <aside class="evidence-column">
      <section class="section-panel" aria-labelledby="section-title">
        <div class="panel-heading compact-heading">
          <div>
            <p class="panel-kicker">Vertical section · 3× vertical</p>
            <h2 id="section-title">Stage to east woodland</h2>
          </div>
        </div>
        <svg
          class="section-drawing"
          viewBox="-10 -9 72 12"
          role="img"
          aria-label="Vertical section from the stage to the raised campsite shelf and outer woodland bank"
        >
          <polyline points={sectionPoints()} class="section-ground" />
          <path
            d={`M ${sectionPoints()} L 58,2.5 L -8,2.5 Z`}
            class="section-ground-fill"
          />
          <rect
            x="-3.2"
            y="-1.65"
            width="6.4"
            height="1.65"
            class="section-stage"
          />
          <line x1="11" y1="0" x2="11" y2="-5.1" class="player-body" />
          <circle cx="11" cy="-5.65" r="0.55" class="player-head" />
          <line x1="9.5" y1="-5.1" x2="12.5" y2="-5.1" class="eye-height" />
          <path d="M 33 -0.75 L 38 -4.05 L 43 -0.75 Z" class="section-tent" />
          <line x1="50" y1="-2.55" x2="50" y2="-8" class="section-tree" />
          <circle cx="50" cy="-8" r="2.4" class="section-tree-crown" />
          <line x1="-8" y1="1.4" x2="30" y2="1.4" class="flat-clearing-line" />
          <text x="0" y="-2.3" class="section-label">0.55 m stage deck</text>
          <text x="38" y="-4.8" class="section-label"
            >0.25 m level camp shelf</text
          >
          <text x="11" y="-6.8" class="section-label">1.70 m eye height</text>
          <text x="11" y="2.25" class="section-dimension"
            >30 m flat terrain budget</text
          >
        </svg>
      </section>

      <section class="hierarchy-panel" aria-labelledby="hierarchy-title">
        <div>
          <p class="panel-kicker">Focal hierarchy</p>
          <h2 id="hierarchy-title">One clearing, three reads</h2>
        </div>
        <div
          class="hierarchy-bars"
          aria-label="Stage first, camp second, forest depth third"
        >
          <div>
            <span>1</span><strong>Stage</strong><i class="hierarchy-stage"></i>
          </div>
          <div>
            <span>2</span><strong>Camp</strong><i class="hierarchy-camp"></i>
          </div>
          <div>
            <span>3</span><strong>Forest depth</strong><i
              class="hierarchy-depth"
            ></i>
          </div>
        </div>
      </section>

      <section class="route-panel" aria-labelledby="route-title">
        <div>
          <p class="panel-kicker">Numbered route</p>
          <h2 id="route-title">What the visitor reads</h2>
        </div>
        <ol class="route-list">
          {#each compositionPlan.route as stop}
            <li>
              <span>{stop.stop}</span>
              <div>
                <strong>{stop.label}</strong>
                <p>{stop.read}</p>
              </div>
            </li>
          {/each}
        </ol>
      </section>
    </aside>
  </div>
</main>

<style>
  .plan-shell {
    --theme-plan-bg: #08130f;
    --theme-plan-bg-raised: #10251c;
    --theme-plan-surface: rgba(13, 35, 25, 0.92);
    --theme-plan-surface-soft: rgba(20, 48, 35, 0.66);
    --theme-plan-line: rgba(224, 235, 210, 0.56);
    --theme-plan-line-soft: rgba(224, 235, 210, 0.2);
    --theme-plan-text: #edf3df;
    --theme-plan-muted: #aebda8;
    --theme-plan-stage: #d6a35e;
    --theme-plan-camp: #f07548;
    --theme-plan-camp-soft: rgba(240, 117, 72, 0.2);
    --theme-plan-open: rgba(163, 191, 105, 0.18);
    --theme-plan-habitat: rgba(69, 126, 83, 0.42);
    --theme-plan-depth: #79a7ae;
    --theme-plan-current: #b6a8a0;
    --settings-plan-gap: clamp(0.75rem, 1.2cqw, 1.5rem);
    position: fixed;
    inset: 0;
    overflow: auto;
    container-type: size;
    color: var(--theme-plan-text);
    background:
      radial-gradient(
        circle at 78% 18%,
        rgba(52, 92, 58, 0.3),
        transparent 34%
      ),
      linear-gradient(
        145deg,
        var(--theme-plan-bg-raised),
        var(--theme-plan-bg) 58%
      );
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .plan-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--settings-plan-gap);
    padding: clamp(1rem, 2cqh, 2.2rem) clamp(1rem, 2cqw, 2.8rem)
      clamp(0.8rem, 1.5cqh, 1.5rem);
    border-bottom: 1px solid var(--theme-plan-line-soft);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 0.22rem;
    font-size: clamp(1.5rem, 2.1cqw, 3.6rem);
    font-weight: 500;
    letter-spacing: -0.025em;
  }

  h2 {
    margin-top: 0.18rem;
    font-size: clamp(1rem, 1.1cqw, 1.55rem);
    font-weight: 500;
  }

  .eyebrow,
  .panel-kicker {
    color: var(--theme-plan-muted);
    font-size: clamp(0.75rem, 0.72cqw, 0.92rem);
    font-weight: 500;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .distance-change {
    display: flex;
    align-items: center;
    gap: clamp(0.5rem, 0.75cqw, 1rem);
    min-height: 2.75rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--theme-plan-line-soft);
    background: var(--theme-plan-surface-soft);
    font-size: clamp(0.875rem, 0.86cqw, 1.15rem);
    white-space: nowrap;
  }

  .distance-change span:first-child {
    color: var(--theme-plan-current);
  }

  .distance-change strong {
    color: var(--theme-plan-camp);
    font-weight: 500;
  }

  .board {
    display: grid;
    grid-template-columns: minmax(0, 2.15fr) minmax(25rem, 0.85fr);
    gap: var(--settings-plan-gap);
    min-height: calc(100cqh - 7.5rem);
    padding: var(--settings-plan-gap) clamp(1rem, 2cqw, 2.8rem)
      clamp(1rem, 2cqh, 2.2rem);
  }

  .map-panel,
  .section-panel,
  .hierarchy-panel,
  .route-panel {
    border: 1px solid var(--theme-plan-line-soft);
    background: var(--theme-plan-surface);
  }

  .map-panel {
    display: flex;
    min-height: 42rem;
    flex-direction: column;
  }

  .panel-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    padding: clamp(0.8rem, 1.1cqw, 1.35rem);
    border-bottom: 1px solid var(--theme-plan-line-soft);
  }

  .compact-heading {
    padding-bottom: 0.8rem;
  }

  .north-mark {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--theme-plan-muted);
    font-size: clamp(0.75rem, 0.7cqw, 0.9rem);
    white-space: nowrap;
  }

  .north-mark span:first-child {
    color: var(--theme-plan-text);
    font-size: 1.6rem;
  }

  .plan-map {
    display: block;
    width: 100%;
    min-height: 0;
    flex: 1;
    background:
      linear-gradient(var(--theme-plan-line-soft) 1px, transparent 1px),
      linear-gradient(90deg, var(--theme-plan-line-soft) 1px, transparent 1px);
    background-size: 5.2% 5.7%;
  }

  .clearing-outline {
    fill: rgba(132, 125, 82, 0.08);
    stroke: var(--theme-plan-line);
    stroke-width: 1.5;
    stroke-dasharray: 5 3;
    vector-effect: non-scaling-stroke;
  }

  .forest-mass {
    fill: rgba(31, 83, 51, 0.28);
    stroke: rgba(117, 156, 119, 0.22);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .sightline {
    stroke: none;
  }

  .primary-sightline {
    fill: rgba(214, 163, 94, 0.13);
  }

  .secondary-sightline {
    fill: rgba(240, 117, 72, 0.1);
  }

  .depth-sightline {
    fill: rgba(121, 167, 174, 0.1);
  }

  .existing-path-shoulder,
  .existing-path-core,
  .proposed-path-shoulder,
  .proposed-path-core {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .existing-path-shoulder {
    stroke: rgba(96, 79, 55, 0.42);
  }

  .existing-path-core {
    stroke: rgba(153, 124, 79, 0.62);
  }

  .camp-path {
    stroke: rgba(184, 138, 82, 0.76);
  }

  .proposed-path-shoulder {
    stroke: rgba(86, 66, 46, 0.78);
    stroke-width: 5.2;
  }

  .proposed-path-core {
    stroke: #b88b57;
    stroke-width: 2.4;
  }

  .spatial-zone {
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .open-zone {
    fill: url(#meadow-hatch);
    stroke: rgba(176, 201, 122, 0.72);
  }

  .meadow-hatch-line {
    fill: none;
    stroke: rgba(176, 201, 122, 0.24);
    stroke-width: 0.35;
  }

  .habitat-zone {
    fill: var(--theme-plan-habitat);
    stroke: rgba(107, 164, 115, 0.78);
  }

  .camp-shelf {
    fill: var(--theme-plan-camp-soft);
    stroke: var(--theme-plan-camp);
    stroke-width: 2;
    stroke-dasharray: 7 3;
    vector-effect: non-scaling-stroke;
  }

  .frame-tree-crown {
    fill: rgba(33, 96, 58, 0.52);
    stroke: rgba(133, 178, 127, 0.62);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  .frame-tree-trunk {
    fill: #65482e;
    stroke: rgba(235, 222, 188, 0.58);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .current-camp {
    opacity: 0.58;
  }

  .current-fire-clearance,
  .current-tent {
    fill: rgba(182, 168, 160, 0.08);
    stroke: var(--theme-plan-current);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
  }

  .current-fire {
    fill: var(--theme-plan-current);
  }

  .ghost-label,
  .zone-label,
  .camp-label,
  .major-label,
  .distance-label,
  .scale-bar text {
    fill: var(--theme-plan-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 1.25px;
    font-weight: 500;
    paint-order: stroke;
    stroke: var(--theme-plan-bg);
    stroke-width: 0.42px;
    text-anchor: middle;
  }

  .ghost-label {
    fill: var(--theme-plan-current);
    font-size: 1.1px;
    text-transform: uppercase;
  }

  .stage-contact {
    fill: rgba(147, 120, 75, 0.58);
    stroke: rgba(221, 200, 158, 0.62);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .stage-deck {
    fill: var(--theme-plan-stage);
    stroke: #f2d49e;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .performance-clear {
    fill: none;
    stroke: rgba(214, 163, 94, 0.62);
    stroke-width: 1.5;
    stroke-dasharray: 3 2;
    vector-effect: non-scaling-stroke;
  }

  .major-label {
    font-size: 1.45px;
    letter-spacing: 0.12em;
  }

  .proposed-fire-clearance {
    fill: rgba(240, 117, 72, 0.08);
    stroke: var(--theme-plan-camp);
    stroke-width: 1.5;
    stroke-dasharray: 4 2;
    vector-effect: non-scaling-stroke;
  }

  .fire-glow {
    fill: rgba(255, 155, 83, 0.7);
  }

  .proposed-fire {
    fill: #ff8b4f;
    stroke: #ffd3ad;
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  .proposed-tent {
    fill: rgba(58, 116, 94, 0.86);
    stroke: #b4d4bd;
    stroke-width: 1.3;
    vector-effect: non-scaling-stroke;
  }

  .distance-line {
    stroke: var(--theme-plan-camp);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
  }

  .distance-label,
  .camp-label {
    fill: var(--theme-plan-camp);
  }

  .zone-label {
    font-size: 1.08px;
  }

  .open-zone-label {
    fill: #d7e8ae;
  }

  .route-marker circle {
    fill: var(--theme-plan-text);
    stroke: var(--theme-plan-bg);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  .route-marker text {
    fill: var(--theme-plan-bg);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 1.25px;
    font-weight: 500;
    text-anchor: middle;
  }

  .scale-bar line {
    stroke: var(--theme-plan-text);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    padding: 0.72rem 1rem;
    border-top: 1px solid var(--theme-plan-line-soft);
    color: var(--theme-plan-muted);
    font-size: clamp(0.75rem, 0.68cqw, 0.9rem);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .legend i {
    width: 0.72rem;
    height: 0.72rem;
    border: 1px solid currentColor;
  }

  .legend-stage {
    color: var(--theme-plan-stage);
    background: var(--theme-plan-stage);
  }

  .legend-open {
    color: #b0c97a;
    background: var(--theme-plan-open);
  }

  .legend-habitat {
    color: #6ba473;
    background: var(--theme-plan-habitat);
  }

  .legend-camp {
    color: var(--theme-plan-camp);
    background: var(--theme-plan-camp-soft);
  }

  .legend-current {
    color: var(--theme-plan-current);
    background: transparent;
    border-style: dashed !important;
  }

  .evidence-column {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: var(--settings-plan-gap);
  }

  .section-drawing {
    display: block;
    width: 100%;
    min-height: 14rem;
    background: rgba(4, 13, 9, 0.34);
  }

  .section-ground {
    fill: none;
    stroke: #98b889;
    stroke-width: 1.6;
    vector-effect: non-scaling-stroke;
  }

  .section-ground-fill {
    fill: rgba(74, 107, 66, 0.42);
  }

  .section-stage {
    fill: var(--theme-plan-stage);
  }

  .player-body,
  .eye-height,
  .section-tree {
    stroke: var(--theme-plan-text);
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }

  .eye-height {
    stroke: var(--theme-plan-depth);
    stroke-dasharray: 2 1;
  }

  .player-head {
    fill: var(--theme-plan-text);
  }

  .section-tent {
    fill: rgba(58, 116, 94, 0.9);
    stroke: #b4d4bd;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .section-tree-crown {
    fill: rgba(50, 112, 69, 0.88);
  }

  .flat-clearing-line {
    stroke: var(--theme-plan-muted);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .section-label,
  .section-dimension {
    fill: var(--theme-plan-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 1.25px;
    paint-order: stroke;
    stroke: var(--theme-plan-bg);
    stroke-width: 0.35px;
    text-anchor: middle;
  }

  .section-dimension {
    fill: var(--theme-plan-muted);
  }

  .hierarchy-panel,
  .route-panel {
    padding: clamp(0.85rem, 1.1cqw, 1.35rem);
  }

  .route-panel {
    display: flex;
    flex-direction: column;
  }

  .hierarchy-bars {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.8rem;
  }

  .hierarchy-bars div {
    display: grid;
    grid-template-columns: 1.4rem 7.4rem 1fr;
    align-items: center;
    gap: 0.55rem;
    min-height: 1.5rem;
    font-size: clamp(0.8rem, 0.76cqw, 0.95rem);
  }

  .hierarchy-bars span {
    color: var(--theme-plan-muted);
  }

  .hierarchy-bars strong {
    font-weight: 500;
  }

  .hierarchy-bars i {
    display: block;
    height: 0.42rem;
    transform-origin: left center;
  }

  .hierarchy-stage {
    background: var(--theme-plan-stage);
    transform: scaleX(1);
  }

  .hierarchy-camp {
    background: var(--theme-plan-camp);
    transform: scaleX(0.7);
  }

  .hierarchy-depth {
    background: var(--theme-plan-depth);
    transform: scaleX(0.45);
  }

  .route-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem 0.9rem;
    margin: 0.9rem 0 0;
    padding: 0;
    list-style: none;
  }

  .route-list li {
    display: grid;
    grid-template-columns: 1.65rem 1fr;
    gap: 0.55rem;
    align-items: start;
  }

  .route-list li > span {
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border: 1px solid var(--theme-plan-line);
    color: var(--theme-plan-text);
    font-size: 0.8rem;
  }

  .route-list strong {
    display: block;
    font-size: clamp(0.8rem, 0.76cqw, 0.95rem);
    font-weight: 500;
  }

  .route-list p {
    margin-top: 0.12rem;
    color: var(--theme-plan-muted);
    font-size: clamp(0.75rem, 0.68cqw, 0.875rem);
    line-height: 1.35;
  }

  @container (max-width: 76rem) {
    .board {
      grid-template-columns: 1fr;
    }

    .map-panel {
      min-height: min(70rem, 82cqh);
    }

    .evidence-column {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
    }

    .route-panel {
      grid-column: 1 / -1;
    }

    .route-list {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @container (max-width: 48rem) {
    .plan-header {
      align-items: start;
      flex-direction: column;
    }

    .distance-change {
      width: 100%;
      justify-content: center;
    }

    .board {
      padding-inline: 0.75rem;
    }

    .map-panel {
      min-height: 34rem;
    }

    .panel-heading {
      align-items: start;
      flex-direction: column;
    }

    .evidence-column {
      grid-template-columns: 1fr;
    }

    .route-panel {
      grid-column: auto;
    }

    .route-list {
      grid-template-columns: 1fr;
    }
  }

  @container (min-width: 160rem) {
    .board {
      grid-template-columns: minmax(0, 2.3fr) minmax(36rem, 0.7fr);
    }

    .route-list {
      grid-template-columns: 1fr;
    }
  }
</style>
