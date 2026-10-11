<!--
  PatternStepStrip.svelte
  The editable per-step strip. One or two lanes. Number cells cycle a value list
  (left −, right +, center = popover); toggle cells flip on/off. Source of truth
  is owned by the parent; this emits edits.
-->
<script lang="ts" generics="T extends number | string | boolean">
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  interface Lane {
    label: string;
    color: "blue" | "red" | "hold";
    values: T[];
    /** Per-cell "this cell can't take effect" mask (reversals: step isn't
     *  spinning). Aligned to `values`. Renders the cell dimmed + dashed. */
    inert?: boolean[];
  }
  interface Props {
    lanes: Lane[];
    cellKind: "number" | "toggle";
    /** Cycle list for number cells (left/right zones). */
    valueList?: T[];
    /** Base/default value rendered "muted". */
    base: T;
    format: (v: T) => string;
    onEdit: (laneIndex: number, stepIndex: number, value: T) => void;
    /** Step the cells up from the inline 56px row to a size that reads at arm's
     *  length. For a roomy pane, where the small row looks lost. */
    fill?: boolean;
    /** Number the columns above the lanes. Turns "on steps 2 and 4" from a claim
     *  into something you can check by looking. */
    showStepNumbers?: boolean;
  }
  let {
    lanes,
    cellKind,
    valueList = [],
    base,
    format,
    onEdit,
    fill = false,
    showStepNumbers = false,
  }: Props = $props();

  let popover = $state<{ lane: number; step: number; x: number; y: number } | null>(null);

  function zone(e: MouseEvent, el: HTMLElement): -1 | 0 | 1 {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    return x <= 0.33 ? -1 : x >= 0.67 ? 1 : 0;
  }
  function step(current: T, dir: -1 | 1): T {
    let idx = valueList.findIndex((v) => String(v) === String(current));
    if (idx < 0) idx = 0;
    return valueList[Math.min(valueList.length - 1, Math.max(0, idx + dir))]!;
  }
  function openPopover(li: number, bi: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    popover = { lane: li, step: bi, x: r.left, y: r.bottom + 8 };
  }
  function onNumberClick(e: MouseEvent, li: number, bi: number, v: T, el: HTMLElement) {
    // Keyboard activation (Enter/Space) fires a click with detail === 0 and
    // clientX/clientY === 0, which the clientX-based zone() always reads as the
    // left ("−") zone. Route keyboard activation to the popover so keyboard
    // users can reach the full value list instead of only ever decrementing.
    if (e.detail === 0) {
      openPopover(li, bi, el);
      return;
    }
    const z = zone(e, el);
    if (z === 0) {
      openPopover(li, bi, el);
    } else {
      onEdit(li, bi, step(v, z));
      popover = null;
    }
  }
  function pick(v: T) {
    if (popover) onEdit(popover.lane, popover.step, v);
    popover = null;
  }
</script>

<svelte:window onclick={(e) => { if (!(e.target as HTMLElement)?.closest?.(".pbs-cell,.pbs-pop")) popover = null; }} />

