<!--
  RenderFilmCard — the moment between stopping a recording and rendering it.

  The recording is already saved by the time this appears, so Re-record throws
  away nothing. Draft first, look at it, then come back for Final or Cinema.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import type { ExportOptionsStateManager } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import {
    FILM_RENDER_PRESETS,
    estimateFilmRenderSeconds,
    formatFilmRenderEstimate,
    matchFilmRenderPreset,
    type FilmRenderPresetId,
  } from "#lib/shared/video-export/domain/film-render-presets.js";

  interface Props {
    durationSeconds: number;
    exportOptions: ExportOptionsStateManager;
    onRender: () => void;
    onDiscard: () => void;
    /** "overlay" is the post-recording moment: its own dialog, own keys, own
     *  focus. "inline" is the same card composed inside a host that already
     *  owns those, such as the 3D Studio export modal. */
    presentation?: "overlay" | "inline";
    title?: string;
    renderLabel?: string;
    discardLabel?: string;
  }

  let {
    durationSeconds,
    exportOptions,
    onRender,
    onDiscard,
    presentation = "overlay",
    title = t("viewer_detail_render_your_film"),
    renderLabel = "Render",
    discardLabel = "Re-record",
  }: Props = $props();

  const isOverlay = $derived(presentation === "overlay");

  let renderButtonEl: HTMLButtonElement | null = $state(null);

  const currentOptions = $derived({
    fps: exportOptions.videoFps,
    resolution: exportOptions.videoResolution,
    quality: exportOptions.videoQuality,
  });

  const selected = $derived(matchFilmRenderPreset(currentOptions));

  // "Custom" is a description of hand-tuned export settings, not something to
  // pick, so it only appears while those settings are in force.
  const options = $derived([
    ...FILM_RENDER_PRESETS.map((preset) => ({
      value: preset.id as FilmRenderPresetId | "custom",
      label: preset.label,
    })),
    ...(selected === "custom"
      ? [{ value: "custom" as FilmRenderPresetId | "custom", label: "Custom" }]
      : []),
  ]);

  const detail = $derived(
    `${currentOptions.resolution}p · ${currentOptions.fps} fps${
      currentOptions.quality === "cinema" ? " · cinema pass" : ""
    }`
  );

  const estimate = $derived(
    formatFilmRenderEstimate(
      estimateFilmRenderSeconds(durationSeconds, currentOptions)
    )
  );

  // The estimate changes as presets change, so reserve the widest wording it
  // can reach. Without this the card's buttons shift under the pointer.
  const widestEstimate = $derived(
    FILM_RENDER_PRESETS.map((preset) =>
      formatFilmRenderEstimate(
        estimateFilmRenderSeconds(durationSeconds, preset)
      )
    ).reduce((widest, next) => (next.length > widest.length ? next : widest), "")
  );

  function handleSelect(value: FilmRenderPresetId | "custom"): void {
    if (value === "custom") return;
    const preset = FILM_RENDER_PRESETS.find((p) => p.id === value);
    if (!preset) return;
    exportOptions.setVideoFps(preset.fps);
    exportOptions.setVideoResolution(preset.resolution);
    exportOptions.setVideoQuality(preset.quality);
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Composed inline, the host owns the keyboard: Escape belongs to its
    // dialog, and Enter to whatever it has focused.
    if (!isOverlay) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onRender();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDiscard();
    }
  }

  $effect(() => {
    if (isOverlay) renderButtonEl?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="render-card"
  class:inline={!isOverlay}
  role={isOverlay ? "dialog" : "group"}
  aria-modal={isOverlay ? "true" : undefined}
  aria-labelledby="render-film-title"
>
  <h2 class="title" id="render-film-title">{title}</h2>
  <p class="meta">
    <span class="recorded">{formatTime(durationSeconds)} {t("viewer_detail_recorded")}</span>
    <span class="detail">{detail}</span>
  </p>

  <SegmentedControl
    {options}
    value={selected}
    onchange={handleSelect}
    size="sm"
    ariaLabel={t("viewer_detail_render_quality")}
  />

  <p class="estimate">
    <span class="estimate-stack">
      <span class="estimate-ghost" aria-hidden="true">{widestEstimate}</span>
      <span class="estimate-value">{estimate}</span>
    </span>
  </p>

  <div class="actions">
    <button
      class="action primary"
      type="button"
      bind:this={renderButtonEl}
      onclick={onRender}
    >
      {renderLabel}
    </button>
    <button class="action secondary" type="button" onclick={onDiscard}>
      {discardLabel}
    </button>
  </div>
</div>

<style>
  .render-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    min-width: min(320px, calc(100vw - 32px));
    max-width: min(420px, calc(100vw - 32px));
  }

  /* Composed inside a host that already draws the surface. */
  .render-card.inline {
    min-width: 0;
    max-width: none;
    padding: 0;
    background: transparent;
    border: none;
  }

  .title {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 0;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .recorded {
    font-variant-numeric: tabular-nums;
  }

  .estimate {
    margin: 0;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-variant-numeric: tabular-nums;
  }

  /* Ghost sizer: the widest wording holds the width so the buttons below
     never move when the estimate changes. */
  .estimate-stack {
    display: inline-grid;
  }

  .estimate-ghost,
  .estimate-value {
    grid-area: 1 / 1;
  }

  .estimate-ghost {
    visibility: hidden;
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .action {
    flex: 1 1 0;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .action.primary {
    border: 1px solid transparent;
    background: var(--theme-accent, #8b5cf6);
    color: #fff;
  }

  .action.primary:hover {
    background: var(--theme-accent-hover, #7c3aed);
  }

  .action.secondary {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
  }

  .action.secondary:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.14));
  }

  .action:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .action {
      transition: none;
    }
  }
</style>
