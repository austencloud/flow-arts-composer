<script lang="ts">
  /**
   * The staff grip lab.
   *
   * A grip failure is a relationship between a body, a prop and a moment in a
   * sequence. One body holding one staff through one fixture can only ever
   * show one point in that space, so this page makes all three axes
   * selectable, puts every axis in the URL, and reports the measurements that
   * distinguish "this body cannot hold this prop" from "this pose is wrong".
   *
   * Composition only. The controls are the app's own pickers, the numbers come
   * from the shared reach owner, the cameras come from `inspection-framing`,
   * and the URL is written through the shared navigation writer. This file
   * arranges them and owns one playback clock for every pane.
   */
  import { Canvas, T } from "@threlte/core";
  import { onMount } from "svelte";
  import type {
    AvatarGripDiagnostics,
    AvatarPoseDiagnostics,
    CollisionEvent,
  } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { page } from "$app/state";
  import OrbitControls from "$lib/shared/3d/components/OrbitControls.svelte";
  import {
    scenePropDrawnLengthCm,
    scenePropFixedLengthCm,
  } from "$lib/shared/3d/domain/scene-prop-catalog";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    describeStanceYawTrack,
    stanceYawAngularVelocity,
    type StanceYawTrack,
  } from "$lib/shared/3d/collision/stance-yaw-track";

  import PanelContent from "$lib/shared/components/panel/PanelContent.svelte";
  import PanelHeader from "$lib/shared/components/panel/PanelHeader.svelte";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";

  import LabTransport from "../_lab-kit/LabTransport.svelte";
  import {
    labScrubMax,
    type ScrubMarker,
  } from "../_lab-kit/phase-transport";

  import CoverageMatrixMount from "./CoverageMatrixMount.svelte";
  import LabControls from "./LabControls.svelte";
  import LabInspector from "./LabInspector.svelte";
  import StaffGripStage from "./StaffGripStage.svelte";
  import type { CoverageMatrix } from "./coverage-matrix-contract";
  import {
    INSPECTION_FOV_DEG,
    INSPECTION_VIEWS,
    inspectionShotForView,
  } from "./inspection-framing";
  import {
    bodyDerivedLengthCm,
    compareLengths,
    readBodyPropFit,
    type BodyPropFit,
  } from "./lab-body-fit";
  import {
    DEFAULT_LAB_SEQUENCE_ID,
    labCharacterName,
    labFixture,
    labPropLabel,
    labSequenceLabel,
    labSweepCharacter,
    resolveLabSequence,
  } from "./lab-catalog";
  import {
    labContinuityMarkers,
    labContinuityStatus,
  } from "./lab-continuity";
  import { isLabGoalId } from "./lab-goals";
  import {
    collectFrameMetrics,
    EMPTY_GRIP_METRIC,
    EMPTY_POSE_METRIC,
    formatMetric,
    type GripMetric,
    type PoseMetric,
  } from "./lab-metrics";
  import { StaffLabState } from "./lab-state.svelte";

  /** Motion steps per second. Slow enough to read a 0.16-step stagger. */
  const PLAYBACK_STEPS_PER_SECOND = 1.2;

  let sequence = $state<SequenceData | null>(
    labFixture(DEFAULT_LAB_SEQUENCE_ID)?.sequence ?? null
  );
  let sequenceLoading = $state(false);

  /**
   * The whole lab's state, in the address bar. Constructed at init because it
   * declares reactive class fields; it is handed a step-count reader rather
   * than the sequence itself so phase can clamp to whatever is loaded.
   */
  const stepCount = $derived(sequence?.steps.length ?? 1);

  const lab = new StaffLabState({
    stepCount: () => stepCount,
  });

  /**
   * What the committed sweep found for whatever is loaded, laid out on the
   * transport's own track.
   *
   * The transport draws marks and seeks to them; it does not know what one
   * means. That stays here, because the sweep is this lab's evidence: the
   * shared bar is used by other labs whose marked moments are something else
   * entirely.
   */
  const continuity = $derived(labContinuityStatus(lab.sequenceId));

  /**
   * `lab.sequenceId` changes the instant a goal is pressed; `stepCount` only
   * catches up when that sequence finishes loading. In between, a four-step
   * sequence's markers would be laid out against the eight-step track still on
   * screen and sit at visibly wrong positions for a moment. The sweep records
   * how many steps it walked, so a disagreement is exactly that window: hand
   * the bar nothing through it rather than publish a placement that is wrong.
   */
  const laneMatchesSequence = $derived(
    continuity.state === "unswept" || continuity.sweptStepCount === stepCount
  );

  const continuityMarkers = $derived<readonly ScrubMarker[]>(
    laneMatchesSequence
      ? labContinuityMarkers(continuity, labScrubMax(stepCount)).map(
          (marker) => ({
            key: marker.key,
            start: marker.start,
            width: marker.width,
            seekPhase: marker.seekPhase,
            label: marker.labelRange,
            ariaLabel: marker.ariaLabel,
            title: `${marker.labelRange} · up to ${Math.round(
              marker.peakMagnitudeCm
            )} cm`,
            blue: marker.blue !== null,
            red: marker.red !== null,
          })
        )
      : []
  );

  /**
   * What the empty lane says. Null while a sequence is still resolving —
   * everything it could say right now belongs to the sequence being replaced.
   */
  const continuityNote = $derived(
    !laneMatchesSequence
      ? null
      : continuity.state === "unswept"
        ? "Not in the continuity sweep"
        : "No discontinuities in the sweep"
  );

  /**
   * The sweep engine at `shared/3d/diagnostics/` is being built separately and
   * is deliberately not imported. Hand a `CoverageMatrix` in here and the
   * Matrix panel renders it, every cell linking back into this lab already set
   * to that configuration. See `coverage-matrix-contract.ts`.
   */
  const coverageMatrix: CoverageMatrix | null = null;

  let leftMetric = $state<GripMetric>({ ...EMPTY_GRIP_METRIC });
  let rightMetric = $state<GripMetric>({ ...EMPTY_GRIP_METRIC });
  let poseMetric = $state<PoseMetric>({ ...EMPTY_POSE_METRIC });
  let bodyFit = $state<BodyPropFit | null>(null);
  let stanceTrack = $state<StanceYawTrack | null>(null);

  const stanceSummary = $derived(describeStanceYawTrack(stanceTrack));
  const stanceVelocity = $derived(
    stanceYawAngularVelocity(stanceTrack, lab.phase)
  );

  const characterName = $derived(labCharacterName(lab.character));
  const propLabel = $derived(labPropLabel(lab.prop));
  const displayWord = $derived(
    sequence ? labSequenceLabel(sequence) : lab.sequenceId
  );

  const bodyLengthCm = $derived(bodyDerivedLengthCm(bodyFit));

  /**
   * The length this configuration ASKS the prop to be: the pinned number, or
   * the one this body's hug derives. It is what `propLength` carries into the
   * rig, and it is not necessarily what gets drawn — see `drawnLengthCm`.
   *
   * It is also not frozen. `LiveSequencePerformer3D` takes its reach reading
   * once, on the first valid frame, and never again; this panel recomputes the
   * fit from the live diagnostics every frame. So on a body-fit configuration
   * this number drifts by a few millimetres across a scrub while the mesh in
   * the viewport does not move at all.
   */
  const configuredLengthCm = $derived(
    lab.propLength === "body" ? bodyLengthCm : lab.propLength
  );

  /**
   * The length actually on screen. A procedural build draws what it is asked
   * for, and so does a model `Prop3D` stretches to the length it is handed;
   * a model it does not stretch draws its authored length and ignores the ask.
   * The catalog owns which builds are which.
   */
  const fixedLengthCm = $derived(scenePropFixedLengthCm(lab.prop));
  const drawnLengthCm = $derived(
    scenePropDrawnLengthCm(lab.prop, configuredLengthCm)
  );

  /**
   * How tall the body on stage is, in centimetres. This is the configured
   * height, not a reading off the mesh: `AvatarSkeletonBuilder.setHeight`
   * scales the loaded rig by `heightCm / originalHeight`, so the silhouette
   * is this number by construction. Measured against ch07's posed vertices it
   * came back 190.69 cm against a configured 190.5 — 1.9 mm, all of it hair.
   */
  const characterHeightCm = $derived(userProportionsState.heightCm);

  /**
   * The length the COLLISION model is using, read back off the grip segment.
   * It does not follow `propLength`: the scene package builds that segment
   * from the global `userProportionsState.staffLength`, so a per-performer
   * length changes the picture and not the physics. Surfacing both is the
   * point — a silent divergence here is exactly the class of problem that
   * only shows up on a body the default length does not suit.
   */
  const collisionLengthCm = $derived(
    poseMetric.collisionStaffLengthMm === null
      ? null
      : poseMetric.collisionStaffLengthMm / 10
  );

  /** Can this body clear the shaft that is actually on screen? */
  const fitComparison = $derived(compareLengths(bodyFit, drawnLengthCm));

  /**
   * When the body on stage is one of the controlled proportion sweep rigs, the
   * generator recorded what it measured off the GLB's rest pose and whether it
   * expected a staff to fit. The lab measures the same body live, through the
   * running solve. Showing both is the point: agreement means the offline
   * sweep can be trusted to pre-filter a coverage matrix, and disagreement is
   * a finding in one of the two, not a rounding difference to average away.
   */
  const sweepCharacter = $derived(labSweepCharacter(lab.character));

  /**
   * A divergence worth naming, not a rounding difference. Below this the two
   * numbers are the same measurement read two ways.
   */
  const LENGTH_DIVERGENCE_NOISE_CM = 0.5;
  const lengthDivergenceCm = $derived(
    drawnLengthCm === null || collisionLengthCm === null
      ? null
      : Math.abs(collisionLengthCm - drawnLengthCm) <
          LENGTH_DIVERGENCE_NOISE_CM
        ? null
        : collisionLengthCm - drawnLengthCm
  );

  /** Quad shows the set; a solo view gives one camera the whole stage. */
  const activeViews = $derived(
    lab.view === "quad"
      ? INSPECTION_VIEWS
      : INSPECTION_VIEWS.filter((view) => view.id === lab.view)
  );

  // Each pane solves its own shot against its own aspect ratio, so a tall
  // reference column and a squat inspection cell both frame their subject
  // instead of one of them cropping it.
  let paneWidths = $state<number[]>(INSPECTION_VIEWS.map(() => 0));
  let paneHeights = $state<number[]>(INSPECTION_VIEWS.map(() => 0));
  const shots = $derived(
    activeViews.map((view, index) => {
      const width = paneWidths[index] ?? 0;
      const height = paneHeights[index] ?? 0;
      const aspectRatio = width > 0 && height > 0 ? width / height : 1;
      return inspectionShotForView(view, aspectRatio);
    })
  );

  function collectGripMetrics(
    events: CollisionEvent[],
    diagnostics: AvatarPoseDiagnostics,
    gripDiagnostics: AvatarGripDiagnostics
  ): void {
    const frame = collectFrameMetrics(events, diagnostics, gripDiagnostics);
    leftMetric = frame.left;
    rightMetric = frame.right;
    poseMetric = frame.pose;
    const fit = readBodyPropFit(diagnostics);
    if (fit) bodyFit = fit;
  }

  onMount(() => {
    // This route breaks out of the app layout, so nothing has set the theme
    // variables the shared pickers and chips paint with. Reading the device's
    // own saved background keeps the lab in the app's palette instead of every
    // primitive falling back to its hardcoded default.
    void import("$lib/shared/settings/utils/background-theme-calculator").then(
      ({ ensureThemeApplied }) => ensureThemeApplied()
    );
  });

  // A pasted link or a reload arrives as a real navigation, which is the one
  // URL change SvelteKit still reports through `page.url`. Reading its href
  // here is what makes re-seeding the lab's mirror reactive.
  $effect(() => {
    void page.url.href;
    lab.syncFromNavigation();
  });

  // Back and Forward move the address bar without any framework signal at
  // all, because every write here is shallow routing. This is the only way
  // history navigation reaches the lab.
  $effect(() => lab.attachUrlSync());

  // Someone reaching for the address bar blurs the window first, so that is
  // the moment a still-moving phase has to be pinned exactly.
  $effect(() => lab.attachFlushOnBlur());

  // A character swap changes the skeleton every measurement was taken from.
  $effect(() => {
    void lab.character;
    bodyFit = null;
  });

  $effect(() => {
    const id = lab.sequenceId;
    const fixture = labFixture(id);
    if (fixture) {
      sequence = fixture.sequence;
      sequenceLoading = false;
      return;
    }
    // A library or community id: the product's own loader resolves it, which
    // is what lets a pasted lab URL reproduce a library sequence cold.
    let cancelled = false;
    sequenceLoading = true;
    void resolveLabSequence(id).then((loaded) => {
      if (cancelled) return;
      sequenceLoading = false;
      if (loaded) sequence = loaded;
    });
    return () => {
      cancelled = true;
    };
  });

  /**
   * One clock for every pane. Each pane holds its own performer, so letting
   * them run their own playback would drift them apart within seconds; seeking
   * every pane from this phase keeps all the cameras on the same frame of the
   * same turn. The tick reads and writes phase outside the effect's tracking
   * scope, so advancing it cannot restart the loop.
   */
  $effect(() => {
    if (!lab.playing) return;
    const span = sequence?.steps.length ?? 0;
    if (span <= 0) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      const next = lab.phase + elapsed * PLAYBACK_STEPS_PER_SECOND;
      lab.setPhase(next >= span - 0.01 ? next - span : next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<svelte:head>
  <title>Staff Grip Lab</title>
  <meta
    name="description"
    content="Compare one grip across characters, props and sequences."
  />
</svelte:head>

<main
  class="grip-lab"
  data-sequence-source={labFixture(lab.sequenceId)
    ? "validated-production-fixture"
    : isLabGoalId(lab.sequenceId)
      ? "core-goal"
      : "library"}
  data-sequence-id={lab.sequenceId}
  data-sequence-steps={sequence?.steps.length ?? 0}
  data-character-id={lab.character}
  data-prop={lab.prop}
  data-prop-length-mode={lab.propLength === "body" ? "body" : "pinned"}
  data-prop-length-cm={lab.propLength === "body"
    ? "body"
    : lab.propLength.toFixed(0)}
  data-view={lab.view}
  data-panel={lab.panel}
  data-grid-labels={lab.gridLabels ? "1" : "0"}
  data-lab-href={lab.fullyQualifiedHref()}
  data-phase={lab.phase.toFixed(2)}
  data-body-max-staff-cm={formatMetric(
    bodyFit?.fit.maxStaffLengthCm ?? null,
    2
  )}
  data-body-recommended-staff-cm={formatMetric(bodyLengthCm, 2)}
  data-body-shoulder-half-span-mm={formatMetric(
    bodyFit ? bodyFit.geometry.shoulderHalfSpanM * 1000 : null,
    2
  )}
  data-body-torso-depth-mm={formatMetric(
    bodyFit ? bodyFit.torsoDepthM * 1000 : null,
    2
  )}
  data-configured-length-cm={formatMetric(configuredLengthCm, 2)}
  data-drawn-length-cm={formatMetric(drawnLengthCm, 2)}
  data-prop-honours-length={fixedLengthCm === null}
  data-character-height-cm={formatMetric(characterHeightCm, 2)}
  data-collision-length-cm={formatMetric(collisionLengthCm, 2)}
  data-length-divergence-cm={formatMetric(lengthDivergenceCm, 2)}
  data-fit-verdict={fitComparison.verdict}
  data-fit-delta-cm={formatMetric(fitComparison.deltaCm, 2)}
  data-left-axis-error-deg={formatMetric(leftMetric.axisErrorDeg, 3)}
  data-right-axis-error-deg={formatMetric(rightMetric.axisErrorDeg, 3)}
  data-left-contact-offset-mm={formatMetric(leftMetric.contactOffsetMm, 3)}
  data-right-contact-offset-mm={formatMetric(rightMetric.contactOffsetMm, 3)}
  data-requested-yaw-deg={formatMetric(poseMetric.requestedYawDeg, 3)}
  data-achieved-yaw-deg={formatMetric(poseMetric.achievedYawDeg, 3)}
  data-head-dodge-deg={formatMetric(poseMetric.headDodgeDeg, 3)}
  data-torso-pitch-deg={formatMetric(poseMetric.torsoPitchDeg, 3)}
  data-collision-count={poseMetric.collisionCount}
  data-collision-zones={poseMetric.collisionZones}
  data-deepest-collision-mm={formatMetric(poseMetric.deepestCollisionMm, 3)}
  data-collision-descriptions={poseMetric.collisionDescriptions}
  data-palm-separation-mm={formatMetric(poseMetric.palmSeparationMm, 2)}
  data-palm-depth-separation-mm={formatMetric(
    poseMetric.palmDepthSeparationMm,
    2
  )}
  data-grip-separation-mm={formatMetric(poseMetric.gripSeparationMm, 2)}
  data-left-elbow-mm={poseMetric.leftElbow}
  data-right-elbow-mm={poseMetric.rightElbow}
  data-left-wrist-inward-deg={formatMetric(poseMetric.leftWristInwardDeg, 2)}
  data-right-wrist-inward-deg={formatMetric(poseMetric.rightWristInwardDeg, 2)}
  data-left-wrist-bend-deg={formatMetric(poseMetric.leftWristBendDeg, 2)}
  data-right-wrist-bend-deg={formatMetric(poseMetric.rightWristBendDeg, 2)}
  data-left-palm-to-authored-mm={formatMetric(
    poseMetric.leftPalmToAuthoredMm,
    2
  )}
  data-right-palm-to-authored-mm={formatMetric(
    poseMetric.rightPalmToAuthoredMm,
    2
  )}
  data-upper-arm-mm={formatMetric(poseMetric.upperArmMm, 2)}
  data-forearm-mm={formatMetric(poseMetric.forearmMm, 2)}
  data-reach-mm={formatMetric(poseMetric.reachMm, 2)}
  data-collision-staff-length-mm={formatMetric(
    poseMetric.collisionStaffLengthMm,
    2
  )}
  data-audience-grip-separation-mm={formatMetric(
    poseMetric.audienceGripSeparationMm,
    3
  )}
  data-depth-grip-separation-mm={formatMetric(
    poseMetric.depthGripSeparationMm,
    3
  )}
  data-blue-grip-depth-mm={formatMetric(poseMetric.blueGripDepthMm, 3)}
  data-red-grip-depth-mm={formatMetric(poseMetric.redGripDepthMm, 3)}
  data-shoulder-half-span-mm={formatMetric(poseMetric.shoulderHalfSpanMm, 3)}
  data-rendered-step-number={poseMetric.renderedStepNumber}
  data-rendered-beat-progress={formatMetric(poseMetric.renderedBeatProgress, 3)}
  data-playing={lab.playing}
  data-stance-lead-steps={formatMetric(stanceSummary.onsetLeadSteps, 4)}
  data-stance-spine-lead-steps={formatMetric(
    stanceSummary.spineOnsetLeadSteps,
    4
  )}
  data-stance-peak-chest-deg={formatMetric(
    (stanceSummary.peakChestRad * 180) / Math.PI,
    3
  )}
  data-stance-peak-head-lag-deg={formatMetric(
    (stanceSummary.peakHeadLagRad * 180) / Math.PI,
    3
  )}
  data-stance-peak-spine-stagger-deg={formatMetric(
    (stanceSummary.peakSpineStaggerRad * 180) / Math.PI,
    3
  )}
  data-stance-arrival-spine1={formatMetric(stanceSummary.arrivals.spine1, 4)}
  data-stance-arrival-chest={formatMetric(stanceSummary.arrivals.chest, 4)}
  data-stance-arrival-spine2={formatMetric(stanceSummary.arrivals.spine2, 4)}
  data-stance-arrival-head={formatMetric(stanceSummary.arrivals.head, 4)}
  data-stance-angular-velocity={formatMetric(stanceVelocity, 5)}
>
  <aside class="rail" aria-label="Lab configuration and measurements">
    <!--
      The app's own panel masthead, at the rank a page owes its document. The
      lab used to open on a 17px heading, which is smaller than the section
      labels under it and the first thing that read as a debug console.
    -->
    <PanelHeader
      headingLevel={1}
      icon="fa-flask"
      title="Staff grip lab"
      subtitle={`${characterName} · ${propLabel} · ${displayWord}`}
    />

    <PanelContent>
      <div class="rail-sections">
        <LabControls
          {lab}
          {sequence}
          {sequenceLoading}
          {bodyLengthCm}
          bodyMeasured={bodyFit !== null}
        />

        <LabInspector
          {lab}
          {sweepCharacter}
          fit={bodyFit}
          verdict={fitComparison.verdict}
          deltaCm={fitComparison.deltaCm}
          {configuredLengthCm}
          {drawnLengthCm}
          {fixedLengthCm}
          {characterHeightCm}
          {collisionLengthCm}
          {lengthDivergenceCm}
          {leftMetric}
          {rightMetric}
          {poseMetric}
          {stanceTrack}
          {stanceSummary}
          {stanceVelocity}
          {coverageMatrix}
        />
      </div>
    </PanelContent>
  </aside>

  <div class="stage">
    <div class="views" data-layout={lab.view === "quad" ? "quad" : "solo"}>
      {#if sequence}
        {#each activeViews as view, index (view.id)}
          <section
            class="view"
            aria-label={`${view.label}: ${view.hint}`}
            bind:clientWidth={paneWidths[index]}
            bind:clientHeight={paneHeights[index]}
          >
            <!--
              No scene clear colour. An alpha buffer lets the pane's own app
              surface show through, so the canvases sit on the product's ground
              rather than on a navy rectangle that appears nowhere else.
            -->
            <Canvas shadows rendererParameters={{ alpha: true }}>
              <T.PerspectiveCamera
                makeDefault
                position={shots[index].position}
                fov={INSPECTION_FOV_DEG}
              >
                <OrbitControls
                  enableDamping
                  enablePan={false}
                  rightDragAction="rotate"
                  target={shots[index].target}
                  minDistance={0.3}
                  maxDistance={12}
                  maxPolarAngle={Math.PI}
                />
              </T.PerspectiveCamera>

              <StaffGripStage
                id={`staff-grip-${view.id}`}
                phase={lab.phase}
                {sequence}
                characterId={lab.character}
                propType={lab.prop}
                propLengthCm={lab.propLength === "body" ? null : lab.propLength}
                gridEmphasis={view.grid}
                showGridLabels={lab.gridLabels}
                onCollisionEvents={index === 0 ? collectGripMetrics : undefined}
                onStanceTrack={index === 0
                  ? (track) => {
                      stanceTrack = track;
                    }
                  : undefined}
              />
            </Canvas>
            <span class="view-label">
              <b>{view.label}</b>
              <i>{view.hint}</i>
            </span>
          </section>
        {/each}
      {:else}
        <div class="stage-empty">
          <PanelState type="loading" message="Loading sequence…" />
        </div>
      {/if}
    </div>

    <!--
      The transport lives under the cameras, where the app puts one, and is the
      shared TransportControls the rest of the product plays with. It stays
      mounted while a sequence resolves so the stage above it never resizes.
    -->
    <LabTransport
      {lab}
      {stepCount}
      disabled={!sequence}
      markers={continuityMarkers}
      markerNote={continuityNote}
      markerLaneLabel="Prop discontinuities in this sequence"
    />
  </div>

  <!--
    The matrix has a home in the inspector rail, which is where it belongs on a
    laptop. Past a very wide canvas the rail is the wrong shape for a table, so
    the same contract also mounts as a band under the cameras.
  -->
  {#if lab.panel === "matrix"}
    <div class="stage-matrix" aria-label="Coverage matrix">
      <CoverageMatrixMount matrix={coverageMatrix} />
    </div>
  {/if}
</main>

<style>
  .grip-lab {
    position: relative;
    display: grid;
    min-height: 100dvh;
    background: var(--background, #0a0a0a);
    color: var(--theme-text, #fff);

    /* Narrow is the base: the rail first, so the controls and the numbers are
       reachable without scrolling past a stack of canvases. */
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "rail"
      "stage"
      "matrix";
  }

  /*
   * The rail is an app panel: a masthead that does not scroll over a body that
   * does. PanelHeader and PanelContent own the padding and the scroll, so this
   * rule only places the panel and paints its surface.
   */
  .rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel-bg-current, rgba(255, 255, 255, 0.05));
    backdrop-filter: var(--glass-backdrop, blur(20px));
    border-bottom: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
  }

  /*
   * The panel body flows into as many columns as its own width affords.
   * Stacked above the stage on a tablet it is the full viewport wide, and a
   * single column there stretches a two-word segmented control across 700px
   * and pushes every camera below the fold. Two columns keep each control at
   * the measure it has as a desktop rail and halve the height the stage sits
   * under. As a side rail — 20rem to 34rem — this resolves to one column, so
   * no breakpoint has to name the difference.
   */
  .rail-sections {
    display: grid;
    /* min() so the track can fall below its own floor rather than
       overflowing a rail narrower than 19rem, which is the 19rem side
       rail a folded phone gets once padding is taken out of it. */
    grid-template-columns: repeat(auto-fit, minmax(min(19rem, 100%), 1fr));
    align-content: start;
    align-items: start;
    gap: 1rem 1.25rem;
    min-width: 0;
  }

  /* Cameras over a transport, the way the product stacks a player. */
  .stage {
    grid-area: stage;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
  }

  .views {
    display: grid;
    min-width: 0;
    min-height: 0;
    /* A Threlte canvas reports the size it was last measured at, so an auto
       row would let a pane keep a height it is no longer entitled to. */
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: minmax(0, 52svh);
  }

  .views[data-layout="solo"] {
    grid-auto-rows: minmax(0, 72svh);
  }

  .stage-empty {
    display: grid;
    place-items: center;
    min-height: 40svh;
    min-width: 0;
  }

  .stage-matrix {
    grid-area: matrix;
    /* On narrow and laptop widths the rail's own Matrix panel is the one that
       shows; this band only appears where a table has room to be read. */
    display: none;
    min-width: 0;
    padding: 0.9rem 1.1rem;
    background: var(--panel-bg-current, rgba(255, 255, 255, 0.05));
    border-top: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    overflow: auto;
  }

  .view {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-bottom: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    background: var(--surface-inset, rgba(0, 0, 0, 0.2));
  }

  .view :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .view-label {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    display: grid;
    gap: 0.1rem;
    max-width: calc(100% - 1.5rem);
    padding: 0.35rem 0.6rem;
    border: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    border-radius: 0.4rem;
    background: var(--surface-glass, rgba(0, 0, 0, 0.5));
    box-shadow: var(--shadow-glass);
    pointer-events: none;
    backdrop-filter: var(--glass-backdrop, blur(20px));
  }

  .view-label b {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 650;
  }

  .view-label i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-xs, 0.8125rem);
    font-style: normal;
  }

  /*
   * Mid: the four panes pair up. One stacked column on a tablet leaves every
   * pane wide and short, so the framing solver fits the subject to the height
   * and the width goes to empty stage either side of it.
   */
  @media (min-width: 40rem) {
    .views[data-layout="quad"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /*
   * Wide: the rail becomes a column and the stage owns the rest of the
   * viewport. The rail is a reading width, not a share of the screen — it
   * grows a little on a wider canvas and then stops, and the space it does not
   * take goes to the cameras, which are what benefits from it.
   */
  @media (min-width: 64rem) {
    .grip-lab {
      grid-template-columns: clamp(20rem, 21vw, 26rem) minmax(0, 1fr);
      grid-template-areas: "rail stage";
      height: 100dvh;
      overflow: hidden;
    }

    .rail {
      border-right: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
      border-bottom: 0;
      overflow: hidden;
    }

    .views {
      grid-auto-rows: unset;
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    .views[data-layout="solo"] {
      grid-template-rows: minmax(0, 1fr);
    }

    .view:nth-child(odd) {
      border-right: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    }

    .view:nth-last-child(-n + 2) {
      border-bottom: 0;
    }
  }

  /*
   * Wide and short — a folded phone in landscape. The rail still takes a
   * column, but it can afford less of one, and the pane captions lose their
   * second line: a two-line caption over a 200px pane covers the subject it is
   * naming. The sentence stays in the section's accessible name, which is
   * where a screen reader reads it from at every width.
   */
  @media (min-width: 40rem) and (max-height: 34rem) {
    .grip-lab {
      grid-template-columns: minmax(0, 19rem) minmax(0, 1fr);
      grid-template-areas: "rail stage";
      height: 100dvh;
      overflow: hidden;
    }

    .rail {
      border-right: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
      border-bottom: 0;
      overflow: hidden;
    }

    .views {
      grid-auto-rows: unset;
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    .views[data-layout="solo"] {
      grid-template-rows: minmax(0, 1fr);
    }

    .view-label i {
      display: none;
    }
  }

  /*
   * Very wide: a coverage matrix is a table, and a table does not read in a
   * 26rem rail. Past this width it gets a band under the cameras instead,
   * where a character-by-prop grid is actually legible.
   */
  /* A 26rem rail is a tenth of a 4K canvas: the inspector's paired metrics
     collapse to one narrow column while the stage sits on space it does not
     need. Widen the control band with the viewport so the numbers stay in
     two readable columns. The stage still takes everything left over. */
  @media (min-width: 100rem) {
    .grip-lab {
      grid-template-columns: clamp(26rem, 17vw, 34rem) minmax(0, 1fr);
    }

    .grip-lab:has(.stage-matrix) {
      grid-template-areas:
        "rail stage"
        "rail matrix";
      grid-template-rows: minmax(0, 1fr) minmax(0, clamp(12rem, 22vh, 22rem));
    }

    .stage-matrix {
      display: block;
    }
  }
</style>
