<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    LAYOUT_PRESETS,
    TUNNEL_LAYER_COLORS,
    type AppliedTransform,
    type PropColors,
    type TransformType,
    type TunnelLayerConfig,
  } from "#lib/shared/animation-engine/domain/compose-types.js";
  import {
    ARRANGEMENT_MAX_GRID_SIZE,
    type ArrangementCell,
  } from "#lib/shared/media-composition/domain/arrangement.js";
  import {
    ARRANGEMENT_MAX_BPM,
    ARRANGEMENT_MAX_CELL_SPEED,
    ARRANGEMENT_MAX_LAYERS,
    ARRANGEMENT_MIN_BPM,
    ARRANGEMENT_MIN_CELL_SPEED,
    visibleCells,
    type ArrangementCellOffset,
  } from "#lib/shared/media-composition/domain/arrangement-edits.js";
  import { calculateArrangementCellBeats } from "#lib/shared/media-composition/domain/arrangement-timing.js";
  import type { PostArrangementItem } from "#lib/shared/post-studio-plugin/index.js";
  import {
    POST_MAX_SPEED,
    POST_MIN_SPEED,
    hasGrid,
  } from "@austencloud/video-editor/core";
  import {
    setArrangementBpm,
    setArrangementCellAppearance,
    setArrangementCellLayers,
    setArrangementCellMotionVisibility,
    setArrangementCellOffset,
    setArrangementCellTipEffects,
    setArrangementCellTipEfforts,
    setArrangementGrid,
    setArrangementSkipStartPlacement,
    setArrangementSpeed,
    staggerArrangement,
  } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import type {
    PostEdit,
    PostEditorState,
  } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import {
    arrangementCellLook,
    arrangementLookOverride,
  } from "#lib/shared/media-composition/domain/arrangement-look.js";
  import type { PostAnimationAppearance } from "#lib/shared/media-composition/domain/post-animation-appearance.js";
  import type {
    EffectType,
    TipEffectMap,
    TipEffortMap,
  } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
  import { getTipLabel } from "#lib/shared/animation-engine/domain/tip-label.js";
  import { EFFECT_LABELS } from "#lib/shared/effects/domain/effect-meta.js";
  import { effectUiLabel } from "#lib/shared/animation-engine/components/effects-panel/effect-ui-label.js";
  import EffectSelector from "#lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte";
  import { EFFORTS, type EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { untrack } from "svelte";
  import { applyTransform } from "#lib/features/compose/tabs/arrange/services/arrange-layer-transformer.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TypeableValue from "#lib/shared/ui/components/TypeableValue.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import { formatPostSpeed } from "@austencloud/video-editor/ui";
  import { arrangementLayerName } from "./arrangement-labels";
  import PostAnimationAppearanceTool from "./PostAnimationAppearanceTool.svelte";

  /**
   * The panels of a selected arrangement. Grid and Speed are the item's own:
   * its shape, whether the start placement plays, how its cells are staggered,
   * and how fast the whole clip plays. Look and Effects edit the grid's default
   * look, or the cell's own over it when a cell is in hand; Effort is the
   * cell's. Sequence, Layers and Offset belong to the cell: which sequences it
   * holds, how each layer looks and is turned, and when the cell starts and how
   * fast it runs. Every change is an ordinary edit, so undo takes it back.
   */
  interface Props {
    editor: PostEditorState;
    item: PostArrangementItem;
    tool:
      | "grid"
      | "sequence"
      | "layers"
      | "offset"
      | "look"
      | "effects"
      | "effort"
      | "speed";
    /** The cell in hand; the Grid panel has none. */
    cell: ArrangementCell | null;
    locked: boolean;
    /** The post's own sequence, offered to a cell when its length fits. */
    sequence: SequenceData | null;
    /** Fit the editor's bounded side column. */
    fill?: boolean;
  }

  let {
    editor,
    item,
    tool,
    cell,
    locked,
    sequence,
    fill = false,
  }: Props = $props();

  const snapshot = $derived(item.snapshot);
  /** Visible cells that hold a sequence, in reading order. */
  const filled = $derived(
    visibleCells(snapshot).filter((c) => c.layers.length > 0)
  );
  /**
   * Every sequence in a grid runs the same number of beats, so the first
   * filled cell sets the length the rest must match. Null while the grid is
   * empty: anything fits.
   */
  const requiredBeats = $derived.by((): number | null => {
    const first = filled[0]?.layers[0];
    return first ? (first.sequence.steps?.length ?? null) : null;
  });
  /** One cell's cycle in beats, which Stagger halves. */
  const cycleBeats = $derived(
    filled[0]
      ? calculateArrangementCellBeats(filled[0], snapshot.skipStartPlacement)
      : 0
  );
  const postSequenceFits = $derived(
    sequence !== null &&
      (requiredBeats === null ||
        (sequence.steps?.length ?? 0) === requiredBeats)
  );
  const layers = $derived(cell?.layers ?? []);
  const full = $derived(layers.length >= ARRANGEMENT_MAX_LAYERS);
  /** The music grid's tempo, offered as a copy; null without a grid. */
  const musicBpm = $derived.by((): number | null => {
    const music = editor.project.music;
    return music && hasGrid(music) ? music.grid.bpm : null;
  });

  const COLOR_NAMES = ["Blue / Red", "Purple / Orange", "Green / Pink", "Cyan / Yellow"];
  const TRANSFORM_NAMES: Partial<Record<TransformType, string>> = {
    mirror: "Mirror",
    flip: "Flip",
    rotate45L: "Rotate ⟲",
    rotate45R: "Rotate ⟳",
    swapHands: "Swap",
  };
  const SPEED_STEP = 0.05;
  const SPEED_MARKS = [-1, 0, 1];

  // ---- Grid ----------------------------------------------------------------

  function setGrid(rows: number, cols: number): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      setArrangementGrid(project, item.id, rows, cols, ctx)
    );
  }

  function setSkip(skip: boolean): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      setArrangementSkipStartPlacement(project, item.id, skip, ctx)
    );
  }

  function setBpm(bpm: number): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      setArrangementBpm(project, item.id, bpm, ctx)
    );
  }

  function formatBpm(bpm: number): string {
    return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
  }

  function stagger(beatsPerCell: number): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      staggerArrangement(project, item.id, beatsPerCell, ctx)
    );
  }

  function presetLabel(rows: number, cols: number): string {
    return `${rows} × ${cols}`;
  }

  // ---- Layers --------------------------------------------------------------

  function setLayers(target: ArrangementCell, next: TunnelLayerConfig[]): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      setArrangementCellLayers(project, item.id, target.id, next, ctx)
    );
  }

  function newLayer(
    chosen: SequenceData,
    index: number,
    keep?: TunnelLayerConfig
  ): TunnelLayerConfig {
    return {
      sequence: chosen,
      beatOffset: keep?.beatOffset ?? 0,
      propColors:
        keep?.propColors ?? TUNNEL_LAYER_COLORS[index % TUNNEL_LAYER_COLORS.length]!,
      transformStack: [],
    };
  }

  function addLayer(chosen: SequenceData): void {
    if (!cell || full) return;
    setLayers(cell, [...layers, newLayer(chosen, layers.length)]);
  }

  function replaceLayer(index: number, chosen: SequenceData): void {
    if (!cell || !layers[index]) return;
    const next = [...layers];
    next[index] = newLayer(chosen, index, layers[index]);
    setLayers(cell, next);
  }

  function removeLayer(index: number): void {
    if (!cell) return;
    setLayers(
      cell,
      layers.filter((_, i) => i !== index)
    );
  }

  function moveLayer(index: number, by: -1 | 1): void {
    if (!cell) return;
    const to = index + by;
    if (to < 0 || to >= layers.length) return;
    const next = [...layers];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    setLayers(cell, next);
  }

  function patchLayer(index: number, patch: Partial<TunnelLayerConfig>): void {
    if (!cell || !layers[index]) return;
    const next = [...layers];
    next[index] = { ...layers[index]!, ...patch };
    setLayers(cell, next);
  }

  function sameColors(a: PropColors, b: PropColors): boolean {
    return a.left === b.left && a.right === b.right;
  }

  function layerName(layer: TunnelLayerConfig): string {
    return arrangementLayerName(layer);
  }

  function beatsOf(chosen: SequenceData): string {
    const count = chosen.steps?.length ?? 0;
    return `${count} ${count === 1 ? "beat" : "beats"}`;
  }

  /** Which layer a transform is being worked out for; its buttons wait. */
  let transforming = $state<number | null>(null);

  /**
   * Turns one layer's sequence and records the turn, so the layer can say
   * what was done to it. The transform is worked out off the layer as it is
   * now; if the cell changed meanwhile, the result is dropped rather than
   * put on a layer it was not made from.
   */
  async function transformLayer(
    index: number,
    type: TransformType
  ): Promise<void> {
    const target = cell;
    const layer = layers[index];
    if (!target || !layer || locked || transforming !== null) return;
    transforming = index;
    try {
      const result = await applyTransform(layer.sequence, type);
      if (!result.success || !result.transformed) return;
      const current = editor.selectedCell;
      if (!current || current.id !== target.id) return;
      const at = current.layers.indexOf(layer);
      if (at === -1) return;
      const applied: AppliedTransform = {
        type,
        hand: "both",
        timestamp: Date.now(),
      };
      const next = [...current.layers];
      next[at] = {
        ...layer,
        sequence: result.transformed,
        transformStack: [...(layer.transformStack ?? []), applied],
      };
      setLayers(current, next);
    } finally {
      transforming = null;
    }
  }

  function appliedNames(layer: TunnelLayerConfig): string {
    const names = (layer.transformStack ?? [])
      .map((t) => TRANSFORM_NAMES[t.type] ?? t.type)
      .join(", ");
    return names ? `Applied: ${names}.` : "Nothing applied.";
  }

  // ---- Sequence picker ------------------------------------------------------

  /** What the library's pick is for: a new layer, or one being replaced. */
  let pickerTarget = $state<{ replace: number | null } | null>(null);
  let pickerOpen = $state(false);

  function openPicker(replace: number | null): void {
    pickerTarget = { replace };
    pickerOpen = true;
  }

  function closePicker(): void {
    pickerOpen = false;
    pickerTarget = null;
  }

  function picked(chosen: SequenceData): void {
    const target = pickerTarget;
    closePicker();
    if (!target) return;
    if (target.replace === null) addLayer(chosen);
    else replaceLayer(target.replace, chosen);
  }

  // ---- Offset --------------------------------------------------------------

  function setOffset(offset: ArrangementCellOffset): void {
    if (!cell || locked) return;
    const id = cell.id;
    editor.edit((project, ctx) =>
      setArrangementCellOffset(project, item.id, id, offset, ctx)
    );
  }

  function setSpeedStop(stop: number): void {
    if (!cell || locked) return;
    const id = cell.id;
    const speedMultiplier = Number((2 ** stop).toFixed(3));
    editor.editSetting(`cell-speed:${id}`, (project, ctx) =>
      setArrangementCellOffset(project, item.id, id, { speedMultiplier }, ctx)
    );
  }

  function speedLabel(stop: number): string {
    return formatPostSpeed(2 ** stop);
  }

  // ---- Look, effects and effort --------------------------------------------

  type LookTool = "look" | "effects" | "effort";
  const LOOK_SECTIONS: Record<
    LookTool,
    readonly ("props" | "effects" | "efforts" | "display")[]
  > = {
    look: ["props", "display"],
    effects: ["effects"],
    effort: ["efforts"],
  };
  /** What the panel shows: the cell's look over the grid's, or the grid's own. */
  const look = $derived(
    cell
      ? arrangementCellLook(snapshot.appearance, cell)
      : (snapshot.appearance ?? null)
  );
  const lookKey = $derived(`${item.id}:${cell?.id ?? "grid"}`);
  const scopeName = $derived(
    cell ? `Cell ${cell.row * snapshot.gridCols + cell.col + 1}` : "Grid"
  );
  const leftShown = $derived(cell?.leftMotionVisible ?? true);
  const rightShown = $derived(cell?.rightMotionVisible ?? true);

  /** A cell keeps only the flags a change moved; the grid keeps the whole look. */
  function saveLook(
    next: PostAnimationAppearance,
    settingKey: string | undefined,
    changed: (keyof PostAnimationAppearance)[]
  ): void {
    if (locked) return;
    const target = cell;
    if (target && changed.length === 0) return;
    const cellId = target?.id ?? null;
    const appearance = target
      ? arrangementLookOverride(target.appearance, next, changed)
      : next;
    const change: PostEdit = (project, ctx) =>
      setArrangementCellAppearance(project, item.id, cellId, appearance, ctx);
    if (settingKey) editor.editSetting(`${lookKey}:look:${settingKey}`, change);
    else editor.edit(change);
  }

  function showHand(hand: "left" | "right", shown: boolean): void {
    if (!cell || locked) return;
    const id = cell.id;
    const visible = hand === "left" ? { left: shown } : { right: shown };
    editor.edit((project, ctx) =>
      setArrangementCellMotionVisibility(project, item.id, id, visible, ctx)
    );
  }

  type Scope = "cell" | "left" | "right" | "tips";
  const SCOPES: { id: Scope; label: string }[] = [
    { id: "cell", label: "Cell" },
    { id: "left", label: "Left" },
    { id: "right", label: "Right" },
    { id: "tips", label: "Tips" },
  ];
  let scope = $state<Scope>("cell");
  let tipKey = $state("0-0");
  $effect(() => {
    void cell?.id;
    untrack(() => {
      scope = "cell";
      tipKey = "0-0";
    });
  });
  /** The map key the scope edits: a hand, a tip, or none for the cell itself. */
  const scopeKey = $derived(
    scope === "left"
      ? "0"
      : scope === "right"
        ? "1"
        : scope === "tips"
          ? tipKey
          : null
  );
  const scopePropType = $derived(look?.propType ?? PropType.STAFF);
  const tipTargets = $derived.by(() => {
    const count = getTipPoints(scopePropType).points.length;
    const targets: { key: string; label: string }[] = [];
    for (const hand of [0, 1] as const)
      for (let tip = 0; tip < count; tip++)
        targets.push({
          key: `${hand}-${tip}`,
          label: `${hand === 0 ? "Left" : "Right"} ${getTipLabel(scopePropType, tip)}`,
        });
    return targets;
  });
  const scopeEffect = $derived(
    scopeKey ? (cell?.tipEffectMap?.[scopeKey]?.effect ?? null) : null
  );
  const scopeEffort = $derived(
    scopeKey ? (cell?.tipEffortMap?.[scopeKey]?.effort ?? null) : null
  );
  const scopeEffectHint = $derived(
    scopeEffect === null
      ? "Follows the cell's effect."
      : scopeEffect === "none"
        ? "No effect here."
        : `${effectUiLabel(EFFECT_LABELS[scopeEffect] ?? scopeEffect)} here. Pick it again to turn it off.`
  );
  const scopeEffortHint = $derived(
    scopeEffort === null
      ? "Follows the cell's effort."
      : `${EFFORTS.find((effort) => effort.id === scopeEffort)?.label ?? scopeEffort} here.`
  );

  /** Sets one scope's effect, turns it off (the active pick again) or clears it to follow the cell. */
  function pickScopeEffect(effect: string | null): void {
    if (!cell || locked || !scopeKey) return;
    const id = cell.id;
    const key = scopeKey;
    const next: TipEffectMap = { ...cell.tipEffectMap };
    if (effect === null) delete next[key];
    else
      next[key] = {
        effect: (scopeEffect === effect ? "none" : effect) as EffectType,
      };
    editor.edit((project, ctx) =>
      setArrangementCellTipEffects(project, item.id, id, next, ctx)
    );
  }

  function pickScopeEffort(effort: EffortId | null): void {
    if (!cell || locked || !scopeKey) return;
    const id = cell.id;
    const key = scopeKey;
    const next: TipEffortMap = { ...cell.tipEffortMap };
    if (effort === null) delete next[key];
    else next[key] = { effort };
    editor.edit((project, ctx) =>
      setArrangementCellTipEfforts(project, item.id, id, next, ctx)
    );
  }

  // ---- Speed ---------------------------------------------------------------

  function setItemSpeedStop(stop: number): void {
    if (locked) return;
    const speed = Number((2 ** stop).toFixed(3));
    editor.editSetting(`arrangement-speed:${item.id}`, (project, ctx) =>
      setArrangementSpeed(project, item.id, speed, ctx)
    );
  }