<div class="pbs" class:fill>
  {#if showStepNumbers}
    <!-- Decorative: every cell already carries its own step in its aria-label,
         so a screen reader reading this row too would just say the numbers
         twice. -->
    <div class="pbs-lane pbs-nums" aria-hidden="true">
      <span class="pbs-label"></span>
      <div class="pbs-steps">
        {#each lanes[0]?.values ?? [] as _, i}
          <span class="pbs-num">{i + 1}</span>
        {/each}
      </div>
    </div>
  {/if}
  {#each lanes as lane, li}
    <div class="pbs-lane">
      <span class="pbs-label {lane.color}">{lane.label}</span>
      <div class="pbs-steps">
        {#each lane.values as v, bi}
          {#if cellKind === "number"}
            <button
              class="pbs-cell num {lane.color}"
              class:muted={v === base}
              onclick={(e) => onNumberClick(e, li, bi, v, e.currentTarget)}
            >
              <span class="z minus"><i class="fa-solid fa-minus"></i></span>
              <span class="z plus"><i class="fa-solid fa-plus"></i></span>
              <span class="v">{format(v)}</span>
            </button>
          {:else}
            <button
              class="pbs-cell toggle {lane.color}"
              class:on={v !== base}
              class:inert={lane.inert?.[bi]}
              role="switch"
              aria-checked={v !== base}
              aria-label={tDynamic(lane.inert?.[bi] ? "pattern_strip_inert_step_aria" : "pattern_strip_step_aria", { lane: lane.label, step: bi + 1 })}
              title={lane.inert?.[bi]
                ? tDynamic("pattern_strip_inert_step_title")
                : undefined}
              onclick={() => onEdit(li, bi, (v === base ? (valueList.find((x) => x !== base) ?? base) : base) as T)}
            >
              <i class="fa-solid {lane.inert?.[bi] ? 'fa-ban' : 'fa-rotate'}"></i>
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

{#if popover}
  {@const lane = lanes[popover.lane]!}
  <div class="pbs-pop" style="left:{popover.x}px; top:{popover.y}px">
    {#each valueList as v}
      <button class:sel={String(v) === String(lane.values[popover.step])} onclick={() => pick(v)}>{format(v)}</button>
    {/each}
  </div>
{/if}

<style>
  .pbs { display: flex; flex-direction: column; gap: 10px; }
  .pbs-lane { display: flex; align-items: center; gap: 12px; }
  /* Sized to the longest label ("Right") rather than to a round number of
     pixels. At 44px the bold text ran past its own box and collided with the
     first cell; ch tracks the font, and the clamp is the backstop for a lane
     name longer than the two this ships with. */
  .pbs-label {
    width: 6ch; flex: 0 0 6ch; min-width: 0;
    font-size: 14px; font-weight: 800;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* The app's own hand colours — the same two tokens the cells below are
     filled with, so the word "Left" and the blue cells it labels are one
     blue. Any tint invented here reads as a third colour on a screen that
     already has two. */
  .pbs-label.blue { color: var(--dm-motion-blue); }
  .pbs-label.red { color: var(--dm-motion-red); }
  .pbs-label.hold { color: var(--theme-accent, #2dd4bf); }
  .pbs-steps { display: flex; gap: 10px; flex: 1; min-width: 0; }
  .pbs-cell {
    position: relative; flex: 1; min-width: 0; height: 56px; border-radius: 12px;
    border: 1px solid var(--theme-stroke); background: var(--theme-card-bg);
    color: var(--theme-text); cursor: pointer; overflow: hidden;
    display: flex; align-items: center; justify-content: center; user-select: none;
  }
  /* Fill mode: the same strip in a roomy pane, where the inline 56px row looks
     lost. The cells step up to a size that reads at arm's length and stop —
     the strip stays its own height and hands the rest back.

     Do NOT tie the cell height to the panel. That was the previous try, and at
     4K it produced four 65x200px slabs: the panel took the drawer's height, the
     cells stretched to match, and a token holding the character "1" turned into
     a column. A cell holds one short value. It is a token in both directions —
     bounded height, bounded width — and whatever height is left over belongs to
     the pane, which centres the editor in it.

     `0 0 auto` and not `1` (which is `1 1 0`): on a short landscape phone the
     pane is shorter than the strip, and a shrinkable strip collapsed to nothing
     while its cells kept painting at full size — the bottom lane ran off the
     screen with no scroll able to reach it, because a collapsed flex item
     contributes no height for the scroller to find. */
  .pbs.fill { flex: 0 0 auto; }
  /* The lane centres as a UNIT — name and cells together. Stretching the cell
     row across the panel and centring the cells inside it looked right in the
     numbers and wrong on screen: the row kept the panel's full width, so "Left"
     stayed pinned to the far edge with 165px of nothing between it and the
     first cell it labels. */
  .pbs.fill .pbs-lane { justify-content: center; }
  .pbs.fill .pbs-steps { flex: 0 1 auto; }
  /* A definite width that shrinks, rather than a share of the row that grows:
     four steps read as four tokens instead of four slabs, and sixteen still
     fit by getting narrower. */
  .pbs.fill .pbs-cell {
    flex: 0 1 7rem;
    width: 7rem;
    height: 76px;
    min-height: 56px;
    max-width: none;
  }

  /* The column header. Sized and spaced exactly like the cell row beneath it so
     each number sits over its own cell — a ruler, not a caption. */
  .pbs-nums { margin-bottom: -2px; }
  .pbs-num {
    flex: 1; min-width: 0; text-align: center;
    font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim); letter-spacing: 0.02em;
  }
  .pbs.fill .pbs-num { flex: 0 1 7rem; width: 7rem; max-width: none; }
  .pbs-cell .v { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; z-index: 2; pointer-events: none; }
  .pbs-cell.muted .v { color: var(--theme-text-dim); }
  /* Filled with the hand colour itself, not a wash of it. A wash toward the
     card background made a fourth and fifth blue on a screen that also shows
     the lane names and the rhythm dots — three shades of "blue" that are all
     supposed to mean the same hand. One token, everywhere. */
  .pbs-cell.num.blue:not(.muted) { background: var(--dm-motion-blue); border-color: var(--dm-motion-blue); }
  .pbs-cell.num.red:not(.muted) { background: var(--dm-motion-red); border-color: var(--dm-motion-red); }
  .pbs-cell.num.hold:not(.muted) { background: var(--theme-accent, #2dd4bf); border-color: var(--theme-accent, #2dd4bf); }
  .pbs-cell.num:not(.muted) .v { color: #fff; }
  .pbs-cell .z {
    position: absolute; top: 0; bottom: 0; width: 50%; display: flex; align-items: center;
    opacity: 0; transition: opacity .12s; z-index: 1; color: var(--theme-text);
  }
  /* The hover -/+ sits on top of the hand colour once a step is filled, so it
     takes the fill's own foreground rather than the panel's. */
  .pbs-cell.num:not(.muted) .z { color: #fff; }
  .pbs-cell .z.minus { left: 0; justify-content: flex-start; padding-left: 9px; }
  .pbs-cell .z.plus { right: 0; justify-content: flex-end; padding-right: 9px; }
  .pbs-cell:hover .z { opacity: .8; }
  .pbs-cell.toggle.on { background: var(--dm-motion-blue); border-color: var(--dm-motion-blue); color: #fff; }
  .pbs-cell.toggle.on.red { background: var(--dm-motion-red); border-color: var(--dm-motion-red); }
  .pbs-cell.toggle:not(.on) i { opacity: .32; }

  /* Inert: this step doesn't spin, so a reversal here can't act. Dashed + dim,
     and an "on" toggle here drops its bright fill to read as having no effect. */
  .pbs-cell.inert { border-style: dashed; opacity: .55; }
  .pbs-cell.toggle.on.inert { background: var(--theme-card-bg); color: var(--theme-text-dim); }
  .pbs-cell.inert i { opacity: .5; }
  .pbs-pop {
    position: fixed; z-index: 50; display: grid; grid-template-columns: repeat(4, 54px); gap: 7px;
    background: var(--theme-panel-bg); border: 1px solid var(--theme-stroke); border-radius: 14px; padding: 10px;
    box-shadow: 0 18px 44px -16px rgba(0,0,0,.7);
  }
  .pbs-pop button {
    height: 46px; border-radius: 10px; border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg); color: var(--theme-text); font-weight: 700; font-size: 15px;
    cursor: pointer; font-variant-numeric: tabular-nums;
  }
  .pbs-pop button.sel { background: var(--theme-accent); color: #fff; border-color: transparent; }

  /* The strip steps up with the panel for the same reason the sentence does:
     every size here is px, so on a 4K panel a 76px cell holding one character
     reads as punctuation. See PatternStripEditor for the matching tiers. */
  @container sequence-action-subview (min-width: 1100px) {
    .pbs.fill { gap: 14px; }
    .pbs.fill .pbs-cell { flex-basis: 9rem; width: 9rem; height: 100px; border-radius: 14px; }
    .pbs.fill .pbs-num { flex-basis: 9rem; width: 9rem; font-size: 15px; }
    .pbs.fill .pbs-label { width: 6ch; flex-basis: 6ch; font-size: 18px; }
    .pbs.fill .pbs-cell .v { font-size: 22px; }
  }

  @container sequence-action-subview (min-width: 1600px) {
    .pbs.fill { gap: 18px; }
    .pbs.fill .pbs-cell { flex-basis: 11rem; width: 11rem; height: 128px; border-radius: 18px; }
    .pbs.fill .pbs-num { flex-basis: 11rem; width: 11rem; font-size: 18px; }
    .pbs.fill .pbs-label { font-size: 22px; }
    .pbs.fill .pbs-cell .v { font-size: 28px; }
  }
</style>
