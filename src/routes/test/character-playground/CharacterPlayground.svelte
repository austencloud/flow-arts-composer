<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { replaceState } from "$app/navigation";
  import {
    AVATAR_DEFINITIONS,
    Plane,
    type AvatarId,
  } from "@austencloud/scene-3d";
  import Viewer3DFullscreen from "$lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import SceneChromeButton from "$lib/shared/3d/components/controls/SceneChromeButton.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PanelHeader from "$lib/shared/components/panel/PanelHeader.svelte";
  import PanelContent from "$lib/shared/components/panel/PanelContent.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
  import { setViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { setCharacterCatalogContext } from "$lib/shared/3d/context/character-catalog-context";
  import {
    prepareCharacterForDisplay,
    getCharacterModelPath,
  } from "$lib/shared/3d/domain/character-model";
  import { SceneEnvironmentId } from "$lib/shared/3d/environments/domain/scene-environment";
  import { ALL_FIXTURE_LOOPS } from "$lib/shared/combination/domain/demo-fixtures";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { createPlaybackControllerFactory } from "$lib/shared/animation-engine/create-playback-controller-factory";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { createFullscreenController } from "$lib/shared/fullscreen/state/fullscreen-controller.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    loadAvailableCandidates,
    resolveCandidate,
    type LocalCharacterCandidate,
  } from "../_lab-kit/local-character-candidates";
  import {
    AGE_BANDS,
    DEFAULT_GENERATION_OPTIONS,
    HAIR_STYLES,
    OUTFITS,
    PRESENTATIONS,
    type GenerationOptions,
    type HairStyle,
    type Outfit,
    type Presentation,
  } from "./generation-options";

  const HAIR_LABELS: Record<HairStyle, string> = {
    short01: "Short 1",
    short02: "Short 2",
    short03: "Short 3",
    bob01: "Bob",
    ponytail01: "Ponytail",
    afro01: "Afro",
  };
  const OUTFIT_LABELS: Record<Outfit, string> = {
    female_casualsuit01: "Casual 1",
    female_casualsuit02: "Casual 2",
    female_sportsuit01: "Sport",
    male_casualsuit01: "Casual 1",
    male_casualsuit02: "Casual 2",
    male_casualsuit03: "Casual 3",
  };
  const RANGE_FIELDS = [
    {
      key: "height",
      label: "Height proportions",
      low: "Short",
      high: "Tall",
    },
    { key: "weight", label: "Weight", low: "Lean", high: "Fuller" },
    { key: "muscle", label: "Muscle", low: "Softer", high: "Defined" },
    {
      key: "proportions",
      label: "Proportions",
      low: "Wide hips",
      high: "Wide shoulders",
    },
    { key: "face", label: "Face variation", low: "Subtle", high: "Bold" },
  ] as const;

  const initialSequence = ALL_FIXTURE_LOOPS.find(
    ([id]) => id === "AAAA_CCW"
  )![1];
  const viewer = createViewer3DState({
    renderMode: "3d",
    environmentId: SceneEnvironmentId.FOREST,
    performers: [],
    selectedPerformerIndex: 0,
    selectedPerformerIndices: [0],
    camera: null,
    navMode: "orbit",
    defaultProp: PropType.FIRE_DOUBLE_STAFF,
    visiblePlanes: [Plane.WALL],
    showGridLabels: true,
    effectToggles: { fire: false, led: false, trails: false },
    sceneFeatures: { environment: true, stage: true, audience: false },
  });
  setViewer3DContext(viewer);
  const animation = createAnimationPanelState({ ephemeral: true });
  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  setAnimationVisibilityContext(visibility);
  let announcement = $state("");
  const fullscreen = createFullscreenController({
    getHapticService: () => null,
    announce: (message) => (announcement = message),
  });
  let playback = $state.raw<AnimationPlaybackController | null>(null);
  let candidates = $state<LocalCharacterCandidate[]>([]);
  const catalog = $derived([
    ...AVATAR_DEFINITIONS.filter(
      ({ id, availability }) =>
        availability !== "local-evaluation" && id !== "ch01"
    ),
    ...candidates.flatMap((candidate) => {
      const definition = AVATAR_DEFINITIONS.find(
        ({ id }) => id === candidate.id
      );
      return definition ? [definition] : [];
    }),
  ]);
  setCharacterCatalogContext(() => catalog);
  let mounted = $state(false);
  let ready = $state(false);
  let generating = $state(false);
  let generatorAvailable = $state(false);
  let generatorOpen = $state(false);
  let pickerOpen = $state(false);
  let message = $state("Loading local characters…");
  let failure = $state("");
  let options = $state<GenerationOptions>({ ...DEFAULT_GENERATION_OPTIONS });
  let active = false;
  let initializedPlayback = false;
  const sequence = $derived(viewer.currentSequenceData ?? initialSequence);
  const selected = $derived(
    viewer.performerManager.performers[viewer.primaryPerformerIndex]
      ?.characterId ?? ""
  );

  async function refreshCharacters() {
    const available = await loadAvailableCandidates();
    if (!active) return;
    for (const candidate of available) {
      const existing = AVATAR_DEFINITIONS.find(({ id }) => id === candidate.id);
      if (existing) existing.modelPath = candidate.modelUrl;
      else
        AVATAR_DEFINITIONS.push({
          id: candidate.id as AvatarId,
          name: candidate.label,
          modelPath: candidate.modelUrl,
          description: candidate.note,
          icon: "fa-person",
          availability: "local-evaluation",
        });
    }
    candidates = available;
  }

  async function randomize() {
    if (generating) return;
    const targets = viewer.scopedPerformers().map(({ id }) => id);
    generating = true;
    failure = "";
    message =
      "Generating body, face, hair and clothes. The scene stays available.";
    try {
      const response = await fetch("/test/character-playground/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(options),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? "Character generation failed.");
      if (!active) return;
      await refreshCharacters();
      const created = candidates.find(({ id }) => id === result.id);
      if (!created)
        throw new Error(
          "The character was saved but its model could not load. Reload to try again."
        );
      await prepareCharacterForDisplay(
        getCharacterModelPath(created.id as AvatarId)
      );
      if (!active) return;
      // Selecting another performer while Blender works must not replace that person.
      const current = viewer.scopedPerformers();
      const sameSelection =
        targets.length > 0 &&
        current.length === targets.length &&
        current.every(({ id }) => targets.includes(id));
      if (sameSelection) viewer.setCharacterScoped(created.id as AvatarId);
      else generatorOpen = true;
      message = `Saved seed ${result.seed}. ${sameSelection ? "Applied to the selected performers." : "Available in the performer character picker."}`;
      announcement = message;
    } catch (cause) {
      if (!active) return;
      failure =
        cause instanceof Error
          ? cause.message
          : "Character generation failed. Please try again.";
      generatorOpen = true;
      message = "";
    } finally {
      if (active) generating = false;
    }
  }

  function setPresentation(presentation: Presentation): void {
    options = {
      ...options,
      presentation,
      outfit: OUTFITS[presentation][0],
    };
  }

  function setControl(
    key: "height" | "weight" | "muscle" | "proportions" | "face",
    event: Event
  ): void {
    options = {
      ...options,
      [key]: Number((event.currentTarget as HTMLInputElement).value),
    };
  }

  function randomizeSettings(): void {
    const presentation =
      PRESENTATIONS[Math.floor(Math.random() * PRESENTATIONS.length)]!;
    const age = AGE_BANDS[Math.floor(Math.random() * AGE_BANDS.length)]!;
    const hair = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)]!;
    const outfits = OUTFITS[presentation];
    options = {
      presentation,
      age,
      hair,
      outfit: outfits[Math.floor(Math.random() * outfits.length)]!,
      height: Math.round(Math.random() * 20) / 20,
      weight: Math.round(Math.random() * 20) / 20,
      muscle: Math.round(Math.random() * 20) / 20,
      proportions: Math.round(Math.random() * 20) / 20,
      face: Math.round(Math.random() * 20) / 20,
    };
  }

  onMount(() => {
    active = true;
    playback = createPlaybackControllerFactory(visibility);
    void (async () => {
      await refreshCharacters();
      if (!active) return;
      const requested =
        new URL(window.location.href).searchParams.get("character") ??
        "intake-mpfb-proof";
      const candidate = resolveCandidate(requested, candidates);
      const characterId =
        catalog.find(({ id }) => id === requested)?.id ?? candidate?.id;
      viewer.enter3D(initialSequence);
      if (characterId) viewer.setCharacterScoped(characterId as AvatarId);
      mounted = true;
      message =
        "Randomize creates a new local character for the selected performers. Saved characters are in the performer picker.";
      try {
        const response = await fetch("/test/character-playground/generate");
        const status = response.ok ? await response.json() : null;
        if (!active) return;
        generatorAvailable = status?.available === true;
        if (!generatorAvailable)
          message =
            "Randomize needs the local Blender and MPFB installation. Scene controls remain available.";
        else if (status.busy)
          message =
            "Another character is being generated. You can keep exploring the scene.";
      } catch {
        if (active)
          message =
            "The local generator could not be reached. Reload to reconnect.";
      }
    })();
    return () => {
      active = false;
    };
  });

  $effect(() => {
    const next = sequence;
    const controller = playback;
    if (!mounted || !controller) return;
    untrack(() => {
      const shouldPlay = !initializedPlayback || animation.isPlaying;
      const speed = animation.speed;
      const shouldLoop = initializedPlayback ? animation.shouldLoop : true;
      controller.initialize(next, animation);
      animation.setShouldLoop(shouldLoop);
      controller.setSpeed(speed);
      if (shouldPlay && !animation.isPlaying) controller.togglePlayback();
      initializedPlayback = true;
    });
  });
  $effect(() => {
    if (!mounted || !selected) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("character") === selected) return;
    url.searchParams.set("character", selected);
    replaceState(url, {});
  });
  onDestroy(() => {
    playback?.dispose(animation);
    animation.dispose();
    fullscreen.clearControlsTimeout();
    viewer.dispose();
  });
