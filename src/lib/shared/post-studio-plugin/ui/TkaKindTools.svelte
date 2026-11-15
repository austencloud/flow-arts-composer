<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
    POST_MAX_BEATS_BEHIND,
    POST_MAX_SPOKEN_LENGTH,
    POST_TITLES_SPOKEN_SIZE_MAX,
    POST_TITLES_SPOKEN_SIZE_MIN,
    type PostAnimationAppearance,
    type PostAnimationItem,
    type PostMovesMode,
    type PostTitlesEnter,
    type PostTitlesItem,
    type PostTitlesLeave,
    type PostTitlesLit,
  } from "#lib/shared/post-studio-plugin/index.js";
  import {
    landTitlesOnCard,
    parkTitles,
    setTunnelAppearance,
    setTunnelHookBackdropFrame,
    setTunnelHookSpeed,
  } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import {
    easingPresetLabel,
    PostCurveEditor,
  } from "@austencloud/video-editor/ui";
  import { tkaEditorTranslate } from "#lib/shared/media-composition/state/editor-strings.js";
  import ChipPopoverOption from "#lib/shared/browse/components/filter-chips/ChipPopoverOption.svelte";
  import PostAnimationAppearanceTool from "#lib/shared/post-studio-plugin/ui/PostAnimationAppearanceTool.svelte";
  import PostMandalaSequencesTool from "./PostMandalaSequencesTool.svelte";
  import PostStage3DTool from "./PostStage3DTool.svelte";
  import PostSplitHandsTool from "./PostSplitHandsTool.svelte";
  import PostPanelLiftTool from "./PostPanelLiftTool.svelte";
  import {
    FLASH_MAX_FADE_SECONDS,
    FLASH_MAX_STRENGTH,
    FLASH_MIN_FADE_SECONDS,
    FLASH_MIN_STRENGTH,
  } from "#lib/shared/media-composition/domain/flash.js";
  import {
    CREDIT_MAX_LEAD_LENGTH,
    CREDIT_WORDMARK,
  } from "#lib/shared/media-composition/domain/credit.js";
  import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "#lib/shared/mandala/domain/mandala-overlay-types.js";
  import { useTkaEditor } from "./tka-editor-context";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { CARD_TITLE_LANDING_SECONDS } from "../card-ending";
  import { TITLES_SPOKEN_SIZE } from "#lib/shared/media-composition/domain/tunnel-titles.js";
  import { measureCardLayout } from "../card-ending-draw";
  import { cardLayerOf } from "./card-layer-registry";

  /**
   * The item tool's panels for tka's own kinds: an animation's backdrop
   * framing, tunnel speed, tunnel and animation appearance and labels; a
   * moves strip's appearance and what it shows; the titles' spoken line; a
   * mandala clip's ordered sequences (its Look is the shared Look panel's).
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

  type Follower = NonNullable<PostAnimationItem["followers"]>[number];
  type PartnerMoves = "off" | "same" | "turned";

  /** A tunnel's second performer, or null for none. */
  function commitFollower(follower: Follower | null): void {
    if (!item || locked) return;
    const id = item.id;
    const followers = follower
      ? [
          {
            ...follower,
            beatsBehind: Math.min(follower.beatsBehind, POST_MAX_BEATS_BEHIND),
          },
        ]
      : null;
    editor.editSetting(`${id}:followers`, (project, ctx) =>
      updateItem(project, id, { followers }, ctx)
    );
  }

  function partnerMoves(follower: Follower | undefined): PartnerMoves {
    if (!follower) return "off";
    return follower.mirror || follower.flip || follower.swap
      ? "turned"
      : "same";
  }

  function commitPartnerMoves(
    moves: PartnerMoves,
    current: Follower | undefined
  ): void {
    if (moves === "off") return commitFollower(null);
    // A partner facing the other way does the moves mirrored, flipped and
    // with hands swapped.
    const turned = moves === "turned";
    commitFollower({
      beatsBehind: current?.beatsBehind ?? 0,
      ...(turned && { mirror: true, flip: true, swap: true }),
    });
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

  const secondsText = (seconds: number) => `${seconds.toFixed(2)} s`;

  /** A spoken line's size against the name, as a share of it. */
  function spokenSizeText(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  /** The playhead as seconds into the titles clip, kept inside it. */
  function playheadIn(titles: PostTitlesItem): number {
    const into = editor.previewSeconds - titles.start;
    return Math.min(titles.duration, Math.max(0, into));
  }

  /** Lighting starts at the playhead and runs to the clip's end. */
  function defaultLit(titles: PostTitlesItem): PostTitlesLit {
    const from = Math.min(playheadIn(titles), titles.duration * 0.5);
    return { from, to: titles.duration };
  }

  /** Frames to wait for a card to draw after seeking to it, before giving up. */
  const LAND_MEASURE_FRAMES = 60;
  /** Why the last "Land on card" did nothing, shown under its button. */
  let landNote = $state<string | null>(null);

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /**
   * Lands the titles' name on the first card on screen at or after the
   * playhead. Only a drawn card knows where its word is, so a card not on
   * screen yet is sought to first and measured once it draws.
   */
  async function landOnCard(titles: PostTitlesItem): Promise<void> {
    if (locked) return;
    landNote = null;
    const at = editor.previewSeconds;
    const card = editor.project.tracks
      .flatMap((track) => track.items)
      .filter((candidate) => candidate.kind === "card")
      .filter((candidate) => candidate.start + candidate.duration > at)
      .sort((a, b) => a.start - b.start)[0];
    if (!card) {
      landNote = t("post_editor_titles_land_none");
      return;
    }
    const from = Math.max(at, card.start, titles.start);
    let layer = cardLayerOf(card.id);
    if (!layer) {
      editor.seek(from + CARD_TITLE_LANDING_SECONDS);
      for (let frame = 0; frame < LAND_MEASURE_FRAMES && !layer; frame++) {
        await nextFrame();
        layer = cardLayerOf(card.id);
      }
      // Let the card finish laying out its header before it is measured.
      await nextFrame();
    }
    const word = layer ? measureCardLayout(layer).word : undefined;
    if (!word) {
      landNote = t("post_editor_titles_land_failed");
      return;
    }
    let landed = false;
    editor.edit((project, ctx) => {
      const next = landTitlesOnCard(
        project,
        titles.id,
        card.id,
        from,
        word,
        ctx
      );
      landed = next !== project;
      return next;
    });
    if (!landed) landNote = t("post_editor_titles_land_failed");
  }

  /** Moves one end of the lit span; an end that would cross the other is refused. */
  function commitLit(
    titles: PostTitlesItem,
    change: Partial<PostTitlesLit>
  ): void {
    if (!titles.lit) return;
    const next = { ...titles.lit, ...change };
    if (next.to <= next.from) return;
    patchItem({ lit: next });
  }
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
    <PostStage3DTool {editor} {item} {locked} />
    {#if !item.stage3d}
      <PostAnimationAppearanceTool
        fill={appearanceFill}
        editor={tka.editor}
        {item}
        {locked}
        defaultPropType={tka.cardRenderOptions?.propTypeOverride}
      />
    {/if}
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
  {:else if tool === "hands" && item.kind === "animation"}
    <PostSplitHandsTool {editor} {item} {locked} />
  {:else if tool === "lift" && item.kind === "animation"}
    <PostPanelLiftTool {editor} {item} {locked} />
  {:else if tool === "performers" && item.kind === "animation"}
    {@const follower = item.followers?.[0]}
    <SegmentedControl
      color="accent"
      options={[
        { value: "off", label: "No partner", disabled: locked },
        { value: "same", label: "Same moves", disabled: locked },
        {
          value: "turned",
          label: "Mirrored, flipped, swapped",
          disabled: locked,
        },
      ]}
      value={partnerMoves(follower)}
      onchange={(value) => commitPartnerMoves(value as PartnerMoves, follower)}
      ariaLabel="Partner"
    />
    {#if follower}
      <ValueSlider
        label="Partner, beats behind"
        value={follower.beatsBehind}
        min={0}
        max={16}
        step={1}
        format={(beats) => (beats === 0 ? "Together" : String(beats))}
        disabled={locked}
        onchange={(beats) =>
          commitFollower({ ...follower, beatsBehind: Math.round(beats) })}
      />
    {/if}
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
{:else if item?.kind === "mandala"}
  {#if tool === "sequence" && item.kind === "mandala"}
    <PostMandalaSequencesTool {editor} {item} {locked} />
  {/if}
{:else if item?.kind === "titles"}
  {#if tool === "titles" && item.kind === "titles"}
    {@const titles = item}
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
      <span class="readout-name">{t("post_editor_titles_leave")}</span>
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "lift",
            label: t("post_editor_titles_leave_lift"),
            disabled: locked,
          },
          {
            value: "stay",
            label: t("post_editor_titles_leave_stay"),
            disabled: locked,
          },
        ]}
        value={item.leave ?? "lift"}
        onchange={(leave) => patchItem({ leave: leave as PostTitlesLeave })}
        ariaLabel={t("post_editor_titles_leave")}
      />
      <span class="readout-name">{t("post_editor_titles_arrive")}</span>
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "rise",
            label: t("post_editor_titles_arrive_rise"),
            disabled: locked,
          },
          {
            value: "none",
            label: t("post_editor_titles_arrive_none"),
            disabled: locked,
          },
        ]}
        value={item.enter ?? "rise"}
        onchange={(enter) => patchItem({ enter: enter as PostTitlesEnter })}
        ariaLabel={t("post_editor_titles_arrive")}
      />
      {#if item.spoken}
        {@const large = item.spokenSize ?? TITLES_SPOKEN_SIZE}
        <ValueSlider
          label={t("post_editor_titles_spoken_size")}
          value={large}
          min={POST_TITLES_SPOKEN_SIZE_MIN}
          max={POST_TITLES_SPOKEN_SIZE_MAX}
          step={0.001}
          format={spokenSizeText}
          disabled={locked}
          onchange={(spokenSize) =>
            change("titles-spoken-size", { spokenSize })}
        />
        {#if item.keyframes?.box?.length}
          <!-- With box keys the line can grow as the box shrinks. -->
          <ValueSlider
            label={t("post_editor_titles_spoken_size_small")}
            value={item.spokenSizeSmall ?? large}
            min={POST_TITLES_SPOKEN_SIZE_MIN}
            max={POST_TITLES_SPOKEN_SIZE_MAX}
            step={0.001}
            format={spokenSizeText}
            disabled={locked}
            onchange={(spokenSizeSmall) =>
              change("titles-spoken-size-small", { spokenSizeSmall })}
          />
        {/if}
      {/if}
      <span class="readout-name">{t("post_editor_titles_lit")}</span>
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "off",
            label: t("post_editor_titles_lit_off"),
            disabled: locked,
          },
          {
            value: "on",
            label: t("post_editor_titles_lit_on"),
            disabled: locked,
          },
        ]}
        value={item.lit ? "on" : "off"}
        onchange={(value) =>
          patchItem({ lit: value === "on" ? defaultLit(titles) : null })}
        ariaLabel={t("post_editor_titles_lit")}
      />
      {#if item.lit}
        {@const lit = item.lit}
        <div class="lit-span" transition:growFade>
          <ValueSlider
            label={t("post_editor_titles_lit_from")}
            value={lit.from}
            min={0}
            max={item.duration}
            step={0.05}
            format={secondsText}
            disabled={locked}
            onchange={(from) => commitLit(titles, { from })}
          />
          <PanelButton
            disabled={locked}
            onclick={() => commitLit(titles, { from: playheadIn(titles) })}
          >
            {t("post_editor_titles_set_to_playhead")}
          </PanelButton>
          <ValueSlider
            label={t("post_editor_titles_lit_to")}
            value={lit.to}
            min={0}
            max={item.duration}
            step={0.05}
            format={secondsText}
            disabled={locked}
            onchange={(to) => commitLit(titles, { to })}
          />
          <PanelButton
            disabled={locked}
            onclick={() => commitLit(titles, { to: playheadIn(titles) })}
          >
            {t("post_editor_titles_set_to_playhead")}
          </PanelButton>
        </div>
      {/if}
      <PanelButton
        disabled={locked}
        onclick={() =>
          editor.edit((project, ctx) =>
            parkTitles(project, titles.id, editor.previewSeconds, ctx)
          )}
      >
        {t("post_editor_titles_park")}
      </PanelButton>
      <PanelButton disabled={locked} onclick={() => void landOnCard(titles)}>
        {t("post_editor_titles_land")}
      </PanelButton>
      {#if landNote}
        <p class="hint" role="status" transition:growFade>{landNote}</p>
      {/if}
    </div>
  {/if}
{:else if item?.kind === "flash"}
  {#if tool === "flash" && item.kind === "flash"}
    <div class="flash-tools">
      <ValueSlider
        label={t("post_editor_flash_strength")}
        value={item.strength}
        min={FLASH_MIN_STRENGTH}
        max={FLASH_MAX_STRENGTH}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}%`}
        disabled={locked}
        onchange={(strength) => change("flash-strength", { strength })}
      />
      <ValueSlider
        label={t("post_editor_flash_fade")}
        value={item.fade}
        min={FLASH_MIN_FADE_SECONDS}
        max={FLASH_MAX_FADE_SECONDS}
        step={0.05}
        format={secondsText}
        disabled={locked}
        onchange={(fade) => change("flash-fade", { fade })}
      />
      <span class="readout-name">{t("post_editor_flash_marks")}</span>
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "on",
            label: t("post_editor_flash_marks_on"),
            disabled: locked,
          },
          {
            value: "off",
            label: t("post_editor_flash_marks_off"),
            disabled: locked,
          },
        ]}
        value={item.marks ? "on" : "off"}
        onchange={(value) => patchItem({ marks: value === "on" })}
        ariaLabel={t("post_editor_flash_marks")}
      />
    </div>
  {/if}
{:else if item?.kind === "credit"}
  {#if tool === "credit" && item.kind === "credit"}
    <div class="flash-tools">
      <span class="readout-name">{t("post_editor_credit_lead")}</span>
      <input
        class="field"
        value={item.lead}
        maxlength={CREDIT_MAX_LEAD_LENGTH}
        aria-label={t("post_editor_credit_lead")}
        disabled={locked}
        oninput={(event) =>
          change("credit-lead", { lead: event.currentTarget.value })}
      />
      <p class="hint">
        {t("post_editor_credit_hint", { wordmark: CREDIT_WORDMARK })}
      </p>
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

  .flash-tools {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .lit-span {
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
