<script lang="ts">
  import type { Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    POST_STAGE_3D_DEFAULT_ELEVATION,
    POST_STAGE_3D_MAX_ELEVATION,
    POST_STAGE_3D_MAX_SPACING,
    POST_STAGE_3D_MAX_ZOOM,
    POST_STAGE_3D_MIN_ELEVATION,
    POST_STAGE_3D_MIN_SPACING,
    POST_STAGE_3D_MIN_ZOOM,
    type PostAnimationItem,
    type PostStage3D,
    type PostStage3DShot,
  } from "../item-kinds";
  import { TUNNEL_CAST_DEPTH_SPACING_M } from "#lib/shared/sequence-viewer/tunnel/tunnel-cast-3d.js";
  import { stage3DGridBpm, stage3DSecondsPerTurn } from "../stage-3d";
  import { STAGE_3D_BEATS_PER_TURN } from "../stage-3d";
  import {
    orbitStagePose,
    roundStagePose,
    type StageCameraPose,
  } from "./stage-3d-camera";
  import { stage3DCameraState } from "./stage-3d-camera-state.svelte";
  import { stage3DShotEditor } from "./stage-3d-shot-editor.svelte";

  /**
   * An animation clip's 3D controls, at the top of its look: 2D or 3D, and in
   * 3D the camera shot, the front and orbit shots' distance and height, the
   * orbit's speed and direction, a saved angle's distance, the space between
   * the performers, and the scene. The scene picker is the 3D viewer's own.
   *
   * The full-size shot editor uses the same controls on its draft: given
   * `draft`, every change goes to `ondraft` and nothing reaches the clip.
   */
  let {
    editor,
    item,
    locked,
    draft = null,
    ondraft,
  }: {
    editor: VideoEditorState;
    item: PostAnimationItem;
    locked: boolean;
    draft?: PostStage3D | null;
    ondraft?: (next: PostStage3D) => void;
  } = $props();

  const stage = $derived(draft ?? item.stage3d ?? null);

  function commit(key: string, next: PostStage3D | null): void {
    if (locked) return;
    if (ondraft) {
      if (next) ondraft(next);
      return;
    }
    const id = item.id;
    editor.editSetting(`${id}:stage3d:${key}`, (project, ctx) =>
      updateItem(project, id, { stage3d: next }, ctx)
    );
  }

  function withoutKey<K extends keyof PostStage3D>(
    value: PostStage3D,
    key: K
  ): PostStage3D {
    const next = { ...value };
    delete next[key];
    return next;
  }

  function setShot(shot: PostStage3DShot): void {
    if (!stage) return;
    // A saved angle starts from whatever the clip shows now.
    const shown = stage3DCameraState.shownPose(item.id);
    commit("shot", {
      ...stage,
      shot,
      ...(shot === "saved" && !stage.camera && shown
        ? { camera: roundStagePose(shown) }
        : {}),
    });
  }

  const beatSeconds = $derived.by(() => {
    const bpm = stage3DGridBpm(editor.project, item);
    return bpm ? (STAGE_3D_BEATS_PER_TURN * 60) / bpm : null;
  });
  const secondsPerTurn = $derived(stage3DSecondsPerTurn(editor.project, item));

  function distanceOf(pose: StageCameraPose): number {
    return Math.hypot(
      pose.position.x - pose.target.x,
      pose.position.y - pose.target.y,
      pose.position.z - pose.target.z
    );
  }
  const savedPose = $derived(
    stage?.camera ?? stage3DCameraState.shownPose(item.id)
  );

  // The scene picker carries the 3D environments' code; load it with 3D.
  let ScenePicker = $state.raw<Component<{
    value?: string;
    onchange?: (environmentId: string) => void;
  }> | null>(null);
  $effect(() => {
    if (!stage || ScenePicker) return;
    let current = true;
    void import("#lib/shared/3d/components/SceneSelectorPopover.svelte").then(
      (module) => {
        if (current) ScenePicker = module.default as typeof ScenePicker;
      }
    );
    return () => {
      current = false;
    };
  });
</script>

