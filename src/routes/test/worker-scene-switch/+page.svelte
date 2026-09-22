<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import WorkerEnvironmentRenderer from "$lib/shared/3d/worker-renderer/components/WorkerEnvironmentRenderer.svelte";
  import type {
    WorkerEnvironmentKey,
    WorkerPerformerSnapshot,
    WorkerPropSnapshot,
  } from "$lib/shared/3d/worker-renderer/domain/worker-renderer-protocol";
  import type { WorkerSceneSwitchSnapshot } from "$lib/shared/3d/worker-renderer/services/worker-environment-renderer";

  interface WorkerSceneSwitchBenchmarkApi {
    snapshot: WorkerSceneSwitchSnapshot | null;
    switchTo(environment: WorkerEnvironmentKey): void;
    runAlternating(
      count?: number
    ): Promise<readonly WorkerSceneSwitchSnapshot[]>;
  }

  declare global {
    interface Window {
      __workerSceneSwitchBenchmark?: WorkerSceneSwitchBenchmarkApi;
    }
  }

  let environment = $state<WorkerEnvironmentKey>("rainbow");
  let snapshot = $state<WorkerSceneSwitchSnapshot | null>(null);
  // The first worker must stage the same complete frame as every replacement.
  // Starting empty would let it report readiness before the avatar exists, then
  // load the performer through the live-update path after the canvas is visible.
  let performers = $state.raw<readonly WorkerPerformerSnapshot[]>([
    performerAt(0),
  ]);
  let heartbeat: HTMLDivElement;
  let heartbeatRequest = 0;
  let heartbeatCount = 0;
  let choreographyRequest = 0;

  function propAt(angle: number, phase: number): WorkerPropSnapshot {
    const pathRadius = 0.54;
    const spin = angle * 1.7 + phase;
    return {
      centerPathAngle: angle,
      staffRotationAngle: spin,
      plane: "wall",
      handAnchor: [0, 0, 0],
      flipped: false,
      worldPosition: [
        Math.sin(angle) * pathRadius,
        Math.cos(angle) * pathRadius,
        0,
      ],
      worldRotation: [0, 0, Math.sin(spin / 2), Math.cos(spin / 2)],
      gripType: "square",
    };
  }

  function performerAt(time: number): WorkerPerformerSnapshot {
    const beat = time / 950;
    return {
      id: "benchmark-performer",
      avatarId: "x-bot",
      position: [0, 0, 0],
      facingAngle: 0,
      avatarHeightCm: 190.5,
      groundY: -1.5,
      staffLength: 0.8636,
      staffThickness: 0.0125,
      propBuild: {
        finish: "fire",
        fanBuild: "pictograph",
        fanFrameColor: "black",
        fanCover: "bare",
      },
      leftPropType: "staff",
      rightPropType: "staff",
      leftProp: propAt(beat, 0),
      rightProp: propAt(-beat + Math.PI, Math.PI / 2),
      stanceYaw: Math.sin(beat * 0.5) * 0.18,
      stanceSegments: null,
      spinePitchOffset: 0,
    };
  }

  function select(next: WorkerEnvironmentKey): void {
    environment = next;
  }

  function onSnapshot(next: WorkerSceneSwitchSnapshot): void {
    snapshot = next;
    if (window.__workerSceneSwitchBenchmark) {
      window.__workerSceneSwitchBenchmark.snapshot = next;
    }
  }

  function waitForEnvironment(
    target: WorkerEnvironmentKey,
    timeoutMs = 90_000
  ): Promise<WorkerSceneSwitchSnapshot> {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (snapshot?.active === target && snapshot.phase === "idle") {
          resolve(snapshot);
          return;
        }
        if (snapshot?.phase === "error") {
          reject(new Error(snapshot.lastError ?? "Worker renderer failed"));
          return;
        }
        if (performance.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${target}`));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  async function runAlternating(
    count = 4
  ): Promise<readonly WorkerSceneSwitchSnapshot[]> {
    const results: WorkerSceneSwitchSnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      const target: WorkerEnvironmentKey =
        index % 2 === 0 ? "ocean" : "rainbow";
      select(target);
      results.push(await waitForEnvironment(target));
    }
    return results;
  }

  onMount(() => {
    window.__workerSceneSwitchBenchmark = {
      snapshot,
      switchTo: select,
      runAlternating,
    };

    const moveHeartbeat = (time: number) => {
      const x = ((time / 8) % 200) - 100;
      heartbeat.style.transform = `translate3d(${x}px, 0, 0)`;
      heartbeat.dataset.frame = String(heartbeatCount++);
      heartbeatRequest = requestAnimationFrame(moveHeartbeat);
    };
    heartbeatRequest = requestAnimationFrame(moveHeartbeat);

    const moveChoreography = (time: number) => {
      performers = [performerAt(time)];
      choreographyRequest = requestAnimationFrame(moveChoreography);
    };
    choreographyRequest = requestAnimationFrame(moveChoreography);
  });

  onDestroy(() => {
    cancelAnimationFrame(heartbeatRequest);
    cancelAnimationFrame(choreographyRequest);
    delete window.__workerSceneSwitchBenchmark;
  });

  const last = $derived(snapshot?.lastMeasurement ?? null);
  const slowestCompileTarget = $derived(
    last?.workerBoot.compileTargets.reduce(
      (slowest, current) =>
        !slowest || current.durationMs > slowest.durationMs ? current : slowest,
      null as (typeof last.workerBoot.compileTargets)[number] | null
    ) ?? null
  );
  const gateLabel = $derived(
    snapshot?.phase === "error"
      ? "Worker handoff failed"
      : !last
        ? "Awaiting first handoff"
        : last.passedInputGate && last.passedFrameGate && last.passedWorkerBound
          ? "All measured gates passed"
          : "At least one measured gate failed"
  );
</script>

<svelte:head>
  <title>Worker Scene Switch Benchmark</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="benchmark-shell">
  <section class="stage" aria-label="Worker-rendered environment">
    <WorkerEnvironmentRenderer {environment} {performers} {onSnapshot} />
    <div class="stage-vignette"></div>
    <div class="heartbeat-track" aria-label="Application-thread heartbeat">
      <div class="heartbeat" bind:this={heartbeat}></div>
    </div>
  </section>

  <aside class="console-panel">
    <header>
      <p class="eyebrow">OffscreenCanvas worker proof</p>
      <h1>Atomic world handoff</h1>
      <p>
        The last complete picture stays visible while the worker prepares the
        requested scene. The new scene appears after its first complete frame.
        Timings below separate asset loading, shaders, and presentation.
      </p>
    </header>

    <div class="scene-choices" aria-label="Prototype worlds">
      <button
        class:active={environment === "rainbow"}
        onclick={() => select("rainbow")}>Rainbow</button
      >
      <button
        class:active={environment === "ocean"}
        onclick={() => select("ocean")}>Ocean</button
      >
      <button
        class:active={environment === "void"}
        onclick={() => select("void")}>Void</button
      >
      <button
        class:active={environment === "winter"}
        onclick={() => select("winter")}>Winter</button
      >
      <button
        class:active={environment === "celestial"}
        onclick={() => select("celestial")}>Celestial</button
      >
      <button
        class:active={environment === "cosmic"}
        onclick={() => select("cosmic")}>Cosmic</button
      >
      <button
        class:active={environment === "forest"}
        onclick={() => select("forest")}>Forest</button
      >
      <button
        class:active={environment === "blossom"}
        onclick={() => select("blossom")}>Blossom</button
      >
      <button
        class:active={environment === "autumn"}
        onclick={() => select("autumn")}>Autumn</button
      >
      <button
        class:active={environment === "ember"}
        onclick={() => select("ember")}>Ember</button
      >
    </div>

    <div class="status-card" aria-live="polite">
      <div>
        <span>Visible</span><strong>{snapshot?.active ?? "none"}</strong>
      </div>
      <div>
        <span>Preparing</span><strong>{snapshot?.staging ?? "none"}</strong>
      </div>
      <div>
        <span>Phase</span><strong>{snapshot?.phase ?? "starting"}</strong>
      </div>
      <div>
        <span>Workers</span><strong>{snapshot?.liveWorkers ?? 0}</strong>
      </div>
      <div>
        <span>Progress</span>
        <strong
          >{snapshot?.progressPhase ?? "idle"}
          {Math.round((snapshot?.progress ?? 0) * 100)}%</strong
        >
      </div>
    </div>

    <div class="gate" class:pass={gateLabel === "All measured gates passed"}>
      {gateLabel}
    </div>

    {#if last}
      <dl class="metrics">
        <div>
          <dt>Click to swap</dt>
          <dd>{last.clickToSwapMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Worker boot</dt>
          <dd>
            {last.workerBoot.warmReuse
              ? "Prepared scene reused"
              : "Prepared from assets"}
          </dd>
          <dt>Retained scenes</dt>
          <dd>
            {last.workerBoot.retainedRuntimeCount ?? 0} · {Math.round(
              (last.workerBoot.retainedRuntimeBytes ?? 0) / 1024 / 1024
            )} MiB estimated
          </dd>
          <dt>Worker preparation</dt>
          <dd>{last.workerBoot.firstFrameMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{last.workerBoot.rendererMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{last.workerBoot.environmentMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Performer</dt>
          <dd>{last.workerBoot.performerMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Shader preparation</dt>
          <dd>{last.workerBoot.compileMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Slowest shader</dt>
          <dd>
            {slowestCompileTarget?.label ?? "none"} ·
            {slowestCompileTarget?.durationMs.toFixed(0) ?? "0"} ms
          </dd>
        </div>
        <div>
          <dt>Resource priming</dt>
          <dd>
            {last.workerBoot.primeMs.toFixed(0)} ms ·
            {last.workerBoot.primeTargets} draws
          </dd>
        </div>
        <div>
          <dt>Complete-frame preflight</dt>
          <dd>
            {last.workerBoot.finalizeCompileMs.toFixed(0)} ms compile ·
            {last.workerBoot.preflightMs.toFixed(0)} ms draw
          </dd>
        </div>
        <div>
          <dt>Geometry uploads</dt>
          <dd>
            {last.workerBoot.memoryAfterCompile.geometries} →
            {last.workerBoot.memoryAfterPrime.geometries} →
            {last.workerBoot.memoryAfterFinalize.geometries} →
            {last.workerBoot.memoryAfterPreflight.geometries} →
            {last.workerBoot.memoryAfterFirstRender.geometries}
          </dd>
        </div>
        <div>
          <dt>Texture uploads</dt>
          <dd>
            {last.workerBoot.memoryAfterCompile.textures} →
            {last.workerBoot.memoryAfterPrime.textures} →
            {last.workerBoot.memoryAfterFinalize.textures} →
            {last.workerBoot.memoryAfterPreflight.textures} →
            {last.workerBoot.memoryAfterFirstRender.textures}
          </dd>
        </div>
        <div>
          <dt>GPU programs</dt>
          <dd>
            {last.workerBoot.memoryAfterCompile.programs} →
            {last.workerBoot.memoryAfterPrime.programs} →
            {last.workerBoot.memoryAfterFinalize.programs} →
            {last.workerBoot.memoryAfterPreflight.programs} →
            {last.workerBoot.memoryAfterFirstRender.programs}
          </dd>
        </div>
        <div>
          <dt>Performer graph</dt>
          <dd>
            {last.workerBoot.performers.count} performer ·
            {last.workerBoot.performers.visibleRenderables}/{last.workerBoot
              .performers.renderables} visible · {last.workerBoot.performers
              .effectivelyVisibleRenderables} effective · layers
            {last.workerBoot.performers.layerMasks.join(",")} · root
            {last.workerBoot.performers.rootVisible
              ? "visible"
              : "hidden"}/{last.workerBoot.performers.rootLayerMask} · opacity
            {last.workerBoot.performers.materialOpacity?.join("–") ?? "none"}
          </dd>
        </div>
        <div>
          <dt>Performer bounds</dt>
          <dd>
            {last.workerBoot.performers.boundsCenter
              ? `${last.workerBoot.performers.boundsCenter.map((value) => value.toFixed(2)).join(", ")} · ${last.workerBoot.performers.boundsSize?.map((value) => value.toFixed(2)).join(", ")}`
              : "none"}
          </dd>
        </div>
        <div>
          <dt>Performer on screen</dt>
          <dd>
            {last.workerBoot.performers.projectedCenter
              ?.map((value) => value.toFixed(2))
              .join(", ") ?? "none"}
          </dd>
        </div>
        <div>
          <dt>First render</dt>
          <dd>{last.workerBoot.firstRenderMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Frame scheduling</dt>
          <dd>{last.workerBoot.presentationWaitMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Confirmation render</dt>
          <dd>{last.workerBoot.confirmationRenderMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Main-thread max gap</dt>
          <dd>
            {last.mainThreadMaxGapMs.toFixed(1)} ms ·
            {last.mainThreadMaxGapPhase ?? "unknown"}
          </dd>
        </div>
        <div>
          <dt>Outgoing frame max gap</dt>
          <dd>
            {last.outgoingWorkerMaxFrameGapMs.toFixed(1)} ms ·
            {last.outgoingWorkerMaxFrameGapPhase ?? "unknown"}
          </dd>
        </div>
        <div>
          <dt>Handoff delay</dt>
          <dd>{last.handoffDelayMs.toFixed(1)} ms</dd>
        </div>
        <div>
          <dt>Contexts at swap / after</dt>
          <dd>
            {last.liveWorkersAtSwap} / {last.liveWorkersAfterCleanup ?? "…"}
          </dd>
        </div>
        <div>
          <dt>GPU textures</dt>
          <dd>{last.workerBoot.textures}</dd>
        </div>
      </dl>
    {/if}

    {#if snapshot?.lastError}
      <p class="error">{snapshot.lastError}</p>
    {/if}
  </aside>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #08090d;
    color: #f5f2ea;
  }

  .benchmark-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(19rem, 25rem);
    height: 100dvh;
    overflow: hidden;
    background: #08090d;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .stage-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      circle at center,
      transparent 52%,
      rgb(0 0 0 / 0.42)
    );
  }

  .heartbeat-track {
    position: absolute;
    bottom: 1.5rem;
    left: 50%;
    width: 14rem;
    height: 0.35rem;
    transform: translateX(-50%);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
  }

  .heartbeat {
    position: absolute;
    left: 50%;
    top: -0.28rem;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 50%;
    background: #fff4a8;
    box-shadow: 0 0 1.2rem #fff4a8;
    will-change: transform;
  }

  .console-panel {
    z-index: 3;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: clamp(1.25rem, 2.5vw, 2.5rem);
    overflow: auto;
    border-left: 1px solid rgb(255 255 255 / 0.12);
    background: rgb(10 11 16 / 0.94);
    backdrop-filter: blur(1.25rem);
  }

  header p {
    margin: 0.65rem 0 0;
    color: #b8b5ad;
    line-height: 1.5;
  }

  .eyebrow {
    color: #d4c8ff;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.35rem 0 0;
    font-size: clamp(1.7rem, 3vw, 2.6rem);
    line-height: 1;
  }

  .scene-choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }

  button {
    min-height: 2.9rem;
    border: 1px solid rgb(255 255 255 / 0.17);
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 0.07);
    color: inherit;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible,
  button.active {
    border-color: #b99aff;
    background: rgb(185 154 255 / 0.18);
  }

  .status-card,
  .metrics {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 1rem;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 0.85rem;
    background: rgb(255 255 255 / 0.045);
  }

  .status-card div,
  .metrics div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .status-card span,
  dt {
    color: #9e9b95;
  }

  .status-card strong,
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .gate {
    padding: 0.8rem 1rem;
    border-radius: 0.7rem;
    background: rgb(255 178 71 / 0.14);
    color: #ffd69c;
    font-weight: 700;
  }

  .gate.pass {
    background: rgb(83 215 139 / 0.14);
    color: #aef1c9;
  }

  .metrics {
    font-size: 0.9rem;
  }

  .error {
    margin: 0;
    color: #ffaaa5;
  }

  @media (max-width: 50rem) {
    .benchmark-shell {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(20rem, 56dvh) minmax(0, 44dvh);
    }

    .stage {
      min-height: 0;
    }

    .console-panel {
      border-top: 1px solid rgb(255 255 255 / 0.12);
      border-left: 0;
    }
  }
</style>
