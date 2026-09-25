<script lang="ts">
  import { onMount } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import { WebGLRenderer } from "three";
  import OrbitControls from "$lib/shared/3d/components/OrbitControls.svelte";
  import EffectControlStack from "$lib/shared/effects/components/EffectControlStack.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { EFFECT_PREVIEW_TARGET_COUNTS } from "$lib/shared/effects/domain/effect-preview-loop-policy";
  import type { GeneratedSequenceInfo } from "$lib/features/landing/domain/models/spinner-models";
  import EffectGridScene from "../effect-grid/EffectGridScene.svelte";
  import {
    GHOST_REVIEW_PRESETS,
    GHOST_REVIEW_STORAGE_KEY,
    ghostReviewIntentMatches,
    parseGhostPresetVerdicts,
    resolveGhostReviewIntent,
    toggleGhostPresetVerdict,
    type GhostPresetVerdict,
    type GhostPresetVerdicts,
    type GhostReviewPreset,
  } from "./ghost-review-presets";

  const initialPreset = GHOST_REVIEW_PRESETS[0]!;
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  effectsConfig.applyPreset(
    "ghost",
    initialPreset.id,
    resolveGhostReviewIntent(initialPreset)
  );
  setEffectsConfigContext(effectsConfig);

  const toggleOptions = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  const copyOptions = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 6, label: "6" },
  ];

  let selectedPresetId = $state(initialPreset.id);
  let verdicts = $state<GhostPresetVerdicts>({});
  let verdictsLoaded = $state(false);
  let playing = $state(true);
  let showProps = $state(true);
  let centerPlanes = $state(1);
  let viewportWidth = $state(1920);
  let previewGenerationKey = $state(0);
  let previewLoopStatus = $state<"generating" | "ready" | "error">(
    "generating"
  );
  let previewLoopCount = $state<number | null>(null);

  const compactCamera = $derived(viewportWidth <= 640);
  const narrowCamera = $derived(viewportWidth > 640 && viewportWidth <= 900);
  const cameraPosition = $derived(
    compactCamera
      ? ([0, 2.4, 5.2] as const)
      : narrowCamera
        ? ([0, 2.15, 3.5] as const)
        : ([0, 2.1, 2.9] as const)
  );
  const cameraTarget = $derived(
    compactCamera
      ? ([0, 1.5, 0] as const)
      : narrowCamera
        ? ([0, 1.45, 0] as const)
        : ([0, 1.35, 0] as const)
  );
  const cameraFov = $derived(compactCamera ? 48 : narrowCamera ? 35 : 32);

  const selectedPreset = $derived(
    GHOST_REVIEW_PRESETS.find((preset) => preset.id === selectedPresetId) ??
      initialPreset
  );
  const selectedIntent = $derived(resolveGhostReviewIntent(selectedPreset));
  const favoriteCount = $derived(
    Object.values(verdicts).filter((verdict) => verdict === "favorite").length
  );
  const passCount = $derived(
    Object.values(verdicts).filter((verdict) => verdict === "pass").length
  );
  const reviewedCount = $derived(favoriteCount + passCount);
  const isEdited = $derived.by(() => {
    void effectsConfig.version;
    return !ghostReviewIntentMatches(effectsConfig.ghost, selectedIntent);
  });

  onMount(() => {
    verdicts = parseGhostPresetVerdicts(
      window.localStorage.getItem(GHOST_REVIEW_STORAGE_KEY)
    );
    verdictsLoaded = true;
  });

  $effect(() => {
    if (!verdictsLoaded) return;
    try {
      window.localStorage.setItem(
        GHOST_REVIEW_STORAGE_KEY,
        JSON.stringify(verdicts)
      );
    } catch {
      // The lab still works when browser storage is unavailable.
    }
  });

  function choosePreset(preset: GhostReviewPreset): void {
    selectedPresetId = preset.id;
    effectsConfig.applyPreset(
      "ghost",
      preset.id,
      resolveGhostReviewIntent(preset)
    );
  }

  function resetSelectedPreset(): void {
    choosePreset(selectedPreset);
  }

  function markPreset(presetId: string, requested: GhostPresetVerdict): void {
    const next = { ...verdicts };
    const verdict = toggleGhostPresetVerdict(next[presetId], requested);
    if (verdict) next[presetId] = verdict;
    else delete next[presetId];
    verdicts = next;
  }

  function clearVerdicts(): void {
    verdicts = {};
  }

  function handlePreviewReady(preview: GeneratedSequenceInfo): void {
    previewLoopCount = preview.sequence.steps.length;
    previewLoopStatus = "ready";
  }

  function handlePreviewError(): void {
    previewLoopCount = null;
    previewLoopStatus = "error";
  }

  function retryPreviewLoop(): void {
    previewLoopStatus = "generating";
    previewGenerationKey += 1;
  }

  function countLabel(
    count: number,
    singular: string,
    plural = `${singular}s`
  ): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function handleReviewKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches("input, button, select, textarea, a") ||
        target.isContentEditable)
    ) {
      return;
    }

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= 8) {
      choosePreset(GHOST_REVIEW_PRESETS[digit - 1]!);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const currentIndex = GHOST_REVIEW_PRESETS.findIndex(
        (preset) => preset.id === selectedPreset.id
      );
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (currentIndex + offset + GHOST_REVIEW_PRESETS.length) %
        GHOST_REVIEW_PRESETS.length;
      choosePreset(GHOST_REVIEW_PRESETS[nextIndex]!);
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "f" || key === "p") {
      markPreset(selectedPreset.id, key === "f" ? "favorite" : "pass");
      event.preventDefault();
    }
  }
