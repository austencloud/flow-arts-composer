<!--
  PatternStripEditor.svelte
  Length × Rhythm × Amount over a PatternStepStrip. Strip is the source of truth;
  chips stamp + auto-highlight by derivation.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ChipPopoverOption from "#lib/shared/browse/components/filter-chips/ChipPopoverOption.svelte";
  import RhythmGlyph from "./RhythmGlyph.svelte";
  import PatternStepStrip from "./PatternStepStrip.svelte";
  import type { StripBinding, StripValue } from "./pattern-strip-types";
  import type { RhythmDef } from "#lib/shared/create/domain/rhythm/rhythm-catalog.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    displayLane, displayMask, displayRhythm, sentenceAmount,
    sentenceConnector, sentenceSubject, sentenceVerb,
  } from "./pattern-strip-display";
  import {
    divisorsUpTo,
    uniformActive,
    perHandRhythmMatches,
    singleLaneRhythmMatches,
    stampPerHand,
    stampSingle,
    resizePeriod,
    laneMaskFor,
  } from "#lib/shared/create/domain/rhythm/rhythm-mask.js";

  interface Props {
    binding: StripBinding;
    sequenceLength: number;
    /** Period-length lanes. lanes[0]=blue (or hold), lanes[1]=red. */
    value: StripValue[][];
    onChange: (lanes: StripValue[][]) => void;
    /** Optional per-lane, period-aligned "cell can't take effect" mask
     *  (reversals: beat isn't spinning). Lane order matches laneColors. */
    inertMask?: boolean[][];
    /** Reflows the controls into horizontal rows when a wide, short drawer
     *  provides less height than the standard stacked editor needs.
     *
     *  Ignored in sentence mode, which already sizes itself to the pane: its
     *  two panels share the spare height and the strip fills whatever they
     *  settle on. Letting both run at once put the compact rules on top of the
     *  sentence layout — the same `.result` styled as a flex panel by one and a
     *  two-column grid by the other. */
    fitAvailableHeight?: boolean;
    /** Lets a parent drill-down give one editing axis the whole surface. */
    visibleAxis?: "all" | "length" | "rhythm" | "amount" | "result";
  }
  let {
    binding,
    sequenceLength,
    value,
    onChange,
    inertMask,
    fitAvailableHeight = false,
    visibleAxis = "all",
  }: Props = $props();

  const periods = $derived(divisorsUpTo(sequenceLength));
  const period = $derived(value[0]?.length ?? 1);
  const reps = $derived(sequenceLength / period);

  // Sentence mode is a whole-editor presentation, so it stays out of the way of
  // the single-axis drill-downs, which already give one axis the whole screen.
  const sentenceMode = $derived(!!binding.sentence && visibleAxis === "all");

  /** What the sentence calls lane `li`. Falls back to the strip's own label,
   *  which is already a subject on the two-hand strips. */
  function subjectOf(li: number): string {
    return binding.sentence?.subject?.[li] ?? binding.laneLabels[li] ?? "";
  }

  /** The named-figure row exists to write BOTH hands in one press — the thing a
   *  per-hand chip cannot do. On a one-lane strip in sentence mode it offers
   *  exactly the shapes that lane's own rhythm chip already offers, so it is a
   *  second copy of the same control and it goes. */
  const showRhythmAxis = $derived(!(sentenceMode && binding.lanes === 1));

  /** Which slot's popover is open, as "amount-0" / "rhythm-1". */
  let openSlot = $state<string | null>(null);

  function laneMask(li: number): boolean[] {
    return (value[li] ?? []).map((v) => v !== binding.base);
  }

  /** What the amount chip reads. A hand-edited lane has no single amount. */
  function amountLabel(li: number): string {
    const a = laneAmount(li);
    return sentenceAmount(binding.sentence?.verb ?? "", a === null ? "" : binding.format(a), a === null);
  }

  /** Does this lane act on any step at all? A lane that acts nowhere has no
   *  amount to state — "turns mixed on no steps" is not a sentence anyone
   *  means, and "mixed" there is an artifact of asking for the shared value of
   *  an empty set. The chip is dropped so the line reads "turns on no steps",
   *  which is true and still one click from a rhythm that fixes it. */
  function laneActive(li: number): boolean {
    return laneMask(li).some(Boolean);
  }

  function toggleSlot(id: string) {
    openSlot = openSlot === id ? null : id;
  }

  function setPeriod(p: number) {
    onChange(value.map((lane) => resizePeriod(lane, p, binding.base)));
  }
  /** Value stamped on active steps: a binary binding's fixed activeValue, else
   *  the lane's current uniform amount (falling back to the first amount). */
  function stampValue(li: number): StripValue {
    if (binding.activeValue !== undefined) return binding.activeValue;
    return (
      uniformActive(value[li] ?? [], binding.base) ??
      (binding.amountList?.[0] as StripValue)
    );
  }
  function laneAmount(li: number): StripValue | null {
    return uniformActive(value[li] ?? [], binding.base);
  }
  function applyAmount(li: number, a: number) {
    const lane = [...(value[li] ?? [])];
    const active = lane
      .map((v, i) => (v !== binding.base ? i : -1))
      .filter((i) => i >= 0);
    if (active.length === 0) lane.fill(a);
    else for (const i of active) lane[i] = a;
    const next = value.map((l, idx) => (idx === li ? lane : l));
    onChange(next);
  }
  /** A fixed-period rhythm is incompatible when the sequence length can't host it. */
  function rhythmDisabled(rhythm: RhythmDef): boolean {
    return rhythm.period != null && sequenceLength % rhythm.period !== 0;
  }
  function rhythmActive(rhythm: RhythmDef): boolean {
    // Fixed-period rhythms only light when the strip is at exactly that period.
    if (rhythm.period != null && period !== rhythm.period) return false;
    if (binding.lanes === 2)
      return perHandRhythmMatches(
        rhythm.sym,
        value[0] ?? [],
        value[1] ?? [],
        binding.base
      );
    return singleLaneRhythmMatches(rhythm.sym, value[0] ?? [], binding.base);
  }
  function applyRhythm(rhythm: RhythmDef) {
    if (rhythmDisabled(rhythm)) return;
    // Fixed-period rhythms resize the strip to their period; tileable ones stamp
    // at the user's current period (unchanged behavior).
    const effPeriod = rhythm.period ?? period;
    if (binding.lanes === 2) {
      const { left, right } = stampPerHand(
        rhythm,
        effPeriod,
        stampValue(0),
        stampValue(1),
        binding.base
      );
      onChange([left, right]);
    } else {
      onChange([stampSingle(rhythm, effPeriod, stampValue(0), binding.base)]);
    }
  }
  /**
   * The rhythms one HAND can be given, at the current period.
   *
   * The catalog names what the pair does, so it cannot be listed verbatim
   * against a single hand: a Left chip reading "every step" sat over a list
   * highlighting "Blue Book", and picking any entry rewrote the other hand too.
   * Projecting each rhythm onto this lane keeps every shape the catalog can
   * make reachable one hand at a time, and duplicates collapse — at a period of
   * 1, Book and Blue Book are the same instruction to the left hand.
   */
  function laneRhythmOptions(li: number): boolean[][] {
    const seen = new Set<string>();
    const out: boolean[][] = [];
    for (const r of binding.rhythms) {
      // A fixed-period figure only has a shape to offer at its own period.
      if (r.period != null && r.period !== period) continue;
      const mask = laneMaskFor(r.sym, li, period);
      if (!mask.some(Boolean)) continue; // "no steps" is added last, once
      const key = mask.map((b) => (b ? "1" : "0")).join("");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mask);
    }
    out.push(new Array(period).fill(false));
    return out;
  }
  function laneMaskMatches(li: number, mask: readonly boolean[]): boolean {
    const cur = laneMask(li);
    return cur.length === mask.length && cur.every((b, i) => b === mask[i]);
  }
  function applyLaneMask(li: number, mask: readonly boolean[]) {
    const amount = stampValue(li);
    const lane = mask.map((on) => (on ? amount : binding.base));
    onChange(value.map((l, idx) => (idx === li ? lane : l)));
  }
  function editCell(li: number, bi: number, v: StripValue) {
    const lane = [...(value[li] ?? [])];
    lane[bi] = v;
    onChange(value.map((l, idx) => (idx === li ? lane : l)));
  }

  const stripLanes = $derived(
    binding.laneLabels.map((label, i) => ({
      label: displayLane(label),
      color: (binding.laneColors[i] === "accent"
        ? "hold"
        : binding.laneColors[i]) as "blue" | "red" | "hold",
      values: value[i] ?? [],
      inert: inertMask?.[i],
    }))
  );
