<script lang="ts">
  /**
   * EUC free-ride behavior lab.
   *
   * Ride the production vehicle stack with WASD/arrows on an ideal plane and
   * watch how the rider behaves under real accelerations. The HUD carries the
   * twitch meter — worst lean/pitch/pelvis rates over a rolling window — so
   * "he twitches while riding" becomes a number a capture run can assert.
   *
   * `window.__flowFestEucRide()` returns the latest telemetry for scripted
   * measurement.
   */
  import { onMount } from "svelte";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import { FLOW_FEST_EUC_CONTACT_THRESHOLDS, type FlowFestEucMountedPoseDiagnostic } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import FlowFestEucRideStage from "./FlowFestEucRideStage.svelte";
  import {
    EUC_RIDE_CAMERA_IDS,
    type EucRideCameraId,
    type EucRideTelemetry,
  } from "./euc-ride-telemetry";

  const CAMERA_LABELS: Record<EucRideCameraId, string> = {
    chase: "Chase",
    side: "Side track",
  };

  let cameraId = $state<EucRideCameraId>("chase");
  let rough = $state(false);

  let telemetry = $state<EucRideTelemetry | null>(null);
  let pose = $state<FlowFestEucMountedPoseDiagnostic | null>(null);
  let stage = $state<FlowFestEucRideStage | null>(null);

  // The telemetry stream arrives every frame; the HUD repaints at a readable
  // cadence instead so the numbers can be read while riding.
  let hudTelemetry = $state<EucRideTelemetry | null>(null);
  let lastHudUpdate = 0;

  function handleTelemetry(next: EucRideTelemetry): void {
    telemetry = next;
    const now = performance.now();
    if (now - lastHudUpdate > 120) {
      hudTelemetry = next;
      lastHudUpdate = now;
    }
  }

  function handlePose(next: FlowFestEucMountedPoseDiagnostic): void {
    pose = next;
  }

  const MPH_PER_METER_PER_SECOND = 2.23694;

  function mph(metersPerSecond: number): string {
    return `${(metersPerSecond * MPH_PER_METER_PER_SECOND).toFixed(1)} mph`;
  }

  function deg(radians: number): string {
    return `${((radians * 180) / Math.PI).toFixed(1)}°`;
  }

  onMount(() => {
    Object.assign(window, {
      __flowFestEucRide: () => ({
        cameraId,
        rough,
        thresholds: FLOW_FEST_EUC_CONTACT_THRESHOLDS,
        telemetry,
        pose,
      }),
    });
    return () => {
      delete (window as unknown as Record<string, unknown>).__flowFestEucRide;
    };
  });
</script>

<svelte:head>
  <title>EUC free-ride lab</title>
</svelte:head>

<div class="stage">
  <Canvas
    dpr={1}
    shadows={PCFSoftShadowMap}
    toneMapping={AgXToneMapping}
    toneMappingExposure={1.15}
  >
    <FlowFestEucRideStage
      bind:this={stage}
      {cameraId}
      {rough}
      onTelemetry={handleTelemetry}
      onPoseDiagnostic={handlePose}
    />
  </Canvas>

  <div class="controls">
      <div class="row">
        {#each EUC_RIDE_CAMERA_IDS as id (id)}
          <button
            class="chip"
            class:active={id === cameraId}
            onclick={() => (cameraId = id)}
          >
            {CAMERA_LABELS[id]}
          </button>
        {/each}
        <button class="chip" class:active={rough} onclick={() => (rough = !rough)}>
          Rough ground
        </button>
        <button class="chip" onclick={() => stage?.reset()}>Reset to center</button>
      </div>
      <p class="hint">
        W/S throttle & brake · A/D steer · Shift performance · Ctrl regen brake
      </p>
    </div>

    <div class="readout">
      {#if hudTelemetry === null}
        <p class="headline neutral">Waiting for the first frame</p>
      {:else}
        {@const t = hudTelemetry}
        <p class="headline">
          {mph(t.dynamics.speedMetersPerSecond)}
          · accel {t.longitudinalAccelerationMetersPerSecondSquared.toFixed(1)} m/s²
          {#if t.collisionLimited}· <span class="fail">collision-limited</span>{/if}
        </p>
        <dl>
          <div>
            <dt>Input</dt>
            <dd>
              throttle {t.input.throttle.toFixed(2)} · brake {t.input.brake.toFixed(2)}
              · steer {t.input.steer.toFixed(2)}
              {t.input.performanceMode ? "· PERF" : ""}
            </dd>
          </div>
          <div>
            <dt>Body</dt>
            <dd>lean {deg(t.dynamics.leanRadians)} · pitch {deg(t.dynamics.pitchRadians)}</dd>
          </div>
          <div>
            <dt>Twitch</dt>
            <dd>
              lean {t.twitch.maxLeanRateDegreesPerSecond.toFixed(0)}°/s ·
              pitch {t.twitch.maxPitchRateDegreesPerSecond.toFixed(0)}°/s ·
              pelvis {t.twitch.maxPelvisRateMillimetersPerSecond.toFixed(0)} mm/s
            </dd>
          </div>
          <div>
            <dt>Reversals</dt>
            <dd>
              {t.twitch.pitchReversalsPerSecond.toFixed(1)} /s over
              {t.twitch.windowSeconds.toFixed(1)} s
            </dd>
          </div>
          {#if pose}
            <div class:fail={!pose.pass}>
              <dt>Pose</dt>
              <dd>{pose.pass ? "PASS" : "FAIL"} · {pose.status}</dd>
            </div>
          {/if}
        </dl>
      {/if}
    </div>
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
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
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

  .hint {
    margin: 0;
    color: #8b9cb3;
    font-size: 0.72rem;
  }

  .readout {
    position: absolute;
    inset-block-end: 0.75rem;
    inset-inline-start: 0.75rem;
    min-width: 24rem;
    max-width: min(32rem, calc(100vw - 1.5rem));
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
    font-variant-numeric: tabular-nums;
  }

  .headline.neutral {
    color: #cfdaea;
  }

  .fail {
    color: #ff8188;
    font-weight: 700;
  }

  dl {
    display: grid;
    gap: 0.05rem;
    margin: 0;
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
    flex: 0 0 5.5rem;
    color: #9fb0c6;
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
