<script lang="ts">
  import plan from "../../../../scripts/winter-composition-gate1-r2.json";

  type Point = [number, number];

  const MAP_VIEW_BOX = "-54 -50 108 100";
  const current = plan.currentArrangement;
  const proposed = plan.proposedArrangement;

  function point(value: number[]): Point {
    return [value[0] ?? 0, value[1] ?? 0];
  }

  function pointsAttribute(values: number[][]): string {
    return values.map(([x = 0, z = 0]) => `${x},${z}`).join(" ");
  }

  function distance(left: number[], right: number[]): number {
    return Math.hypot(
      (right[0] ?? 0) - (left[0] ?? 0),
      (right[1] ?? 0) - (left[1] ?? 0)
    );
  }

  function sightlinePolygon(
    sightline: (typeof plan.sightlines)[number]
  ): string {
    const [fromX, fromZ] = point(sightline.from);
    const [toX, toZ] = point(sightline.to);
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    const angle = Math.atan2(toZ - fromZ, toX - fromX);
    const spread = (sightline.halfAngleDegrees * Math.PI) / 180;
    return pointsAttribute([
      [fromX, fromZ],
      [
        fromX + Math.cos(angle - spread) * length,
        fromZ + Math.sin(angle - spread) * length,
      ],
      [
        fromX + Math.cos(angle + spread) * length,
        fromZ + Math.sin(angle + spread) * length,
      ],
    ]);
  }

  function sectionPoints(): string {
    return plan.verticalSection.samples
      .map((sample) => {
        const [routeDistance, elevation] = point(sample);
        return `${routeDistance},${48 - elevation * 13}`;
      })
      .join(" ");
  }

  const stageToLodge = distance(proposed.stage.center, proposed.lodge.center);
  const hearthToLodge = distance(proposed.hearth.center, proposed.lodge.center);
  const stageToPond = distance(proposed.stage.center, proposed.pond.center);
</script>

<svelte:head>
  <title>Winter retreat composition · Approved Gate 1</title>
</svelte:head>