</script>

<div
  class="pse"
  class:fit-available-height={fitAvailableHeight && !sentenceMode}
  class:single-lane={binding.lanes === 1}
  class:solo-axis={visibleAxis !== "all"}
  class:sentence-mode={sentenceMode}
>
  {#if sentenceMode && binding.sentence}
    <div class="sentences">
      {#each binding.laneLabels as _laneLabel, li}
        {@const subject = sentenceSubject(subjectOf(li))}
        <p class="sentence">
          <span class="subject {binding.laneColors[li]}">{subject}</span>
          <span class="prose verb">{sentenceVerb(binding.sentence.verb, laneAmount(li) === null)}</span>
          {#if binding.amountList && laneActive(li)}
            <span class="slot amount">
            <FilterChipBase
              label={amountLabel(li)}
              mode="dropdown"
              size="sm"
              expanded={openSlot === `amount-${li}`}
              ariaLabel={tDynamic("pattern_strip_amount_aria", { subject, amount: amountLabel(li) })}
              onclick={() => toggleSlot(`amount-${li}`)}
            >
              {#snippet children()}
                {#each binding.amountList ?? [] as a}
                  <ChipPopoverOption
                    label={binding.format(a)}
                    selected={String(laneAmount(li)) === String(a)}
                    onclick={() => {
                      applyAmount(li, a);
                      openSlot = null;
                    }}
                  />
                {/each}
              {/snippet}
            </FilterChipBase>
            </span>
          {/if}
          <span class="prose on">{sentenceConnector()}</span>
          <span class="slot rhythm">
          <FilterChipBase
            label={displayMask(laneMask(li))}
            mode="dropdown"
            size="sm"
            expanded={openSlot === `rhythm-${li}`}
            ariaLabel={tDynamic("pattern_strip_rhythm_aria", { subject, rhythm: displayMask(laneMask(li)) })}
            onclick={() => toggleSlot(`rhythm-${li}`)}
          >
            {#snippet children()}
              <!-- Every option is written by the same function that writes the
                   chip, so the open list always contains the words on the chip
                   that opened it. -->
              {#each laneRhythmOptions(li) as mask}
                <ChipPopoverOption
                  label={displayMask(mask)}
                  selected={laneMaskMatches(li, mask)}
                  onclick={() => {
                    applyLaneMask(li, mask);
                    openSlot = null;
                  }}
                />
              {/each}
            {/snippet}
          </FilterChipBase>
          </span>
        </p>
      {/each}
    </div>
  {/if}

  {#if visibleAxis === "all" || visibleAxis === "length"}
    <div class="axis">
      <div class="axis-row">
        <!-- "Length" is what this axis is called everywhere else in the editor,
             but beside a 40-step sequence a control reading 1 / 2 / 5 is not a
             length — it is how often the figure comes back around. In sentence
             mode the words have to survive being read aloud. -->
        <span class="axis-lbl">{tDynamic(sentenceMode ? "pattern_strip_repeats_every" : "pattern_strip_length")}</span>
        <span class="reps">{tDynamic("pattern_strip_repetitions", { reps, steps: sequenceLength })}</span>
      </div>
      <div class="seg-wrap">
        <SegmentedControl
          size="md"
          color="accent"
          options={periods.map((p) => ({ value: String(p), label: String(p) }))}
          value={String(period)}
          onchange={(v) => setPeriod(Number(v))}
        />
      </div>
    </div>
  {/if}

  {#if showRhythmAxis && (visibleAxis === "all" || visibleAxis === "rhythm")}
    <div class="axis">
      <!-- The catalog names figures the PAIR makes, which is why they cannot
           live on a single hand's chip. Here they are true: one press writes
           both hands at once, and this is where a newcomer meets the words
           other people will say to them. -->
      <div class="axis-lbl">{tDynamic(sentenceMode ? "pattern_strip_both_hands" : "pattern_strip_rhythm")}</div>
      <div class="chips">
        {#each binding.rhythms as r}
          <FilterChipBase
            label={displayRhythm(r.id, r.label)}
            mode="toggle"
            size="md"
            active={rhythmActive(r)}
            disabled={rhythmDisabled(r)}
            onclick={() => applyRhythm(r)}
          >
            {#snippet iconSnippet()}<RhythmGlyph
                sym={r.sym}
                lanes={binding.lanes}
              />{/snippet}
          </FilterChipBase>
        {/each}
      </div>
    </div>
  {/if}

  {#if binding.amountList && !sentenceMode && (visibleAxis === "all" || visibleAxis === "amount")}
    <div class="axis">
      <div class="axis-lbl">{tDynamic("pattern_strip_amount")}</div>
      <div class="amt-grid">
        {#each binding.laneLabels as label, li}
          <div class="amt-row">
            <span class="amt-lane {binding.laneColors[li]}">{displayLane(label)}</span>
            <div class="seg-wrap">
              <SegmentedControl
                size="md"
                color={binding.laneColors[li]}
                options={binding.amountList.map((a) => ({
                  value: String(a),
                  label: binding.format(a),
                }))}
                value={String(laneAmount(li) ?? -1)}
                onchange={(a) => applyAmount(li, Number(a))}
              />
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if visibleAxis === "all" || visibleAxis === "result"}
    <div class="axis result">
      <div class="axis-lbl">{tDynamic("pattern_strip_result")}</div>
      <PatternStepStrip
        lanes={stripLanes}
        cellKind={binding.cellKind ?? "number"}
        valueList={binding.valueList}
        base={binding.base}
        format={binding.format}
        onEdit={editCell}
        fill={sentenceMode}
        showStepNumbers={sentenceMode}
      />
    </div>
  {/if}
</div>

<style>
  .pse {
    display: flex;
    flex-direction: column;
    gap: 26px;
    width: 100%;
    margin: 8px 0 0;
  }
  .axis-lbl {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }
  .axis > .axis-lbl {
    display: block;
    margin: 0 0 12px;
  }
  .axis-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 12px;
  }
  .reps {
    font-size: 12px;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .amt-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .amt-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* Same fix as PatternStepStrip's .pbs-label: 44px was narrower than the bold
     text it held, so the name spilled onto the control beside it. */
  .amt-lane {
    width: 6ch;
    flex: 0 0 6ch;
    min-width: 0;
    font-size: 13px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .amt-lane.blue {
    color: var(--dm-motion-blue);
  }
  .amt-lane.red {
    color: var(--dm-motion-red);
  }
  .amt-lane.accent {
    color: var(--theme-accent, #2dd4bf);
  }
  .result {
    margin-top: 2px;
  }

  /* One axis on its own screen: the drill-down header already names it, so the
     duplicate LENGTH / RHYTHM / RESULT caption goes, and the meta line ("×10
     over 40 steps") slides back under the heading it belongs to. */
  .solo-axis .axis-lbl {
    display: none;
  }

  /* With the caption gone the meta line ("×10 over 40 steps") is no longer a
     heading — it is the consequence of the choice, so it moves under the
     control. Axes with a single visible child are unaffected by the reverse. */
  .solo-axis .axis {
    display: flex;
    flex-direction: column-reverse;
  }

  .solo-axis .axis-row {
    justify-content: flex-start;
    margin: 8px 0 0;
  }

  /* Cohesion: stop SegmentedControl stretching full-width; unify value type with the strip. */
  .seg-wrap {
    width: max-content;
    max-width: 100%;
  }
  :global(.pse .seg-wrap .segmented-control) {
    width: max-content;
  }
  :global(.pse .seg-wrap .segment) {
    min-width: 56px;
    padding: 0 16px;
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }


  /* ONE card, not a stack of loose fragments. The sentence, the two controls
     that write it, and the result it produces are one thought, and they were
     reading as three unrelated boxes of three different widths adrift on the
     panel — a 26rem card over a 42rem chip row over a 31rem strip, each
     floating on black. Now they share an edge, a background, and a width, and
     hairlines mark the seams. The card is as wide as its widest row, so no
     region can be wider than what it holds and none of them can be empty. */
  .pse.sentence-mode {
    gap: 0;
    margin: 0;
    align-self: center;
    width: max-content;
    max-width: 100%;
    min-width: min(100%, 30rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 18px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    text-align: center;
  }
  .pse.sentence-mode > :global(*) {
    padding: 18px 22px;
  }
  /* Hairline seams, never an outer edge — the card owns the outside. */
  .pse.sentence-mode > :global(* + *) {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
  }
  .pse.sentence-mode > .axis {
    width: auto;
    max-width: 100%;
  }
  .pse.sentence-mode .chips {
    justify-content: center;
  }
  .pse.sentence-mode .seg-wrap {
    margin-inline: auto;
  }

  /* The sentence is the control, not a caption above one, so it heads the card
     and carries no chrome of its own — the card is the surface. */
  .sentences {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Chips sit inline with the words, so the line has to wrap like prose and
     still keep its baseline when a chip is taller than the text. */
  /* The sentence is the primary control on the screen, so it is set at reading
     size rather than at the size of the captions under it. At 16px in a 640px
     card it read as one more fragment. */
  .sentence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 9px;
    margin: 0;
    font-size: 18px;
    line-height: 1.4;
  }

  /* Both lines say the same four things in the same order, so their columns
     line up: reserving the width of the widest subject and verb turns two
     ragged sentences into a small table you can scan down. `max-content` on the
     slots keeps a chip from stretching, and an empty amount slot collapses so
     an inactive lane reads "turns on no steps" without a hole in the middle. */
  .subject {
    min-width: 3.4rem;
  }
  .verb,
  .on {
    text-align: center;
  }
  .slot {
    display: inline-flex;
    align-items: center;
  }
  .slot.amount {
    min-width: 3.25rem;
    justify-content: center;
  }

  /* The reps line is a gloss on the caption, not a second heading, so it sits
     beside it rather than pushed to the far edge of the card, where it read as
     an unrelated fragment stranded in the gutter. */
  .pse.sentence-mode .axis-row {
    justify-content: center;
    gap: 10px;
  }

  /* Result is the consequence of the sentence, so it reads as its own block:
     a caption, then a framed strip. Left bare it was two rows of tokens
     floating on the panel background with no edge to tell them apart from the
     sentence above. */
  /* Both panels are sized by what they hold. The previous try stretched them to
     spend the drawer's height, which is exactly backwards: a card holding two
     short lines became a 640x225 cavern with the lines adrift in it, and the
     Result strip's cells grew into 200px columns to match. A form does not get
     better by inflating its boxes. They hug, and the pane centres the stack in
     whatever height is left (see each view's `justify-content: safe center`). */
  /* The two lines centre as a block and stay left-aligned inside it — that is
     what keeps the two hands' four columns lined up to scan down. */
  .pse.sentence-mode .sentences {
    flex: 0 0 auto;
    width: max-content;
    max-width: 100%;
    margin-inline: auto;
    text-align: left;
  }
  .pse.sentence-mode .result {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    margin-top: 0;
  }

  /* The colour says which prop; the word says which hand. Both are load-bearing
     for someone meeting this for the first time — the tint alone does not teach
     that blue is the left hand. */
  .subject {
    font-weight: 800;
    letter-spacing: 0.01em;
  }
  .subject.blue {
    color: var(--dm-motion-blue);
  }
  .subject.red {
    color: var(--dm-motion-red);
  }
  .subject.accent {
    color: var(--theme-accent, #2dd4bf);
  }

  .prose {
    color: var(--theme-text-dim);
  }

  /* A drawer this wide is a 4K screen, or a TV across a room. Nothing is
     scaling for us there — every size in this file is px — so the editor
     arrives as a postage stamp in the middle of a 1770px panel unless the type
     and the controls step up with the panel. Two tiers: the first catches
     4K at 150% scaling, the second the raw 3840 and the TV. */
  @container sequence-action-subview (min-width: 1100px) {
    .pse.sentence-mode {
      min-width: min(100%, 40rem);
      border-radius: 22px;
    }
    .pse.sentence-mode > :global(*) {
      padding: 24px 30px;
    }
    .pse.sentence-mode .sentences {
      gap: 16px;
    }
    .pse.sentence-mode .sentence {
      font-size: 22px;
      gap: 12px;
    }
    .pse.sentence-mode .axis-lbl {
      font-size: 15px;
    }
    .pse.sentence-mode .seg-wrap :global(.segment) {
      min-width: 68px;
      font-size: 19px;
    }
    /* The chips are the only controls with their own fixed sizes, so without
       this they stay 12px in a card whose every other measure has stepped up,
       and the row that names the figures reads as the least important thing
       on the screen. */
    .pse.sentence-mode :global(.chip-label) {
      font-size: 15px;
    }
    .pse.sentence-mode .chips :global(.filter-chip) {
      min-height: 52px;
      padding-inline: 14px;
      border-radius: 12px;
      --rhythm-dot: 9px;
    }
    .pse.sentence-mode .sentence :global(.filter-chip) {
      min-height: 46px;
      padding-inline: 14px;
    }
    .pse.sentence-mode .sentence :global(.chip-label) {
      font-size: 19px;
    }
  }

  @container sequence-action-subview (min-width: 1600px) {
    .pse.sentence-mode {
      min-width: min(100%, 52rem);
      border-radius: 26px;
    }
    .pse.sentence-mode > :global(*) {
      padding: 32px 40px;
    }
    .pse.sentence-mode .sentences {
      gap: 20px;
    }
    .pse.sentence-mode .sentence {
      font-size: 27px;
      gap: 15px;
    }
    .pse.sentence-mode .axis-lbl {
      font-size: 17px;
    }
    .pse.sentence-mode .seg-wrap :global(.segment) {
      min-width: 82px;
      font-size: 23px;
    }
    .pse.sentence-mode :global(.chip-label) {
      font-size: 18px;
    }
    .pse.sentence-mode .chips :global(.filter-chip) {
      min-height: 62px;
      padding-inline: 18px;
      border-radius: 14px;
      --rhythm-dot: 11px;
    }
    .pse.sentence-mode .sentence :global(.filter-chip) {
      min-height: 56px;
      padding-inline: 18px;
    }
    .pse.sentence-mode .sentence :global(.chip-label) {
      font-size: 24px;
    }
  }

  /* A narrow portrait drawer cannot spend 26px between every editing axis.
     This keeps the phone composition vertical and readable while reclaiming
     enough height for Result and the persistent Apply action below it. */
  @container sequence-action-subview (max-width: 599px) and (max-height: 430px) {
    .pse.fit-available-height {
      gap: 10px;
      margin: 0;
    }

    .pse.fit-available-height .axis-row,
    .pse.fit-available-height .axis > .axis-lbl {
      margin-bottom: 6px;
    }

    .pse.fit-available-height .chips,
    .pse.fit-available-height .amt-grid {
      gap: 6px;
    }

    .pse.fit-available-height .amt-row {
      gap: 6px;
    }

    .pse.fit-available-height .seg-wrap :global(.segment) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 10px;
      font-size: var(--font-size-sm, 14px);
    }

    .pse.fit-available-height .chips :global(.filter-chip) {
      min-height: var(--min-touch-target, 44px);
      padding-inline: 8px;
      gap: 4px;
    }

    .pse.fit-available-height .result {
      margin-top: 0;
    }
  }

  /* A foldable portrait drawer is wide enough for full controls but only about
     half a screen tall. Keep every target at least 44px and use that width to
     put each editing axis on one row, so Result and Apply stay visible. */
  @container sequence-action-subview (min-width: 600px) and (max-height: 540px) {
    .pse.fit-available-height {
      gap: 4px;
      margin: 0;
    }

    .pse.fit-available-height > .axis {
      display: grid;
      grid-template-columns: 4rem minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-width: 0;
      margin: 0;
    }

    .pse.fit-available-height > .axis:first-child {
      grid-template-columns: minmax(0, 1fr) max-content;
    }

    .pse.fit-available-height .axis-row {
      margin: 0;
    }

    .pse.fit-available-height .axis > .axis-lbl {
      margin: 0;
    }

    .pse.fit-available-height .chips {
      flex-wrap: nowrap;
      gap: 6px;
      min-width: 0;
    }

    .pse.fit-available-height .chips :global(.filter-chip) {
      min-width: 0;
      padding: 6px 4px;
      gap: 2px;
    }

    .pse.fit-available-height .amt-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    .pse.fit-available-height.single-lane .amt-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .pse.fit-available-height .amt-row {
      gap: 4px;
      min-width: 0;
    }

    .pse.fit-available-height .amt-lane {
      width: 2rem;
      flex-basis: 2rem;
    }

    .pse.fit-available-height .seg-wrap :global(.segment) {
      min-width: 42px;
      padding-inline: 8px;
      font-size: var(--font-size-sm, 14px);
    }

    .pse.fit-available-height .result {
      margin: 0;
    }

    .pse.fit-available-height .result :global(.pbs) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .pse.fit-available-height.single-lane .result :global(.pbs) {
      grid-template-columns: minmax(0, 1fr);
    }

    .pse.fit-available-height .result :global(.pbs-lane) {
      gap: 4px;
      min-width: 0;
    }

    .pse.fit-available-height .result :global(.pbs-label) {
      width: 2rem;
      flex-basis: 2rem;
    }

    .pse.fit-available-height .result :global(.pbs-steps) {
      gap: 4px;
    }

    .pse.fit-available-height .result :global(.pbs-cell) {
      height: var(--min-touch-target, 44px);
      border-radius: 8px;
    }

    .pse.fit-available-height .result :global(.pbs-cell .v) {
      font-size: var(--font-size-sm, 14px);
    }
  }
</style>
