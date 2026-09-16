<script lang="ts">
  import { onMount } from "svelte";
  import { T } from "@threlte/core";
  import { Plane, Prop3D, type PropState3D } from "@austencloud/scene-3d";
  import { BackgroundType } from "@austencloud/backgrounds";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import Scene3D from "$lib/shared/3d/components/Scene3D.svelte";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
  import { calculatePropState } from "$lib/shared/3d/services/prop-state-interpolator";
  import { motionDataToConfig3D } from "$lib/shared/3d/services/sequence-converter";
  import { setSceneFeatureContext } from "$lib/shared/3d/scene-features/context/scene-feature-context";
  import { createSceneFeatureState } from "$lib/shared/3d/scene-features/state/scene-feature-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import archiveJson from "../../../../docs/research/spiroanim/qst-228-sequences.json";

  interface QstStep {
    stepNumber: number;
    letter: string;
    startPlacement: string;
    endPlacement: string;
    motions: {
      left: MotionData;
      right: MotionData;
    };
  }

  interface QstSequence {
    word: string;
    displayName: string;
    metadata: {
      sourceReference: string;
      sourceCollection: string;
      sourceLevel: string;
      sourceRepository: string;
      sourceCommit: string;
      attribution: {
        credit: string;
        note: string;
      };
    };
    steps: QstStep[];
  }

  type Tempo = "slow" | "study" | "fast";
  type BqtVariant = "breaks-52" | "breaks-55";

  const archive = archiveJson as unknown as readonly QstSequence[];
  const sceneFeatures = createSceneFeatureState(
    {
      environment: true,
      stage: false,
      audience: false,
      campfire: false,
      tent: false,
    },
    { isolated: true }
  );
  setSceneFeatureContext(sceneFeatures);

  const defaultReference: BqtVariant = "breaks-52";
  const visiblePlanes = new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]);
  const scenePropType = toScenePropType(PropType.STAFF);
  const tempoOptions: Array<{ value: Tempo; label: string }> = [
    { value: "slow", label: "32 BPM" },
    { value: "study", label: "48 BPM" },
    { value: "fast", label: "72 BPM" },
  ];
  const bqtOptions: Array<{ value: BqtVariant; label: string }> = [
    { value: "breaks-52", label: "Right front" },
    { value: "breaks-55", label: "Left front" },
  ];
  const tempoBpm: Record<Tempo, number> = {
    slow: 32,
    study: 48,
    fast: 72,
  };

  let selectedReference = $state<string>(defaultReference);
  let tempo = $state<Tempo>("study");
  let playing = $state(true);
  let playhead = $state(0);
  let completedLoops = $state(0);

  const selectedSequence = $derived(
    archive.find(
      (sequence) => sequence.metadata.sourceReference === selectedReference
    ) ?? archive[0]!
  );
  const stepIndex = $derived(
    Math.min(
      selectedSequence.steps.length - 1,
      Math.max(0, Math.floor(playhead))
    )
  );
  const step = $derived(selectedSequence.steps[stepIndex]!);
  const stepProgress = $derived(playhead - Math.floor(playhead));
  const bpm = $derived(tempoBpm[tempo]);
  const leftPropState = $derived(propStateFor(step.motions.left, stepProgress));
  const rightPropState = $derived(
    propStateFor(step.motions.right, stepProgress)
  );
  function propStateFor(motion: MotionData, progress: number): PropState3D {
    return calculatePropState(
      motionDataToConfig3D(motion, motion.plane ?? Plane.WALL),
      progress
    );
  }

  function positionTuple(state: PropState3D): [number, number, number] {
    return [
      state.worldPosition.x,
      state.worldPosition.y,
      state.worldPosition.z,
    ];
  }

  function chooseSequence(reference: string) {
    selectedReference = reference;
    playhead = 0;
    completedLoops = 0;
    playing = true;
  }

  function chooseBqtVariant(reference: BqtVariant) {
    chooseSequence(reference);
  }

  function chooseStep(index: number) {
    playhead = index;
    playing = false;
  }

  onMount(() => {
    let animationFrame = 0;
    let previousTime = performance.now();

    function animate(time: number) {
      const deltaSeconds = Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;

      if (playing && selectedSequence.steps.length > 0) {
        const nextPlayhead = playhead + deltaSeconds * (bpm / 60);
        const sequenceLength = selectedSequence.steps.length;

        if (nextPlayhead >= sequenceLength) {
          completedLoops += Math.floor(nextPlayhead / sequenceLength);
        }

        playhead = nextPlayhead % sequenceLength;
      }

      animationFrame = requestAnimationFrame(animate);
    }

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  });
</script>

