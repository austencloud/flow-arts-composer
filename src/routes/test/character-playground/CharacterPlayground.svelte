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
  import { COLOR_PRESETS } from "$lib/shared/ui/color-presets";
  import {
    safeLocalStorageGet,
    safeLocalStorageSet,
  } from "$lib/shared/foundation/services/storage-manager";
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
    EYEBROWS,
    EYELASHES,
    EYE_COLORS,
    HAIR_STYLES,
    HATS,
    OUTFITS,
    PRESENTATIONS,
    SHOES,
    parseGenerationOptions,
    type GenerationOptions,
    type Outfit,
    type Presentation,
  } from "./generation-options";
  import ColorOverridePicker from "./ColorOverridePicker.svelte";

  const HAIR_COLOR_PRESETS = [
    { hex: "#16110f", name: "Black" },
    { hex: "#382417", name: "Dark brown" },
    { hex: "#6f452c", name: "Brown" },
    { hex: "#b9824e", name: "Auburn" },
    { hex: "#d5af72", name: "Blond" },
    { hex: "#c8c6c1", name: "Silver" },
    ...COLOR_PRESETS,
  ] as const;
  const OUTFIT_COLOR_PRESETS = [
    { hex: "#17191c", name: "Black" },
    { hex: "#f4f1eb", name: "White" },
    { hex: "#6b7280", name: "Gray" },
    { hex: "#142c4f", name: "Navy" },
    ...COLOR_PRESETS,
  ] as const;

  const CREATOR_DRAFT_KEY = "character-playground-creator-draft-v2";
  const CREATOR_SECTIONS = ["body", "face", "hair", "wardrobe"] as const;
  type CreatorSection = (typeof CREATOR_SECTIONS)[number];
  const SECTION_LABELS: Record<CreatorSection, string> = {
    body: "Body",
    face: "Face",
    hair: "Hair",
    wardrobe: "Wardrobe",
  };
  const EYE_LABELS: Record<(typeof EYE_COLORS)[number], string> = {
    blue: "Blue",
    bluegreen: "Blue green",
    brown: "Brown",
    brownlight: "Light brown",
    deepblue: "Deep blue",
    green: "Green",
    grey: "Grey",
    ice: "Ice",
    lightblue: "Light blue",
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
    { key: "face", label: "Face variation", low: "None", high: "Bold" },
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
  let activeCreatorSection = $state<CreatorSection>("body");
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
      outfit: OUTFITS[presentation].includes(options.outfit as never)
        ? (options.outfit as Outfit)
        : OUTFITS[presentation][0],
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
    const pick = <T,>(values: readonly T[]): T =>
      values[Math.floor(Math.random() * values.length)]!;
    const outfits = OUTFITS[presentation];
    options = {
      presentation,
      age,
      hair: pick(HAIR_STYLES),
      outfit: pick(outfits),
      shoes: pick(SHOES),
      hat: pick(HATS),
      eyebrows: pick(EYEBROWS),
      eyelashes: pick(EYELASHES),
      eyeColor: pick(EYE_COLORS),
      hairColorOverride: null,
      outfitColorOverride: null,
      variationSeed: newVariationSeed(),
      faceSeed: newVariationSeed(),
      height: Math.round(Math.random() * 20) / 20,
      weight: Math.round(Math.random() * 20) / 20,
      muscle: Math.round(Math.random() * 20) / 20,
      proportions: Math.round(Math.random() * 20) / 20,
      face: Math.round(Math.random() * 20) / 20,
    };
  }

  function resetSection(section: CreatorSection): void {
    const defaults = DEFAULT_GENERATION_OPTIONS;
    if (section === "body")
      options = {
        ...options,
        presentation: defaults.presentation,
        age: defaults.age,
        height: defaults.height,
        weight: defaults.weight,
        muscle: defaults.muscle,
        proportions: defaults.proportions,
      };
    if (section === "face")
      options = {
        ...options,
        face: defaults.face,
        eyebrows: defaults.eyebrows,
        eyelashes: defaults.eyelashes,
        eyeColor: defaults.eyeColor,
      };
    if (section === "hair")
      options = { ...options, hair: defaults.hair, hairColorOverride: null };
    if (section === "wardrobe")
      options = {
        ...options,
        outfit: OUTFITS[options.presentation][0],
        shoes: defaults.shoes,
        hat: defaults.hat,
        outfitColorOverride: null,
      };
  }

  function randomizeSection(section: CreatorSection): void {
    const pick = <T,>(values: readonly T[]): T =>
      values[Math.floor(Math.random() * values.length)]!;
    if (section === "body") {
      const presentation = pick(PRESENTATIONS);
      options = {
        ...options,
        presentation,
        outfit: OUTFITS[presentation].includes(options.outfit as never)
          ? (options.outfit as Outfit)
          : OUTFITS[presentation][0],
        age: pick(AGE_BANDS),
        height: Math.round(Math.random() * 20) / 20,
        weight: Math.round(Math.random() * 20) / 20,
        muscle: Math.round(Math.random() * 20) / 20,
        proportions: Math.round(Math.random() * 20) / 20,
      };
    }
    if (section === "face")
      options = {
        ...options,
        face: Math.round(Math.random() * 20) / 20,
        eyebrows: pick(EYEBROWS),
        eyelashes: pick(EYELASHES),
        eyeColor: pick(EYE_COLORS),
        faceSeed: newVariationSeed(),
      };
    if (section === "hair")
      options = {
        ...options,
        hair: pick(HAIR_STYLES),
        hairColorOverride: null,
      };
    if (section === "wardrobe")
      options = {
        ...options,
        outfit: pick(OUTFITS[options.presentation]),
        shoes: pick(SHOES),
        hat: pick(HATS),
        outfitColorOverride: null,
      };
  }

  function assetLabel(asset: string): string {
    return asset
      .replace(/^(female_|male_)/, "")
      .replace(/suit/, " suit")
      .replace(/([a-z])(\d+)/, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function newVariationSeed(): number {
    return Math.floor(Math.random() * 2147483648);
  }

  onMount(() => {
    active = true;
    const saved = safeLocalStorageGet<unknown>(CREATOR_DRAFT_KEY);
    const restored = parseGenerationOptions(saved);
    if (restored) options = restored;
    if (options.variationSeed === null || options.faceSeed === null) {
      options = {
        ...options,
        variationSeed: options.variationSeed ?? newVariationSeed(),
        faceSeed: options.faceSeed ?? newVariationSeed(),
      };
    }
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
        "Choose your settings, then generate. Saved characters are in the performer picker.";
      try {
        const response = await fetch("/test/character-playground/generate");
        const status = response.ok ? await response.json() : null;
        if (!active) return;
        generatorAvailable = status?.available === true;
        if (!generatorAvailable)
          message =
            "Generation needs the local Blender and MPFB installation. Scene controls remain available.";
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
    if (mounted) safeLocalStorageSet(CREATOR_DRAFT_KEY, options);
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
    {#if !compact}<div class="generator-heading">
        <PanelHeader title="Character generator" icon="fa-shuffle" />
        {#if !compact}<SceneChromeButton
            icon="fa-xmark"
            label="Close character generator"
            onclick={close}
          />{/if}
      </div>{/if}
    <PanelContent>
      <p>Shape a new performer, then generate to see them in the scene.</p>
      <p>
        These sliders shape the model. The scene scales performers to its
        configured height.
      </p>
      <div class="creator-fields">
        <SegmentedControl
          options={CREATOR_SECTIONS.map((section) => ({
            value: section,
            label: SECTION_LABELS[section],
          }))}
          value={activeCreatorSection}
          onchange={(section) => (activeCreatorSection = section)}
          semantics="tabs"
          ariaLabel="Creator section"
          color="accent"
          size="md"
        />
        <div class="section-actions">
          <PanelButton
            variant="secondary"
            onclick={() => resetSection(activeCreatorSection)}
            >Reset {SECTION_LABELS[activeCreatorSection]}</PanelButton
          >
          <PanelButton
            variant="secondary"
            onclick={() => randomizeSection(activeCreatorSection)}
            ><i class="fas fa-shuffle" aria-hidden="true"></i> Randomize {SECTION_LABELS[
              activeCreatorSection
            ]}</PanelButton
          >
        </div>
        {#if activeCreatorSection === "body"}
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
              size="md"
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
              size="md"
            />
          </div>
          <div class="slider-grid">
            {#each RANGE_FIELDS.filter((field) => field.key !== "face") as field}
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
        {:else if activeCreatorSection === "face"}
          <div class="slider-grid">
            {#each RANGE_FIELDS.filter((field) => field.key === "face") as field}
              <label class="range-field"
                ><span class="range-title"
                  >{field.label}<small>{field.low} · {field.high}</small></span
                ><input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={options[field.key]}
                  oninput={(event) => setControl(field.key, event)}
                /><output>{Math.round(options[field.key] * 100)}%</output
                ></label
              >
            {/each}
          </div>
          <div class="choice-field">
            <span id="eyebrows-label">Eyebrows</span>
            <div
              class="asset-cards compact-cards"
              role="group"
              aria-labelledby="eyebrows-label"
            >
              {#each EYEBROWS as eyebrow}<button
                  type="button"
                  class:selected={options.eyebrows === eyebrow}
                  aria-pressed={options.eyebrows === eyebrow}
                  onclick={() => (options = { ...options, eyebrows: eyebrow })}
                  ><img
                    src={`/test/character-playground/thumbs/eyebrows/${eyebrow}`}
                    alt=""
                  /><span>{assetLabel(eyebrow)}</span></button
                >{/each}
            </div>
          </div>
          <div class="choice-field">
            <span>Eyelashes</span><SegmentedControl
              options={EYELASHES.map((lashes) => ({
                value: lashes,
                label: lashes === "none" ? "None" : assetLabel(lashes),
              }))}
              value={options.eyelashes}
              onchange={(eyelashes) => (options = { ...options, eyelashes })}
              semantics="radiogroup"
              ariaLabel="Eyelashes"
              color="accent"
              size="md"
              columns={3}
            />
          </div>
          <div class="choice-field">
            <span>Eye color</span><SegmentedControl
              options={EYE_COLORS.map((eyeColor) => ({
                value: eyeColor,
                label: EYE_LABELS[eyeColor],
              }))}
              value={options.eyeColor}
              onchange={(eyeColor) => (options = { ...options, eyeColor })}
              semantics="radiogroup"
              ariaLabel="Eye color"
              color="accent"
              size="md"
              columns={3}
            />
          </div>
        {:else if activeCreatorSection === "hair"}
          <div class="choice-field">
            <span id="hair-label">Hair</span>
            <div class="asset-cards" role="group" aria-labelledby="hair-label">
              {#each HAIR_STYLES as hair}<button
                  type="button"
                  class:selected={options.hair === hair}
                  aria-pressed={options.hair === hair}
                  onclick={() => (options = { ...options, hair })}
                  >{#if hair === "bald"}<i
                      class="fas fa-circle-user"
                      aria-hidden="true"
                    ></i>{:else}<img
                      src={`/test/character-playground/thumbs/hair/${hair}`}
                      alt=""
                    />{/if}<span
                    >{hair === "bald" ? "Bald" : assetLabel(hair)}</span
                  ></button
                >{/each}
            </div>
          </div>
          <ColorOverridePicker
            label="Hair color"
            description="A solid color replaces the original hair texture."
            value={options.hairColorOverride}
            fallbackColor="#382417"
            presets={HAIR_COLOR_PRESETS}
            onchange={(hairColorOverride) =>
              (options = { ...options, hairColorOverride })}
          />
        {:else}
          <div class="choice-field">
            <span id="outfit-label">Outfit</span>
            <div
              class="asset-cards"
              role="group"
              aria-labelledby="outfit-label"
            >
              {#each OUTFITS[options.presentation] as outfit}<button
                  type="button"
                  class:selected={options.outfit === outfit}
                  aria-pressed={options.outfit === outfit}
                  onclick={() => (options = { ...options, outfit })}
                  ><img
                    src={`/test/character-playground/thumbs/clothes/${outfit}`}
                    alt=""
                  /><span>{assetLabel(outfit)}</span></button
                >{/each}
            </div>
          </div>
          <div class="choice-field">
            <span id="shoes-label">Shoes</span>
            <div
              class="asset-cards compact-cards"
              role="group"
              aria-labelledby="shoes-label"
            >
              {#each SHOES as shoes}<button
                  type="button"
                  class:selected={options.shoes === shoes}
                  aria-pressed={options.shoes === shoes}
                  onclick={() => (options = { ...options, shoes })}
                  ><img
                    src={`/test/character-playground/thumbs/clothes/${shoes}`}
                    alt=""
                  /><span>{assetLabel(shoes)}</span></button
                >{/each}
            </div>
          </div>
          <div class="choice-field">
            <span id="hat-label">Hat</span>
            <div
              class="asset-cards compact-cards"
              role="group"
              aria-labelledby="hat-label"
            >
              {#each HATS as hat}<button
                  type="button"
                  class:selected={options.hat === hat}
                  aria-pressed={options.hat === hat}
                  onclick={() => (options = { ...options, hat })}
                  >{#if hat === "none"}<i class="fas fa-ban" aria-hidden="true"
                    ></i>{:else}<img
                      src={`/test/character-playground/thumbs/clothes/${hat}`}
                      alt=""
                    />{/if}<span
                    >{hat === "none" ? "No hat" : assetLabel(hat)}</span
                  ></button
                >{/each}
            </div>
          </div>
          <ColorOverridePicker
            label="Outfit color"
            description="Solid colors remove printed patterns from the outfit."
            value={options.outfitColorOverride}
            fallbackColor="#355f9f"
            presets={OUTFIT_COLOR_PRESETS}
            onchange={(outfitColorOverride) =>
              (options = { ...options, outfitColorOverride })}
          />
        {/if}
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
  .generator-panel.compact :global(.panel-content) {
    /* The shared sheet owns scrolling on compact screens. */
    overflow: visible;
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
  .section-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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
  .asset-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .asset-cards.compact-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .asset-cards button {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.35rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 8px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 14px);
    text-align: left;
  }
  .asset-cards button:hover,
  .asset-cards button.selected {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 14%,
      var(--theme-card-bg)
    );
  }
  .asset-cards button:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .asset-cards img {
    width: 3.5rem;
    height: 2.75rem;
    object-fit: cover;
    border-radius: 4px;
    background: var(--theme-panel-bg);
  }
  .asset-cards i {
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 2.75rem;
    color: var(--theme-text-dim);
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
    position: sticky;
    bottom: 0;
    z-index: 1;
    padding-top: 0.5rem;
    background: rgb(from var(--theme-panel-bg) r g b / 1);
    border-top: 1px solid var(--theme-stroke);
    padding-bottom: 0.75rem;
  }
  @media (max-width: 30rem) {
    .range-field {
      grid-template-columns: 6.25rem minmax(3rem, 1fr) 2.5rem;
    }
    .asset-cards,
    .asset-cards.compact-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .asset-cards button {
      grid-template-columns: 2.5rem minmax(0, 1fr);
    }
    .asset-cards img,
    .asset-cards i {
      width: 2.5rem;
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
