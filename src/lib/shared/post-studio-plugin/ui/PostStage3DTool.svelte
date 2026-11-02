<script lang="ts">
  import type { Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import type {
    PostAnimationItem,
    PostStage3D,
    PostStage3DShot,
  } from "../item-kinds";
  import { stage3DGridBpm, stage3DSecondsPerTurn } from "../stage-3d";
  import { STAGE_3D_BEATS_PER_TURN } from "../stage-3d";
  import {
    orbitStagePose,
    roundStagePose,
    type StageCameraPose,
  } from "./stage-3d-camera";
  import { stage3DCameraState } from "./stage-3d-camera-state.svelte";

  /**
   * An animation clip's 3D controls, at the top of its look: 2D or 3D, and in
   * 3D the camera shot, the orbit's speed and direction, a saved angle's
   * distance, and the scene. The scene picker is the 3D viewer's own.
   */
  let {
    editor,
    item,
    locked,
  }: {
    editor: VideoEditorState;
    item: PostAnimationItem;
    locked: boolean;
  } = $props();

  const stage = $derived(item.stage3d ?? null);

  function commit(key: string, next: PostStage3D | null): void {
    if (locked) return;
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
      <p class="hint">{t("post_stage_3d_saved_hint")}</p>
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

    <span class="readout-name">{t("post_stage_3d_scene")}</span>
    {#if ScenePicker}
      <ScenePicker
        value={stage.environment ?? "cosmic"}
        onchange={(environment) =>
          commit("scene", { ...stage, environment })}
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
