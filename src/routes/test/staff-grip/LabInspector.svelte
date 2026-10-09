<!--
  The numbers, in four views the URL can name.

  Fit is the new one and the reason the lab exists: this body's measured
  segments beside the prop it is actually holding. Grip and Turn are the
  readouts and the stance-timing lanes that already worked, re-laid out to fit
  the rail. Matrix is the sweep mount.
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";

  import CoverageMatrixMount from "./CoverageMatrixMount.svelte";
  import StanceTimingChart from "./StanceTimingChart.svelte";
  import type { CoverageMatrix } from "./coverage-matrix-contract";
  import { LAB_SWEEP_AXIS_LABEL } from "./lab-catalog";
  import type { BodyPropFit, FitVerdict } from "./lab-body-fit";
  import type { ProportionSweepCharacter } from "$lib/shared/3d/domain/proportion-sweep-characters";
  import type { GripMetric, PoseMetric } from "./lab-metrics";
  import type { LabPanel, StaffLabState } from "./lab-state.svelte";
  import type {
    describeStanceYawTrack,
    StanceYawTrack,
  } from "$lib/shared/3d/collision/stance-yaw-track";

  interface Props {
    lab: StaffLabState;
    /**
     * Set when the body on stage is one of the controlled proportion sweep
     * rigs, carrying what the offline generator measured off its rest pose.
     */
    sweepCharacter: ProportionSweepCharacter | undefined;
    fit: BodyPropFit | null;
    verdict: FitVerdict;
    deltaCm: number | null;
    /** What this configuration asks the prop to be. */
    configuredLengthCm: number | null;
    /** What is actually drawn. Equals the ask unless `fixedLengthCm` is set. */
    drawnLengthCm: number | null;
    /**
     * Set when the build is a model the scene does not stretch, so it draws
     * its authored length and ignores the ask.
     */
    fixedLengthCm: number | null;
    /** How tall the body on stage stands, in centimetres. */
    characterHeightCm: number;
    /** What the collision model is using. Does not follow the configuration. */
    collisionLengthCm: number | null;
    /** Signed gap between the two, or null when they agree. */
    lengthDivergenceCm: number | null;
    leftMetric: GripMetric;
    rightMetric: GripMetric;
    poseMetric: PoseMetric;
    stanceTrack: StanceYawTrack | null;
    stanceSummary: ReturnType<typeof describeStanceYawTrack>;
    stanceVelocity: number | null;
    coverageMatrix: CoverageMatrix | null;
  }

  let {
    lab,
    sweepCharacter,
    fit,
    verdict,
    deltaCm,
    configuredLengthCm,
    drawnLengthCm,
    fixedLengthCm,
    characterHeightCm,
    collisionLengthCm,
    lengthDivergenceCm,
    leftMetric,
    rightMetric,
    poseMetric,
    stanceTrack,
    stanceSummary,
    stanceVelocity,
    coverageMatrix,
  }: Props = $props();

  /**
   * The offline sweep's reading of this body beside the lab's live one. It is
   * the same arithmetic — `performer-reach-measurements` — run twice: once by
   * the generator over the GLB's authored rest pose, once here over the rig
   * the browser actually posed. Agreement is what would let a sweep pre-filter
   * a coverage matrix without opening it. A gap means one of the two is
   * measuring a different body than it thinks.
   */
  const SWEEP_AGREEMENT_TOLERANCE_CM = 1;

  /**
   * Centimetres are what the solver works in; feet and inches are what a prop
   * is bought in. Both, always, so neither has to be converted in someone's
   * head while they are looking at a body.
   */
  const CM_PER_INCH = 2.54;

  function imperial(valueCm: number | null): string {
    if (valueCm === null || !Number.isFinite(valueCm)) return "—";
    const totalInches = valueCm / CM_PER_INCH;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;
    return feet > 0
      ? `${feet} ft ${inches.toFixed(1)} in`
      : `${inches.toFixed(1)} in`;
  }

  const sweepDeltaCm = $derived(
    sweepCharacter && fit
      ? fit.fit.maxStaffLengthCm - sweepCharacter.measured.staffCm
      : null
  );

  const sweepDisagrees = $derived(
    sweepDeltaCm !== null &&
      Math.abs(sweepDeltaCm) > SWEEP_AGREEMENT_TOLERANCE_CM
  );

  /** `statureScale 0.90` — the literal knob, because that is what was moved. */
  const sweepParameters = $derived(
    sweepCharacter
      ? Object.entries(sweepCharacter.parameters)
          .map(([name, value]) => `${name} ${value}`)
          .join(" · ")
      : ""
  );

  const PANEL_OPTIONS: { value: LabPanel; label: string; ariaLabel: string }[] =
    [
      { value: "fit", label: "Fit", ariaLabel: "Body and prop fit" },
      { value: "grip", label: "Grip", ariaLabel: "Grip and collision readout" },
      { value: "turn", label: "Turn", ariaLabel: "Stance turn timing" },
      { value: "matrix", label: "Matrix", ariaLabel: "Coverage matrix" },
    ];

  const VERDICT_COPY: Record<FitVerdict, string> = {
    fits: "Inside this body's hug",
    over: "Longer than this body clears",
    under: "Shorter than this body could hold",
    unsupported: "No supported length fits this body",
    unknown: "Measuring",
  };

  function mm(value: number | null, digits = 0): string {
    return value === null ? "—" : value.toFixed(digits);
  }

  function cm(value: number | null | undefined, digits = 1): string {
    return value === null || value === undefined ? "—" : value.toFixed(digits);
  }

  function deg(value: number | null, digits = 0): string {
    return value === null ? "—" : value.toFixed(digits);
  }

  function radToDeg(value: number): string {
    return ((value * 180) / Math.PI).toFixed(1);
  }
