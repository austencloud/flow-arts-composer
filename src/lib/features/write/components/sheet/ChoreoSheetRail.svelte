<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ResizeHandle from "#lib/shared/panels/ResizeHandle.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import {
    getChoreoSheetContext,
    type RosterRow,
  } from "../../state/choreo-sheet-state.svelte";
  import type {
    GroupSeparator,
    SheetOrientation,
    SheetPacking,
  } from "../../domain/types/choreo-sheet";
  import SheetHeaderEditor from "./SheetHeaderEditor.svelte";

  type RailTask = "sequences" | "format";
  type ViewMode = "reading" | "page";
  type PictographSize = "large" | "standard" | "compact";
  const { state: builder } = getChoreoSheetContext();
  let {
    collapsed,
    width,
    stacked = false,
    dragging,
    playbackActive = false,
    viewMode,
    onToggle,
    onViewMode,
    onDragStart,
    onDrag,
    onDragEnd,
  }: {
    collapsed: boolean;
    width: number;
    stacked?: boolean;
    dragging: boolean;
    playbackActive?: boolean;
    viewMode: ViewMode;
    onToggle: () => void;
    onViewMode: (v: ViewMode) => void;
    onDragStart: () => void;
    onDrag: (delta: number) => void;
    onDragEnd: () => void;
  } = $props();
  let task = $state<RailTask>("sequences");
  const taskOptions = [
    { value: "sequences", label: "Sequences" },
    { value: "format", label: "Format" },
  ] satisfies { value: RailTask; label: string }[];
  const separatorOptions = [
    { value: "rule", label: "Line" },
    { value: "gap", label: "Gap" },
    { value: "none", label: "None" },
  ] satisfies { value: GroupSeparator; label: string }[];
  const packingOptions = [
    { value: "flow", label: "Study (dense)" },
    { value: "aligned", label: "Annotated" },
  ] satisfies { value: SheetPacking; label: string }[];
  const orientationOptions = [
    { value: "landscape", label: "Landscape" },
    { value: "portrait", label: "Portrait" },
  ] satisfies { value: SheetOrientation; label: string }[];
  const viewOptions = [
    { value: "reading", label: "Reading" },
    { value: "page", label: "Page" },
  ] satisfies { value: ViewMode; label: string }[];
  const sizeOptions = [
    { value: "large", label: "Large" },
    { value: "standard", label: "Standard" },
    { value: "compact", label: "Compact" },
  ] satisfies { value: PictographSize; label: string }[];
  const blocked = $derived(
    builder.roster.filter((r) => r.status === "missing" || r.status === "error")
  );
  const size = $derived<PictographSize>(
    builder.layout.columns <= 4
      ? "large"
      : builder.layout.columns <= 6
        ? "standard"
        : "compact"
  );
  const annotated = $derived(builder.layout.packing === "aligned");
  const label = (row: RosterRow): string =>
    row.meta?.name ? simplifyRepeatedWord(row.meta.name) : "…";
  function setSize(value: PictographSize): void {
    builder.setLayout(
      value === "large"
        ? { columns: 4, rowsPerPage: 3 }
        : value === "standard"
          ? { columns: 6, rowsPerPage: 4 }
          : { columns: 8, rowsPerPage: 6 }
    );
  }
  function retryAll(): void {
    for (const row of blocked) void builder.retryHydration(row.id);
  }
</script>

<aside
  class="rail"
  class:collapsed
  class:dragging
  class:stacked
  style:--rail-w="{width}px"