<main class="plan-shell">
  <header class="plan-header">
    <div>
      <p class="eyebrow">Gate 1 approved · Gate 2 production review ready</p>
      <h1>The retreat triangle</h1>
      <p class="lede">
        Performance ice first. Warm refuge second. Natural frozen pond third.
      </p>
    </div>
    <div class="distance-readout" aria-label="Proposed landmark distances">
      <span><strong>{stageToLodge.toFixed(1)} m</strong> stage to lodge</span>
      <span><strong>{hearthToLodge.toFixed(1)} m</strong> hearth to lodge</span>
      <span><strong>{stageToPond.toFixed(1)} m</strong> stage to pond</span>
    </div>
  </header>

  <section class="hero-panel" aria-labelledby="hero-title">
    <div class="panel-heading hero-heading">
      <div>
        <p class="panel-kicker">Approved first impression</p>
        <h2 id="hero-title">One frame with a clear order of attention</h2>
      </div>
      <span class="camera-chip">44° lens · 5.2 m camera</span>
    </div>

    <svg
      class="hero-frame"
      viewBox="0 0 1200 680"
      role="img"
      aria-labelledby="hero-svg-title hero-svg-description"
    >
      <title id="hero-svg-title"
        >Approved Moonlit Winter Hollow hero composition</title
      >
      <desc id="hero-svg-description">
        The illuminated stage dominates the lower center. A packed snow route
        bends toward a warm lodge in the upper left. The hearth sits beside the
        lodge, while a darker fully frozen pond balances the right side.
      </desc>
      <defs>
        <linearGradient id="winter-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#030816" />
          <stop offset="0.64" stop-color="#102946" />
          <stop offset="1" stop-color="#66839b" />
        </linearGradient>
        <linearGradient id="winter-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b9ccda" />
          <stop offset="1" stop-color="#e8f1f7" />
        </linearGradient>
        <radialGradient id="stage-ice">
          <stop offset="0" stop-color="#87c9ef" />
          <stop offset="0.72" stop-color="#bce7fb" />
          <stop offset="1" stop-color="#f2fbff" />
        </radialGradient>
        <radialGradient id="warm-light">
          <stop offset="0" stop-color="#ffb061" stop-opacity="0.72" />
          <stop offset="1" stop-color="#ff7a36" stop-opacity="0" />
        </radialGradient>
        <filter id="ice-glow" x="-80%" y="-160%" width="260%" height="420%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <rect width="1200" height="680" fill="url(#winter-sky)" />
      <circle cx="790" cy="96" r="31" class="moon" />
      <g class="stars" aria-hidden="true">
        <circle cx="162" cy="74" r="2" /><circle cx="236" cy="128" r="2.6" />
        <circle cx="394" cy="62" r="1.8" /><circle cx="512" cy="112" r="2.2" />
        <circle cx="938" cy="70" r="2.4" /><circle cx="1075" cy="132" r="1.8" />
      </g>
      <path
        d="M0 265 C180 228 350 286 520 252 C745 207 920 272 1200 222 L1200 680 L0 680 Z"
        fill="url(#winter-snow)"
      />

      <g class="distant-tree-line" aria-hidden="true">
        {#each [55, 112, 174, 236, 302, 376, 454, 878, 950, 1022, 1090, 1154] as x, index}
          <path
            d={`M${x} 284 l${18 + (index % 3) * 4} -92 l${22 + (index % 2) * 5} 92 z`}
          />
        {/each}
      </g>

      <path
        class="route-shadow"
        d="M610 680 C610 598 575 555 548 510 C505 438 430 404 365 355 C318 320 292 293 279 263"
      />
      <path
        class="route"
        d="M610 680 C610 598 575 555 548 510 C505 438 430 404 365 355 C318 320 292 293 279 263"
      />

      <g class="lodge" transform="translate(202 196)">
        <ellipse cx="90" cy="110" rx="132" ry="72" fill="url(#warm-light)" />
        <rect x="18" y="55" width="154" height="84" rx="4" class="lodge-wall" />
        <path d="M0 61 L94 0 L190 61 Z" class="lodge-roof" />
        <rect x="46" y="84" width="34" height="31" class="window" />
        <rect x="126" y="75" width="31" height="64" class="door" />
        <path d="M151 10 L159 -34 L174 -34 L178 39" class="chimney" />
      </g>

      <g class="hearth" transform="translate(116 330)">
        <circle r="72" fill="url(#warm-light)" />
        <ellipse rx="47" ry="17" class="hearth-stones" />
        <path d="M-14 0 Q0 -54 14 0 Q5 -15 0 0 Q-7 -13 -14 0" class="flame" />
      </g>

      <g class="pond" transform="translate(932 368)">
        <ellipse rx="132" ry="49" class="pond-bank" />
        <ellipse rx="112" ry="36" class="pond-ice" />
        <path
          d="M-62 -2 l28 10 l19 -18 l31 14 l30 -15 l27 9"
          class="pond-crack"
        />
      </g>

      <ellipse
        cx="610"
        cy="525"
        rx="241"
        ry="78"
        class="stage-glow"
        filter="url(#ice-glow)"
      />
      <ellipse cx="610" cy="532" rx="228" ry="79" class="stage-base" />
      <ellipse
        cx="610"
        cy="513"
        rx="212"
        ry="67"
        fill="url(#stage-ice)"
        class="stage-surface"
      />
      <path
        d="M520 520 l42 7 l36 -25 l49 18 l38 -26 l45 21"
        class="stage-crack"
      />
      <path d="M468 571 L420 628 L584 632 L552 584 Z" class="snow-ramp" />

      <g class="foreground-trees" aria-hidden="true">
        <path d="M0 680 L0 112 L165 680 Z" /><path
          d="M86 680 L190 165 L304 680 Z"
        />
        <path d="M1200 680 L1200 124 L1050 680 Z" /><path
          d="M1118 680 L1020 192 L920 680 Z"
        />
      </g>

      <g class="hero-labels">
        <g transform="translate(632 418)"><circle r="22" /><text>1</text></g>
        <g transform="translate(318 176)"><circle r="22" /><text>2</text></g>
        <g transform="translate(112 262)"><circle r="22" /><text>3</text></g>
        <g transform="translate(981 313)"><circle r="22" /><text>4</text></g>
      </g>
    </svg>

    <ol class="hero-legend">
      <li>
        <span>1</span><strong>Performance ice</strong><small
          >largest, brightest, nearest</small
        >
      </li>
      <li>
        <span>2</span><strong>Warming lodge</strong><small
          >warm destination through trees</small
        >
      </li>
      <li>
        <span>3</span><strong>Hearth pocket</strong><small
          >beside the lodge, off the route</small
        >
      </li>
      <li>
        <span>4</span><strong>Frozen pond</strong><small
          >dark, quiet, natural ice</small
        >
      </li>
    </ol>
  </section>

  <div class="evidence-grid">
    <section class="plan-panel" aria-labelledby="plan-title">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Measured top-down plan · runtime metres</p>
          <h2 id="plan-title">The fire moves out of the traffic lane</h2>
        </div>
        <span class="north-mark">↑ N · upstage</span>
      </div>

      <svg
        class="plan-map"
        viewBox={MAP_VIEW_BOX}
        role="img"
        aria-labelledby="plan-svg-title plan-svg-description"
      >
        <title id="plan-svg-title">Measured approved Winter retreat plan</title>
        <desc id="plan-svg-description">
          Entry arrives from the south. The stage remains central. The lodge
          moves farther upstage-left, the hearth moves beside it, and the fully
          frozen pond moves to the opposite side of the stage.
        </desc>
        <defs>
          <pattern
            id="grid"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path d="M10 0 H0 V10" class="grid-line" />
          </pattern>
        </defs>
        <rect x="-54" y="-50" width="108" height="100" class="map-ground" />
        <rect x="-54" y="-50" width="108" height="100" fill="url(#grid)" />

        <g class="tree-masses" aria-hidden="true">
          <ellipse cx="-45" cy="-11" rx="10" ry="37" />
          <ellipse cx="45" cy="-8" rx="10" ry="39" />
          <ellipse cx="0" cy="-48" rx="51" ry="9" />
        </g>

        {#each plan.sightlines as sightline}
          <polygon
            points={sightlinePolygon(sightline)}
            class="sightline"
            class:primary={sightline.priority === 1}
            class:secondary={sightline.priority === 2}
            class:tertiary={sightline.priority === 3}
          />
        {/each}

        <g class="current-ghosts" aria-label="Current positions">
          <rect
            x={point(current.lodgeCenter)[0] - 3.9}
            y={point(current.lodgeCenter)[1] - 3.2}
            width="7.8"
            height="6.4"
          />
          <circle
            cx={current.hearthCenter[0]}
            cy={current.hearthCenter[1]}
            r="3.1"
          />
          <ellipse
            cx={current.pondCenter[0]}
            cy={current.pondCenter[1]}
            rx="6"
            ry="4.4"
          />
        </g>

        {#each plan.routes as route}
          <polyline
            points={pointsAttribute(route.points)}
            class="route-shoulder"
            style={`stroke-width:${route.width + 1.2}`}
          />
          <polyline
            points={pointsAttribute(route.points)}
            class="plan-route"
            style={`stroke-width:${route.width}`}
          />
        {/each}

        <circle
          cx="0"
          cy="0"
          r={proposed.stage.radius + 1.1}
          class="stage-apron"
        />
        <circle cx="0" cy="0" r={proposed.stage.radius} class="stage-mark" />
        <rect
          x={point(proposed.lodge.center)[0] -
            point(proposed.lodge.footprint)[0] / 2}
          y={point(proposed.lodge.center)[1] -
            point(proposed.lodge.footprint)[1] / 2}
          width={point(proposed.lodge.footprint)[0]}
          height={point(proposed.lodge.footprint)[1]}
          class="lodge-mark"
        />
        <circle
          cx={proposed.hearth.center[0]}
          cy={proposed.hearth.center[1]}
          r={proposed.hearth.clearedRadius}
          class="hearth-mark"
        />
        <ellipse
          cx={proposed.pond.center[0]}
          cy={proposed.pond.center[1]}
          rx={proposed.pond.radiusX}
          ry={proposed.pond.radiusZ}
          class="pond-mark"
        />

        <g
          class="camera-mark"
          transform={`translate(${proposed.heroCamera.position[0]} ${proposed.heroCamera.position[2]})`}
        >
          <circle r="1.5" /><path d="M0 -1.5 L-2.6 -5.5 L2.6 -5.5 Z" />
        </g>
        <circle
          cx={proposed.entry.center[0]}
          cy={proposed.entry.center[1]}
          r="2.2"
          class="entry-mark"
        />

        <g class="map-labels">
          <text x="5" y="2">1 · stage</text>
          <text x="-22" y="-42">2 · lodge</text>
          <text x="-45" y="-34">3 · hearth</text>
          <text x="17" y="-16">4 · frozen pond</text>
          <text x="11" y="43">entry</text>
        </g>
      </svg>

      <div class="map-legend">
        <span><i class="legend-current"></i>current position</span>
        <span><i class="legend-proposed"></i>proposed landmark</span>
        <span><i class="legend-route"></i>packed route</span>
        <span><i class="legend-sightline"></i>hero attention cone</span>
      </div>
    </section>

    <section class="section-panel" aria-labelledby="section-title">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Long section · entry to lodge</p>
          <h2 id="section-title">The deck explains its elevation</h2>
        </div>
      </div>
      <svg
        class="section-drawing"
        viewBox="0 0 90 58"
        role="img"
        aria-labelledby="section-svg-title"
      >
        <title id="section-svg-title"
          >Proposed vertical section from the south entry through the stage to
          the lodge</title
        >
        <line x1="0" y1="48" x2="88" y2="48" class="section-baseline" />
        <polyline points={sectionPoints()} class="section-ground" />
        <path d="M38 48 L38 42 L48 42 L48 48" class="section-stage" />
        <path d="M36 48 L38 42" class="section-ramp" />
        <path d="M79 18 L84 11 L89 18 V38 H79 Z" class="section-lodge" />
        <g class="person" transform="translate(9 42)"
          ><circle cy="-5.2" r="1.2" /><path
            d="M0 -4 V2 M-3 -1 H3 M0 2 L-2.3 6 M0 2 L2.3 6"
          /></g
        >
        <g class="section-labels">
          <text x="2" y="56">south entry</text>
          <text x="36" y="37">0.45 m deck</text>
          <text x="67" y="50">≤ 12% route</text>
          <text x="77" y="8">2.6 m lodge pad</text>
          <text x="5" y="33">1.65 m eye</text>
        </g>
      </svg>

      <div class="ice-rule">
        <article>
          <span>Performance ice</span>
          <strong>Bright, level, maintained</strong>
          <p>
            Inset into a visible timber-and-stone deck with one broad snow ramp.
          </p>
        </article>
        <article>
          <span>Natural pond ice</span>
          <strong>Dark, rough, snow-banked</strong>
          <p>
            No liquid blue, glowing rim, or visual competition with the stage.
          </p>
        </article>
      </div>
    </section>
  </div>

  <section class="route-strip" aria-labelledby="route-title">
    <div class="panel-heading">
      <div>
        <p class="panel-kicker">Numbered attention sequence</p>
        <h2 id="route-title">What the viewer understands, in order</h2>
      </div>
    </div>
    <ol>
      {#each plan.attentionSequence as step, index}
        <li>
          <span>{index + 1}</span>
          <p>{step}</p>
        </li>
      {/each}
    </ol>
  </section>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-width: 0;
    overflow: auto;
    background: #050914;
  }

  .plan-shell {
    --theme-bg: #050914;
    --theme-panel-bg: #0b1422;
    --theme-card-bg: #101d2d;
    --theme-stroke: rgba(184, 216, 239, 0.2);
    --theme-text: #eef8ff;
    --theme-muted: #9db1c2;
    --theme-ice: #aee5ff;
    --theme-ice-deep: #3d83a8;
    --theme-warm: #ff9b50;
    --theme-route: #e4c993;
    --theme-pond: #456f8b;
    box-sizing: border-box;
    width: 100%;
    min-height: 100vh;
    padding: clamp(1rem, 2.4vw, 3.25rem);
    color: var(--theme-text);
    background:
      radial-gradient(
        circle at 72% 0%,
        rgba(63, 112, 157, 0.18),
        transparent 36rem
      ),
      linear-gradient(180deg, #040813, var(--theme-bg));
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: clamp(1rem, calc(0.45vw + 0.45rem), 1.4rem);
    container-type: inline-size;
  }

  .plan-shell *,
  .plan-shell *::before,
  .plan-shell *::after {
    box-sizing: inherit;
  }

  .plan-header,
  .panel-heading,
  .distance-readout,
  .map-legend,
  .hero-legend,
  .route-strip ol,
  .ice-rule {
    display: flex;
  }

  .plan-header {
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    width: min(162.5rem, 92vw);
    margin: 0 auto 1.4rem;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2.35rem, 5.2cqw, 5.7rem);
    font-weight: 500;
    letter-spacing: -0.045em;
    line-height: 0.95;
  }

  h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.25rem, 2.2cqw, 2.35rem);
    font-weight: 500;
    line-height: 1.08;
  }

  .eyebrow,
  .panel-kicker,
  .camera-chip,
  .north-mark {
    color: var(--theme-ice);
    font-size: clamp(0.75rem, 0.8cqw, 0.95rem);
    font-weight: 760;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .eyebrow {
    margin-bottom: 0.72rem;
  }

  .lede {
    margin-top: 0.8rem;
    color: var(--theme-muted);
    font-size: clamp(1rem, 1.2cqw, 1.3rem);
  }

  .distance-readout {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
    max-width: 34rem;
  }

  .distance-readout span,
  .camera-chip,
  .north-mark {
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: rgba(10, 22, 38, 0.88);
    color: var(--theme-muted);
    font-size: 0.78rem;
  }

  .distance-readout strong {
    color: var(--theme-text);
  }

  .hero-panel,
  .plan-panel,
  .section-panel,
  .route-strip {
    border: 1px solid var(--theme-stroke);
    border-radius: 1.25rem;
    background: var(--theme-panel-bg);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.28);
    overflow: hidden;
  }

  .hero-panel,
  .evidence-grid,
  .route-strip {
    width: min(162.5rem, 92vw);
    margin-inline: auto;
  }

  .panel-heading {
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: clamp(1rem, 2cqw, 1.8rem);
  }

  .panel-kicker {
    margin-bottom: 0.35rem;
  }

  .hero-frame,
  .plan-map,
  .section-drawing {
    display: block;
    width: 100%;
    height: auto;
  }

  .hero-frame {
    height: clamp(24rem, 56vh, 42rem);
    border-block: 1px solid var(--theme-stroke);
    background: #050914;
  }

  .moon {
    fill: #e9f0f5;
    stroke: #a9b9c6;
    stroke-width: 3;
  }

  .stars circle {
    fill: #e7f4ff;
  }

  .distant-tree-line path {
    fill: #263d4d;
    opacity: 0.9;
  }

  .route-shadow,
  .route {
    fill: none;
    stroke-linecap: round;
  }

  .route-shadow {
    stroke: rgba(55, 75, 89, 0.34);
    stroke-width: 74;
  }

  .route {
    stroke: rgba(234, 224, 198, 0.52);
    stroke-width: 42;
    stroke-dasharray: 4 9;
  }

  .lodge-wall,
  .door {
    fill: #5b321f;
    stroke: #8a5936;
    stroke-width: 4;
  }

  .lodge-roof {
    fill: #dce8ef;
    stroke: #75472c;
    stroke-width: 10;
    stroke-linejoin: round;
  }

  .window {
    fill: #ffc16e;
    stroke: #8a5936;
    stroke-width: 5;
  }

  .chimney {
    fill: #5c4034;
    stroke: #5c4034;
    stroke-width: 12;
    stroke-linejoin: round;
  }

  .hearth-stones {
    fill: #62534a;
    stroke: #d69b66;
    stroke-width: 9;
  }

  .flame {
    fill: #ff9d42;
    stroke: #ffe29b;
    stroke-width: 5;
  }

  .pond-bank {
    fill: #e7f0f5;
    stroke: #aabecb;
    stroke-width: 6;
  }

  .pond-ice {
    fill: #31556e;
    stroke: #6d91a8;
    stroke-width: 5;
  }

  .pond-crack,
  .stage-crack {
    fill: none;
    stroke: rgba(230, 250, 255, 0.8);
    stroke-width: 4;
  }

  .stage-glow {
    fill: rgba(91, 191, 238, 0.62);
  }

  .stage-base {
    fill: #705039;
    stroke: #95aeba;
    stroke-width: 13;
  }

  .stage-surface {
    stroke: #effcff;
    stroke-width: 9;
  }

  .snow-ramp {
    fill: #dbe9f1;
    stroke: #adbec9;
    stroke-width: 5;
  }

  .foreground-trees path {
    fill: rgba(7, 20, 27, 0.94);
    stroke: #253f4d;
    stroke-width: 7;
  }

  .hero-labels circle {
    fill: #07111f;
    stroke: var(--theme-ice);
    stroke-width: 3;
  }

  .hero-labels text {
    fill: var(--theme-text);
    font-size: 20px;
    font-weight: 800;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .hero-legend {
    gap: 0;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .hero-legend li {
    display: grid;
    grid-template-columns: auto 1fr;
    flex: 1;
    gap: 0.05rem 0.7rem;
    min-width: 0;
    padding: 1rem 1.15rem;
    border-right: 1px solid var(--theme-stroke);
  }

  .hero-legend li:last-child {
    border-right: 0;
  }

  .hero-legend span {
    grid-row: 1 / 3;
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 50%;
    color: #07111f;
    background: var(--theme-ice);
    font-weight: 850;
  }

  .hero-legend strong,
  .hero-legend small {
    display: block;
  }

  .hero-legend strong {
    font-size: 0.92rem;
  }

  .hero-legend small {
    color: var(--theme-muted);
    font-size: 0.78rem;
  }

  .evidence-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.14fr) minmax(22rem, 0.86fr);
    gap: 1.2rem;
    margin-top: 1.2rem;
  }

  .plan-map {
    aspect-ratio: 1.08;
    min-height: 34rem;
  }

  .map-ground {
    fill: #dce8ef;
  }

  .grid-line {
    fill: none;
    stroke: rgba(40, 70, 90, 0.16);
    stroke-width: 0.2;
  }

  .tree-masses ellipse {
    fill: #183b38;
    stroke: #315e56;
    stroke-width: 0.6;
  }

  .sightline {
    opacity: 0.24;
  }

  .sightline.primary {
    fill: #83d6ff;
  }
  .sightline.secondary {
    fill: #ffab61;
  }
  .sightline.tertiary {
    fill: #6e99b4;
  }

  .current-ghosts rect,
  .current-ghosts circle,
  .current-ghosts ellipse {
    fill: rgba(75, 89, 101, 0.12);
    stroke: #526777;
    stroke-width: 0.55;
    stroke-dasharray: 1.6 1.2;
  }

  .route-shoulder,
  .plan-route {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .route-shoulder {
    stroke: rgba(94, 119, 130, 0.24);
  }
  .plan-route {
    stroke: var(--theme-route);
  }

  .stage-apron {
    fill: rgba(101, 179, 213, 0.18);
    stroke: #4b8cac;
    stroke-width: 0.55;
  }

  .stage-mark {
    fill: #aee5ff;
    stroke: #2b6f91;
    stroke-width: 0.75;
  }

  .lodge-mark {
    fill: #a96235;
    stroke: #4d2e1f;
    stroke-width: 0.75;
  }

  .hearth-mark {
    fill: #ff9347;
    stroke: #7a3f22;
    stroke-width: 0.75;
  }

  .pond-mark {
    fill: #4f7892;
    stroke: #284f68;
    stroke-width: 0.75;
  }

  .entry-mark {
    fill: #f3f8fa;
    stroke: #2f607a;
    stroke-width: 0.75;
  }

  .camera-mark circle,
  .camera-mark path {
    fill: #091724;
    stroke: #4d879f;
    stroke-width: 0.45;
  }

  .map-labels text {
    fill: #152634;
    font-size: 2.1px;
    font-weight: 800;
    paint-order: stroke;
    stroke: rgba(235, 244, 248, 0.9);
    stroke-width: 0.55;
  }

  .map-legend {
    flex-wrap: wrap;
    gap: 0.7rem 1.25rem;
    padding: 0.9rem 1.1rem 1.1rem;
    color: var(--theme-muted);
    font-size: 0.8rem;
  }

  .map-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .map-legend i {
    width: 1.35rem;
    height: 0.65rem;
    border-radius: 999px;
  }

  .legend-current {
    border: 1px dashed #607686;
  }
  .legend-proposed {
    background: var(--theme-ice);
  }
  .legend-route {
    background: var(--theme-route);
  }
  .legend-sightline {
    background: rgba(131, 214, 255, 0.45);
  }

  .section-drawing {
    padding: 1rem;
    background: #dce8ef;
  }

  .section-baseline {
    stroke: rgba(40, 70, 90, 0.22);
    stroke-width: 0.4;
  }

  .section-ground {
    fill: none;
    stroke: #31566d;
    stroke-width: 1.35;
  }

  .section-stage {
    fill: #aee5ff;
    stroke: #2b6f91;
    stroke-width: 0.7;
  }

  .section-ramp {
    fill: none;
    stroke: #c49d5a;
    stroke-width: 1.1;
  }

  .section-lodge {
    fill: #995c37;
    stroke: #4d2e1f;
    stroke-width: 0.8;
  }

  .person circle,
  .person path {
    fill: #142936;
    stroke: #142936;
    stroke-width: 0.7;
    stroke-linecap: round;
  }

  .section-labels text {
    fill: #1e3645;
    font-size: 2.3px;
    font-weight: 750;
  }

  .ice-rule {
    gap: 0.75rem;
    padding: 1rem;
  }

  .ice-rule article {
    flex: 1;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85rem;
    background: var(--theme-card-bg);
  }

  .ice-rule span,
  .ice-rule strong {
    display: block;
  }

  .ice-rule span {
    color: var(--theme-ice);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .ice-rule strong {
    margin-top: 0.4rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.15rem;
  }

  .ice-rule p {
    margin-top: 0.5rem;
    color: var(--theme-muted);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .route-strip {
    margin-top: 1.2rem;
  }

  .route-strip ol {
    gap: 0;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .route-strip li {
    display: grid;
    grid-template-columns: auto 1fr;
    flex: 1;
    align-items: start;
    gap: 0.8rem;
    min-width: 0;
    padding: 1.2rem;
    border-top: 1px solid var(--theme-stroke);
    border-right: 1px solid var(--theme-stroke);
  }

  .route-strip li:last-child {
    border-right: 0;
  }

  .route-strip li > span {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 50%;
    color: #07111f;
    background: var(--theme-route);
    font-weight: 850;
  }

  .route-strip li p {
    color: var(--theme-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  @container (max-width: 62rem) {
    .plan-header,
    .evidence-grid {
      grid-template-columns: 1fr;
    }

    .plan-header {
      align-items: start;
      flex-direction: column;
    }

    .distance-readout {
      justify-content: flex-start;
    }

    .hero-legend,
    .route-strip ol {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hero-legend li,
    .route-strip li {
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke);
    }
  }

  @container (max-width: 38rem) {
    .plan-shell {
      padding: 0.75rem;
    }

    .hero-heading,
    .panel-heading,
    .ice-rule {
      align-items: flex-start;
      flex-direction: column;
    }

    .hero-frame {
      height: 22rem;
    }

    .hero-legend,
    .route-strip ol {
      grid-template-columns: 1fr;
    }

    .plan-map {
      min-height: 25rem;
    }
  }
</style>