</script>

<div class="inspector">
  <SegmentedControl
    options={PANEL_OPTIONS}
    value={lab.panel}
    density="tight"
    semantics="tabs"
    ariaLabel="Which measurements to show"
    onchange={(panel) => lab.setPanel(panel)}
  />

  <div class="panel-stage">
    <Crossfade key={lab.panel} animateHeight>
      {#if lab.panel === "fit"}
        <div class="panel">
          <p class="verdict" data-verdict={verdict}>
            <b>{cm(drawnLengthCm)} cm</b>
            {fixedLengthCm === null ? "configured" : "on screen"} ·
            {VERDICT_COPY[verdict]}{deltaCm !== null && verdict !== "fits"
              ? ` by ${Math.abs(deltaCm).toFixed(1)} cm`
              : ""}
          </p>
          <dl class="readout">
            <div class="metric">
              <dt>Character height</dt>
              <dd>
                {cm(characterHeightCm)} cm
                <span class="sub">· {imperial(characterHeightCm)}</span>
              </dd>
            </div>
            <div class="metric" data-diverged={fixedLengthCm !== null}>
              <dt>Prop drawn length</dt>
              <dd>
                {cm(drawnLengthCm)} cm
                <span class="sub">· {imperial(drawnLengthCm)}</span>
              </dd>
            </div>
            <div class="metric">
              <dt>Reach (shoulder to grip)</dt>
              <dd>{cm(fit ? fit.measurements.reachM * 100 : null)} cm</dd>
            </div>
            <div class="metric">
              <dt>Upper arm / forearm</dt>
              <dd>
                {cm(fit ? fit.measurements.upperArmM * 100 : null)} / {cm(
                  fit ? fit.measurements.forearmM * 100 : null
                )} cm
              </dd>
            </div>
            <div class="metric">
              <dt>Shoulder half-span</dt>
              <dd>
                {cm(fit ? fit.geometry.shoulderHalfSpanM * 100 : null)} cm
              </dd>
            </div>
            <div class="metric">
              <dt>Torso depth to clear</dt>
              <dd>{cm(fit ? fit.torsoDepthM * 100 : null)} cm</dd>
            </div>
            <div class="metric">
              <dt>Hug lane / separation</dt>
              <dd>
                {cm(fit ? fit.geometry.laneM * 100 : null)} / {cm(
                  fit ? fit.geometry.separationM * 100 : null
                )} cm
              </dd>
            </div>
            <div class="metric">
              <dt>Grips forward of chest</dt>
              <dd>{cm(fit ? fit.geometry.forwardM * 100 : null)} cm</dd>
            </div>
            <div class="metric is-wide">
              <dt>Longest this body clears</dt>
              <dd>
                {cm(fit?.fit.maxStaffLengthCm ?? null)} cm
                {#if fit?.fit.fits}
                  <span class="sub"
                    >· body fit picks {cm(fit.fit.recommendedStaffLengthCm)} cm</span
                  >
                {/if}
              </dd>
            </div>
            <div
              class="metric is-wide"
              data-diverged={lengthDivergenceCm !== null}
            >
              <dt>Collision model staff</dt>
              <dd>
                {cm(collisionLengthCm)} cm
                {#if lengthDivergenceCm !== null}
                  <span class="sub"
                    >· {lengthDivergenceCm > 0 ? "+" : "−"}{Math.abs(
                      lengthDivergenceCm
                    ).toFixed(1)} cm vs drawn</span
                  >
                {/if}
              </dd>
            </div>
            {#if sweepCharacter}
              <div class="metric is-wide">
                <dt>Proportion sweep</dt>
                <dd>
                  {LAB_SWEEP_AXIS_LABEL[sweepCharacter.axis]}
                  {#if sweepParameters}
                    <span class="sub">· {sweepParameters}</span>
                  {/if}
                </dd>
              </div>
              <div class="metric is-wide" data-diverged={sweepDisagrees}>
                <dt>Offline sweep predicted</dt>
                <dd>
                  {sweepCharacter.measured.staffCm.toFixed(1)} cm
                  <span class="sub"
                    >· {sweepCharacter.measured.staffFits
                      ? "fits"
                      : "does not fit"}{#if sweepDeltaCm !== null}, lab measures
                      {sweepDeltaCm > 0 ? "+" : "−"}{Math.abs(
                        sweepDeltaCm
                      ).toFixed(1)} cm{/if}</span
                  >
                </dd>
              </div>
            {/if}
          </dl>
          {#if sweepCharacter}
            <p class="note">
              This body is one base rig with a single dimension moved, so a
              failure here names its own cause. The predicted line is the
              generator's own measurement of the same rest pose; it and the live
              reading above should agree within a centimetre.
            </p>
          {/if}
          {#if fixedLengthCm !== null}
            <p class="note">
              This build is drawn from an authored model that the scene
              package's <code>Prop3D</code> does not stretch, so it measures
              {cm(fixedLengthCm)} cm whatever it is asked for. Prop length above asks
              for {cm(configuredLengthCm)} cm and nothing receives it. Switch to the
              plain Staff to make the control reach the mesh, or change the model's
              own <code>AUTHORED_LENGTH_M</code> and rebuild it.
            </p>
          {/if}
          <p class="note">
            Three lengths are live at once. The configured one reaches the drawn
            prop through <code>propLength</code>, and every build answers it
            except a model the scene does not stretch. The collision model
            builds its segment from the scene package's global
            <code>staffLength</code> and ignores both, so a per-body length changes
            the picture and not the physics.
          </p>
          <p class="note">
            The production sequence viewer takes a third route: it sizes the
            prop from the performer's own <code>staffLengthCm</code> setting, so a
            body-derived fit reaches this route and not that one. Expose both there
            before the fit is trusted as a product behaviour.
          </p>
        </div>
      {:else if lab.panel === "grip"}
        <div class="panel">
          <dl class="readout">
            <div class="metric">
              <dt>Blue axis / contact</dt>
              <dd>
                {deg(leftMetric.axisErrorDeg, 1)}° · {mm(
                  leftMetric.contactOffsetMm,
                  1
                )} mm
              </dd>
            </div>
            <div class="metric">
              <dt>Red axis / contact</dt>
              <dd>
                {deg(rightMetric.axisErrorDeg, 1)}° · {mm(
                  rightMetric.contactOffsetMm,
                  1
                )} mm
              </dd>
            </div>
            <div class="metric">
              <dt>Yaw requested → achieved</dt>
              <dd>
                {deg(poseMetric.requestedYawDeg)}° → {deg(
                  poseMetric.achievedYawDeg
                )}°
              </dd>
            </div>
            <div class="metric">
              <dt>Head dodge</dt>
              <dd>{deg(poseMetric.headDodgeDeg)}°</dd>
            </div>
            <div class="metric is-wide">
              <dt>Grip depth of shoulder half-span</dt>
              <dd>
                {mm(poseMetric.blueGripDepthMm)} / {mm(
                  poseMetric.redGripDepthMm
                )} mm of ±{mm(poseMetric.shoulderHalfSpanMm)}
              </dd>
            </div>
            <div class="metric">
              <dt>Wrist inward blue / red</dt>
              <dd>
                {deg(poseMetric.leftWristInwardDeg)}° / {deg(
                  poseMetric.rightWristInwardDeg
                )}°
              </dd>
            </div>
            <div class="metric">
              <dt>Grip separation</dt>
              <dd>{mm(poseMetric.gripSeparationMm)} mm</dd>
            </div>
            <div class="metric">
              <dt>Collisions</dt>
              <dd>{poseMetric.collisionCount}</dd>
            </div>
            <div class="metric">
              <dt>Deepest penetration</dt>
              <dd>{mm(poseMetric.deepestCollisionMm, 1)} mm</dd>
            </div>
          </dl>
          {#if poseMetric.collisionZones}
            <p class="note">{poseMetric.collisionZones}</p>
          {/if}
        </div>
      {:else if lab.panel === "turn"}
        <div class="panel">
          <div class="chart-frame">
            <StanceTimingChart track={stanceTrack} scoreTime={lab.phase} />
          </div>
          <dl class="readout">
            <div class="metric">
              <dt>Chest lead</dt>
              <dd>{stanceSummary.onsetLeadSteps?.toFixed(2) ?? "—"} steps</dd>
            </div>
            <div class="metric">
              <dt>Spine lead</dt>
              <dd>
                {stanceSummary.spineOnsetLeadSteps?.toFixed(2) ?? "—"} steps
              </dd>
            </div>
            <div class="metric">
              <dt>Peak chest</dt>
              <dd>{radToDeg(stanceSummary.peakChestRad)}°</dd>
            </div>
            <div class="metric">
              <dt>Peak head lag</dt>
              <dd>{radToDeg(stanceSummary.peakHeadLagRad)}°</dd>
            </div>
            <div class="metric">
              <dt>Peak spine stagger</dt>
              <dd>{radToDeg(stanceSummary.peakSpineStaggerRad)}°</dd>
            </div>
            <div class="metric">
              <dt>Angular velocity</dt>
              <dd>
                {stanceVelocity === null ? "—" : stanceVelocity.toFixed(3)}
              </dd>
            </div>
          </dl>
        </div>
      {:else}
        <div class="panel">
          <CoverageMatrixMount matrix={coverageMatrix} />
        </div>
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  /* The rail's Measurements section owns the card and the heading. */
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }

  .panel-stage {
    min-width: 0;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-width: 0;
  }

  .verdict {
    margin: 0;
    padding: 0.5rem 0.7rem;
    border-radius: 10px;
    border: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .verdict[data-verdict="over"],
  .verdict[data-verdict="unsupported"] {
    border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
    background: color-mix(in srgb, var(--semantic-error) 16%, transparent);
  }

  .verdict[data-verdict="fits"] {
    border-color: color-mix(in srgb, var(--semantic-success) 55%, transparent);
    background: color-mix(in srgb, var(--semantic-success) 14%, transparent);
  }

  .verdict[data-verdict="under"] {
    border-color: color-mix(in srgb, var(--semantic-warning) 55%, transparent);
    background: color-mix(in srgb, var(--semantic-warning) 14%, transparent);
  }

  .readout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.45rem;
    margin: 0;
    min-width: 0;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.6rem;
    border-radius: 10px;
    background: var(--card-bg-current, rgba(255, 255, 255, 0.05));
    min-width: 0;
  }

  .metric.is-wide {
    grid-column: 1 / -1;
  }

  /* A number that disagrees with the configuration is the finding, not chrome. */
  .metric[data-diverged="true"] {
    background: color-mix(in srgb, var(--semantic-warning) 18%, transparent);
  }

  .metric dt {
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .metric dd {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text, #fff);
    /* Changing numbers keep their column so the grid never jitters. */
    font-variant-numeric: tabular-nums;
  }

  .sub {
    font-weight: 400;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .note {
    margin: 0;
    font-size: var(--font-size-xs, 0.75rem);
    line-height: 1.5;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .note code {
    color: var(--theme-text, #fff);
  }

  /*
   * The chart draws to the box it is given, so the box is reserved up front —
   * and the box NAMES itself, which it never used to.
   *
   * `StanceTimingChart` carries two `@container timing-band` rules and no
   * ancestor declared the container, so neither had ever matched. The width
   * one is a live defect: the arrivals reading reserves `min-width: 21rem`,
   * the rail gives the band about 20rem, and without the query that floor
   * pushes the last arrival past the edge instead of wrapping. `inline-size`
   * arms it.
   *
   * The companion `(max-height: 13rem)` rule stays unarmed on purpose. A
   * height query needs `size` containment, `size` containment needs a definite
   * height, and every height that clears this chart's readout in a rail this
   * narrow is far above the 13rem seam — a height low enough to match would
   * clip the numbers the panel exists to show.
   */
  .chart-frame {
    display: grid;
    min-width: 0;
    min-height: 190px;
    container-type: inline-size;
    container-name: timing-band;
    border-radius: 10px;
    overflow: hidden;
  }
</style>
