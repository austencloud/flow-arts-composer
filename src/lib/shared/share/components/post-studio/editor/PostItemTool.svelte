<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import {
    POST_BOX,
    POST_CANVAS_RATIOS,
    POST_FRAME_RATE,
    POST_MAX_LABEL_LENGTH,
    POST_MAX_SPEED,
    POST_MAX_TEXT_LENGTH,
    POST_MAX_VOLUME,
    POST_MAX_EDGE_BORDER,
    POST_MAX_EDGE_CORNERS,
    POST_MAX_ZOOM,
    POST_MIN_ITEM_SECONDS,
    POST_MIN_SPEED,
    POST_MIN_ZOOM,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
    textBox,
    wrapDegrees,
    type PostBox,
    type PostEdgeColor,
    type PostItem,
    type PostTextSize,
    POST_DEFAULT_EDGE_BORDER,
    POST_EDGE_COLOR_HEX,
    edgeOf,
    postOutputSize,
    ratioValue,
    autoGradeVideo,
    type PostVideoColorGrade,
    boxAt,
    channelValueAt,
    framingAt,
    isAnimated,
    opacityAt,
    setItemFill,
    setTrackFlag,
    setVideoSpeed,
    trimItem,
    trimItemToSource,
    updateItem,
    updateItemAt,
    type PostItemPatch,
  } from "@austencloud/video-editor/core";
  import type {
    PostEdit,
    VideoEditorPlugin,
    VideoEditorState,
  } from "@austencloud/video-editor";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import {
    formatPostSpeed,
    formatTakeClock,
    itemDisplayLabel,
    boxTurn,
    typeBox,
    type BoxField,
    keepsShape,
    keptBox,
    shownBox,
    panelChannel,
    type PostPanelToolId,
    STRAIGHTEN_LIMIT,
    joinRotation,
    quarterLeft,
    splitRotation,
    sourceCropAtRatio,
    sourceFillBox,
  } from "@austencloud/video-editor/ui";
  import type {
    CropSession,
    CropShapeKind,
  } from "@austencloud/video-editor/ui";
  import PostRatioPicker, { type RatioOption } from "./PostRatioPicker.svelte";
  import PostNativeTextTool from "./PostNativeTextTool.svelte";
  import PostSourceGeometryTool from "./PostSourceGeometryTool.svelte";
  import PostVideoColorTool from "./PostVideoColorTool.svelte";
  import ToolReadout from "./item-tool/ToolReadout.svelte";
  import ToolStatus from "./item-tool/ToolStatus.svelte";
  import {
    Icon,
    faArrowRightFromBracket,
    faArrowRightToBracket,
    faArrowsRotate,
    faCropSimple,
    faExpand,
    faFilm,
    faLeftRight,
    faLocationCrosshairs,
    faLockOpen,
    faRotateLeft,
    faVolumeHigh,
  } from "@austencloud/video-editor/icons";

  const DEGREE = String.fromCharCode(176);

  const t = useStrings();

  /**
   * The body of one tool for the selected item. An amount is a slider, a
   * pick is a segmented control, an action is a button. Every change is an
   * ordinary edit, so undo takes it back; a slider dragged through many
   * values undoes in one step.
   */
  interface Props {
    editor: VideoEditorState;
    /**
     * The plugin whose kinds name an item with no name of its own, and whose
     * tool panels render after the core tool's own controls.
     */
    plugin: VideoEditorPlugin | null;
    item: PostItem;
    tool: PostPanelToolId;
    /** The side inspector fills its column; the bottom drawer fits its controls. */
    appearanceFill?: boolean;
    /**
     * The crop screen's session. Crop's controls go through it, so a turn
     * or a zoom keeps the window filled the way a drag on the stage does.
     */
    crop?: CropSession | null;
    cropSourceView?: boolean;
    chosenSourceShape?: CropShapeKind | null;
    onCropFramingControl?: () => void;
    onCropSourceControl?: () => void;
  }

  let {
    editor,
    plugin,
    item,
    tool,
    appearanceFill = true,
    crop = null,
    cropSourceView = true,
    chosenSourceShape = $bindable(null),
    onCropFramingControl,
    onCropSourceControl,
  }: Props = $props();
  let grading = $state(false);
  let gradeError = $state("");

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;

  const trackIndex = $derived(
    findItem(editor.project, item.id)?.trackIndex ?? 0
  );
  const trackId = $derived(editor.project.tracks[trackIndex]?.id ?? null);
  const onMain = $derived(trackIndex === 0);
  const locked = $derived(editor.isLocked(item.id));
  const seconds = $derived(editor.previewSeconds);

  /** The playhead is on the item: the test the keyframes themselves use. */
  const withinSpan = $derived(
    seconds >= item.start - POST_TIME_EPSILON &&
      seconds <= itemEnd(item) + POST_TIME_EPSILON
  );
  /** Far enough inside that an edge moved to the playhead leaves a piece. */
  const playheadInside = $derived(
    seconds - item.start > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON &&
      itemEnd(item) - seconds > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON
  );
  const channel = $derived(
    (tool === "crop" || tool === "position") &&
      (item.kind === "video" || item.kind === "image") &&
      (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)
      ? "sourceGeometry"
      : panelChannel(tool)
  );
  /** An animated value has no single value to show off the item. */
  const frozen = $derived(
    channel !== null && isAnimated(item, channel) && !withinSpan
  );

  function change(field: string, patch: PostItemPatch): void {
    if (locked) return;
    editor.editSetting(`${item.id}:${field}`, (project, ctx) =>
      updateItemAt(project, item.id, patch, editor.previewSeconds, ctx)
    );
  }

  function patchItem(patch: PostItemPatch): void {
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }

  async function autoAdjustColor(): Promise<void> {
    if (item.kind !== "video" || grading || locked) return;
    const target = item;
    const url = editor.mediaUrl(target.takeId);
    if (!url) {
      gradeError = "The video is not ready to analyze.";
      return;
    }
    grading = true;
    gradeError = "";
    try {
      const colorGrade = await autoGradeVideo(
        url,
        target.sourceIn,
        target.sourceOut
      );
      if (!findItem(editor.project, target.id) || editor.isLocked(target.id))
        return;
      editor.edit((project, ctx) =>
        updateItem(project, target.id, { colorGrade }, ctx)
      );
    } catch {
      gradeError =
        "Could not analyze this video. The original remains unchanged.";
    } finally {
      grading = false;
    }
  }

  function setVideoColor(
    field: keyof PostVideoColorGrade,
    value: number
  ): void {
    if (item.kind !== "video" || locked || grading) return;
    const colorGrade = {
      brightness: item.colorGrade?.brightness ?? 1,
      contrast: item.colorGrade?.contrast ?? 1,
      saturation: item.colorGrade?.saturation ?? 1,
      hue: item.colorGrade?.hue ?? 0,
      [field]: value,
    };
    editor.editSetting(`${item.id}:color:${field}`, (project, ctx) =>
      updateItem(project, item.id, { colorGrade }, ctx)
    );
  }

  function rename(value: string): void {
    const label = value.trim();
    patchItem({ label: label || null });
  }

  /** Moves an edge to the playhead and shows the frame now at that edge. */
  function trimToPlayhead(edge: "start" | "end"): void {
    trimTo(edge, editor.previewSeconds);
  }

  /** Moves an edge to a typed time on the timeline. */
  function trimTo(edge: "start" | "end", seconds: number): void {
    const id = item.id;
    trim(edge, (project, ctx) => trimItem(project, id, edge, seconds, ctx));
  }

  /** Moves a clip's In or Out to a typed time in its take. */
  function trimToSource(edge: "start" | "end", seconds: number): void {
    const id = item.id;
    trim(edge, (project, ctx) =>
      trimItemToSource(project, id, edge, seconds, ctx)
    );
  }

  /** Runs a trim, then shows the frame now at the edge it moved. */
  function trim(edge: "start" | "end", run: PostEdit): void {
    if (locked) return;
    const id = item.id;
    const changed = editor.edit(run);
    if (!changed) return;
    const trimmed = findItem(editor.project, id)?.item;
    if (!trimmed) return;
    editor.seek(
      edge === "start"
        ? trimmed.start
        : Math.max(trimmed.start, itemEnd(trimmed) - FRAME_SECONDS)
    );
  }

  function setFill(fill: boolean): void {
    if (locked) return;
    editor.edit((project, ctx) => setItemFill(project, item.id, fill, ctx));
  }

  function setSpeed(speed: number): void {
    if (locked) return;
    editor.editSetting(`${item.id}:speed`, (project, ctx) =>
      setVideoSpeed(project, item.id, speed, ctx)
    );
  }

  function place(box: PostBox): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      updateItemAt(project, item.id, { box }, editor.previewSeconds, ctx)
    );
  }

  // ---- Crop: through the crop screen's session when there is one ----------

  function setCropZoom(zoom: number): void {
    onCropFramingControl?.();
    if (crop)
      crop.setZoom(
        item.kind === "video" &&
          (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)
          ? Math.max(1, zoom)
          : zoom
      );
    else change("zoom", { zoom });
  }

  function straighten(value: number, quarter: number): void {
    onCropFramingControl?.();
    if (crop) crop.setStraighten(value);
    else change("rotation", { rotation: joinRotation(quarter, value) });
  }

  function rotateLeft(quarter: number, value: number): void {
    onCropFramingControl?.();
    if (crop) crop.rotateQuarter();
    else
      change("rotation", {
        rotation: joinRotation(quarterLeft(quarter), value),
      });
  }

  /** Fill, the footage's own shape, a free one, then the fixed ratios. */
  const cropShapes = $derived.by((): RatioOption<CropShapeKind>[] => {
    const off = locked || !crop;
    return [
      {
        value: "fill",
        label: t("post_crop_shape_fill"),
        icon: faExpand,
        disabled: off,
      },
      {
        value: "original",
        label: t("post_crop_shape_original"),
        icon: faFilm,
        disabled: off || !crop?.pose,
      },
      {
        value: "free",
        label: t("post_crop_shape_free"),
        icon: faCropSimple,
        disabled: off,
      },
      ...POST_CANVAS_RATIOS.map((name) => ({
        value: name,
        label: name,
        ratio: ratioValue(name),
        disabled: off,
      })),
    ];
  });

  function toggleMirror(): void {
    onCropFramingControl?.();
    if (crop) crop.toggleMirror();
    else if (item.kind === "video") patchItem({ flip: !item.flip });
  }

  function setCropShape(kind: CropShapeKind): void {
    const geometry =
      item.kind === "video" &&
      (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)
        ? channelValueAt(item, "sourceGeometry", seconds)
        : null;
    if (!geometry) {
      onCropFramingControl?.();
      crop?.setShape(kind);
      return;
    }
    const source = crop?.source;
    if (!source || locked || frozen) return;
    if (kind === "free") {
      onCropSourceControl?.();
      chosenSourceShape = kind;
      return;
    }
    const next =
      kind === "fill"
        ? sourceFillBox(
            geometry,
            source,
            output,
            channelValueAt(item, "box", seconds)
          )
        : sourceCropAtRatio(
            geometry,
            source,
            output,
            kind === "original"
              ? source.width / source.height
              : ratioValue(kind),
            kind === "original"
          );
    onCropSourceControl?.();
    editor.pause();
    editor.edit((project, ctx) =>
      updateItemAt(project, item.id, { sourceGeometry: next }, seconds, ctx)
    );
    chosenSourceShape = kind;
  }

  function resetCrop(): void {
    const geometry =
      item.kind === "video" &&
      (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)
        ? channelValueAt(item, "sourceGeometry", seconds)
        : null;
    const source = crop?.source;
    if (geometry && source && !locked && !frozen) {
      const next = sourceCropAtRatio(
        geometry,
        source,
        output,
        source.width / source.height,
        true
      );
      onCropSourceControl?.();
      editor.pause();
      editor.edit((project, ctx) =>
        updateItemAt(project, item.id, { sourceGeometry: next }, seconds, ctx)
      );
      chosenSourceShape = "original";
    } else onCropFramingControl?.();
    if (crop?.canReset) crop.reset();
  }

  function unlock(): void {
    const id = trackId;
    if (!id) return;
    editor.edit((project, ctx) =>
      setTrackFlag(project, id, "locked", false, ctx)
    );
  }

  /** Puts the playhead on the item's nearest frame. */
  function goToItem(): void {
    editor.pause();
    editor.seek(
      seconds < item.start
        ? item.start
        : Math.max(item.start, itemEnd(item) - FRAME_SECONDS)
    );
  }

  function sameBox(a: PostBox, b: PostBox): boolean {
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-4;
    return (
      near(a.x, b.x) &&
      near(a.y, b.y) &&
      near(a.width, b.width) &&
      near(a.height, b.height)
    );
  }

  const placements = $derived.by(
    (): { id: string; label: string; box: PostBox }[] => {
      switch (item.kind) {
        case "video":
        case "image":
          return [
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
            {
              id: "top",
              label: t("post_editor_place_top_half"),
              box: POST_BOX.top,
            },
            {
              id: "above-strip",
              label: t("post_editor_place_above_strip"),
              box: POST_BOX.aboveStrip,
            },
          ];
        case "animation":
          return [
            {
              id: "bottom",
              label: t("post_editor_place_bottom_half"),
              box: POST_BOX.bottom,
            },
            {
              id: "top",
              label: t("post_editor_place_top_half"),
              box: POST_BOX.top,
            },
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
        case "moves":
          return [
            {
              id: "strip-square",
              label: t("post_editor_place_strip_square"),
              box: POST_BOX.stripSquare,
            },
            {
              id: "strip-wide",
              label: t("post_editor_place_strip_wide"),
              box: POST_BOX.stripWide,
            },
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
        case "carousel":
          return [
            {
              id: "strip-side",
              label: t("post_editor_place_strip_side"),
              box: POST_BOX.stripCarousel,
            },
            {
              id: "strip-wide",
              label: t("post_editor_place_strip_wide"),
              box: POST_BOX.stripWide,
            },
          ];
        case "text":
          return [
            {
              id: "top",
              label: t("post_editor_place_top"),
              box: textBox("top"),
            },
            {
              id: "middle",
              label: t("post_editor_place_middle"),
              box: textBox("middle"),
            },
            {
              id: "bottom",
              label: t("post_editor_place_bottom"),
              box: textBox("bottom"),
            },
          ];
        case "card":
        case "titles":
          return [
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
      }
    }
  );

  const onlyPlacement = $derived(
    placements.length === 1 ? placements[0]! : null
  );

  const TEXT_SIZES = $derived<
    { value: PostTextSize; label: string; disabled: boolean }[]
  >([
    { value: "s", label: t("post_editor_text_small"), disabled: locked },
    { value: "m", label: t("post_editor_text_medium"), disabled: locked },
    { value: "l", label: t("post_editor_text_large"), disabled: locked },
  ]);

  const placementNow = $derived(
    placements.find((option) => sameBox(boxAt(item, seconds), option.box))
      ?.id ?? ""
  );

  /** The post's size in pixels, which typed positions and sizes count in. */
  const output = $derived(postOutputSize(editor.project.canvas));

  /** The post's shorter side, which border widths are measured against. */
  const frameShort = $derived(Math.min(output.width, output.height));

  /** Where the item shows now, in the post's pixels. */
  const shownPixels = $derived.by((): Record<BoxField, number> => {
    const shown = shownBox(editor, item, seconds);
    return {
      x: shown.x * output.width,
      y: shown.y * output.height,
      width: shown.width * output.width,
      height: shown.height * output.height,
    };
  });

  const BOX_FIELDS = $derived<{ field: BoxField; label: string }[]>([
    { field: "x", label: t("post_editor_box_x") },
    { field: "y", label: t("post_editor_box_y") },
    { field: "width", label: t("post_editor_box_width") },
    { field: "height", label: t("post_editor_box_height") },
  ]);

  /** Moves or resizes where the item shows to a typed number of pixels. */
  function typeRect(field: BoxField, pixels: number): void {
    const across = field === "x" || field === "width";
    const share = pixels / (across ? output.width : output.height);
    const shown = shownBox(editor, item, seconds);
    const next = typeBox(shown, field, share, keepsShape(item));
    place(keptBox(editor, item, next, boxAt(item, seconds)));
  }

  /** How far the whole item is turned now, in degrees clockwise. */
  const shownTurn = $derived(boxTurn(shownBox(editor, item, seconds)));

  /** Turns the whole item to a typed angle, where it stands. */
  function typeTurn(degrees: number): void {
    if (!Number.isFinite(degrees)) return;
    place({ ...boxAt(item, seconds), turn: wrapDegrees(degrees) });
  }

  /** A placement moves the item and keeps it turned as it was. */
  function placeAt(box: PostBox): void {
    const turn = boxTurn(boxAt(item, seconds));
    place(turn ? { ...box, turn } : box);
  }

  type BorderPick = PostEdgeColor | "none";

  const BORDER_COLOR_NAMES: Record<PostEdgeColor, () => string> = {
    white: () => t("color_preset_white"),
    black: () => t("color_preset_black"),
    red: () => t("color_preset_red"),
    orange: () => t("color_preset_orange"),
    gold: () => t("color_preset_gold"),
    blue: () => t("color_preset_blue"),
    violet: () => t("color_preset_violet"),
  };

  const BORDER_PICKS = $derived<
    { value: BorderPick; label: string; disabled: boolean }[]
  >([
    { value: "none", label: t("post_editor_border_none"), disabled: locked },
    ...(Object.keys(POST_EDGE_COLOR_HEX) as PostEdgeColor[]).map((color) => ({
      value: color,
      label: BORDER_COLOR_NAMES[color](),
      disabled: locked,
    })),
  ]);

  /** A colour gives a clip with no border the usual one; None takes it off. */
  function pickBorder(pick: BorderPick): void {
    if (item.kind !== "video") return;
    if (pick === "none") {
      patchItem({ edge: { border: 0 } });
      return;
    }
    patchItem({
      edge:
        edgeOf(item).border > 0
          ? { borderColor: pick }
          : { borderColor: pick, border: POST_DEFAULT_EDGE_BORDER },
    });
  }

  const percent = (value: number) => `${Math.round(value)}%`;
  const pixels = (value: number) => `${Math.round(value)} px`;
  const fineDegrees = (value: number) => `${Number(value.toFixed(1))}${DEGREE}`;
  const fadeSeconds = (value: number) => `${value.toFixed(2)} s`;

  /**
   * Speed slides on a doubling scale: 1x sits in the middle, with the same
   * travel to half speed as to double.
   */
  const SPEED_STEP = 0.05;
  const speedFromStop = (stop: number) =>
    Math.min(
      POST_MAX_SPEED,
      Math.max(POST_MIN_SPEED, Math.round(2 ** stop * 100) / 100)
    );
  const formatSpeed = (stop: number) => formatPostSpeed(speedFromStop(stop));
</script>

{#snippet borderSwatch(pick: BorderPick)}
  {#if pick === "none"}
    {t("post_editor_border_none")}
  {:else}
    <span
      class="swatch"
      style:background={POST_EDGE_COLOR_HEX[pick]}
      aria-hidden="true"
    ></span>
  {/if}
{/snippet}

<div
  class="item-tool"
  class:animation-appearance={appearanceFill &&
    tool === "appearance" &&
    (item.kind === "animation" || item.kind === "moves")}
>
  {#if locked}
    <ToolStatus
      text={t("post_editor_layer_locked")}
      icon={faLockOpen}
      action={t("post_editor_unlock_layer")}
      run={unlock}
    />
  {:else if channel !== null && !withinSpan}
    <ToolStatus
      text={t("post_editor_outside_item")}
      icon={faLocationCrosshairs}
      action={t("post_editor_go_to_item")}
      run={goToItem}
    />
  {/if}

  {#if tool === "trim" && item.kind === "video"}
    <ToolReadout
      name={t("post_editor_in")}
      value={formatTakeClock(item.sourceIn)}
      typed={(seconds) => trimToSource("start", seconds)}
      set={{
        icon: faArrowRightToBracket,
        run: () => trimToPlayhead("start"),
      }}
      {locked}
      {playheadInside}
    />
    <ToolReadout
      name={t("post_editor_out")}
      value={formatTakeClock(item.sourceOut)}
      typed={(seconds) => trimToSource("end", seconds)}
      set={{
        icon: faArrowRightFromBracket,
        run: () => trimToPlayhead("end"),
      }}
      {locked}
      {playheadInside}
    />
  {:else if tool === "timing"}
    {#if !onMain}
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "clip",
            label: t("post_editor_match_clip"),
            disabled: locked,
          },
          { value: "own", label: t("post_editor_own_time"), disabled: locked },
        ]}
        value={item.fill ? "clip" : "own"}
        onchange={(value) => setFill(value === "clip")}
        ariaLabel={t("post_editor_tool_timing")}
      />
    {/if}
    {#if onMain || !item.fill}
      {#if !onMain}
        <ToolReadout
          name={t("post_editor_start")}
          value={formatTakeClock(item.start)}
          typed={(seconds) => trimTo("start", seconds)}
          set={{
            icon: faArrowRightToBracket,
            run: () => trimToPlayhead("start"),
          }}
          {locked}
          {playheadInside}
        />
      {/if}
      <ToolReadout
        name={t("post_editor_end")}
        value={formatTakeClock(itemEnd(item))}
        typed={(seconds) => trimTo("end", seconds)}
        set={{
          icon: faArrowRightFromBracket,
          run: () => trimToPlayhead("end"),
        }}
        {locked}
        {playheadInside}
      />
    {/if}
  {:else if tool === "position" && (item.kind === "video" || item.kind === "image") && (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)}
    {@const geometry = channelValueAt(item, "sourceGeometry", seconds)}
    <PostSourceGeometryTool
      {geometry}
      {output}
      {locked}
      {frozen}
      mode="position"
      onChange={(next, field) =>
        change(`source-geometry:${field}`, { sourceGeometry: next })}
    />
  {:else if tool === "crop" && item.kind === "video"}
    {@const framing = framingAt(item, seconds)}
    {@const parts = crop?.parts ?? splitRotation(framing.rotation)}
    <PostRatioPicker
      options={cropShapes}
      value={item.sourceGeometry || item.keyframes?.sourceGeometry?.length
        ? chosenSourceShape
        : (crop?.shapeKind ?? null)}
      onchange={setCropShape}
      ariaLabel={t("post_crop_shape")}
    />
    <ValueSlider
      label={t("post_crop_straighten")}
      value={parts.straighten}
      min={-STRAIGHTEN_LIMIT}
      max={STRAIGHTEN_LIMIT}
      step={0.5}
      origin={0}
      format={fineDegrees}
      disabled={locked || frozen}
      onchange={(value) => straighten(value, parts.quarter)}
    />
    <ValueSlider
      label={t("post_editor_zoom")}
      value={framing.zoom * 100}
      min={(item.sourceGeometry || item.keyframes?.sourceGeometry?.length
        ? Math.max(1, crop?.zoomFloor ?? POST_MIN_ZOOM)
        : (crop?.zoomFloor ?? POST_MIN_ZOOM)) * 100}
      max={POST_MAX_ZOOM * 100}
      step={1}
      origin={100}
      format={percent}
      disabled={locked || frozen}
      onchange={(value) => setCropZoom(value / 100)}
    />
    <div class="crop-row">
      <PanelButton
        onclick={() => rotateLeft(parts.quarter, parts.straighten)}
        disabled={locked || frozen}
        ariaLabel={t("post_crop_rotate_left")}
      >
        <Icon icon={faRotateLeft} />
        {t("post_crop_rotate")}
      </PanelButton>
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        icon={faLeftRight}
        label={t("post_editor_flip")}
        active={item.flip}
        disabled={locked}
        onclick={toggleMirror}
      />
      {#if crop}
        <PanelButton
          onclick={resetCrop}
          disabled={locked ||
            frozen ||
            (!crop.canReset &&
              !(item.sourceGeometry || item.keyframes?.sourceGeometry?.length))}
        >
          <Icon icon={faArrowsRotate} />
          {t("post_editor_reset_crop")}
        </PanelButton>
      {/if}
    </div>
    <p class="hint">{t("post_crop_hint")}</p>
    {#if item.sourceGeometry || item.keyframes?.sourceGeometry?.length}
      {@const geometry = channelValueAt(item, "sourceGeometry", seconds)}
      {#if !cropSourceView}
        <PanelButton onclick={() => onCropSourceControl?.()}>
          Edit source crop
        </PanelButton>
      {/if}
      <PostSourceGeometryTool
        {geometry}
        {output}
        {locked}
        {frozen}
        mode="crop"
        onChange={(next, field) => {
          onCropSourceControl?.();
          chosenSourceShape = "free";
          change(`source-geometry:${field}`, { sourceGeometry: next });
        }}
      />
    {/if}
  {:else if tool === "crop" && item.kind === "image" && (item.sourceGeometry || item.keyframes?.sourceGeometry?.length)}
    {@const geometry = channelValueAt(item, "sourceGeometry", seconds)}
    <PostSourceGeometryTool
      {geometry}
      {output}
      {locked}
      {frozen}
      mode="crop"
      onChange={(next, field) =>
        change(`source-geometry:${field}`, { sourceGeometry: next })}
    />
  {:else if tool === "speed" && item.kind === "video"}
    <ValueSlider
      label={t("post_editor_speed")}
      value={Math.log2(item.speed)}
      min={Math.log2(POST_MIN_SPEED)}
      max={Math.log2(POST_MAX_SPEED)}
      step={SPEED_STEP}
      origin={0}
      format={formatSpeed}
      fromTyped={Math.log2}
      disabled={locked}
      onchange={(stop) => setSpeed(speedFromStop(stop))}
    />
  {:else if tool === "volume" && item.kind === "video"}
    <ValueSlider
      label={t("post_editor_volume")}
      value={item.volume * 100}
      min={0}
      max={POST_MAX_VOLUME * 100}
      step={1}
      format={percent}
      disabled={locked}
      onchange={(value) => change("volume", { volume: value / 100 })}
    />
    {#if editor.project.audio === "silent"}
      <ToolStatus
        text={t("post_editor_post_silent")}
        icon={faVolumeHigh}
        action={t("post_editor_use_video_sound")}
        run={() => editor.setAudio("takes")}
      />
    {/if}
  {:else if tool === "position"}
    {#if onlyPlacement}
      {@const only = onlyPlacement}
      <div class="actions">
        <PanelButton
          onclick={() => placeAt(only.box)}
          disabled={locked || frozen || placementNow === only.id}
        >
          <Icon icon={faExpand} />
          {only.label}
        </PanelButton>
      </div>
    {:else}
      <SegmentedControl
        color="accent"
        options={placements.map((option) => ({
          value: option.id,
          label: option.label,
          disabled: locked || frozen,
        }))}
        value={placementNow}
        onchange={(id) => {
          const option = placements.find((entry) => entry.id === id);
          if (option) placeAt(option.box);
        }}
        ariaLabel={t("post_editor_placement")}
      />
    {/if}
    <div class="rect" role="group" aria-label={t("post_editor_box_where")}>
      {#each BOX_FIELDS as entry (entry.field)}
        <span class="rect-name" aria-hidden="true">{entry.label}</span>
        <TypeableValue
          label={entry.label}
          text={`${Math.round(shownPixels[entry.field])} px`}
          disabled={locked || frozen}
          oncommit={(pixels) => typeRect(entry.field, pixels)}
        />
      {/each}
      <span class="rect-name" aria-hidden="true"
        >{t("post_editor_box_turn")}</span
      >
      <TypeableValue
        label={t("post_editor_box_turn")}
        text={fineDegrees(shownTurn)}
        signed
        disabled={locked || frozen}
        oncommit={typeTurn}
      />
    </div>
  {:else if tool === "border" && item.kind === "video"}
    {@const edge = edgeOf(item)}
    <ValueSlider
      label={t("post_editor_corners")}
      value={(edge.corners / POST_MAX_EDGE_CORNERS) * 100}
      min={0}
      max={100}
      step={1}
      format={percent}
      disabled={locked}
      onchange={(value) =>
        change("edgeCorners", {
          edge: { corners: (value / 100) * POST_MAX_EDGE_CORNERS },
        })}
    />
    <SegmentedControl
      color="accent"
      columns={4}
      options={BORDER_PICKS}
      value={edge.border > 0 ? edge.borderColor : "none"}
      onchange={pickBorder}
      optionContent={borderSwatch}
      ariaLabel={t("post_editor_tool_border")}
    />
    <ValueSlider
      label={t("post_editor_border_width")}
      value={edge.border * frameShort}
      min={0}
      max={Math.floor(POST_MAX_EDGE_BORDER * frameShort)}
      step={1}
      format={pixels}
      disabled={locked}
      onchange={(value) =>
        change("edgeBorder", { edge: { border: value / frameShort } })}
    />
    <ValueSlider
      label={t("post_editor_shadow")}
      value={edge.shadow * 100}
      min={0}
      max={100}
      step={1}
      format={percent}
      disabled={locked}
      onchange={(value) =>
        change("edgeShadow", { edge: { shadow: value / 100 } })}
    />
  {:else if tool === "fade"}
    {#if item.transitionOut}
      <div class="readout">
        <span>{t("post_editor_crossfade")}</span>
        <TypeableValue
          label={t("post_editor_crossfade_duration")}
          text={`${item.transitionOut.duration.toFixed(2)} s`}
          disabled={locked}
          oncommit={(value) =>
            change("transitionOut", {
              transitionOut: {
                ...item.transitionOut!,
                duration: Math.max(
                  FRAME_SECONDS,
                  Math.min(item.duration, value)
                ),
              },
            })}
        />
      </div>
      <PanelButton
        disabled={locked}
        onclick={() => patchItem({ transitionOut: null })}
      >
        {t("post_timeline_remove_crossfade")}
      </PanelButton>
    {/if}
    <ValueSlider
      label={t("post_editor_opacity")}
      value={opacityAt(item, seconds) * 100}
      min={0}
      max={100}
      step={1}
      format={percent}
      disabled={locked || frozen}
      onchange={(value) => change("opacity", { opacity: value / 100 })}
    />
    <ValueSlider
      label={t("post_editor_fade_in")}
      value={item.fadeIn}
      min={0}
      max={Math.max(0, item.duration / 2)}
      step={0.05}
      format={fadeSeconds}
      disabled={locked}
      onchange={(value) => change("fadeIn", { fadeIn: value })}
    />
    <ValueSlider
      label={t("post_editor_fade_out")}
      value={item.fadeOut}
      min={0}
      max={Math.max(0, item.duration / 2)}
      step={0.05}
      format={fadeSeconds}
      disabled={locked}
      onchange={(value) => change("fadeOut", { fadeOut: value })}
    />
  {:else if tool === "effects" && item.kind === "video"}
    <PostVideoColorTool
      grade={item.colorGrade}
      {locked}
      {grading}
      error={gradeError}
      onAuto={() => void autoAdjustColor()}
      onReset={() => patchItem({ colorGrade: null })}
      onChange={setVideoColor}
    />
    {#if item.autoAdjust}
      <details class="import-adjustment">
        <summary>
          Original InShot adjustment: {Math.round(
            item.autoAdjust.strength * 100
          )}% (reference only)
        </summary>
        <p>
          InShot AutoAdjust was {item.autoAdjust.enabled ? "on" : "off"}. Post
          Studio cannot reproduce its original color model, so this value does
          not change the video here.
        </p>
      </details>
    {/if}
  {:else if tool === "text" && item.kind === "text"}
    <textarea
      class="field text-field"
      value={item.text}
      maxlength={POST_MAX_TEXT_LENGTH}
      rows="3"
      aria-label={t("post_editor_text_words")}
      disabled={locked}
      oninput={(event) => change("text", { text: event.currentTarget.value })}
    ></textarea>
    {#if item.style}
      <PostNativeTextTool
        style={item.style}
        animation={item.animation}
        {locked}
        onStyle={(style, field) => change(`text-style:${field}`, { style })}
        onAnimation={(animation, field) =>
          change(`text-animation:${field}`, { animation })}
      />
    {:else}
      <SegmentedControl
        color="accent"
        options={TEXT_SIZES}
        value={item.size}
        onchange={(size) => patchItem({ size })}
        ariaLabel={t("post_editor_text_size")}
      />
    {/if}
  {:else if tool === "rename"}
    <input
      class="field"
      value={item.label ?? ""}
      placeholder={itemDisplayLabel(
        t,
        { ...item, label: undefined },
        editor.project,
        plugin
      )}
      maxlength={POST_MAX_LABEL_LENGTH}
      aria-label={t("post_editor_item_name")}
      disabled={locked}
      onchange={(event) => rename(event.currentTarget.value)}
    />
  {/if}
  {#if plugin}
    {@const KindPanel = plugin.itemKinds.find((d) => d.kind === item.kind)?.ui
      ?.toolPanel}
    {#if KindPanel}
      <KindPanel {editor} {item} {tool} {locked} {appearanceFill} />
    {/if}
    {#if plugin.ui?.toolPanel}
      {@const ItemPanel = plugin.ui.toolPanel}
      <ItemPanel {editor} {item} {tool} {locked} {appearanceFill} />
    {/if}
  {/if}
</div>

<style>
  .native-limit {
    margin: 0;
    color: var(--text-secondary, #a3a3a3);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .import-adjustment {
    color: var(--text-secondary, #a3a3a3);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .import-adjustment summary {
    cursor: pointer;
    padding-block: 0.375rem;
  }

  .import-adjustment summary:focus-visible {
    outline: 2px solid var(--ve-theme-accent, currentColor);
    outline-offset: 2px;
  }

  .import-adjustment p {
    margin: 0.5rem 0 0;
  }

  .item-tool {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
  }

  .item-tool.animation-appearance {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    min-width: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* X and Y, then width and height: each name beside a box that takes a
     typed number of pixels. */
  .rect {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.625rem;
  }

  .rect-name {
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }

  .swatch {
    display: block;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid rgb(255 255 255 / 0.35);
    border-radius: 50%;
  }

  /* Rotate, Mirror and Reset share a line when the panel has room. */
  .crop-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .hint {
    margin: 0;
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--ve-min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--ve-theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--ve-theme-text, #fff);
    background: var(--ve-theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .text-field {
    min-height: 5.5rem;
    padding: 0.5rem 0.625rem;
    line-height: 1.4;
    resize: vertical;
  }

  .field:focus-visible {
    outline: 2px solid var(--ve-theme-accent, currentColor);
    outline-offset: 1px;
  }

  .field:disabled {
    opacity: 0.5;
  }
</style>
