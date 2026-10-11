<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    mainItemAt,
    TUNNEL_BACKDROP_MAX_ZOOM,
    type TunnelBackdropFrame,
    EASING_PRESETS,
    easingPresetOf,
    type PostEasingPresetId,
    updateItem,
    updateItemAt,
    type PostItemPatch,
  } from "@austencloud/video-editor/core";
  import type { ToolPanelProps } from "@austencloud/video-editor";
  import {
    POST_MAX_SPOKEN_LENGTH,
    type PostAnimationAppearance,
    type PostMovesMode,
  } from "$lib/shared/post-studio-plugin";
  import {
    setTunnelAppearance,
    setTunnelHookBackdropFrame,
    setTunnelHookSpeed,
  } from "$lib/shared/media-composition/domain/post-project-edits";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import { easingPresetLabel } from "@austencloud/video-editor/ui";
  import { tkaEditorTranslate } from "$lib/shared/media-composition/state/editor-strings";
  import ChipPopoverOption from "$lib/shared/browse/components/filter-chips/ChipPopoverOption.svelte";
  import PostCurveEditor from "$lib/shared/share/components/post-studio/editor/PostCurveEditor.svelte";
  import PostAnimationAppearanceTool from "$lib/shared/post-studio-plugin/ui/PostAnimationAppearanceTool.svelte";
  import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "$lib/shared/mandala/domain/mandala-overlay-types";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The item tool's panels for tka's own kinds: an animation's backdrop
   * framing, tunnel speed, tunnel and animation appearance and labels; a
   * moves strip's appearance and what it shows; the titles' spoken line.
   * Renders nothing for a tool none of them owns.
   */
  let {
    editor,
    item,
    tool,
    locked,
    appearanceFill = true,
  }: ToolPanelProps = $props();
  const tka = useTkaEditor();

  function change(field: string, patch: PostItemPatch): void {
    if (!item) return;
    if (locked) return;
    editor.editSetting(`${item.id}:${field}`, (project, ctx) =>
      updateItemAt(project, item.id, patch, editor.previewSeconds, ctx)
    );
  }

  function patchItem(patch: PostItemPatch): void {
    if (!item) return;
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }

  const HOOK_SPEED_PRESETS = [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "smooth",
  ] as const satisfies readonly PostEasingPresetId[];
  const HOOK_DEFAULT_SPEED = EASING_PRESETS.smooth;

  type AnimationAppearance = PostAnimationAppearance;
  /** What the tunnel shows: the animation's look with the tunnel's own changes over it. */
  const tunnelLook = $derived(
    item?.kind === "animation"
      ? { ...item.animationAppearance, ...item.tunnelAppearance }
      : null
  );

  /**
   * The tunnel keeps only the flags changed on it; everything else goes on
   * following the animation.
   */
  function commitTunnelAppearance(
    look: AnimationAppearance,
    settingKey: string | undefined,
    changed: (keyof AnimationAppearance)[]
  ): void {
    if (!item) return;
    if (locked || changed.length === 0) return;
    const changes = Object.fromEntries(
      changed.map((key) => [
        key,
        // The slider leaves the default thickness unsaid; the tunnel says it,
        // so it is not taken for "follow the animation".
        key === "mandalaThickness"
          ? (look.mandalaThickness ??
            DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth)
          : look[key],
      ])
    ) as AnimationAppearance;
    const change = (
      project: Parameters<typeof setTunnelAppearance>[0],
      ctx: Parameters<typeof setTunnelAppearance>[2]
    ) => setTunnelAppearance(project, changes, ctx);
    if (settingKey)
      editor.editSetting(`${item.id}:tunnel:effects:${settingKey}`, change);
    else editor.edit(change);
  }

  function commitHookSpeed(next: readonly number[]): void {
    if (!item) return;
    if (locked) return;
    const speed = next as [number, number, number, number];
    editor.editSetting(`${item.id}:hook-speed`, (project, ctx) =>
      setTunnelHookSpeed(project, speed, ctx)
    );
  }

  /**
   * The footage behind the opening, as framed now: the hook's own framing, or
   * the whole picture centred where the clip under it is framed.
   */
  const backdropFrame = $derived.by((): TunnelBackdropFrame | null => {
    if (item?.kind !== "animation" || !item.tunnelHook?.backdrop) return null;
    if (item.tunnelHook.backdropFrame) return item.tunnelHook.backdropFrame;
    const under = mainItemAt(editor.project, item.start);
    const crop =
      under && (under.kind === "video" || under.kind === "image")
        ? under.sourceGeometry?.crop
        : undefined;
    return {
      zoom: 1,
      x: crop ? (crop.left + crop.right) / 2 : 0.5,
      y: crop ? (crop.top + crop.bottom) / 2 : 0.5,
    };
  });

  function commitBackdropFrame(
    patch: Partial<TunnelBackdropFrame>,
    field: string
  ): void {
    if (!item) return;
    if (locked || !backdropFrame) return;
    const next = { ...backdropFrame, ...patch };
    editor.editSetting(`${item.id}:backdrop-frame:${field}`, (project, ctx) =>
      setTunnelHookBackdropFrame(project, next, ctx)
    );
  }

  const zoomTimes = (value: number) => `${value.toFixed(2)}×`;

  const MOVES_MODES = $derived<
    { value: PostMovesMode; label: string; disabled: boolean }[]
  >([
    { value: "arrows", label: t("post_editor_moves_arrows"), disabled: locked },
    {
      value: "mandala",
      label: t("post_editor_moves_mandala"),
      disabled: locked,
    },
    {
      value: "alternate",
      label: t("post_editor_moves_alternate"),
      disabled: locked,
    },
  ]);

  const percent = (value: number) => `${Math.round(value)}%`;