<div class="stage-3d-tool">
  {#if !ondraft}
    <SegmentedControl
      color="accent"
      options={[
        { value: "2d", label: t("post_stage_3d_view_2d"), disabled: locked },
        { value: "3d", label: t("post_stage_3d_view_3d"), disabled: locked },
      ]}
      value={stage ? "3d" : "2d"}
      onchange={(value) =>
        commit("view", value === "3d" ? (stage ?? { shot: "front" }) : null)}
      ariaLabel={t("post_stage_3d_view")}
    />
    {#if item.stage3d}
      <PanelButton
        disabled={locked}
        onclick={() => {
          if (item.stage3d) stage3DShotEditor.start(item.id, item.stage3d);
        }}
      >
        {t("post_stage_3d_open_editor")}
      </PanelButton>
    {/if}
  {/if}

  {#if stage}
    <SegmentedControl
      color="accent"
      options={[
        {
          value: "front",
          label: t("post_stage_3d_shot_front"),
          disabled: locked,
        },
        {
          value: "orbit",
          label: t("post_stage_3d_shot_orbit"),
          disabled: locked,
        },
        {
          value: "saved",
          label: t("post_stage_3d_shot_saved"),
          disabled: locked,
        },
      ]}
      value={stage.shot}
      onchange={(shot) => setShot(shot as PostStage3DShot)}
      ariaLabel={t("post_stage_3d_shot")}
    />

    {#if stage.shot !== "saved"}
      <!-- A diamond on each track marks the framing's own value; pressing it
           goes back there. -->
      <ValueSlider
        label={t("post_stage_3d_distance")}
        value={stage.zoom ?? 1}
        min={POST_STAGE_3D_MIN_ZOOM}
        max={POST_STAGE_3D_MAX_ZOOM}
        step={0.05}
        origin={1}
        format={(zoom) => `${Math.round(zoom * 100)}%`}
        fromTyped={(percent) => percent / 100}
        marks={[1]}
        markLabel={() => t("post_stage_3d_default_value")}
        onmark={() => commit("zoom", withoutKey(stage, "zoom"))}
        disabled={locked}
        onchange={(zoom) => commit("zoom", { ...stage, zoom })}
      />
      <ValueSlider
        label={t("post_stage_3d_height")}
        value={stage.elevation ?? POST_STAGE_3D_DEFAULT_ELEVATION}
        min={POST_STAGE_3D_MIN_ELEVATION}
        max={POST_STAGE_3D_MAX_ELEVATION}
        step={1}
        format={(degrees) => `${Math.round(degrees)}°`}
        marks={[POST_STAGE_3D_DEFAULT_ELEVATION]}
        markLabel={() => t("post_stage_3d_default_value")}
        onmark={() => commit("elevation", withoutKey(stage, "elevation"))}
        disabled={locked}
        onchange={(elevation) => commit("elevation", { ...stage, elevation })}
      />
    {/if}

    {#if stage.shot === "orbit"}
      <ValueSlider
        label={t("post_stage_3d_turn_seconds")}
        value={secondsPerTurn}
        min={4}
        max={60}
        step={0.5}
        format={(seconds) => `${seconds.toFixed(1)} s`}
        marks={beatSeconds ? [beatSeconds] : []}
        markLabel={() => t("post_stage_3d_turn_on_beat")}
        onmark={() => commit("turn", withoutKey(stage, "orbitSecondsPerTurn"))}
        disabled={locked}
        onchange={(seconds) =>
          commit("turn", { ...stage, orbitSecondsPerTurn: seconds })}
      />
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "counterclockwise",
            label: t("post_stage_3d_direction_counterclockwise"),
            disabled: locked,
          },
          {
            value: "clockwise",
            label: t("post_stage_3d_direction_clockwise"),
            disabled: locked,
          },
        ]}
        value={(stage.orbitDirection ?? 1) === 1
          ? "counterclockwise"
          : "clockwise"}
        onchange={(value) =>
          commit("direction", {
            ...stage,
            orbitDirection: value === "clockwise" ? -1 : 1,
          })}
        ariaLabel={t("post_stage_3d_direction")}
      />
    {:else if stage.shot === "saved"}
      <p class="hint">
        {t(ondraft ? "post_stage_3d_editor_hint" : "post_stage_3d_saved_hint")}
      </p>
      {#if savedPose}
        {@const distance = distanceOf(savedPose)}
        <ValueSlider
          label={t("post_stage_3d_distance")}
          value={distance}
          min={1.5}
          max={40}
          step={0.1}
          format={(meters) => `${meters.toFixed(1)} m`}
          disabled={locked}
          onchange={(meters) =>
            commit("camera", {
              ...stage,
              camera: roundStagePose(
                orbitStagePose(savedPose, 0, 0, meters / distance)
              ),
            })}
        />
      {/if}
      {#if stage.camera}
        <PanelButton
          disabled={locked}
          onclick={() => commit("camera", withoutKey(stage, "camera"))}
        >
          {t("post_stage_3d_reset_front")}
        </PanelButton>
      {/if}
    {/if}

    {#if item.followers?.length}
      <ValueSlider
        label={t("post_stage_3d_spacing")}
        value={stage.spacing ?? TUNNEL_CAST_DEPTH_SPACING_M}
        min={POST_STAGE_3D_MIN_SPACING}
        max={POST_STAGE_3D_MAX_SPACING}
        step={0.1}
        format={(meters) => `${meters.toFixed(1)} m`}
        marks={[TUNNEL_CAST_DEPTH_SPACING_M]}
        markLabel={() => t("post_stage_3d_default_value")}
        onmark={() => commit("spacing", withoutKey(stage, "spacing"))}
        disabled={locked}
        onchange={(spacing) => commit("spacing", { ...stage, spacing })}
      />
    {/if}

    <span class="readout-name">{t("post_stage_3d_scene")}</span>
    {#if ScenePicker}
      <ScenePicker
        value={stage.environment ?? "cosmic"}
        onchange={(environment) => commit("scene", { ...stage, environment })}
      />
    {/if}
  {/if}
</div>

<style>
  .stage-3d-tool {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
    container-type: inline-size;
  }

  .readout-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
