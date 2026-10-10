<script lang="ts">
  /**
   * FFS-FID-001 evidence harness.
   *
   * Everything on this page is production code: the vehicle component, the
   * pedal anchors, the mounted-pose rig, and the terrain-attitude derivation.
   * The page only chooses a camera, a slope, and a dynamics preset, then prints
   * the diagnostic the rig already publishes.
   *
   * `window.__flowFestEucPose()` returns the same diagnostic for scripted
   * measurement, so a capture run can assert numbers instead of eyeballing the
   * overlay. `window.__flowFestEucPoseSet()` moves between cases through
   * client-side navigation, which keeps the WebGL context and the loaded avatar
   * alive - a full reload would re-download the rig for every frame and reset
   * the idle-stability window that one of the criteria measures.
   */
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import type { FlowFestElectricUnicycleDynamics } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import {
    FLOW_FEST_EUC_CONTACT_THRESHOLDS,
    type FlowFestEucMountedPoseDiagnostic,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import FlowFestEucPoseStage from "./FlowFestEucPoseStage.svelte";
  import {
    EUC_POSE_MOTION_IDS,
    EUC_POSE_MOTIONS,
    EUC_POSE_SLOPE_DEGREES,
    EUC_POSE_VIEW_IDS,
    EUC_POSE_VIEWS,
    parseEucPoseMotion,
    parseEucPoseSlope,
    parseEucPoseView,
  } from "./euc-pose-harness-views";

  const view = $derived(parseEucPoseView(page.url.searchParams.get("view")));
  const motion = $derived(parseEucPoseMotion(page.url.searchParams.get("motion")));
  const slopeDegrees = $derived(
    parseEucPoseSlope(page.url.searchParams.get("slope"))
  );
  const slopeBearingDegrees = $derived(
    Number(page.url.searchParams.get("bearing") ?? "30")
  );
  const mounted = $derived(page.url.searchParams.get("mounted") !== "0");
  const rough = $derived(page.url.searchParams.get("rough") === "1");
  const markers = $derived(page.url.searchParams.get("markers") === "1");
  const hudVisible = $derived(page.url.searchParams.get("hud") !== "0");
  const simulationRateHz = $derived.by(() => {
    const raw = page.url.searchParams.get("rate");
    if (raw === null || raw === "native") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 5 && parsed <= 240
      ? parsed
      : null;
  });

  let diagnostic = $state<FlowFestEucMountedPoseDiagnostic | null>(null);
  let dynamics = $state<FlowFestElectricUnicycleDynamics | null>(null);

  function handleDiagnostic(next: FlowFestEucMountedPoseDiagnostic): void {
    diagnostic = next;
  }

  function handleDynamics(next: FlowFestElectricUnicycleDynamics): void {
    dynamics = next;
  }

  type HarnessOverrides = Partial<{
    view: string;
    motion: string;
    slope: string;
    bearing: string;
    mounted: string;
    markers: string;
    hud: string;
    rate: string;
  }>;

  function href(overrides: HarnessOverrides): string {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    return `?${params.toString()}`;
  }

  const MILLIMETRES = 1000;

  function mm(value: number): string {
    return Number.isFinite(value)
      ? `${(value * MILLIMETRES).toFixed(1)} mm`
      : "—";
  }

  function deg(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(1)}°` : "—";
  }

  function pct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function verdict(pass: boolean): string {
    return pass ? "PASS" : "FAIL";
  }

  onMount(() => {
    Object.assign(window, {
      __flowFestEucPose: () => ({
        view,
        motion,
        slopeDegrees,
        slopeBearingDegrees,
        mounted,
        rough,
        simulationRateHz,
        thresholds: FLOW_FEST_EUC_CONTACT_THRESHOLDS,
        dynamics,
        diagnostic,
      }),
      __flowFestEucPoseSet: (overrides: HarnessOverrides) =>
        goto(href(overrides), {
          replace: true,
          reset: false,
        }),
    });
  });
</script>

<svelte:head>
  <title>EUC mounted-pose evidence</title>
</svelte:head>

<div class="stage">
  <Canvas
    dpr={1}
    shadows={PCFSoftShadowMap}
    toneMapping={AgXToneMapping}
    toneMappingExposure={1.15}
  >
    <FlowFestEucPoseStage
      {view}
      {slopeDegrees}
      {slopeBearingDegrees}
      {motion}
      {mounted}
      {rough}
      {markers}
      {simulationRateHz}
      onDiagnostic={handleDiagnostic}
      onDynamics={handleDynamics}
    />
  </Canvas>

  {#if hudVisible}
    <div class="controls">
      <div class="row">
        {#each EUC_POSE_VIEW_IDS as id (id)}
          <a class="chip" class:active={id === view} href={href({ view: id })}>
            {EUC_POSE_VIEWS[id].label}
          </a>
        {/each}
      </div>
      <div class="row">
        {#each EUC_POSE_SLOPE_DEGREES as degrees (degrees)}
          <a
            class="chip"
            class:active={degrees === slopeDegrees}
            href={href({ slope: String(degrees) })}
          >
            {degrees === 0 ? "Level" : `${degrees}° slope`}
          </a>
        {/each}
      </div>
      <div class="row">
        {#each EUC_POSE_MOTION_IDS as id (id)}
          <a class="chip" class:active={id === motion} href={href({ motion: id })}>
            {EUC_POSE_MOTIONS[id].label}
          </a>
        {/each}
      </div>
      <div class="row">
        <a
          class="chip"
          class:active={mounted}
          href={href({ mounted: mounted ? "0" : "1" })}
        >
          {mounted ? "Mounted" : "Dismounted"}
        </a>
        <a
          class="chip"
          class:active={markers}
          href={href({ markers: markers ? "0" : "1" })}
        >
          Contact markers
        </a>
        <a
          class="chip"
          class:active={simulationRateHz === 30}
          href={href({ rate: simulationRateHz === 30 ? "native" : "30" })}
        >
          30 Hz sim
        </a>
      </div>
    </div>

    <div class="readout">
      {#if !mounted}
        <p class="headline neutral">Dismounted — no mounted pose</p>
        <p class="note">
          The rider is unmounted, so the pose rig is detached and the ordinary
          animation pipeline owns the avatar.
        </p>
      {:else if diagnostic === null}
        <p class="headline neutral">Waiting for the first frame</p>
      {:else}
        <p class="headline" class:pass={diagnostic.pass} class:fail={!diagnostic.pass}>
          {verdict(diagnostic.pass)} · {diagnostic.status}
        </p>
        {#if diagnostic.unsupportedReason}
          <p class="note fail">{diagnostic.unsupportedReason}</p>
        {/if}

        <table>
          <thead>
            <tr><th>Contact</th><th>Left</th><th>Right</th><th>Limit</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Sole to pedal</td>
              <td class:fail={!diagnostic.leftVerdict.soleWithinTolerance}>
                {mm(diagnostic.left.errorMeters)}
              </td>
              <td class:fail={!diagnostic.rightVerdict.soleWithinTolerance}>
                {mm(diagnostic.right.errorMeters)}
              </td>
              <td>{mm(FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumSoleErrorMeters)}</td>
            </tr>
            <tr>
              <td>Penetration</td>
              <td class:fail={!diagnostic.leftVerdict.penetrationWithinTolerance}>
                {mm(diagnostic.left.penetrationMeters)}
              </td>
              <td class:fail={!diagnostic.rightVerdict.penetrationWithinTolerance}>
                {mm(diagnostic.right.penetrationMeters)}
              </td>
              <td>
                {mm(FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumPenetrationMeters)}
              </td>
            </tr>
            <tr>
              <td>Foot forward</td>
              <td class:fail={!diagnostic.leftVerdict.footForwardWithinTolerance}>
                {deg(diagnostic.left.forwardErrorDegrees)}
              </td>
              <td class:fail={!diagnostic.rightVerdict.footForwardWithinTolerance}>
                {deg(diagnostic.right.forwardErrorDegrees)}
              </td>
              <td>
                {deg(FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumFootForwardDegrees)}
              </td>
            </tr>
            <tr>
              <td>Knee flex</td>
              <td class:fail={!diagnostic.leftVerdict.kneeWithinRange}>
                {deg(diagnostic.left.kneeFlexDegrees)}
              </td>
              <td class:fail={!diagnostic.rightVerdict.kneeWithinRange}>
                {deg(diagnostic.right.kneeFlexDegrees)}
              </td>
              <td>
                {deg(FLOW_FEST_EUC_CONTACT_THRESHOLDS.minimumKneeFlexDegrees)}–{deg(
                  FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumKneeFlexDegrees
                )}
              </td>
            </tr>
            <tr>
              <td>Knee forward</td>
              <td class:fail={!diagnostic.left.kneeForward}>
                {diagnostic.left.kneeForward ? "yes" : "no"}
              </td>
              <td class:fail={!diagnostic.right.kneeForward}>
                {diagnostic.right.kneeForward ? "yes" : "no"}
              </td>
              <td>yes</td>
            </tr>
          </tbody>
        </table>

        <dl>
          <div class:fail={!diagnostic.pelvisWithinTolerance}>
            <dt>Pelvis lateral</dt>
            <dd>
              {mm(diagnostic.pelvisLateralOffsetMeters)} of {mm(
                FLOW_FEST_EUC_CONTACT_THRESHOLDS.maximumPelvisLateralOffsetMeters
              )}
            </dd>
          </div>
          <div>
            <dt>Pelvis forward</dt>
            <dd>{mm(diagnostic.pelvisForwardOffsetMeters)}</dd>
          </div>
          <div>
            <dt>Stance width</dt>
            <dd>{mm(diagnostic.stanceWidthMeters)}</dd>
          </div>
          <div>
            <dt>Idle spread</dt>
            <dd>
              {mm(diagnostic.idleStability.leftSpreadMeters)} / {mm(
                diagnostic.idleStability.rightSpreadMeters
              )}
              over {diagnostic.idleStability.windowSeconds.toFixed(1)} s
            </dd>
          </div>
          <div>
            <dt>Blend</dt>
            <dd>
              neutral {pct(diagnostic.blend.neutral)} · accel {pct(
                diagnostic.blend.accelerate
              )} · brake {pct(diagnostic.blend.brake)} · carve L {pct(
                diagnostic.blend.carveLeft
              )} / R {pct(diagnostic.blend.carveRight)}
            </dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>
              {diagnostic.frameRateHz.toFixed(0)} Hz · locomotion {diagnostic.locomotionSuspended
                ? "suspended"
                : "active"}
            </dd>
          </div>
        </dl>
      {/if}

      <p class="note">
        {EUC_POSE_VIEWS[view].label} · {EUC_POSE_MOTIONS[motion].label} ·
        {slopeDegrees === 0 ? "level" : `${slopeDegrees}° slope`}
        {#if dynamics}
          · {dynamics.speedMetersPerSecond.toFixed(1)} m/s
        {/if}
      </p>
    </div>
  {/if}
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    background: #12161c;
    color: #e8eef7;
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .controls {
    position: absolute;
    inset-block-start: 0.75rem;
    inset-inline-start: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 1.85rem;
    padding: 0 0.7rem;
    border: 1px solid rgb(255 255 255 / 0.18);
    border-radius: 999px;
    background: rgb(10 14 20 / 0.72);
    color: #cfdaea;
    font-size: 0.75rem;
    text-decoration: none;
  }

  .chip:hover {
    border-color: rgb(255 255 255 / 0.4);
    color: #ffffff;
  }

  .chip.active {
    border-color: #6fc7ff;
    background: rgb(24 62 96 / 0.85);
    color: #ffffff;
  }

  .readout {
    position: absolute;
    inset-block-end: 0.75rem;
    inset-inline-start: 0.75rem;
    min-width: 27rem;
    max-width: min(34rem, calc(100vw - 1.5rem));
    padding: 0.7rem 0.85rem;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 0.6rem;
    background: rgb(8 11 16 / 0.86);
    font-size: 0.72rem;
    line-height: 1.45;
  }

  .headline {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .headline.pass {
    color: #6ff0a8;
  }

  .headline.fail,
  .note.fail {
    color: #ff8188;
  }

  .headline.neutral {
    color: #cfdaea;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.45rem;
  }

  th,
  td {
    padding: 0.1rem 0.35rem 0.1rem 0;
    text-align: right;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  th:first-child,
  td:first-child {
    text-align: left;
    color: #9fb0c6;
  }

  thead th {
    color: #7f90a6;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid rgb(255 255 255 / 0.12);
  }

  tbody td:last-child {
    color: #7f90a6;
  }

  td.fail {
    color: #ff8188;
    font-weight: 700;
  }

  dl {
    display: grid;
    gap: 0.05rem;
    margin: 0 0 0.4rem;
  }

  dl > div {
    display: flex;
    gap: 0.5rem;
  }

  dl > div.fail dd {
    color: #ff8188;
    font-weight: 700;
  }

  dt {
    flex: 0 0 6.5rem;
    color: #9fb0c6;
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    color: #8b9cb3;
  }
</style>