</script>

{#if item?.kind === "animation"}
  {#if tool === "crop" && item.kind === "animation" && backdropFrame}
    <p class="hint">{t("post_editor_backdrop_frame_hint")}</p>
    <ValueSlider
      label={t("post_editor_backdrop_zoom")}
      value={backdropFrame.zoom}
      min={1}
      max={TUNNEL_BACKDROP_MAX_ZOOM}
      step={0.01}
      origin={1}
      format={zoomTimes}
      disabled={locked}
      onchange={(zoom) => commitBackdropFrame({ zoom }, "zoom")}
    />
    <ValueSlider
      label={t("post_editor_backdrop_up_down")}
      value={backdropFrame.y * 100}
      min={0}
      max={100}
      step={0.5}
      format={percent}
      disabled={locked}
      onchange={(value) => commitBackdropFrame({ y: value / 100 }, "y")}
    />
    <ValueSlider
      label={t("post_editor_backdrop_left_right")}
      value={backdropFrame.x * 100}
      min={0}
      max={100}
      step={0.5}
      format={percent}
      disabled={locked}
      onchange={(value) => commitBackdropFrame({ x: value / 100 }, "x")}
    />
    {#if item.tunnelHook?.backdropFrame}
      <PanelButton
        disabled={locked}
        onclick={() =>
          editor.edit((project, ctx) =>
            setTunnelHookBackdropFrame(project, null, ctx)
          )}
      >
        {t("post_editor_backdrop_whole")}
      </PanelButton>
    {/if}
  {:else if tool === "speed" && item.kind === "animation" && item.tunnelHook}
    {@const hookSpeed = item.tunnelHook.speed ?? HOOK_DEFAULT_SPEED}
    <PostCurveEditor easing={hookSpeed} {locked} onCommit={commitHookSpeed}>
      {#snippet presets()}
        <div
          class="preset-list"
          role="listbox"
          aria-label={t("post_curve_presets")}
        >
          {#each HOOK_SPEED_PRESETS as id (id)}
            <ChipPopoverOption
              label={easingPresetLabel(tkaEditorTranslate, id)}
              selected={easingPresetOf([...hookSpeed]) === id}
              onclick={() => commitHookSpeed([...EASING_PRESETS[id]])}
            />
          {/each}
        </div>
      {/snippet}
    </PostCurveEditor>
    <PanelButton
      onclick={() => {
        editor.seek(item.start);
        editor.togglePlayback();
      }}
    >
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      {t("post_editor_hook_play")}
    </PanelButton>
  {:else if tool === "appearance" && editor.selectedPart === "tunnel" && item.kind === "animation"}
    <PostAnimationAppearanceTool
      fill={appearanceFill}
      editor={tka.editor}
      appearanceOverride={tunnelLook}
      onAppearanceChange={commitTunnelAppearance}
      appearanceKey="{item.id}:tunnel"
      scopeLabel={t("post_timeline_tunnel")}
      {locked}
      defaultPropType={tka.cardRenderOptions?.propTypeOverride}
    />
  {:else if tool === "appearance" && item.kind === "animation"}
    <PostAnimationAppearanceTool
      fill={appearanceFill}
      editor={tka.editor}
      {item}
      {locked}
      defaultPropType={tka.cardRenderOptions?.propTypeOverride}
    />
  {:else if tool === "labels" && item.kind === "animation"}
    <SegmentedControl
      color="accent"
      options={[
        {
          value: "shown",
          label: t("post_editor_labels_shown"),
          disabled: locked,
        },
        {
          value: "hidden",
          label: t("post_editor_labels_hidden"),
          disabled: locked,
        },
      ]}
      value={item.overlay ? "shown" : "hidden"}
      onchange={(value) => patchItem({ overlay: value === "shown" })}
      ariaLabel={t("share_studio_deep_beat_and_letter")}
    />
  {/if}
{:else if item?.kind === "moves"}
  {#if tool === "appearance" && item.kind === "moves"}
    <PostAnimationAppearanceTool
      fill={appearanceFill}
      editor={tka.editor}
      {item}
      {locked}
      defaultPropType={tka.cardRenderOptions?.propTypeOverride}
    />
  {:else if tool === "shows" && item.kind === "moves"}
    <SegmentedControl
      color="accent"
      options={MOVES_MODES}
      value={item.mode}
      onchange={(mode) => patchItem({ mode })}
      ariaLabel={t("post_editor_moves_show")}
    />
  {/if}
{:else if item?.kind === "titles"}
  {#if tool === "titles" && item.kind === "titles"}
    <div class="hook-titles">
      <span class="readout-name">{t("post_editor_hook_spoken")}</span>
      <input
        class="field"
        value={item.spoken ?? ""}
        placeholder={t("post_editor_hook_spoken_placeholder")}
        maxlength={POST_MAX_SPOKEN_LENGTH}
        aria-label={t("post_editor_hook_spoken")}
        disabled={locked}
        oninput={(event) =>
          change("titles-spoken", { spoken: event.currentTarget.value })}
      />
    </div>
  {/if}
{/if}

<style>
  .preset-list {
    display: grid;
    gap: 0.125rem;
  }

  .hook-titles {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
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

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .field:disabled {
    opacity: 0.5;
  }
</style>