</script>

{#snippet pair(colors: PropColors)}
  <span class="pair" aria-hidden="true">
    <span class="dot" style:background={colors.left}></span>
    <span class="dot" style:background={colors.right}></span>
  </span>
{/snippet}

<div class="arrangement-tool" data-arrangement-tool={tool}>
  {#if tool === "grid"}
    <div class="group" role="group" aria-label="Grid shape">
      <span class="group-name">Shape</span>
      <div class="chips">
        {#each Object.entries(LAYOUT_PRESETS) as [key, preset] (key)}
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label={presetLabel(preset.rows, preset.cols)}
            ariaLabel={`${preset.rows} rows by ${preset.cols} columns`}
            active={snapshot.gridRows === preset.rows &&
              snapshot.gridCols === preset.cols}
            disabled={locked}
            onclick={() => setGrid(preset.rows, preset.cols)}
          />
        {/each}
      </div>
    </div>
    <div class="stepper">
      <span class="stepper-name">Rows</span>
      <PanelButton
        ariaLabel="One row fewer"
        disabled={locked || snapshot.gridRows <= 1}
        onclick={() => setGrid(snapshot.gridRows - 1, snapshot.gridCols)}
      >
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </PanelButton>
      <TypeableValue
        label="Rows"
        text={String(snapshot.gridRows)}
        sizer={String(ARRANGEMENT_MAX_GRID_SIZE)}
        disabled={locked}
        oncommit={(value) => setGrid(Math.round(value), snapshot.gridCols)}
      />
      <PanelButton
        ariaLabel="One row more"
        disabled={locked || snapshot.gridRows >= ARRANGEMENT_MAX_GRID_SIZE}
        onclick={() => setGrid(snapshot.gridRows + 1, snapshot.gridCols)}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </PanelButton>
    </div>
    <div class="stepper">
      <span class="stepper-name">Columns</span>
      <PanelButton
        ariaLabel="One column fewer"
        disabled={locked || snapshot.gridCols <= 1}
        onclick={() => setGrid(snapshot.gridRows, snapshot.gridCols - 1)}
      >
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </PanelButton>
      <TypeableValue
        label="Columns"
        text={String(snapshot.gridCols)}
        sizer={String(ARRANGEMENT_MAX_GRID_SIZE)}
        disabled={locked}
        oncommit={(value) => setGrid(snapshot.gridRows, Math.round(value))}
      />
      <PanelButton
        ariaLabel="One column more"
        disabled={locked || snapshot.gridCols >= ARRANGEMENT_MAX_GRID_SIZE}
        onclick={() => setGrid(snapshot.gridRows, snapshot.gridCols + 1)}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </PanelButton>
    </div>
    <div class="group">
      <span class="group-name" id="start-placement-name">Start placement</span>
      <SegmentedControl
        color="accent"
        options={[
          { value: "shown", label: "Shown", disabled: locked },
          { value: "skipped", label: "Skipped", disabled: locked },
        ]}
        value={snapshot.skipStartPlacement ? "skipped" : "shown"}
        onchange={(value) => setSkip(value === "skipped")}
        ariaLabel="Start placement"
      />
    </div>
    <div class="stepper">
      <span class="stepper-name">Tempo</span>
      <PanelButton
        ariaLabel="One BPM slower"
        disabled={locked || snapshot.bpm <= ARRANGEMENT_MIN_BPM}
        onclick={() => setBpm(Math.ceil(snapshot.bpm) - 1)}
      >
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </PanelButton>
      <TypeableValue
        label="Tempo"
        text={formatBpm(snapshot.bpm)}
        unit="BPM"
        sizer={String(ARRANGEMENT_MAX_BPM)}
        disabled={locked}
        oncommit={(value) => setBpm(value)}
      />
      <PanelButton
        ariaLabel="One BPM faster"
        disabled={locked || snapshot.bpm >= ARRANGEMENT_MAX_BPM}
        onclick={() => setBpm(Math.floor(snapshot.bpm) + 1)}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </PanelButton>
    </div>
    {#if musicBpm !== null}
      {@const bpm = musicBpm}
      <div class="actions">
        <PanelButton disabled={locked || bpm === snapshot.bpm} onclick={() => setBpm(bpm)}>
          Use music tempo ({formatBpm(bpm)} BPM)
        </PanelButton>
      </div>
    {/if}
    <p class="hint">
      A new tempo keeps the clip on the same beats, so it grows or shrinks on
      the timeline.
    </p>
    <div class="group" role="group" aria-label="Stagger">
      <span class="group-name">Stagger</span>
      <div class="actions">
        <PanelButton disabled={locked || filled.length < 2} onclick={() => stagger(0)}>
          In sync
        </PanelButton>
        <PanelButton disabled={locked || filled.length < 2} onclick={() => stagger(1)}>
          One beat apart
        </PanelButton>
        <PanelButton
          disabled={locked || filled.length < 2 || cycleBeats < 2}
          onclick={() => stagger(Math.floor(cycleBeats / 2))}
        >
          Half apart
        </PanelButton>
      </div>
      <p class="hint">
        {filled.length < 2
          ? "Stagger needs two or more cells with sequences."
          : "Offsets the cells in reading order: the first starts at once, each next one later."}
      </p>
    </div>
    <p class="hint">
      Tap a cell in the preview for its sequence, layers, and offset. Drag a
      cell onto another to swap them; its grips change how many cells it
      covers.
    </p>
  {:else if !cell}
    <p class="hint">Tap a cell in the preview first.</p>
  {:else if tool === "sequence"}
    {#if layers.length === 0}
      <p class="hint">This cell has no sequence yet.</p>
    {:else}
      <ul class="layer-list" aria-label="Sequences in this cell">
        {#each layers as layer, index (index)}
          <li class="layer-row">
            {@render pair(layer.propColors)}
            <span class="layer-name">{layerName(layer)}</span>
            <span class="layer-meta">{beatsOf(layer.sequence)}</span>
            <PanelButton
              disabled={locked}
              ariaLabel={`Replace ${layerName(layer)}`}
              onclick={() => openPicker(index)}
            >
              Replace
            </PanelButton>
            <PanelButton
              disabled={locked}
              ariaLabel={`Remove ${layerName(layer)}`}
              title="Remove"
              onclick={() => removeLayer(index)}
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </PanelButton>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      {#if sequence}
        <PanelButton
          variant="primary"
          disabled={locked || full || !postSequenceFits}
          onclick={() => addLayer(sequence)}
        >
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          Add this post's sequence
        </PanelButton>
      {/if}
      <PanelButton disabled={locked || full} onclick={() => openPicker(null)}>
        <i class="fa-solid fa-book-open" aria-hidden="true"></i>
        Choose from library…
      </PanelButton>
    </div>
    <p class="hint">
      {#if full}
        A cell holds up to {ARRANGEMENT_MAX_LAYERS} sequences.
      {:else if sequence && !postSequenceFits && requiredBeats !== null}
        Every sequence in the grid runs {requiredBeats}
        {requiredBeats === 1 ? "beat" : "beats"}; this post's runs {sequence
          .steps?.length ?? 0}.
      {:else if requiredBeats !== null}
        Sequences in this grid run {requiredBeats}
        {requiredBeats === 1 ? "beat" : "beats"}.
      {:else}
        The first sequence sets the length the others match.
      {/if}
    </p>
  {:else if tool === "layers"}
    {#if layers.length === 0}
      <p class="hint">Add a sequence under Sequence first.</p>
    {/if}
    {#each layers as layer, index (index)}
      <section class="layer" aria-label={`Layer ${index + 1}: ${layerName(layer)}`}>
        <header class="layer-head">
          {@render pair(layer.propColors)}
          <span class="layer-name">{layerName(layer)}</span>
          <PanelButton
            disabled={locked || index === 0}
            ariaLabel={`Move ${layerName(layer)} up`}
            title="Move up"
            onclick={() => moveLayer(index, -1)}
          >
            <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </PanelButton>
          <PanelButton
            disabled={locked || index === layers.length - 1}
            ariaLabel={`Move ${layerName(layer)} down`}
            title="Move down"
            onclick={() => moveLayer(index, 1)}
          >
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          </PanelButton>
          <PanelButton
            disabled={locked}
            ariaLabel={`Remove ${layerName(layer)}`}
            title="Remove"
            onclick={() => removeLayer(index)}
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </PanelButton>
        </header>
        <div class="chips" role="group" aria-label={`Colors of ${layerName(layer)}`}>
          {#each TUNNEL_LAYER_COLORS as colors, colorIndex (colorIndex)}
            {#snippet swatch()}
              {@render pair(colors)}
            {/snippet}
            <FilterChipBase
              mode="toggle"
              label={COLOR_NAMES[colorIndex] ?? ""}
              iconSnippet={swatch}
              active={sameColors(layer.propColors, colors)}
              disabled={locked}
              onclick={() => patchLayer(index, { propColors: colors })}
            />
          {/each}
        </div>
        <SequenceTransformActions
          hasSequence={!locked}
          hasSelection={false}
          isTransforming={transforming === index}
          showEditInConstructor={false}
          toolbar
          rotationDegrees={45}
          actionSubject={layerName(layer)}
          onMirror={() => void transformLayer(index, "mirror")}
          onFlip={() => void transformLayer(index, "flip")}
          onRotateCCW={() => void transformLayer(index, "rotate45L")}
          onRotateCW={() => void transformLayer(index, "rotate45R")}
          onSwap={() => void transformLayer(index, "swapHands")}
        />
        <p class="hint" aria-live="polite">{appliedNames(layer)}</p>
        <div class="readout">
          <span class="readout-name">Layer offset</span>
          <TypeableValue
            label={`Offset of ${layerName(layer)}`}
            text={String(layer.beatOffset)}
            unit="beats"
            sizer="88"
            disabled={locked}
            oncommit={(value) =>
              patchLayer(index, { beatOffset: Math.max(0, Math.round(value)) })}
          />
        </div>
      </section>
    {/each}
  {:else if tool === "offset"}
    <div class="stepper">
      <span class="stepper-name">Beat offset</span>
      <PanelButton
        ariaLabel="One beat earlier"
        disabled={locked || cell.beatOffset <= 0}
        onclick={() => setOffset({ beatOffset: cell.beatOffset - 1 })}
      >
        <i class="fa-solid fa-minus" aria-hidden="true"></i>
      </PanelButton>
      <TypeableValue
        label="Beat offset"
        text={String(cell.beatOffset)}
        unit="beats"
        sizer="88"
        disabled={locked}
        oncommit={(value) => setOffset({ beatOffset: Math.round(value) })}
      />
      <PanelButton
        ariaLabel="One beat later"
        disabled={locked}
        onclick={() => setOffset({ beatOffset: cell.beatOffset + 1 })}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </PanelButton>
    </div>
    <p class="hint">
      {cell.beatOffset === 0
        ? "This cell starts with the grid."
        : `This cell starts ${cell.beatOffset} ${cell.beatOffset === 1 ? "beat" : "beats"} after the grid.`}
    </p>
    <ValueSlider
      label="Speed"
      value={Math.log2(cell.speedMultiplier ?? 1)}
      min={Math.log2(ARRANGEMENT_MIN_CELL_SPEED)}
      max={Math.log2(ARRANGEMENT_MAX_CELL_SPEED)}
      step={SPEED_STEP}
      origin={0}
      marks={SPEED_MARKS}
      onmark={setSpeedStop}
      markLabel={speedLabel}
      format={speedLabel}
      fromTyped={Math.log2}
      disabled={locked}
      onchange={setSpeedStop}
    />
  {:else if tool === "speed"}
    <ValueSlider
      label="Speed"
      value={Math.log2(item.speed)}
      min={Math.log2(POST_MIN_SPEED)}
      max={Math.log2(POST_MAX_SPEED)}
      step={SPEED_STEP}
      origin={0}
      marks={SPEED_MARKS}
      onmark={setItemSpeedStop}
      markLabel={speedLabel}
      format={speedLabel}
      fromTyped={Math.log2}
      disabled={locked}
      onchange={setItemSpeedStop}
    />
    <p class="hint">
      Speed plays the whole grid faster or slower. Each cell keeps its own
      speed inside it.
    </p>
  {:else if tool === "look" || tool === "effects" || tool === "effort"}
    {#if tool === "look" && cell}
      <div class="group" role="group" aria-label="Hands shown">
        <span class="group-name">Hands</span>
        <div class="chips">
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label="Left"
            ariaLabel="Show the left hand"
            active={leftShown}
            disabled={locked}
            onclick={() => showHand("left", !leftShown)}
          />
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label="Right"
            ariaLabel="Show the right hand"
            active={rightShown}
            disabled={locked}
            onclick={() => showHand("right", !rightShown)}
          />
        </div>
      </div>
    {/if}
    {#if tool !== "look" && cell}
      <div class="group" role="group" aria-label="Applies to">
        <span class="group-name">Applies to</span>
        <div class="chips">
          {#each SCOPES as entry (entry.id)}
            <FilterChipBase
              mode="toggle"
              emphasis="solid"
              label={entry.label}
              active={scope === entry.id}
              disabled={locked}
              onclick={() => (scope = entry.id)}
            />
          {/each}
        </div>
        {#if scope === "tips"}
          <div class="chips">
            {#each tipTargets as target (target.key)}
              <FilterChipBase
                mode="toggle"
                emphasis="solid"
                label={target.label}
                active={tipKey === target.key}
                disabled={locked}
                onclick={() => (tipKey = target.key)}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if tool === "look" || scopeKey === null}
      {#key `${tool}:${lookKey}`}
        <PostAnimationAppearanceTool
          {editor}
          appearanceOverride={look}
          onAppearanceChange={saveLook}
          appearanceKey={lookKey}
          scopeLabel={scopeName}
          {locked}
          {fill}
          sections={LOOK_SECTIONS[tool]}
        />
      {/key}
    {:else if tool === "effects"}
      <p class="hint">{scopeEffectHint}</p>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          emphasis="solid"
          label="Follow the cell"
          active={scopeEffect === null}
          disabled={locked}
          onclick={() => pickScopeEffect(null)}
        />
      </div>
      <EffectSelector
        activeEffect={scopeEffect ?? "none"}
        onSelect={pickScopeEffect}
        disabled={locked}
      />
    {:else}
      <p class="hint">{scopeEffortHint}</p>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          emphasis="solid"
          label="Follow the cell"
          active={scopeEffort === null}
          disabled={locked}
          onclick={() => pickScopeEffort(null)}
        />
        {#each EFFORTS as effort (effort.id)}
          <FilterChipBase
            mode="toggle"
            emphasis="solid"
            label={effort.label}
            active={scopeEffort === effort.id}
            disabled={locked}
            onclick={() => pickScopeEffort(effort.id)}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if tool === "sequence" && cell}
  {#key requiredBeats}
    <SequencePickerModal
      bind:open={pickerOpen}
      onClose={closePicker}
      onSelect={picked}
      requiredBeatCount={requiredBeats}
      title={pickerTarget?.replace != null
        ? "Replace this sequence"
        : "Add a sequence"}
    />
  {/key}
{/if}

<style>
  .arrangement-tool {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .group-name,
  .stepper-name,
  .readout-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .chips,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* A name, then minus, the value, plus, on one line while it fits. */
  .stepper {
    --typeable-min-width: 4.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .stepper-name {
    flex: 1 0 5rem;
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    min-width: 0;
  }

  .layer-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .layer-row,
  .layer-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .layer-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layer-meta {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  /* One card per layer: its colours, its turns, its own offset. */
  .layer {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
    padding: 0.625rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 0.625rem;
  }

  .pair {
    display: inline-flex;
    flex: none;
    gap: 0.125rem;
  }

  .dot {
    display: block;
    width: 0.875rem;
    height: 0.875rem;
    border: 1px solid rgb(255 255 255 / 0.35);
    border-radius: 50%;
  }
</style>
