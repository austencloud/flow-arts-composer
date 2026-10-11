<!--
  SaveSceneModal — the "packing list" for saving a 3D scene. Shows the seven
  save groups with live summaries generated from current viewer state, all on
  by default, each toggleable. Spec:
  docs/superpowers/specs/2026-07-10-save-scene-modal-design.md
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { tryGetViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    captureScene3DSnapshot,
    captureScene3DPoster,
  } from "../services/capture-3d-scene";
  import { scene3dCollectionState } from "../state/scene-3d-collection-state.svelte";
  import { SCENE_3D_GROUPS } from "../domain/scene-3d-collection-types";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import {
    SceneEnvironmentId,
    getSceneEnvironmentDefinition,
  } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import type {
    Scene3DGroupId,
    StepData,
  } from "../domain/scene-3d-collection-types";
  import {
    reportViewerControlChange,
    type ViewerActionSink,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  let {
    open = $bindable(false),
    bpm,
    onSettingChange,
    onAction,
  }: {
    open?: boolean;
    bpm?: number;
    onSettingChange?: ViewerControlSink;
    onAction?: ViewerActionSink;
  } = $props();

  const viewer3DState = tryGetViewer3DContext();

  let saving = $state(false);
  let name = $state("");
  let poster = $state("");
  let enabled = $state<Record<Scene3DGroupId, boolean>>(allOn());

  function allOn(): Record<Scene3DGroupId, boolean> {
    return Object.fromEntries(SCENE_3D_GROUPS.map((g) => [g, true])) as Record<
      Scene3DGroupId,
      boolean
    >;
  }

  // Reset per open: fresh name, fresh poster off the live canvas, all groups on.
  $effect(() => {
    if (!open || !viewer3DState) return;
    const seq = viewer3DState.currentSequenceData;
    const word = simplifyRepeatedWord(seq?.word || seq?.name || "");
    name = word ? `${word} — 3D scene` : "3D scene";
    poster = captureScene3DPoster(viewer3DState);
    enabled = allOn();
    if (!hasSteps) enabled.performance = false;
  });

  const seq = $derived(viewer3DState?.currentSequenceData ?? null);
  const hasSteps = $derived((seq?.steps?.length ?? 0) > 0);
  const performers = $derived(viewer3DState?.performerManager.performers ?? []);

  function readSceneFeatureCount(): number {
    try {
      const raw = localStorage.getItem("tka-scene-features");
      if (!raw) return 0;
      return Object.values(JSON.parse(raw) as Record<string, boolean>).filter(
        Boolean
      ).length;
    } catch {
      return 0;
    }
  }

  const overrideCounts = $derived({
    prop: performers.filter((p) => p.settings.prop !== null).length,
    effort: performers.filter((p) => p.settings.effortId !== null).length,
    effect: performers.filter((p) => p.settings.effect !== null).length,
  });

  interface GroupRow {
    id: Scene3DGroupId;
    icon: string;
    title: string;
    summary: string;
    disabled?: boolean;
  }

  const rows: GroupRow[] = $derived.by(() => {
    if (!viewer3DState) return [];
    const d = viewer3DState.defaultSettings;
    const settings = settingsService.settings;
    const activeEffects = Object.entries(viewer3DState.effectToggles)
      .filter(([, on]) => on)
      .map(([k]) => k);
    const featureCount = open ? readSceneFeatureCount() : 0;
    const formation =
      viewer3DState.activeFormation === "manual"
        ? "manual layout"
        : viewer3DState.activeFormation;
    const planes = [...viewer3DState.visiblePlanes];

    return [
      {
        id: "performance",
        icon: "fa-music",
        title: "Performance",
        summary: hasSteps
          ? `${simplifyRepeatedWord(seq?.word || seq?.name || "sequence")} · ${seq?.steps?.length} steps${bpm ? ` · ${bpm} BPM` : ""}`
          : "No sequence loaded — look-only save",
        disabled: !hasSteps,
      },
      {
        id: "performers",
        icon: "fa-people-group",
        title: "Performers",
        summary: `${performers.length} on stage · ${formation} · positions, facing, names`,
      },
      {
        id: "props",
        icon: "fa-wand-magic-sparkles",
        title: "Props & sizes",
        summary:
          `${settings.leftPropType ?? d.prop} / ${settings.rightPropType ?? d.prop}` +
          (overrideCounts.prop > 0
            ? ` · ${overrideCounts.prop} performer override${overrideCounts.prop > 1 ? "s" : ""}`
            : "") +
          ` · sizes ${viewer3DState.propSizeLinked ? "linked" : "per-performer"}`,
      },
      {
        id: "efforts",
        icon: "fa-person-running",
        title: "Efforts",
        summary:
          `${d.effortId}` +
          (overrideCounts.effort > 0
            ? ` · ${overrideCounts.effort} performer override${overrideCounts.effort > 1 ? "s" : ""}`
            : " · all performers inherit"),
      },
      {
        id: "effects",
        icon: "fa-fire",
        title: "Effects",
        summary:
          activeEffects.length > 0
            ? activeEffects.join(", ") +
              (overrideCounts.effect > 0
                ? ` · ${overrideCounts.effect} performer override${overrideCounts.effect > 1 ? "s" : ""}`
                : "")
            : overrideCounts.effect > 0
              ? `${overrideCounts.effect} performer override${overrideCounts.effect > 1 ? "s" : ""}`
              : "none active",
      },
      {
        id: "scene",
        icon: "fa-mountain-sun",
        title: "Scene",
        summary:
          `${getSceneEnvironmentDefinition(viewer3DState.environmentId).label}` +
          (viewer3DState.environmentId === SceneEnvironmentId.OCEAN
            ? ` · ${viewer3DState.oceanVariant}`
            : "") +
          (featureCount > 0
            ? ` · ${featureCount} feature${featureCount > 1 ? "s" : ""} on`
            : ""),
      },
      {
        id: "camera",
        icon: "fa-video",
        title: "Camera & view",
        summary:
          `${viewer3DState.navMode} · ${viewer3DState.activeCameraPreset}` +
          (planes.length > 0
            ? ` · ${planes.length} grid plane${planes.length > 1 ? "s" : ""}`
            : " · grid off"),
      },
    ];
  });

  const enabledCount = $derived(
    SCENE_3D_GROUPS.filter((g) => enabled[g]).length
  );
  const selectableCount = $derived(
    hasSteps ? SCENE_3D_GROUPS.length : SCENE_3D_GROUPS.length - 1
  );
  const statusText = $derived(
    enabledCount >= selectableCount
      ? "Everything selected"
      : `${enabledCount} of ${selectableCount} groups selected`
  );

  function toggle(id: Scene3DGroupId) {
    const previous = enabled[id];
    enabled[id] = !previous;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_save_scene",
      `include_${id}`,
      previous,
      !previous
    );
  }

  function closeModal(): void {
    if (!saving) open = false;
  }

  async function handleSave() {
    if (saving || !viewer3DState) return;
    saving = true;
    onAction?.("save_scene", { stage: "requested" });
    try {
      const snapshot = captureScene3DSnapshot(viewer3DState, {
        ...(bpm !== undefined && enabled.performance ? { bpm } : {}),
        groups: { ...enabled },
      });
      const steps =
        enabled.performance && hasSteps
          ? (seq?.steps as StepData[] | undefined)
          : undefined;

      // Lineage stamp: link back to the raw source sequence (spec:
      // 2026-07-12-art-in-library-design.md Unit 3). Recomputed from the live
      // `seq` here rather than reusing the modal-open-time `name` field, since
      // the user may have edited `name` before saving.
      const sourceWord = simplifyRepeatedWord(seq?.word || seq?.name || "");
      const join = sequenceGridJoin(seq);

      await scene3dCollectionState.add({
        name: name.trim() || "3D scene",
        poster,
        snapshot,
        ...(steps && steps.length > 0 ? { steps } : {}),
        ...(steps && steps.length > 0 && join ? { conjoined: join } : {}),
        ...(sourceWord
          ? { sourceWord, ...(seq?.id ? { sourceSequenceId: seq.id } : {}) }
          : {}),
      });
      onAction?.("save_scene", { stage: "completed" }, { count: false });
      toast.success("Scene saved to your collection");
      open = false;
    } catch (error) {
      console.warn("[Scene3DCollection] Save failed:", error);
      onAction?.("save_scene", { stage: "failed" }, { count: false });
      toast.error("Couldn't save the scene — try again");
    } finally {
      saving = false;
    }
  }