</script>

<svelte:head
  ><title>Character playground · Flow Arts Composer</title></svelte:head
>

{#snippet generatorActions()}
  <PanelButton
    variant="primary"
    ariaLabel="Create character"
    onclick={() => (generatorOpen = true)}
  >
    <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
    Create character
  </PanelButton>
{/snippet}

{#snippet generatorPanel(close: () => void, compact: boolean)}
  <section
    class="generator-panel"
    class:compact
    aria-label="Character generator"
  >
    <div class="generator-heading">
      <PanelHeader title="Character generator" icon="fa-shuffle" />
      {#if !compact}<SceneChromeButton
          icon="fa-xmark"
          label="Close character generator"
          onclick={close}
        />{/if}
    </div>
    <PanelContent>
      <p>
        Build an adult performer with MakeHuman / MPFB. The generator saves this
        exact setup with its fresh seed.
      </p>
      <p>
        These sliders shape the model. Scene performer controls set its
        displayed height.
      </p>
      <div class="creator-fields">
        <div class="choice-field">
          <span id="presentation-label">Body presentation</span>
          <SegmentedControl
            options={[
              { value: "feminine" as const, label: "Feminine" },
              { value: "masculine" as const, label: "Masculine" },
            ]}
            value={options.presentation}
            onchange={setPresentation}
            semantics="radiogroup"
            ariaLabelledby="presentation-label"
            color="accent"
            size="sm"
          />
        </div>
        <div class="choice-field">
          <span id="age-label">Adult age</span>
          <SegmentedControl
            options={[
              { value: "young" as const, label: "Young adult" },
              { value: "middleage" as const, label: "Middle age" },
              { value: "old" as const, label: "Older adult" },
            ]}
            value={options.age}
            onchange={(age) => (options = { ...options, age })}
            semantics="radiogroup"
            ariaLabelledby="age-label"
            color="accent"
            size="sm"
          />
        </div>
        <div class="slider-grid">
          {#each RANGE_FIELDS as field}
            <label class="range-field">
              <span class="range-title"
                >{field.label}<small>{field.low} · {field.high}</small></span
              >
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={options[field.key]}
                oninput={(event) => setControl(field.key, event)}
              />
              <output>{Math.round(options[field.key] * 100)}%</output>
            </label>
          {/each}
        </div>
        <div class="choice-field">
          <span id="hair-label">Hair</span>
          <SegmentedControl
            options={HAIR_STYLES.map((hair) => ({
              value: hair,
              label: HAIR_LABELS[hair],
            }))}
            value={options.hair}
            onchange={(hair) => (options = { ...options, hair })}
            semantics="radiogroup"
            ariaLabelledby="hair-label"
            color="accent"
            size="sm"
            columns={3}
          />
        </div>
        <div class="choice-field">
          <span id="outfit-label">Outfit</span>
          <SegmentedControl
            options={OUTFITS[options.presentation].map((outfit) => ({
              value: outfit,
              label: OUTFIT_LABELS[outfit],
            }))}
            value={options.outfit}
            onchange={(outfit) => (options = { ...options, outfit })}
            semantics="radiogroup"
            ariaLabelledby="outfit-label"
            color="accent"
            size="sm"
            columns={3}
          />
        </div>
      </div>
      <div class="generator-status" aria-live="polite">
        <p>
          {candidates.length} local characters available. Changes apply when you generate;
          selected performers receive the finished character.
        </p>
        <p>{message}</p>
        {#if failure}<p class="failure" role="alert">{failure}</p>{/if}
      </div>
      <div class="generator-actions">
        <PanelButton
          variant="secondary"
          disabled={generating || !generatorAvailable}
          onclick={randomizeSettings}
        >
          <i class="fas fa-shuffle" aria-hidden="true"></i> Randomize settings
        </PanelButton>
        <PanelButton
          variant="primary"
          ariaBusy={generating}
          disabled={generating || !generatorAvailable}
          onclick={randomize}
        >
          <i
            class="fas {generating ? 'fa-spinner fa-spin' : 'fa-shuffle'}"
            aria-hidden="true"
          ></i>
          Generate for selected performers
        </PanelButton>
      </div>
    </PanelContent>
  </section>
{/snippet}

<main
  class="playground"
  aria-label="Character playground"
  data-ready={ready}
  data-character={selected}
  data-playing={animation.isPlaying}
  data-step={animation.currentStep}
  data-performers={viewer.performerManager.performers.length}
>
  {#if mounted}
    <Viewer3DFullscreen
      sequenceData={sequence}
      currentStep={animation.currentStep}
      isPlaying={animation.isPlaying}
      bpm={animation.speed * 60}
      word={null}
      leftPropType={PropType.FIRE_DOUBLE_STAFF}
      rightPropType={PropType.FIRE_DOUBLE_STAFF}
      playbackMode={animation.playbackMode}
      onPlaybackModeChange={animation.setPlaybackMode}
      onPlaybackToggle={() => playback?.togglePlayback()}
      isLooping={animation.shouldLoop}
      onLoopToggle={() => animation.setShouldLoop(!animation.shouldLoop)}
      onBpmChange={(bpm) => playback?.setSpeed(bpm / 60)}
      onProgressBarSeek={(step) => playback?.seekToStep(step)}
      onSystemPlaybackChange={(playing) => {
        if (playing !== animation.isPlaying) playback?.togglePlayback();
      }}
      onSceneReadyChange={(value) => (ready = value)}
      onChangeSequence={() => (pickerOpen = true)}
      immersive={fullscreen.immersive}
      onToggleImmersive={(host) => fullscreen.toggleImmersive(host)}
      hudActions={generatorActions}
      hostPanel={generatorPanel}
      hostPanelTitle="Character generator"
      bind:hostPanelOpen={generatorOpen}
      weldPerformerGrip
      enablePerformerLocomotion={false}
      allowSaveScene={false}
      contained
    />
  {:else}
    <div class="loading" role="status">Loading character playground…</div>
  {/if}
</main>
<SequencePickerModal
  open={pickerOpen}
  title="Choose a sequence for the selected performers"
  onSelect={(next) => viewer.loadSequenceScoped(next)}
  onClose={() => (pickerOpen = false)}
/>
<div class="sr-only" aria-live="polite">{announcement}</div>

<style>
  .playground {
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg);
  }
  .loading {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--theme-text);
  }
  .generator-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: inherit;
    min-height: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg);
    background: var(--theme-panel-bg);
    color: var(--theme-text);
  }
  .generator-panel.compact {
    border: 0;
  }
  .generator-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-right: 0.75rem;
  }
  .generator-panel p {
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    color: var(--theme-text-dim);
  }
  .generator-panel .failure {
    color: var(--semantic-error);
  }
  .creator-fields {
    display: grid;
    gap: 0.9rem;
  }
  .choice-field {
    display: grid;
    gap: 0.35rem;
  }
  .choice-field > span,
  .range-title {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
  .range-title small {
    display: block;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    line-height: 1.25;
  }
  .slider-grid {
    display: grid;
    gap: 0.55rem;
  }
  .range-field {
    display: grid;
    grid-template-columns: 7.5rem minmax(4rem, 1fr) 2.75rem;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
  }
  .range-field input {
    width: 100%;
    accent-color: var(--theme-accent);
  }
  .range-field output {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .generator-status {
    min-height: 5.25rem;
  }
  .generator-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  @media (max-width: 30rem) {
    .range-field {
      grid-template-columns: 6.25rem minmax(3rem, 1fr) 2.5rem;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