</script>

<svelte:head>
  <title>Ghost preset lab</title>
</svelte:head>

<svelte:window
  bind:innerWidth={viewportWidth}
  onkeydown={handleReviewKeydown}
/>

<div class="lab-shell">
  <header class="lab-header">
    <div>
      <p class="eyebrow">3D PROP EFFECT REVIEW</p>
      <h1>Ghost preset lab</h1>
      <p class="intro">
        Pick a look, tune it live, and mark what belongs in the final set.
      </p>
    </div>

    <div class="review-status" role="group" aria-label="Preset review progress">
      <span class="status-count"
        >{reviewedCount}/{GHOST_REVIEW_PRESETS.length}</span
      >
      <span>{countLabel(favoriteCount, "favorite")}</span>
      <span>{countLabel(passCount, "pass", "passes")}</span>
      <span class="saved-note">Saved in this browser</span>
    </div>
  </header>

  <main class="workspace">
    <section
      class="preview-column"
      aria-label="Live Ghost preview and settings"
    >
      <div
        class="stage"
        data-preview-loop-status={previewLoopStatus}
        data-preview-loop-count={previewLoopCount ?? 0}
      >
        <div class="canvas-layer" aria-hidden="true">
          <Canvas
            createRenderer={(canvas) =>
              new WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
              })}
          >
            <T.PerspectiveCamera
              makeDefault
              position={cameraPosition}
              fov={cameraFov}
            >
              <OrbitControls
                enableDamping
                target={cameraTarget}
                maxPolarAngle={Math.PI / 2}
              />
            </T.PerspectiveCamera>
            {#key previewGenerationKey}
              <EffectGridScene
                {showProps}
                {playing}
                showLabels={false}
                {centerPlanes}
                focusEffect="ghost"
                showStageMarker={false}
                onPreviewReady={handlePreviewReady}
                onPreviewError={handlePreviewError}
              />
            {/key}
          </Canvas>
        </div>

        {#if previewLoopStatus !== "ready"}
          <div
            class="preview-status"
            class:error={previewLoopStatus === "error"}
            role="status"
          >
            {#if previewLoopStatus === "generating"}
              <span class="status-spinner" aria-hidden="true"></span>
              <span>Generating a {EFFECT_PREVIEW_TARGET_COUNTS}-count LOOP</span
              >
            {:else}
              <span>LOOP generation failed.</span>
              <button type="button" onclick={retryPreviewLoop}>Retry</button>
            {/if}
          </div>
        {/if}

        <p class="sr-only" aria-live="polite">
          {selectedPreset.name}. Intensity {Math.round(
            effectsConfig.ghost.intensity * 100
          )}%, persistence {effectsConfig.ghost.decay} out of 10, density {Math.round(
            effectsConfig.ghost.interval * 100
          )}%.
        </p>

        <div class="stage-title">
          <span class="live-dot" aria-hidden="true"></span>
          <span>{selectedPreset.name}</span>
          {#if previewLoopCount !== null}
            <span class="loop-badge">{previewLoopCount}-count LOOP</span>
          {/if}
          {#if isEdited}<span class="edited-badge">Edited</span>{/if}
        </div>

        <div class="viewer-controls">
          <div class="viewer-control">
            <span>Motion</span>
            <SegmentedControl
              options={toggleOptions}
              value={playing}
              onchange={(value) => (playing = value)}
              size="sm"
              ariaLabel="Motion"
            />
          </div>
          <div class="viewer-control">
            <span>Props</span>
            <SegmentedControl
              options={toggleOptions}
              value={showProps}
              onchange={(value) => (showProps = value)}
              size="sm"
              ariaLabel="Show props"
            />
          </div>
          <div class="viewer-control">
            <span>Copies</span>
            <SegmentedControl
              options={copyOptions}
              value={centerPlanes}
              onchange={(value) => (centerPlanes = value)}
              size="sm"
              ariaLabel="Overlaid rigs"
            />
          </div>
        </div>
      </div>

      <section class="tuning-card" aria-labelledby="tuning-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">LIVE SETTINGS</p>
            <h2 id="tuning-title">Tune {selectedPreset.name}</h2>
          </div>
          <button
            type="button"
            class="reset-button"
            disabled={!isEdited}
            onclick={resetSelectedPreset}
          >
            Discard edits
          </button>
        </div>
        <p class="tuning-note">
          Color, intensity, persistence, and density update the preview
          immediately.
        </p>
        <EffectControlStack effect="ghost" config={effectsConfig} view="3d" />
      </section>
    </section>

    <aside class="review-panel" aria-labelledby="presets-title">
      <div class="section-heading preset-heading">
        <div>
          <p class="section-kicker">EIGHT DIRECTIONS</p>
          <h2 id="presets-title">Preset candidates</h2>
        </div>
        <button
          type="button"
          class="clear-button"
          disabled={reviewedCount === 0}
          onclick={clearVerdicts}
        >
          Clear marks
        </button>
      </div>
      <p class="keyboard-hint">
        Keys: 1–8 select · arrows move · F favorite · P pass
      </p>

      <ol class="preset-grid">
        {#each GHOST_REVIEW_PRESETS as preset, index (preset.id)}
          {@const intent = resolveGhostReviewIntent(preset)}
          {@const verdict = verdicts[preset.id]}
          <li
            class:selected={preset.id === selectedPreset.id}
            class:favorite={verdict === "favorite"}
            class:passed={verdict === "pass"}
            style:--preset-accent={preset.previewColor}
            style:--preset-blue={intent.leftColor}
            style:--preset-red={intent.rightColor}
          >
            <button
              type="button"
              class="preset-choice"
              aria-pressed={preset.id === selectedPreset.id}
              aria-label={`Preview ${preset.name}`}
              onclick={() => choosePreset(preset)}
            >
              <span class="preset-topline">
                <span class="preset-number"
                  >{String(index + 1).padStart(2, "0")}</span
                >
                <span class="source-badge">{preset.source}</span>
                <span class="color-pair" aria-hidden="true">
                  <span></span><span></span>
                </span>
              </span>
              <strong>{preset.name}</strong>
              <span class="direction">{preset.direction}</span>
              <span class="parameter-profile" aria-hidden="true">
                <span style:--amount={`${Math.round(intent.intensity * 100)}%`}
                ></span>
                <span
                  style:--amount={`${Math.round((intent.decay / 10) * 100)}%`}
                ></span>
                <span style:--amount={`${Math.round(intent.interval * 100)}%`}
                ></span>
              </span>
              <span class="preset-values">
                <span>{Math.round(intent.intensity * 100)}% intensity</span>
                <span>{intent.decay}/10 persistence</span>
                <span>{Math.round(intent.interval * 100)}% density</span>
              </span>
            </button>

            <div
              class="verdict-row"
              role="group"
              aria-label={`Verdict for ${preset.name}`}
            >
              <button
                type="button"
                class="verdict-button favorite-button"
                class:active={verdict === "favorite"}
                aria-pressed={verdict === "favorite"}
                aria-label={`Favorite ${preset.name}`}
                onclick={() => markPreset(preset.id, "favorite")}
              >
                Favorite
              </button>
              <button
                type="button"
                class="verdict-button pass-button"
                class:active={verdict === "pass"}
                aria-pressed={verdict === "pass"}
                aria-label={`Pass ${preset.name}`}
                onclick={() => markPreset(preset.id, "pass")}
              >
                Pass
              </button>
            </div>
          </li>
        {/each}
      </ol>
    </aside>
  </main>
</div>

<style>
  :global(body:has(.lab-shell)) {
    margin: 0;
  }

  .lab-shell {
    --theme-text: #edf4ff;
    --theme-text-dim: #94a5bd;
    --theme-panel-bg: rgba(7, 13, 24, 0.92);
    --theme-card-bg: rgba(255, 255, 255, 0.035);
    --theme-stroke: rgba(154, 180, 214, 0.16);
    --theme-stroke-strong: rgba(174, 204, 242, 0.34);
    --theme-accent: #70d9ff;
    --font-size-compact: 0.875rem;
    --font-size-sm: 0.875rem;
    --min-touch-target: 44px;
    box-sizing: border-box;
    min-height: 100vh;
    padding: clamp(1rem, 2vw, 2.75rem);
    background:
      radial-gradient(
        circle at 18% 0%,
        rgba(54, 112, 161, 0.18),
        transparent 34%
      ),
      radial-gradient(
        circle at 92% 24%,
        rgba(118, 72, 156, 0.12),
        transparent 28%
      ),
      #05080e;
    color: var(--theme-text);
    font-size: clamp(1rem, 0.66rem + 0.3vw, 1.5rem);
  }

  .lab-shell,
  .lab-shell * {
    box-sizing: border-box;
  }

  .lab-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2em;
    margin-bottom: 1.2em;
  }

  .eyebrow,
  .section-kicker {
    margin: 0 0 0.45em;
    color: #70d9ff;
    font-size: 0.69em;
    font-weight: 750;
    letter-spacing: 0.15em;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.2em;
    font-size: clamp(2em, 4vw, 3.15em);
    line-height: 0.98;
    letter-spacing: -0.045em;
  }

  h2 {
    margin-bottom: 0;
    font-size: 1.2em;
    letter-spacing: -0.02em;
  }

  .intro {
    max-width: 42em;
    margin-bottom: 0;
    color: var(--theme-text-dim);
    font-size: 0.96em;
  }

  .review-status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.55em 0.85em;
    color: #a8b8cf;
    font-size: 0.75em;
  }

  .status-count {
    display: grid;
    place-items: center;
    min-width: 3.6em;
    min-height: 2.5em;
    border: 1px solid rgba(112, 217, 255, 0.42);
    border-radius: 999px;
    background: rgba(112, 217, 255, 0.08);
    color: #d9f6ff;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .saved-note {
    flex-basis: 100%;
    color: #708198;
    text-align: right;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(24em, 0.95fr);
    align-items: stretch;
    gap: 1em;
  }

  .preview-column {
    display: grid;
    align-content: start;
    gap: 1em;
    min-width: 0;
  }

  .stage,
  .tuning-card,
  .review-panel {
    border: 1px solid var(--theme-stroke);
    border-radius: 1em;
    background: rgba(8, 13, 23, 0.86);
    box-shadow: 0 1.5em 4em rgba(0, 0, 0, 0.22);
  }

  .stage {
    position: relative;
    height: clamp(27rem, 52vh, 88rem);
    min-height: 0;
    overflow: hidden;
    background: #020407;
  }

  .canvas-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .stage::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.035);
    pointer-events: none;
    content: "";
  }

  .stage-title,
  .viewer-controls {
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    border: 1px solid rgba(179, 210, 246, 0.16);
    background: rgba(4, 8, 14, 0.76);
    backdrop-filter: blur(16px);
  }

  .stage-title {
    top: 0.8em;
    left: 0.8em;
    gap: 0.55em;
    min-height: 2.65em;
    padding: 0.55em 0.85em;
    border-radius: 999px;
    font-size: 0.8em;
    font-weight: 700;
  }

  .live-dot {
    width: 0.55em;
    height: 0.55em;
    border-radius: 50%;
    background: #76e3ff;
    box-shadow: 0 0 0.8em rgba(118, 227, 255, 0.8);
  }

  .edited-badge {
    padding: 0.2em 0.5em;
    border-radius: 999px;
    background: rgba(251, 191, 36, 0.14);
    color: #f9d77c;
    font-size: 0.76em;
    font-weight: 700;
  }

  .loop-badge {
    padding: 0.2em 0.5em;
    border-radius: 999px;
    background: rgba(112, 217, 255, 0.12);
    color: #bcefff;
    font-size: 0.76em;
    font-weight: 700;
  }

  .preview-status {
    position: absolute;
    z-index: 3;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75em;
    background: rgba(2, 4, 7, 0.76);
    color: #b9c8dc;
    font-size: max(0.875rem, 0.8em);
    font-weight: 650;
  }

  .preview-status.error {
    color: #ffabb8;
  }

  .preview-status button {
    min-height: var(--min-touch-target);
    padding: 0.55em 0.9em;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 0.7em;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  .status-spinner {
    width: 1em;
    height: 1em;
    border: 2px solid rgba(112, 217, 255, 0.24);
    border-top-color: #70d9ff;
    border-radius: 50%;
    animation: preview-spin 700ms linear infinite;
  }

  @keyframes preview-spin {
    to {
      transform: rotate(1turn);
    }
  }

  .viewer-controls {
    right: 0.8em;
    bottom: 0.8em;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.55em 0.9em;
    max-width: calc(100% - 1.6em);
    padding: 0.65em 0.75em;
    border-radius: 0.8em;
  }

  .viewer-control {
    display: flex;
    align-items: center;
    gap: 0.45em;
    color: #8799b1;
    font-size: max(0.875rem, 0.68em);
  }

  .tuning-card,
  .review-panel {
    padding: 1em;
  }

  .tuning-card {
    --font-size-compact: max(0.875rem, 0.68em);
  }

  .tuning-card :global(.control-stack) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 36rem));
    gap: 0.75em 1.25em;
    max-width: 74rem;
  }

  .tuning-card :global(.ctl-row) {
    grid-template-columns: 5.5em minmax(0, 20rem) auto;
    min-height: var(--min-touch-target);
  }

  .tuning-card :global(.ctl-slider) {
    height: var(--min-touch-target);
    background: linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg))
      center / 100% 6px no-repeat;
  }

  .tuning-card :global(.ctl-color) {
    width: calc(var(--min-touch-target) + 2px);
    height: calc(var(--min-touch-target) + 2px);
  }

  .tuning-card :global(.ctl-color input) {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    margin-bottom: 0.7em;
  }

  .section-kicker {
    margin-bottom: 0.25em;
    font-size: 0.6em;
  }

  .tuning-note {
    margin-bottom: 0.9em;
    color: #7f91aa;
    font-size: max(0.875rem, 0.72em);
  }

  .reset-button,
  .clear-button,
  .verdict-button {
    min-height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.7em;
    background: rgba(255, 255, 255, 0.035);
    color: #b9c8dc;
    font: inherit;
    font-size: max(0.875rem, 0.72em);
    font-weight: 650;
    cursor: pointer;
  }

  .reset-button,
  .clear-button {
    padding: 0.55em 0.85em;
  }

  button:focus-visible {
    outline: 2px solid #70d9ff;
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .review-panel {
    position: sticky;
    top: 1em;
    display: flex;
    height: 100%;
    overflow: visible;
    scrollbar-color: rgba(112, 217, 255, 0.3) transparent;
    flex-direction: column;
  }

  .preset-heading {
    position: sticky;
    z-index: 4;
    top: -1em;
    margin: -1em -1em 0.8em;
    padding: 1em;
    border-bottom: 1px solid var(--theme-stroke);
    background: rgba(8, 13, 23, 0.96);
    backdrop-filter: blur(16px);
  }

  .keyboard-hint {
    margin: -0.15em 0 0.8em;
    color: #788ba4;
    font-size: max(0.875rem, 0.65em);
  }

  .preset-grid {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: 0.7em;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .preset-grid > li {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85em;
    background: rgba(255, 255, 255, 0.025);
    transition:
      border-color 120ms ease,
      background 120ms ease,
      opacity 120ms ease;
  }

  .preset-grid > li::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 2px;
    background: linear-gradient(
      90deg,
      var(--preset-accent),
      var(--preset-blue),
      var(--preset-red)
    );
    opacity: 0.72;
    content: "";
  }

  .preset-grid > li.selected {
    border-color: rgba(112, 217, 255, 0.78);
    background: rgba(112, 217, 255, 0.075);
    box-shadow: 0 0 0 1px rgba(112, 217, 255, 0.12);
  }

  .preset-grid > li.favorite {
    border-color: rgba(74, 222, 128, 0.58);
  }

  .preset-grid > li.passed:not(.selected) .preset-choice {
    opacity: 0.55;
  }

  .preset-choice {
    display: flex;
    width: 100%;
    padding: 0.85em;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    flex-direction: column;
  }

  .preset-choice:hover {
    background: rgba(255, 255, 255, 0.035);
  }

  .preset-topline {
    display: flex;
    align-items: center;
    width: 100%;
    margin-bottom: 0.75em;
  }

  .preset-number {
    color: #70829a;
    font-size: max(0.875rem, 0.65em);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .source-badge {
    margin-left: 0.65em;
    padding: 0.22em 0.48em;
    border: 1px solid rgba(159, 180, 208, 0.14);
    border-radius: 999px;
    color: #8496ae;
    font-size: max(0.875rem, 0.62em);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .color-pair {
    display: flex;
    margin-left: auto;
  }

  .color-pair span {
    width: 0.8em;
    height: 0.8em;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    background: var(--preset-blue);
    box-shadow: 0 0 0.65em
      color-mix(in srgb, var(--preset-blue) 55%, transparent);
  }

  .color-pair span + span {
    margin-left: -0.18em;
    background: var(--preset-red);
    box-shadow: 0 0 0.65em
      color-mix(in srgb, var(--preset-red) 55%, transparent);
  }

  .preset-choice strong {
    margin-bottom: 0.35em;
    font-size: 0.92em;
    letter-spacing: -0.015em;
  }

  .direction {
    color: #93a4bb;
    font-size: max(0.875rem, 0.72em);
    line-height: 1.42;
  }

  .parameter-profile {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35em;
    margin-top: 0.75em;
  }

  .parameter-profile > span {
    height: 0.28em;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(144, 164, 190, 0.14);
  }

  .parameter-profile > span::after {
    display: block;
    width: var(--amount);
    height: 100%;
    border-radius: inherit;
    background: var(--preset-accent);
    content: "";
  }

  .preset-values {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35em 0.7em;
    margin-top: 0.75em;
    padding-top: 0.9em;
    color: #708198;
    font-size: max(0.875rem, 0.68em);
    font-variant-numeric: tabular-nums;
  }

  .verdict-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45em;
    padding: 0 0.65em 0.65em;
  }

  .verdict-button {
    min-width: 0;
    padding: 0.45em 0.35em;
  }

  .favorite-button.active {
    border-color: rgba(74, 222, 128, 0.7);
    background: rgba(74, 222, 128, 0.16);
    color: #9bf5bb;
  }

  .pass-button.active {
    border-color: rgba(251, 113, 133, 0.7);
    background: rgba(251, 113, 133, 0.14);
    color: #ffabb8;
  }

  @media (hover: hover) {
    .reset-button:not(:disabled):hover,
    .clear-button:not(:disabled):hover,
    .verdict-button:hover {
      border-color: var(--theme-stroke-strong);
      background: rgba(255, 255, 255, 0.075);
      color: #edf4ff;
    }
  }

  @media (max-width: 70rem) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .review-panel {
      position: static;
      display: block;
      height: auto;
      max-height: none;
      overflow: visible;
    }

    .preset-heading {
      position: static;
    }

    .preset-grid {
      grid-template-rows: none;
    }

    .stage {
      height: clamp(24rem, 42vh, 34rem);
    }
  }

  @media (min-width: 100rem) and (min-height: 70rem) {
    .lab-shell {
      font-size: 1.25rem;
    }

    .stage {
      height: clamp(52rem, 36vw, 88rem);
    }
  }

  @media (min-width: 70rem) and (max-height: 60rem) {
    .stage {
      height: max(18rem, calc(100vh - 26.5rem));
    }

    .review-panel {
      align-self: start;
      height: auto;
      max-height: calc(100vh - 11.3rem);
      overflow: auto;
    }

    .preset-grid {
      grid-template-rows: none;
    }
  }

  @media (min-width: 220rem) and (min-height: 100rem) {
    .lab-shell {
      --font-size-compact: 1.125rem;
      --font-size-sm: 1.125rem;
      font-size: 1.5rem;
    }

    .section-kicker,
    .keyboard-hint,
    .viewer-control,
    .tuning-note,
    .reset-button,
    .clear-button,
    .verdict-button,
    .preset-number,
    .source-badge,
    .direction,
    .preset-values {
      font-size: 0.75em;
    }
  }

  @media (max-width: 40rem) {
    .lab-shell {
      padding: 0.75rem;
    }

    .lab-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.85em;
    }

    .review-status {
      justify-content: flex-start;
    }

    .saved-note {
      text-align: left;
    }

    .stage {
      height: 18rem;
      margin-bottom: 8.5rem;
      overflow: visible;
    }

    .viewer-controls {
      left: 0.6em;
      right: 0.6em;
      top: calc(100% + 0.6em);
      bottom: auto;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      justify-content: flex-start;
      gap: 0.35em;
      padding: 0.45em;
      overflow: visible;
    }

    .viewer-control > span {
      display: none;
    }

    .viewer-control {
      min-width: 0;
    }

    .viewer-control:last-child {
      grid-column: 1 / -1;
      width: 9rem;
    }

    .tuning-card :global(.control-stack) {
      grid-template-columns: 1fr;
      max-width: none;
    }

    .preset-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 50rem) and (max-height: 36rem) {
    .lab-shell {
      padding: 0.7rem;
    }

    .lab-header {
      align-items: center;
      margin-bottom: 0.65em;
    }

    .eyebrow,
    .intro,
    .saved-note {
      display: none;
    }

    h1 {
      margin: 0;
      font-size: 1.65em;
    }

    .workspace {
      grid-template-columns: minmax(0, 1.35fr) minmax(19rem, 0.9fr);
      gap: 0.7em;
    }

    .stage {
      height: calc(100vh - 5.25rem);
      min-height: 18rem;
      margin-bottom: 4.5rem;
      overflow: visible;
    }

    .viewer-controls {
      top: calc(100% + 0.6em);
      bottom: auto;
      left: 0;
      right: auto;
    }

    .review-panel {
      position: sticky;
      display: flex;
      height: auto;
      top: 0.7rem;
      max-height: calc(100vh - 0.7rem);
      overflow: auto;
    }

    .preset-heading {
      position: sticky;
    }

    .preset-grid {
      grid-template-columns: 1fr;
    }

    .tuning-card {
      padding: 0.85em;
    }

    .tuning-card :global(.control-stack) {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-grid > li {
      transition: none;
    }

    .status-spinner {
      animation: none;
    }
  }
</style>