<div class="qst-viewer">
  <header class="viewer-header">
    <div class="title-block">
      <span class="eyebrow"
        >Quarter Space Tech by Mentive · Based on Alex Kurowski's grid</span
      >
      <h1>Prop-only 3D loop viewer</h1>
      <p>Drag the scene to orbit. The figure is intentionally absent.</p>
    </div>

    <div class="live-status" aria-live="polite">
      <span class="status-label">Now showing</span>
      <strong>{selectedSequence.word}</strong>
      <span>{selectedSequence.metadata.sourceReference}</span>
    </div>
  </header>

  <main class="workspace">
    <section
      class="scene-panel"
      aria-label="Prop-only Quarter Space Tech animation"
    >
      <Scene3D
        showGrid
        showLabels
        showStage={false}
        showAudience={false}
        gridForwardOffset={0}
        gridSize={1.35}
        gridHandPointRadius={0.52}
        gridOuterPointRadius={0.95}
        {visiblePlanes}
        backgroundType={BackgroundType.VOID}
        customCameraPosition={[1.45, 1.15, 1.85]}
        customCameraTarget={[0, 0, 0]}
      >
        {#snippet children()}
          <T.Group position={positionTuple(leftPropState)}>
            <Prop3D
              propType={scenePropType}
              propState={leftPropState}
              color="blue"
            />
          </T.Group>
          <T.Group position={positionTuple(rightPropState)}>
            <Prop3D
              propType={scenePropType}
              propState={rightPropState}
              color="red"
            />
          </T.Group>
        {/snippet}
      </Scene3D>

      <div class="scene-legend" aria-label="Scene legend">
        <span><i class="legend-dot blue" aria-hidden="true"></i>Left prop</span>
        <span><i class="legend-dot red" aria-hidden="true"></i>Right prop</span>
        <span
          ><i class="fas fa-cube" aria-hidden="true"></i>Wall · Wheel · Floor</span
        >
      </div>
    </section>

    <aside class="control-rail" aria-label="Sequence and playback controls">
      <section class="control-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Compare the seam</span>
            <h2>BQTHTQ variants</h2>
          </div>
          <span class="loop-count">{completedLoops} loops</span>
        </div>

        <div class="quick-picks" aria-label="BQTHTQ variant">
          {#each bqtOptions as option}
            <PanelButton
              variant={selectedReference === option.value
                ? "primary"
                : "secondary"}
              fullWidth
              ariaPressed={selectedReference === option.value}
              onclick={() => chooseBqtVariant(option.value)}
            >
              {option.label}
            </PanelButton>
          {/each}
        </div>
      </section>

      <section class="control-section archive-picker">
        <label for="archive-sequence"
          >Full collection · {archive.length} sequences</label
        >
        <select
          id="archive-sequence"
          value={selectedReference}
          onchange={(event) => chooseSequence(event.currentTarget.value)}
        >
          {#each archive as sequence, index}
            <option value={sequence.metadata.sourceReference}>
              {String(index + 1).padStart(3, "0")} · {sequence.metadata
                .sourceReference} · {sequence.word} · {sequence.displayName}
            </option>
          {/each}
        </select>
      </section>

      <section class="sequence-summary" aria-label="Selected sequence">
        <div class="summary-title">
          <strong>{selectedSequence.displayName}</strong>
          <span>{selectedSequence.metadata.sourceCollection}</span>
        </div>

        <dl>
          <div>
            <dt>Beat</dt>
            <dd>{step.stepNumber} / {selectedSequence.steps.length}</dd>
          </div>
          <div>
            <dt>Letter</dt>
            <dd>{step.letter}</dd>
          </div>
          <div>
            <dt>Blue plane</dt>
            <dd>{step.motions.left.plane}</dd>
          </div>
          <div>
            <dt>Red plane</dt>
            <dd>{step.motions.right.plane}</dd>
          </div>
        </dl>

        <div class="step-strip" aria-label="Sequence beats">
          {#each selectedSequence.steps as sequenceStep, index}
            <button
              type="button"
              class:current={index === stepIndex}
              aria-label="Pause on beat {sequenceStep.stepNumber}, letter {sequenceStep.letter}"
              aria-current={index === stepIndex ? "step" : undefined}
              onclick={() => chooseStep(index)}
            >
              <span>{sequenceStep.stepNumber}</span>
              <strong>{sequenceStep.letter}</strong>
            </button>
          {/each}
        </div>
      </section>

      <section class="playback-controls">
        <PanelButton
          variant="primary"
          fullWidth
          ariaPressed={playing}
          onclick={() => (playing = !playing)}
        >
          <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
          ></i>
          <span>{playing ? "Pause" : "Play"}</span>
        </PanelButton>

        <SegmentedControl
          options={tempoOptions}
          value={tempo}
          onchange={(value) => (tempo = value)}
          color="accent"
          size="sm"
          semantics="radiogroup"
          ariaLabel="Playback tempo"
        />
      </section>

      <section class="attribution">
        <span class="section-kicker">Source note</span>
        <p>{selectedSequence.metadata.attribution.credit}</p>
        <p class="attribution-note">
          {selectedSequence.metadata.attribution.note}
        </p>
        <a
          href={`${selectedSequence.metadata.sourceRepository}/commit/${selectedSequence.metadata.sourceCommit}`}
          target="_blank"
          rel="noreferrer"
        >
          Open source commit
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
      </section>
    </aside>
  </main>
</div>

<style>
  .qst-viewer {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    color: var(--theme-text, #f4f6fb);
    background: #070911;
  }

  .viewer-header {
    min-height: 88px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 14px clamp(18px, 2.5vw, 36px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: #0d101b;
  }

  .title-block,
  .summary-title,
  .section-heading > div {
    min-width: 0;
  }

  .eyebrow,
  .section-kicker,
  .status-label {
    display: block;
    color: rgba(225, 231, 244, 0.6);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 3px;
    font-size: clamp(20px, 2vw, 28px);
    line-height: 1.1;
  }

  h2 {
    margin-top: 3px;
    font-size: 18px;
    line-height: 1.2;
  }

  .title-block p {
    margin-top: 4px;
    color: rgba(225, 231, 244, 0.7);
    font-size: 14px;
  }

  .live-status {
    min-width: 150px;
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    gap: 2px 10px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .live-status .status-label {
    grid-column: 1 / -1;
  }

  .live-status strong {
    overflow: hidden;
    font-size: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-status > span:last-child {
    color: rgba(225, 231, 244, 0.64);
    font-size: 14px;
  }

  .workspace {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 390px);
  }

  .scene-panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #05070d;
  }

  .scene-panel :global(.scene-container) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .scene-legend {
    position: absolute;
    left: 18px;
    bottom: 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    max-width: calc(100% - 36px);
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: rgba(244, 246, 251, 0.84);
    background: rgba(7, 9, 17, 0.88);
    font-size: 12px;
  }

  .scene-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-dot.blue {
    background: #4d9cff;
  }

  .legend-dot.red {
    background: #ff646d;
  }

  .control-rail {
    min-height: 0;
    overflow-y: auto;
    padding: 20px;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    background: #10131f;
  }

  .control-section,
  .sequence-summary,
  .playback-controls,
  .attribution {
    padding-bottom: 18px;
    margin-bottom: 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .loop-count {
    flex: none;
    min-width: 58px;
    color: rgba(225, 231, 244, 0.68);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .quick-picks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .archive-picker label {
    display: block;
    margin-bottom: 8px;
    color: rgba(244, 246, 251, 0.88);
    font-size: 14px;
    font-weight: 600;
  }

  select {
    width: 100%;
    min-height: 44px;
    padding: 0 36px 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    color: #f4f6fb;
    background: #171b28;
    font: inherit;
    font-size: 14px;
  }

  select:focus-visible,
  .step-strip button:focus-visible,
  .attribution a:focus-visible {
    outline: 2px solid var(--theme-accent, #8f7dff);
    outline-offset: 2px;
  }

  .summary-title {
    min-height: 58px;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .summary-title strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: 16px;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .summary-title span {
    overflow: hidden;
    color: rgba(225, 231, 244, 0.62);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 12px 0;
  }

  dl > div {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.035);
  }

  dt {
    color: rgba(225, 231, 244, 0.58);
    font-size: 12px;
  }

  dd {
    overflow: hidden;
    margin: 3px 0 0;
    color: #f4f6fb;
    font-size: 14px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .step-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
    gap: 6px;
  }

  .step-strip button {
    min-width: 0;
    min-height: 48px;
    display: grid;
    place-content: center;
    gap: 1px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    color: rgba(244, 246, 251, 0.7);
    background: #171b28;
    cursor: pointer;
  }

  .step-strip button:hover {
    border-color: rgba(255, 255, 255, 0.28);
    color: #f4f6fb;
    background: #202536;
  }

  .step-strip button.current {
    border-color: var(--theme-accent, #8f7dff);
    color: #ffffff;
    background: color-mix(in srgb, var(--theme-accent, #8f7dff) 24%, #171b28);
    box-shadow: 0 0 0 1px var(--theme-accent, #8f7dff);
  }

  .step-strip button span {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .step-strip button strong {
    font-size: 15px;
  }

  .playback-controls {
    display: grid;
    gap: 12px;
  }

  .attribution {
    padding-bottom: 4px;
    margin-bottom: 0;
    border-bottom: 0;
  }

  .attribution p {
    margin-top: 8px;
    color: rgba(244, 246, 251, 0.82);
    font-size: 14px;
    line-height: 1.45;
  }

  .attribution .attribution-note {
    color: rgba(225, 231, 244, 0.6);
    font-size: 12px;
  }

  .attribution a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    color: #bcb1ff;
    font-size: 14px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 760px) {
    .qst-viewer {
      height: auto;
      min-height: 100dvh;
      overflow-y: auto;
    }

    .viewer-header {
      min-height: auto;
      align-items: start;
      padding: 14px 16px;
    }

    .title-block p,
    .live-status .status-label {
      display: none;
    }

    .live-status {
      min-width: 94px;
      grid-template-columns: 1fr;
      gap: 0;
    }

    .live-status strong {
      font-size: 16px;
    }

    .workspace {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .scene-panel {
      flex: 0 0 min(54dvh, 430px);
      min-height: 300px;
    }

    .control-rail {
      overflow: visible;
      padding: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      border-left: 0;
    }

    .scene-legend {
      left: 12px;
      bottom: 12px;
      max-width: calc(100% - 24px);
    }
  }

  @media (max-height: 560px) and (orientation: landscape) {
    .viewer-header {
      min-height: 58px;
      padding-block: 8px;
    }

    .title-block p,
    .eyebrow {
      display: none;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
    }

    .scene-panel {
      min-height: 0;
    }

    .control-rail {
      overflow-y: auto;
      padding: 14px;
      border-top: 0;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
    }
  }
</style>