</script>

<BaseModal
  bind:open
  size="fit"
  labelledBy="save-scene-title"
  closeOnBackdrop={!saving}
  closeOnEscape={!saving}
>
  <div class="save-scene">
    <header class="head">
      {#if poster}
        <img class="thumb" src={poster} alt="" aria-hidden="true" />
      {:else}
        <div class="thumb thumb-empty" aria-hidden="true">
          <i class="fas fa-cube"></i>
        </div>
      {/if}
      <div class="head-text">
        <h2 id="save-scene-title">Save 3D scene</h2>
        <input
          class="name-input"
          type="text"
          bind:value={name}
          placeholder="Scene name"
          aria-label="Scene name"
          maxlength="80"
        />
      </div>
      <button
        class="close-button"
        type="button"
        aria-label="Close Save 3D scene"
        title="Close"
        onclick={closeModal}
        disabled={saving}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    <div class="rows" role="group" aria-label="What to include">
      {#each rows as row (row.id)}
        <button
          type="button"
          class="group-row"
          role="switch"
          aria-checked={enabled[row.id]}
          disabled={row.disabled}
          onclick={() => toggle(row.id)}
        >
          <i class="fas {row.icon} row-icon" aria-hidden="true"></i>
          <span class="row-text">
            <span class="row-title">{row.title}</span>
            <span class="row-summary">{row.summary}</span>
          </span>
          <span class="switch" aria-hidden="true">
            <span class="knob"></span>
          </span>
        </button>
      {/each}
    </div>

    <footer class="foot">
      <span class="status">{statusText}</span>
      <button
        data-save-shortcut
        type="button"
        class="save-btn"
        onclick={handleSave}
        disabled={saving || enabledCount === 0}
      >
        <i
          class="fas {saving ? 'fa-spinner fa-spin' : 'fa-bookmark'}"
          aria-hidden="true"
        ></i>
        {saving ? "Saving…" : "Save scene"}
      </button>
    </footer>
  </div>
</BaseModal>

<style>
  .save-scene {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    width: min(480px, calc(100vw - 48px));
  }

  .head {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .thumb {
    width: 88px;
    height: 66px;
    object-fit: cover;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .thumb-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: rgba(255, 255, 255, 0.3);
    font-size: 22px;
  }

  .head-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .close-button {
    align-self: flex-start;
    display: grid;
    width: 44px;
    min-width: 44px;
    height: 44px;
    place-items: center;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    cursor: pointer;
  }

  .close-button:hover,
  .close-button:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .close-button:disabled {
    cursor: wait;
    opacity: 0.5;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
  }

  .name-input {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    font-size: 14px;
  }

  .name-input:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 1px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    cursor: pointer;
    text-align: left;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      opacity 150ms ease;
  }

  .group-row:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .group-row[aria-checked="false"] {
    opacity: 0.55;
  }

  .group-row:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .row-icon {
    width: 22px;
    text-align: center;
    font-size: 15px;
    color: var(--theme-accent, #4a9eff);
    flex-shrink: 0;
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .row-title {
    font-size: 14px;
    font-weight: 600;
  }

  .row-summary {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .switch {
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    position: relative;
    flex-shrink: 0;
    transition: background 150ms ease;
  }

  .group-row[aria-checked="true"] .switch {
    background: var(--theme-accent, #4a9eff);
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: transform 150ms ease;
  }

  .group-row[aria-checked="true"] .knob {
    transform: translateX(16px);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .status {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
  }

  .save-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 12px;
    background: var(--theme-accent, #4a9eff);
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #4a9eff) 70%, white);
    color: white;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  @media (hover: hover) {
    .save-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px
        color-mix(in srgb, var(--theme-accent, #4a9eff) 35%, transparent);
    }
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .save-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }
</style>
