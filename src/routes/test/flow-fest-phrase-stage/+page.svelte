<script lang="ts">
  /**
   * The Flow Fest staff test stage (spec:
   * docs/superpowers/specs/active/2026-10-22-flow-fest-phrase-brain.md).
   *
   * Two fire staff spinners at night: stage left a planted techer, stage
   * right a wanderer. Both play their phrase schedule live from the phrase
   * brain, so every setting applies at once without rerunning the schedule
   * tool. With the defaults the page plays exactly the committed
   * `phrase-stage-schedule.json` the Unreal stage reads.
   *
   * The stage fills the page; the dock along the bottom (a rail beside the
   * stage on short landscape screens) shows each spinner's library sequence
   * as the Composer draws it, its current step following the spinner. The
   * settings live in a drawer. The app theme supplies the atmosphere: the
   * sky, the fog the floor fades into, and the chrome's surfaces.
   *
   * Props: the kevlar fire double staff (`FIRE_DOUBLE_STAFF`) with the fire
   * effect, because fire is what the jam burns and the fire model puts the
   * flames on real wicks at the staff ends; an LED staff would test the same
   * phrases but not the look the stage is for.
   *
   * `?probe` mounts the gait probe (`window.__gaitProbe`). `window.__phraseStage`
   * carries the clock's beat and each performer's current frame.
   */
  import { onDestroy, onMount } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import { OrbitControls } from "@threlte/extras";
  import { EffectComposer } from "threlte-postprocessing";
  import { ToneMappingEffect } from "threlte-postprocessing/effects";
  import { ToneMappingMode } from "postprocessing";
  import { AgXToneMapping, WebGLRenderer } from "three";
  import BloomEffect from "#lib/shared/3d/effects/post-processing/BloomEffect.svelte";
  import ScenePreparationSurface from "#lib/shared/3d/scene-features/components/ScenePreparationSurface.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { CHARACTER_DEFINITIONS } from "#lib/shared/3d/domain/character-model.js";
  import { BACKGROUND_THEME_COLORS } from "#lib/shared/theme/config/tka-theme-config.js";
  import {
    ensureThemeApplied,
    getSavedBackgroundType,
  } from "#lib/shared/settings/utils/background-theme-calculator.js";
  import {
    createLoadingSession,
    type LoadingSession,
  } from "#lib/shared/loading/loading-session.svelte.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    DEFAULT_PHRASE_BRAIN_SETTINGS,
    type PhrasePersonality,
    type PhrasePerformerSpec,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
  import {
    DEFAULT_WALK_SAFE,
    PHRASE_PLANES,
    type PhraseLibrary,
    type PhraseLibraryEntry,
    type PhraseMotionType,
    type WalkSafeMove,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
  import type { PhrasePlaybackFrame } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-playback.js";
  import { rebuildPhraseSequence } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-sequence.js";
  import {
    buildPhraseStageSchedule,
    PHRASE_STAGE_PERFORMERS,
    PHRASE_STAGE_TEMPO_BPM,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-stage.js";
  import type {
    JamLoadProgress,
    JamLoadStage,
  } from "../flow-fest-jam/flow-fest-jam-readiness";
  import PhraseStageScene from "./PhraseStageScene.svelte";
  import PhraseDockCard from "./PhraseDockCard.svelte";
  import PhraseStageSettings from "./PhraseStageSettings.svelte";

  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const probe = params.has("probe");

  // ------------------------------------------------------------------ library

  let library = $state.raw<PhraseLibrary | null>(null);
  let error = $state<string | null>(null);
  const sequences = new Map<string, SequenceData>();
  let entriesById = new Map<string, PhraseLibraryEntry>();

  function sequenceFor(id: string): SequenceData {
    let sequence = sequences.get(id);
    if (!sequence) {
      const entry = entriesById.get(id);
      if (!entry) throw new Error(`Phrase library has no sequence ${id}`);
      sequence = rebuildPhraseSequence(entry);
      sequences.set(id, sequence);
    }
    return sequence;
  }

  /** The sequence as the step grid reads it: the start placement first. */
  const gridSequences = new Map<string, SequenceData>();
  function gridSequenceFor(id: string): SequenceData {
    let grid = gridSequences.get(id);
    if (!grid) {
      const sequence = sequenceFor(id);
      grid = {
        ...sequence,
        steps: [
          sequence.startPlacement,
          ...sequence.steps,
        ] as SequenceData["steps"],
      };
      gridSequences.set(id, grid);
    }
    return grid;
  }

  // --------------------------------------------------------------------- cast

  const names: Record<string, string> = Object.fromEntries(
    PHRASE_STAGE_PERFORMERS.map((p) => [
      p.id,
      CHARACTER_DEFINITIONS.find((c) => c.id === p.characterId)?.name ?? p.id,
    ])
  );

  /** "Techer · clean": who stands and does tech, and how tight the timing is. */
  function personalityLine(personality: PhrasePersonality): string {
    const kind = personality.style < 0.5 ? "Techer" : "Wanderer";
    const timing =
      personality.skill >= 0.75
        ? "clean"
        : personality.skill >= 0.4
          ? "loose"
          : "sloppy";
    return `${kind} · ${timing}`;
  }

  // ----------------------------------------------------------------- controls

  let tempoBpm = $state(PHRASE_STAGE_TEMPO_BPM);
  let seedOffset = $state(0);
  let personalities = $state<PhrasePersonality[]>(
    PHRASE_STAGE_PERFORMERS.map((p) => ({ ...p.personality }))
  );
  let walkMoves = $state<WalkSafeMove[]>(
    DEFAULT_WALK_SAFE.moves.map((m) => ({ ...m }))
  );
  let maxTotalTurns = $state(DEFAULT_WALK_SAFE.maxTotalTurns);
  let maxDifficulty = $state(DEFAULT_WALK_SAFE.maxDifficulty);
  let hardMotionTypes = $state<PhraseMotionType[]>([
    ...DEFAULT_WALK_SAFE.hardMotionTypes,
  ]);
  let hardDifficulty = $state(DEFAULT_PHRASE_BRAIN_SETTINGS.hardDifficulty);
  let settingsOpen = $state(false);

  const performers = $derived<PhrasePerformerSpec[]>(
    PHRASE_STAGE_PERFORMERS.map((p, i) => ({
      ...p,
      seed: p.seed + seedOffset,
      personality: { ...personalities[i]! },
    }))
  );

  const schedule = $derived(
    library
      ? buildPhraseStageSchedule(library.entries, {
          performers,
          tempoBpm,
          settings: {
            walkSafe: {
              moves: walkMoves,
              maxTotalTurns,
              maxDifficulty,
              hardMotionTypes,
            },
            hardDifficulty,
          },
        })
      : null
  );

  const walkSafeCount = $derived.by(() => {
    if (!library) return 0;
    const settings = {
      moves: walkMoves,
      maxTotalTurns,
      maxDifficulty,
      hardMotionTypes,
    };
    return library.entries.filter((e) =>
      PHRASE_PLANES.some(
        (plane) =>
          e.tags.totalTurns <= settings.maxTotalTurns &&
          e.tags.difficulty <= settings.maxDifficulty &&
          !settings.hardMotionTypes.some((t) => e.tags.motionCounts[t] > 0) &&
          settings.moves.some(
            (m) =>
              m.kind === e.tags.kind && (m.plane === "any" || m.plane === plane)
          )
      )
    ).length;
  });

  const shares = $derived(
    schedule?.performers.map((performer) => {
      const beats = { planted: 0, turning: 0, travelling: 0 };
      for (const phrase of performer.phrases)
        beats[phrase.mode] += phrase.beats;
      const total = schedule.lengthBeats;
      return {
        planted: Math.round((beats.planted / total) * 100),
        turning: Math.round((beats.turning / total) * 100),
        travelling: Math.round((beats.travelling / total) * 100),
      };
    }) ?? []
  );

  // --------------------------------------------------------------------- dock

  // What each card shows, updated only when a phrase or a step changes, not
  // on every frame the scene samples.
  interface DockState {
    phraseIndex: number;
    stepIndex: number;
  }
  let dock = $state<DockState[]>(
    PHRASE_STAGE_PERFORMERS.map(() => ({ phraseIndex: 0, stepIndex: 0 }))
  );

  function onFrames(frames: readonly PhrasePlaybackFrame[]): void {
    for (const [i, frame] of frames.entries()) {
      const steps = sequenceFor(frame.phrase.sequenceId).steps.length || 1;
      const wrapped = ((frame.scoreBeat % steps) + steps) % steps;
      const stepIndex = frame.phrase.rest
        ? 0
        : Math.min(steps - 1, Math.floor(wrapped));
      const card = dock[i];
      if (
        card &&
        (card.phraseIndex !== frame.phraseIndex || card.stepIndex !== stepIndex)
      )
        dock[i] = { phraseIndex: frame.phraseIndex, stepIndex };
    }
  }

  const cards = $derived(
    PHRASE_STAGE_PERFORMERS.map((spec, i) => {
      const performer = schedule?.performers[i];
      const index = dock[i]?.phraseIndex ?? 0;
      const phrase = performer?.phrases[index] ?? null;
      let next: (typeof performer & {})["phrases"][number] | null = null;
      if (performer) {
        for (let k = 1; k < performer.phrases.length && !next; k++) {
          const candidate =
            performer.phrases[(index + k) % performer.phrases.length]!;
          if (!candidate.rest) next = candidate;
        }
      }
      return {
        id: spec.id,
        name: names[spec.id] ?? spec.id,
        personality: personalityLine(personalities[i] ?? spec.personality),
        phrase,
        phraseKey: `${seedOffset}:${index}:${phrase?.sequenceId ?? ""}`,
        sequence: phrase ? gridSequenceFor(phrase.sequenceId) : null,
        stepIndex: dock[i]?.stepIndex ?? 0,
        nextWord: next ? sequenceFor(next.sequenceId).word : null,
      };
    })
  );

  // ------------------------------------------------------------------- camera

  // Frame both spinners' whole areas, so the wanderer stays in shot at the
  // end of a walk, from a little above eye height, at any aspect.
  const left = Math.min(
    ...PHRASE_STAGE_PERFORMERS.map((p) => p.home.x - p.areaRadius)
  );
  const right = Math.max(
    ...PHRASE_STAGE_PERFORMERS.map((p) => p.home.x + p.areaRadius)
  );
  const FRAME_CENTER_X = (left + right) / 2;
  const FRAME_HALF_WIDTH = (right - left) / 2;
  const FRAME_HALF_HEIGHT = 1.6;
  const FRAME_TARGET_Y = 1.1;
  const CAMERA_FOV = 42;
  // A wide stage looks across the floor; a tall one, which has height to
  // spare once the width fits, looks further down onto it instead of sky.
  const pitchFor = (aspect: number) =>
    ((12 + Math.min(14, Math.max(0, (1.4 - aspect) * 20))) * Math.PI) / 180;
  let viewWidth = $state(0);
  let viewHeight = $state(0);
  const cameraPosition = $derived.by((): [number, number, number] => {
    const aspect =
      viewWidth > 0 && viewHeight > 0 ? viewWidth / viewHeight : 1.6;
    const tanV = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
    const tanH = tanV * aspect;
    // Plus the depth of the areas' near halves, which sit closer to the camera.
    const distance =
      Math.max(FRAME_HALF_WIDTH / tanH, FRAME_HALF_HEIGHT / tanV) + 3;
    const pitch = pitchFor(aspect);
    return [
      FRAME_CENTER_X,
      FRAME_TARGET_Y + distance * Math.sin(pitch),
      distance * Math.cos(pitch),
    ];
  });

  // -------------------------------------------------------------------- theme

  // The theme's darkest colour, deepened toward night, is the stage's sky.
  let atmosphere = $state("#07080d");
  function deepen(hex: string): string {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    const mix = (c: number, night: number) =>
      Math.round(c * 0.28 + night * 0.72);
    const r = mix((n >> 16) & 255, 5);
    const g = mix((n >> 8) & 255, 6);
    const b = mix(n & 255, 10);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  // ------------------------------------------------------------------ loading

  const LOAD_LABELS: Record<JamLoadStage, string> = {
    stage: "Setting the stage",
    cast: "Dressing the cast",
    warm: "Warming up",
  };
  const nightSky = { top: "#05070f", mid: "#0c1222", horizon: "#1b2236" };
  let session = $state<LoadingSession | null>(null);
  let loadStage = $state<JamLoadStage>("stage");
  type Reveal = "loading" | "finishing" | "leaving" | "gone";
  let reveal = $state<Reveal>("loading");
  let begin = $state(false);
  const revealTimers: ReturnType<typeof setTimeout>[] = [];
  const revealMotion = reducedMotion()
    ? {
        hold: DURATION.normal + DURATION.instant,
        chrome: DURATION.fast,
        delay: 0,
        stage: DURATION.normal,
        scale: 1,
        lift: 0,
      }
    : {
        hold: DURATION.normal + DURATION.instant,
        chrome: DURATION.normal,
        delay: DURATION.fast,
        stage: DURATION.scene,
        scale: 1.08,
        lift: 8,
      };

  function onLoading(progress: JamLoadProgress): void {
    if (reveal !== "loading") return;
    loadStage = progress.stage;
    if (!session) return;
    if (progress.fraction >= 0.25) session.reach("load-25");
    if (progress.fraction >= 0.5) session.reach("load-50");
    if (progress.fraction >= 0.75) session.reach("load-75");
    if (progress.stage === "warm") session.reach("loaded");
  }

  function onPrepared(): void {
    if (reveal !== "loading") return;
    session?.reach("compiled");
    session?.complete();
    reveal = "finishing";
    revealTimers.push(
      setTimeout(() => (reveal = "leaving"), revealMotion.hold)
    );
  }

  // ---------------------------------------------------------------------- fps

  let fps = $state(0);

  onMount(() => {
    ensureThemeApplied();
    const themeDark = BACKGROUND_THEME_COLORS[getSavedBackgroundType()]?.[0];
    if (themeDark) atmosphere = deepen(themeDark);
    session = createLoadingSession({
      key: "flow-fest-phrase-stage",
      ranks: [
        "open",
        "load-25",
        "load-50",
        "load-75",
        "loaded",
        "compiled",
        "smooth",
      ],
      defaultProfile: {
        open: 0,
        "load-25": 1500,
        "load-50": 3000,
        "load-75": 4500,
        loaded: 6000,
        compiled: 6800,
        smooth: 7200,
      },
    });
    void fetch("/data/flow-fest/phrase-library.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(`Phrase library: HTTP ${response.status}`);
        return response.json() as Promise<PhraseLibrary>;
      })
      .then((loaded) => {
        entriesById = new Map(loaded.entries.map((e) => [e.id, e]));
        library = loaded;
      })
      .catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : String(cause);
      });

    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        (globalThis as Record<string, unknown>).__phraseStageFps = fps;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  onDestroy(() => {
    revealTimers.forEach(clearTimeout);
    if (session && !session.done) session.abandon();
  });
</script>

<svelte:head>
  <title>Flow Fest · Staff test stage</title>
</svelte:head>

<div class="page" style:--atmosphere={atmosphere}>
  <div
    class="stage-view"
    bind:clientWidth={viewWidth}
    bind:clientHeight={viewHeight}
  >
    <Canvas
      autoRender={false}
      dpr={1}
      toneMapping={AgXToneMapping}
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: false,
          powerPreference: "high-performance",
        })}
    >
      <EffectComposer multisampling={4}>
        <!-- The camera lives here, not in the scene: the composer reads the
             default camera once, when it mounts, and the scene mounts later.
             It frames both spinners for the stage's aspect. -->
        <T.PerspectiveCamera
          makeDefault
          position={cameraPosition}
          fov={CAMERA_FOV}
          near={0.1}
          far={120}
        >
          <OrbitControls
            target={[FRAME_CENTER_X, FRAME_TARGET_Y, 0]}
            enableDamping
            maxPolarAngle={Math.PI * 0.49}
            minDistance={2.5}
            maxDistance={40}
          />
        </T.PerspectiveCamera>
        {#if schedule}
          <PhraseStageScene
            {schedule}
            {sequenceFor}
            {tempoBpm}
            {begin}
            {probe}
            {atmosphere}
            {names}
            {onLoading}
            {onPrepared}
            {onFrames}
          />
        {/if}
        <BloomEffect
          intensity={1.1}
          luminanceThreshold={0.62}
          luminanceSmoothing={0.25}
          radius={0.6}
          levels={6}
        />
        <ToneMappingEffect mode={ToneMappingMode.AGX} />
      </EffectComposer>
    </Canvas>

    <header class="stage-bar">
      <h1>Staff test stage</h1>
      <PanelButton
        variant="secondary"
        ariaLabel="Stage settings"
        ariaExpanded={settingsOpen}
        onclick={() => (settingsOpen = true)}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
        <span class="settings-label">Settings</span>
      </PanelButton>
    </header>
  </div>

  <section class="dock" aria-label="What each spinner is playing">
    {#each cards as card (card.id)}
      <PhraseDockCard
        name={card.name}
        personality={card.personality}
        phrase={card.phrase}
        phraseKey={card.phraseKey}
        sequence={card.sequence}
        stepIndex={card.stepIndex}
        nextWord={card.nextWord}
      />
    {/each}
  </section>

  {#if reveal !== "gone"}
    <div
      class="curtain"
      style:--leave-chrome="{revealMotion.chrome}ms"
      style:--leave-delay="{revealMotion.delay}ms"
      style:--leave-stage="{revealMotion.stage}ms"
      style:--leave-scale={revealMotion.scale}
      style:--leave-lift="{revealMotion.lift}px"
    >
      <ScenePreparationSurface
        statusText={LOAD_LABELS[loadStage]}
        {session}
        labels={Object.values(LOAD_LABELS)}
        sky={nightSky}
        title="Staff test stage"
        leaving={reveal === "leaving"}
        onLeft={() => {
          reveal = "gone";
          begin = true;
        }}
      />
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</div>

<PhraseStageSettings
  bind:isOpen={settingsOpen}
  bind:tempoBpm
  bind:personalities
  bind:walkMoves
  bind:maxTotalTurns
  bind:maxDifficulty
  bind:hardMotionTypes
  bind:hardDifficulty
  performers={PHRASE_STAGE_PERFORMERS.map((p) => ({
    id: p.id,
    name: names[p.id] ?? p.id,
  }))}
  {walkSafeCount}
  {shares}
  {fps}
  onReseed={() => (seedOffset += 1)}
/>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-areas:
      "stage"
      "dock";
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    color: var(--theme-text);
    /* The theme's night: the sky the stage fades into runs on behind the dock. */
    background: var(--atmosphere);
  }

  .stage-view {
    grid-area: stage;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .stage-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: max(12px, env(safe-area-inset-top))
      max(12px, env(safe-area-inset-right)) 0
      max(16px, env(safe-area-inset-left));
    pointer-events: none;
  }

  .stage-bar > :global(*) {
    pointer-events: auto;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--theme-text-dim);
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
  }

  .settings-label {
    margin-left: 6px;
  }

  .dock {
    grid-area: dock;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 880px));
    justify-content: center;
    gap: 12px;
    padding: 12px max(12px, env(safe-area-inset-right))
      max(12px, env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
    background: var(--theme-panel-bg);
    border-top: 1px solid var(--theme-stroke);
  }

  /* Phones and portrait tablets: the cards stack, stage left above stage
     right, so each gets the width its step grid needs. */
  @media (max-width: 900px) {
    .dock {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      padding-top: 8px;
    }
  }

  @media (max-width: 640px) {
    .settings-label {
      display: none;
    }
  }

  /* Short landscape screens: the dock becomes a rail beside the stage. */
  @media (orientation: landscape) and (max-height: 560px) {
    .page {
      grid-template-areas: "stage dock";
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr) min(360px, 42vw);
    }

    .dock {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      gap: 4px;
      padding: max(6px, env(safe-area-inset-top))
        max(6px, env(safe-area-inset-right)) 6px 6px;
      /* Both cards fit the height of a phone on its side. */
      --phrase-card-pad: 6px;
      overflow-y: auto;
      border-top: 0;
      border-left: 1px solid var(--theme-stroke);
    }
  }

  .curtain {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
  }

  .error {
    position: absolute;
    top: 1rem;
    left: 50%;
    z-index: 31;
    transform: translateX(-50%);
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }
</style>