>
  <div class="rail-bar">
    <button
      type="button"
      class="icon-btn"
      onclick={onToggle}
      aria-expanded={!collapsed}
      aria-label={playbackActive
        ? "Exit Play act"
        : collapsed
          ? "Expand sequence rail"
          : "Collapse sequence rail"}
      ><i
        class="fa-solid"
        class:fa-chevron-left={!collapsed}
        class:fa-chevron-right={collapsed}
        aria-hidden="true"
      ></i></button
    >{#if collapsed}{#if playbackActive}<i
          class="fa-solid fa-play playback-mark"
          aria-hidden="true"
        ></i>{:else}<span>{builder.sequenceIds.length}</span>{/if}{/if}
  </div>
  <div class="content">
    <SegmentedControl
      options={taskOptions}
      value={task}
      onchange={(v) => (task = v)}
      color="accent"
      size="sm"
    />
    {#if task === "sequences"}
      <section>
        <header>
          <h2>Sequences ({builder.sequenceIds.length})</h2>
          {#if blocked.length >= 2}<button class="retry" onclick={retryAll}
              >Retry all</button
            >{/if}
        </header>
        <Crossfade key={builder.sequenceIds.length === 0}
          >{#if builder.sequenceIds.length === 0}<p class="empty">
              No sequences yet. Add some to build the sheet.
            </p>{:else}<ul>
              {#each builder.roster as row, i (row.id)}<li
                  class:selected={builder.selectedSequenceId === row.id}
                >
                  <button
                    class="row-label tka-font"
                    title={row.meta?.name ?? row.id}
                    aria-pressed={builder.selectedSequenceId === row.id}
                    onclick={() => builder.toggleSequenceSelection(row.id)}
                    >{label(row)}</button
                  >
                  <span class="count">{row.meta?.stepCount ?? ""}</span><span
                    class="status"
                    >{#if row.status === "loading" || row.status === "retrying"}<ShimmerBlock
                        circle
                        height="14px"
                      />{:else if row.status === "error"}<button
                        class="icon-btn"
                        aria-label="Retry loading sequence"
                        onclick={() => void builder.retryHydration(row.id)}
                        ><i class="fa-solid fa-rotate-right" aria-hidden="true"
                        ></i></button
                      >{:else if row.status === "missing"}<i
                        class="fa-solid fa-circle-question"
                        aria-label="Sequence not found"
                      ></i>{/if}</span
                  >
                  <div class="row-actions">
                    <button
                      class="icon-btn"
                      aria-label="Move up"
                      disabled={i === 0}
                      onclick={() => builder.move(i, i - 1)}
                      ><i class="fa-solid fa-chevron-up" aria-hidden="true"
                      ></i></button
                    ><button
                      class="icon-btn"
                      aria-label="Move down"
                      disabled={i === builder.roster.length - 1}
                      onclick={() => builder.move(i, i + 1)}
                      ><i class="fa-solid fa-chevron-down" aria-hidden="true"
                      ></i></button
                    ><button
                      class="icon-btn danger"
                      aria-label="Remove from sheet"
                      onclick={() => builder.removeAt(i)}
                      ><i class="fa-solid fa-xmark" aria-hidden="true"
                      ></i></button
                    >
                  </div>
                </li>{/each}
            </ul>{/if}</Crossfade
        >
      </section>
    {:else}
      <section>
        <h2>Format</h2>
        <SheetHeaderEditor
          header={builder.sheet.annotations.header}
          onchange={builder.setHeader}
        />
        <div class="setting">
          <span>Step numbers</span><button
            type="button"
            name="show-step-numbers"
            class="switch"
            class:on={builder.layout.showStepNumbers}
            role="switch"
            aria-label="Show step numbers"
            aria-checked={builder.layout.showStepNumbers}
            onclick={() =>
              builder.setLayout({
                showStepNumbers: !builder.layout.showStepNumbers,
              })}><span class="thumb" aria-hidden="true"></span></button
          >
        </div>
        <label
          >Group separator<SegmentedControl
            options={separatorOptions}
            value={builder.layout.groupSeparator}
            onchange={(v) => builder.setLayout({ groupSeparator: v })}
            color="accent"
            size="sm"
          /></label
        >
        <label
          >View<SegmentedControl
            options={viewOptions}
            value={viewMode}
            onchange={onViewMode}
            color="accent"
            size="sm"
          /></label
        >
        <label
          >Sheet style<SegmentedControl
            options={packingOptions}
            value={builder.layout.packing}
            onchange={(v) => builder.setLayout({ packing: v })}
            color="accent"
            size="sm"
          /></label
        >
        <label
          >Pictograph size<SegmentedControl
            options={sizeOptions}
            value={size}
            onchange={setSize}
            color="accent"
            size="sm"
          /></label
        >
        {#if annotated}<label
            >Orientation<SegmentedControl
              options={orientationOptions}
              value={builder.layout.orientation}
              onchange={(v) => builder.setLayout({ orientation: v })}
              color="accent"
              size="sm"
            /></label
          >
          <div class="chips">
            <FilterChipBase
              label="Cue rail"
              icon="fa-solid fa-clock"
              mode="toggle"
              size="sm"
              active={builder.layout.showCueRail}
              onclick={() =>
                builder.setLayout({ showCueRail: !builder.layout.showCueRail })}
            /><FilterChipBase
              label="Note strips"
              icon="fa-solid fa-note-sticky"
              mode="toggle"
              size="sm"
              active={builder.layout.showNoteStrips}
              onclick={() =>
                builder.setLayout({
                  showNoteStrips: !builder.layout.showNoteStrips,
                })}
            />
          </div>{/if}
      </section>
    {/if}
  </div>
</aside>
{#if !playbackActive}
  <div class="resize" class:stacked>
    <ResizeHandle
      direction={stacked ? "vertical" : "horizontal"}
      {onDragStart}
      {onDrag}
      {onDragEnd}
    />
  </div>
{/if}

<style>
  .rail {
    flex: 0 0 var(--rail-w);
    width: var(--rail-w);
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-panel-bg);
  }
  .rail.collapsed {
    flex-basis: 48px;
    width: 48px;
  }
  .rail.stacked {
    flex-basis: var(--rail-w);
    width: 100%;
    max-width: 100%;
    max-height: 280px;
  }
  .rail.stacked.collapsed {
    flex-basis: 48px;
    width: 100%;
    max-height: 48px;
  }
  .rail-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 48px;
    padding: 2px;
  }
  .collapsed .rail-bar {
    flex-direction: column;
  }
  .playback-mark {
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
  }
  .collapsed .content {
    display: none;
  }
  .content {
    min-width: 260px;
    overflow: auto;
    padding: var(--spacing-sm);
  }
  section {
    display: grid;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }
  header,
  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }
  h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min);
  }
  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 2px;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  li.selected {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }
  .row-label {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0;
    background: transparent;
    color: var(--theme-text);
    text-align: left;
    font-size: 1rem;
  }
  .count,
  .status {
    flex: 0 0 24px;
    color: var(--theme-text-dim);
    text-align: center;
  }
  .row-actions {
    flex: 0 0 132px;
    display: flex;
    opacity: 0;
    pointer-events: none;
  }
  .row-actions :focus {
    opacity: 1;
  }
  li:hover .row-actions,
  li:focus-within .row-actions,
  li.selected .row-actions {
    opacity: 1;
    pointer-events: auto;
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim);
  }
  .danger {
    color: var(--theme-danger);
  }
  label {
    display: grid;
    gap: 6px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 3.25rem;
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .switch::before {
    content: "";
    position: absolute;
    inset: 50% 0 auto;
    height: 1.75rem;
    transform: translateY(-50%);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-panel-bg);
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .switch.on::before {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 55%, transparent);
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 0.25rem;
    width: 1.25rem;
    height: 1.25rem;
    transform: translateY(-50%);
    border-radius: 50%;
    background: var(--theme-text);
    transition: left var(--duration-fast) ease;
  }

  .switch.on .thumb {
    left: 1.75rem;
  }

  .switch:focus-visible {
    border-radius: 999px;
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .resize {
    display: flex;
    align-items: stretch;
    width: 8px;
  }
  .resize.stacked {
    width: 100%;
    height: 8px;
  }
  .retry {
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--theme-accent);
  }
  .empty {
    color: var(--theme-text-dim);
  }
  @media (hover: none) {
    .row-actions {
      opacity: 1;
      pointer-events: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .switch::before,
    .thumb {
      transition: none;
    }
  }
</style>
