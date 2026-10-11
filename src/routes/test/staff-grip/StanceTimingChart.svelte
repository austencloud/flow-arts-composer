<script lang="ts">
  /**
   * The stance turn drawn against score time.
   *
   * The upper lane answers "does the turn lead the props": the prop lateral
   * signal and the memoryless planner's answer to it are both drawn against the
   * curve the body actually follows, so anticipation reads as a horizontal
   * offset and the authored ease reads as curvature rather than as the props'
   * own sweep rate.
   *
   * The lower lane answers "does the torso break successively": each segment is
   * scaled by its own full-scale share, so four identically shaped curves are
   * separated only by time. Stagger is the horizontal gap between them.
   */
  import {
    SPINE1_SHARE,
    SPINE2_SHARE,
    describeStanceYawTrack,
    sampleStanceYawTrackDetail,
    type StanceYawTrack,
  } from "#lib/shared/3d/collision/stance-yaw-track.js";
  import {
    FULL_ASSIST_LATERAL_M,
    MAX_STANCE_YAW_RAD,
  } from "#lib/shared/3d/collision/upper-body-stance-planner.js";

  interface Props {
    track: StanceYawTrack | null;
    /** Where playback is, in motion steps from the first beat. */
    scoreTime: number;
  }

  const { track, scoreTime }: Props = $props();

  const DEG = 180 / Math.PI;
  const MAX_YAW_DEG = MAX_STANCE_YAW_RAD * DEG;
  /** Plot half-height in degrees, so the 87-degree limit sits inside the box. */
  const YAW_AXIS_DEG = 95;
  /** Samples across the whole score. Fine enough to show the ease, cheap once. */
  const RESOLUTION = 480;

  interface Frame {
    t: number;
    chestDeg: number;
    spine1Deg: number;
    spine2Deg: number;
    headDeg: number;
    desireDeg: number;
    lateralDeg: number;
  }

  const stepCount = $derived(track?.stepCount ?? 0);

  const frames = $derived.by<Frame[]>(() => {
    if (!track || stepCount <= 0) return [];
    const out: Frame[] = [];
    for (let i = 0; i <= RESOLUTION; i += 1) {
      const t = (i / RESOLUTION) * stepCount;
      const sample = sampleStanceYawTrackDetail(track, t);
      out.push({
        t,
        chestDeg: sample.chestRad * DEG,
        spine1Deg: sample.spine1Rad * DEG,
        spine2Deg: sample.spine2Rad * DEG,
        headDeg: sample.headRad * DEG,
        desireDeg: sample.desireRad * DEG,
        // The lateral signal in the planner's own units: full assist maps to a
        // full turn, so the two lanes share one horizontal and one vertical.
        lateralDeg:
          Math.max(
            -1,
            Math.min(1, sample.lateralM / FULL_ASSIST_LATERAL_M)
          ) * MAX_YAW_DEG,
      });
    }
    return out;
  });

  function xAt(t: number): number {
    return stepCount > 0 ? (t / stepCount) * 1000 : 0;
  }

  function yawY(deg: number): number {
    return 50 - (deg / YAW_AXIS_DEG) * 50;
  }

  function unitY(fraction: number): number {
    return 50 - Math.max(-1.15, Math.min(1.15, fraction)) * 43;
  }

  function pathOf(read: (frame: Frame) => number): string {
    if (frames.length === 0) return "";
    let d = "";
    for (const frame of frames) {
      d += `${d ? "L" : "M"}${xAt(frame.t).toFixed(2)} ${read(frame).toFixed(2)}`;
    }
    return d;
  }

  const lateralArea = $derived.by(() => {
    if (frames.length === 0) return "";
    const body = pathOf((frame) => yawY(frame.lateralDeg));
    const first = xAt(frames[0].t).toFixed(2);
    const last = xAt(frames[frames.length - 1].t).toFixed(2);
    return `${body}L${last} ${yawY(0).toFixed(2)}L${first} ${yawY(0).toFixed(2)}Z`;
  });

  const desirePath = $derived(pathOf((frame) => yawY(frame.desireDeg)));
  const chestPath = $derived(pathOf((frame) => yawY(frame.chestDeg)));

  const spine1Unit = $derived(
    pathOf((frame) => unitY(frame.spine1Deg / (SPINE1_SHARE * MAX_YAW_DEG)))
  );
  const spine2Unit = $derived(
    pathOf((frame) => unitY(frame.spine2Deg / (SPINE2_SHARE * MAX_YAW_DEG)))
  );
  const chestUnit = $derived(pathOf((frame) => unitY(frame.chestDeg / MAX_YAW_DEG)));
  const headUnit = $derived(pathOf((frame) => unitY(frame.headDeg / MAX_YAW_DEG)));

  const boundaries = $derived(
    stepCount > 0
      ? Array.from({ length: stepCount + 1 }, (_, index) => index)
      : []
  );

  const playheadX = $derived(
    stepCount > 0
      ? xAt(((scoreTime % stepCount) + stepCount) % stepCount)
      : 0
  );

  // The numbers come from the curve's own owner rather than from these drawn
  // samples, so a readout can never describe a different turn than the picture.
  const summary = $derived(describeStanceYawTrack(track));
  const leadSteps = $derived(summary.onsetLeadSteps);
  const spineLeadSteps = $derived(summary.spineOnsetLeadSteps);
  const peakHeadLagDeg = $derived(summary.peakHeadLagRad * DEG);
  const peakStaggerDeg = $derived(summary.peakSpineStaggerRad * DEG);
  const arrivals = $derived(summary.arrivals);

  const live = $derived.by(() => {
    if (!track || stepCount <= 0) return null;
    const wrapped = ((scoreTime % stepCount) + stepCount) % stepCount;
    const sample = sampleStanceYawTrackDetail(track, wrapped);
    return {
      chestDeg: sample.chestRad * DEG,
      desireDeg: sample.desireRad * DEG,
      headLagDeg: sample.headLagRad * DEG,
    };
  });

  function fixed(value: number | null, digits = 2): string {
    return value === null ? "—" : value.toFixed(digits);
  }
</script>

<section class="timing" aria-label="Stance turn over score time">
  <header>
    <h2>Turn timing</h2>
    <dl class="timing-readout">
      <div>
        <dt>Lead: spine</dt>
        <dd>{fixed(spineLeadSteps)} steps</dd>
      </div>
      <div>
        <dt>Lead: shoulders</dt>
        <dd>{fixed(leadSteps)} steps</dd>
      </div>
      <div>
        <dt>Chest now</dt>
        <dd>{fixed(live?.chestDeg ?? null, 1)}°</dd>
      </div>
      <div>
        <dt>Props ask</dt>
        <dd>{fixed(live?.desireDeg ?? null, 1)}°</dd>
      </div>
      <div>
        <dt>Head lag now</dt>
        <dd>{fixed(live?.headLagDeg ?? null, 1)}°</dd>
      </div>
      <div>
        <dt>Peak head lag</dt>
        <dd>{fixed(peakHeadLagDeg, 1)}°</dd>
      </div>
      <div>
        <dt>Peak spine stagger</dt>
        <dd>{fixed(peakStaggerDeg, 1)}°</dd>
      </div>
      <div>
        <dt>Arrivals</dt>
        <dd class="arrivals">
          hips pinned · S1 {fixed(arrivals.spine1)} · chest {fixed(
            arrivals.chest
          )} · S2 {fixed(arrivals.spine2)} · head {fixed(arrivals.head)}
        </dd>
      </div>
    </dl>
  </header>

  <ul class="legend">
    <li><i class="swatch lateral"></i>prop lateral</li>
    <li><i class="swatch desire"></i>props ask (memoryless)</li>
    <li><i class="swatch chest"></i>chest (delivered)</li>
    <li><i class="swatch spine1"></i>Spine1</li>
    <li><i class="swatch spine2"></i>Spine2</li>
    <li><i class="swatch head"></i>head</li>
    <li><i class="swatch hips"></i>hips (pinned — the feet never slide)</li>
  </ul>

  <div class="lanes">
    <div class="lane lane-yaw">
      <span class="lane-name">yaw ±{Math.round(YAW_AXIS_DEG)}°</span>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        {#each boundaries as boundary (boundary)}
          <line
            class="boundary"
            x1={xAt(boundary)}
            x2={xAt(boundary)}
            y1="0"
            y2="100"
          />
        {/each}
        <line class="zero" x1="0" x2="1000" y1={yawY(0)} y2={yawY(0)} />
        <line class="limit" x1="0" x2="1000" y1={yawY(MAX_YAW_DEG)} y2={yawY(MAX_YAW_DEG)} />
        <line
          class="limit"
          x1="0"
          x2="1000"
          y1={yawY(-MAX_YAW_DEG)}
          y2={yawY(-MAX_YAW_DEG)}
        />
        <path class="lateral-area" d={lateralArea} />
        <path class="trace desire" d={desirePath} />
        <path class="trace chest" d={chestPath} />
        <line class="playhead" x1={playheadX} x2={playheadX} y1="0" y2="100" />
      </svg>
    </div>

    <div class="lane lane-share">
      <span class="lane-name">share of own full turn</span>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        {#each boundaries as boundary (boundary)}
          <line
            class="boundary"
            x1={xAt(boundary)}
            x2={xAt(boundary)}
            y1="0"
            y2="100"
          />
        {/each}
        <line class="zero hips" x1="0" x2="1000" y1={unitY(0)} y2={unitY(0)} />
        <path class="trace spine1" d={spine1Unit} />
        <path class="trace chest" d={chestUnit} />
        <path class="trace spine2" d={spine2Unit} />
        <path class="trace head" d={headUnit} />
        <line class="playhead" x1={playheadX} x2={playheadX} y1="0" y2="100" />
      </svg>
    </div>
  </div>

  <div class="axis" aria-hidden="true">
    {#each boundaries as boundary (boundary)}
      <span style:left={`${stepCount > 0 ? (boundary / stepCount) * 100 : 0}%`}>
        {boundary}
      </span>
    {/each}
  </div>
</section>

<style>
  .timing {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem 1.15rem 0.85rem;
    /*
     * The series colours are data: each one names a curve the legend
     * identifies, so it is declared once here and read by both the key swatch
     * and the stroke that draws it. Everything else in this chart is chrome
     * and reads the app's own surface, stroke and text tokens.
     */
    --series-lateral: rgb(148 178 206 / 55%);
    --series-lateral-fill: rgb(148 178 206 / 16%);
    --series-hips: rgb(148 178 206 / 45%);
    --series-desire: #ffb27a;
    --series-chest: #6fe7ff;
    --series-spine1: #8ef5c0;
    --series-spine2: #b6a6ff;
    --series-head: #ff8fb0;
    background: var(--surface-dark, rgba(0, 0, 0, 0.35));
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1.25rem;
  }

  h2 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    font-weight: 640;
    letter-spacing: 0.01em;
  }

  .timing-readout {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.15rem;
    margin: 0;
  }

  .timing-readout div {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    /*
     * A reading is one flex item of the row. It wraps to the next row whole
     * rather than being squeezed, so the label never ends up on its own line
     * while there is still width for it; the cap is what stops the widest
     * reading from running off the right edge of a phone.
     */
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
  }

  .timing-readout dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 0.75rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .timing-readout dd.arrivals {
    /* Four arrival times on one line, wide enough not to reflow as the turn
     * is scrubbed. Stated in rem rather than as a percentage: a percentage
     * would resolve against this reading's own shrink-to-fit width, which is
     * derived from the value it is supposed to be reserving room for. */
    min-width: 21rem;
  }

  /*
   * On a phone that reservation is wider than the whole band, so it stops
   * being a floor and starts pushing the last arrival off the right edge.
   * Below that width the reading wraps under its label instead.
   */
  @container timing-band (max-width: 38rem) {
    .timing-readout dd.arrivals {
      min-width: 0;
    }
  }

  .timing-readout dd {
    margin: 0;
    /*
     * The digits change every frame during playback; a fixed width keeps the
     * row from reflowing as a value gains or loses a character.
     */
    min-width: 4.5rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.9rem;
    margin: 0;
    padding: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 0.75rem;
    list-style: none;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  /*
   * A folded phone in landscape gives the band twelve rem. The curves and the
   * numbers are what it is for, so the colour key is the part that yields; the
   * traces keep their names in the readings above them. The chrome around them
   * gives up its slack too: at this height the readings wrap to two rows, and
   * without this the lanes are left too short to draw a curve in.
   */
  @container timing-band (max-height: 13rem) {
    .legend {
      display: none;
    }

    .timing {
      gap: 0.3rem;
      padding: 0.4rem 0.9rem 0.45rem;
    }

    header {
      gap: 0.25rem 0.9rem;
    }

    .timing-readout {
      gap: 0.2rem 0.9rem;
    }

    .lanes {
      gap: 0.25rem;
    }
  }

  .swatch {
    width: 1rem;
    height: 0.1875rem;
    border-radius: 999px;
  }

  .swatch.lateral {
    background: var(--series-lateral);
  }
  .swatch.desire {
    background: repeating-linear-gradient(
      90deg,
      var(--series-desire) 0 0.25rem,
      transparent 0.25rem 0.4rem
    );
  }
  .swatch.chest {
    height: 0.25rem;
    background: var(--series-chest);
  }
  .swatch.spine1 {
    background: var(--series-spine1);
  }
  .swatch.spine2 {
    background: var(--series-spine2);
  }
  .swatch.head {
    background: var(--series-head);
  }
  .swatch.hips {
    background: var(--series-hips);
  }

  .lanes {
    display: grid;
    grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 0.35rem;
    /*
     * The band's height is owned by the page grid; the lanes divide whatever it
     * gives them. A floor keeps the curves readable when the row is short.
     */
    flex: 1 1 auto;
    min-height: 4rem;
  }

  .lane {
    position: relative;
    min-height: 0;
    border: var(--glass-border, 1px solid rgba(255, 255, 255, 0.1));
    border-radius: 0.4rem;
    background: var(--surface-inset-deep, rgba(0, 0, 0, 0.3));
  }

  .lane-name {
    position: absolute;
    top: 0.25rem;
    left: 0.4rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 0.6875rem;
    letter-spacing: 0.02em;
    pointer-events: none;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  /*
   * The lanes stretch to the band, so every stroke declares a non-scaling
   * width: without it a 3840-wide band draws hairline verticals and fat
   * horizontals out of the same 1px.
   */
  svg line,
  svg path {
    vector-effect: non-scaling-stroke;
  }

  .boundary {
    stroke: color-mix(in srgb, var(--theme-text, #fff) 14%, transparent);
    stroke-width: 1;
  }

  .zero {
    stroke: color-mix(in srgb, var(--theme-text, #fff) 32%, transparent);
    stroke-width: 1;
  }

  .zero.hips {
    stroke: var(--series-hips);
    stroke-width: 2;
  }

  .limit {
    stroke: color-mix(in srgb, var(--series-desire) 24%, transparent);
    stroke-dasharray: 2 4;
    stroke-width: 1;
  }

  .lateral-area {
    fill: var(--series-lateral-fill);
    stroke: var(--series-lateral);
    stroke-width: 1;
  }

  .trace {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .trace.desire {
    stroke: var(--series-desire);
    stroke-dasharray: 5 4;
    stroke-width: 1.5;
  }

  .trace.chest {
    stroke: var(--series-chest);
    stroke-width: 2.5;
  }

  .trace.spine1 {
    stroke: var(--series-spine1);
    stroke-width: 1.5;
  }

  .trace.spine2 {
    stroke: var(--series-spine2);
    stroke-width: 1.5;
  }

  .trace.head {
    stroke: var(--series-head);
    stroke-width: 1.5;
  }

  .playhead {
    stroke: color-mix(in srgb, var(--theme-text, #fff) 70%, transparent);
    stroke-width: 1.5;
  }

  .axis {
    position: relative;
    height: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
  }

  .axis span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }
</style>
