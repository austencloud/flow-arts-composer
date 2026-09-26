<!-- One directly editable VTG ratio. Theory composes one for each axis so
     neither half of the grid is hidden behind an Apply-to mode. -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { spinRatioKey, type SpinRatio } from "@vtg/domain";
  import {
    theoryRatioFromParts,
    theoryRatioLabel,
    theoryRatioSpokenLabel,
    THEORY_RATIO_MAX_PART,
  } from "$lib/shared/shape-matrix/domain/theory-ratio";
  import { growFade } from "$lib/shared/transitions/motion";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";

  interface Props {
    hand: "left" | "right" | "both";
    /** Corner: the grid's corner cell names the axis and sizes the fields
       in its own container units; only the two numbers remain. */
    layout?: "ribbon" | "tray" | "corner";
    onfocuschange?: (hand: "left" | "right" | "both" | null) => void;
  }
  let { hand, layout = "ribbon", onfocuschange }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const current = $derived(
    hand === "right" ? appState.theoryRightRatio : appState.theoryLeftRatio
  );
  const currentKey = $derived(spinRatioKey(current));
  const axisLabel = $derived(
    hand === "left"
      ? t("shape_engine_left_rows")
      : hand === "right"
        ? t("shape_engine_right_columns")
        : t("shape_engine_rows_columns")
  );

  let propText = $state("");
  let handText = $state("");

  /* An emptied field must stay empty long enough for the next digit. The text
     only reseeds when the applied ratio changed outside this editor. */
  let seededKey = $state<string | null>(null);

  $effect(() => {
    if (currentKey === seededKey) return;
    seededKey = currentKey;
    propText = String(current.propRotations);
    handText = String(current.handCycles);
  });

  function readPart(text: string): number | null {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }

  function reduceTyped(prop: string, cycle: string): SpinRatio | null {
    const propRotations = readPart(prop);
    const handCycles = readPart(cycle);
    if (propRotations === null || handCycles === null) return null;
    return theoryRatioFromParts(propRotations, handCycles);
  }

  const typed = $derived(reduceTyped(propText, handText));
  const propValue = $derived(readPart(propText));
  const handValue = $derived(readPart(handText));
  const problem = $derived.by<string | null>(() => {
    const propRotations = readPart(propText);
    const handCycles = readPart(handText);
    if (propRotations === null || handCycles === null) return null;
    if (propRotations === 0 && handCycles === 0) {
      return t("shape_engine_ratio_invalid_zero");
    }
    if (
      propRotations > THEORY_RATIO_MAX_PART ||
      handCycles > THEORY_RATIO_MAX_PART
    ) {
      return t("shape_engine_ratio_range", { max: THEORY_RATIO_MAX_PART });
    }
    return null;
  });

  const reducedNote = $derived.by<string | null>(() => {
    if (!typed || problem) return null;
    const propRotations = readPart(propText);
    const handCycles = readPart(handText);
    if (
      propRotations === typed.propRotations &&
      handCycles === typed.handCycles
    ) {
      return null;
    }
    return theoryRatioLabel(typed);
  });

  function apply(nextProp: string, nextHand: string): void {
    const nextRatio = reduceTyped(nextProp, nextHand);
    const nextPropValue = readPart(nextProp);
    const nextHandValue = readPart(nextHand);
    if (
      !nextRatio ||
      nextPropValue === null ||
      nextHandValue === null ||
      (nextPropValue === 0 && nextHandValue === 0) ||
      nextPropValue > THEORY_RATIO_MAX_PART ||
      nextHandValue > THEORY_RATIO_MAX_PART
    ) {
      return;
    }
    appState.setTheoryRatioFor(hand === "right" ? "right" : "left", nextRatio);
    // Keep 2:4 under the cursor while the grid correctly applies 1:2.
    seededKey = spinRatioKey(nextRatio);
  }

  function onPart(next: string, side: "prop" | "hand"): void {
    const digits = next.replace(/\D/g, "").slice(0, 2);
    const nextProp = side === "prop" ? digits : propText;
    const nextHand = side === "hand" ? digits : handText;
    propText = nextProp;
    handText = nextHand;
    apply(nextProp, nextHand);
  }

  function nudge(side: "prop" | "hand", delta: number): void {
    const from = readPart(side === "prop" ? propText : handText) ?? 0;
    const next = Math.min(THEORY_RATIO_MAX_PART, Math.max(0, from + delta));
    onPart(String(next), side);
  }

  function onKey(event: KeyboardEvent, side: "prop" | "hand"): void {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(side, 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(side, -1);
    }
  }

  function onFocusOut(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget;
    if (!host || !(next instanceof Node) || !host.contains(next)) {
      onfocuschange?.(null);
    }
  }
</script>

<section
  class="ratio-side"
  class:left={hand === "left"}
  class:right={hand === "right"}
  class:both={hand === "both"}
  class:tray={layout === "tray"}
  class:corner={layout === "corner"}
  aria-label={t("shape_engine_ratio_aria", { axis: axisLabel })}
  onfocusin={() => onfocuschange?.(hand)}
  onfocusout={onFocusOut}
>
  <header class="side-head">
    <span class="axis-dot" aria-hidden="true"></span>
    <span class="axis-label">{axisLabel}</span>
  </header>

  <div class="entry-row" class:invalid={Boolean(problem)}>
    <div class="part-field">
      <span>{t("shape_engine_hand_cycles")}</span>
      <span class="part-stepper">
        <button
          type="button"
          aria-label={t("shape_engine_ratio_decrease_hand", {
            axis: axisLabel,
          })}
          disabled={(handValue ?? 0) <= 0}
          onclick={() => nudge("hand", -1)}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <input
          type="text"
          role="spinbutton"
          inputmode="numeric"
          autocomplete="off"
          value={handText}
          aria-label={t("shape_engine_ratio_hand_field", { axis: axisLabel })}
          aria-valuemin="0"
          aria-valuemax={THEORY_RATIO_MAX_PART}
          aria-valuenow={handValue ?? undefined}
          aria-invalid={Boolean(problem)}
          oninput={(event) => onPart(event.currentTarget.value, "hand")}
          onkeydown={(event) => onKey(event, "hand")}
        />
        <button
          type="button"
          aria-label={t("shape_engine_ratio_increase_hand", {
            axis: axisLabel,
          })}
          disabled={(handValue ?? 0) >= THEORY_RATIO_MAX_PART}
          onclick={() => nudge("hand", 1)}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </span>
    </div>

    <span class="colon" aria-hidden="true">:</span>

    <div class="part-field">
      <span>{t("shape_engine_prop_rotations")}</span>
      <span class="part-stepper">
        <button
          type="button"
          aria-label={t("shape_engine_ratio_decrease_prop", {
            axis: axisLabel,
          })}
          disabled={(propValue ?? 0) <= 0}
          onclick={() => nudge("prop", -1)}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <input
          type="text"
          role="spinbutton"
          inputmode="numeric"
          autocomplete="off"
          value={propText}
          aria-label={t("shape_engine_ratio_prop_field", { axis: axisLabel })}
          aria-valuemin="0"
          aria-valuemax={THEORY_RATIO_MAX_PART}
          aria-valuenow={propValue ?? undefined}
          aria-invalid={Boolean(problem)}
          oninput={(event) => onPart(event.currentTarget.value, "prop")}
          onkeydown={(event) => onKey(event, "prop")}
        />
        <button
          type="button"
          aria-label={t("shape_engine_ratio_increase_prop", {
            axis: axisLabel,
          })}
          disabled={(propValue ?? 0) >= THEORY_RATIO_MAX_PART}
          onclick={() => nudge("prop", 1)}
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </span>
    </div>
  </div>

  <div class="feedback" aria-live="polite">
    {#if problem}
      <span class="problem" transition:growFade={{ axis: "y" }}>
        {problem}
      </span>
    {:else if reducedNote}
      <span class="reduced" transition:growFade={{ axis: "y" }}>
        Reduces to {reducedNote}
      </span>
    {/if}
  </div>

  <span class="sr-only" aria-live="polite">
    {theoryRatioSpokenLabel(current)}
  </span>
</section>

<style>
  .ratio-side {
    --axis-color: var(--theme-accent, #f59e0b);
    --axis-base: var(--theme-accent, #f59e0b);
    --value-size: 1.125rem;
    display: grid;
    grid-template-rows: auto auto;
    width: 20rem;
    min-width: 0;
    gap: 0.45rem;
    padding: 0.25rem;
  }

  .ratio-side.left {
    --axis-color: var(--prop-blue-text, #818cf8);
    --axis-base: var(--prop-blue, #2e3192);
  }

  .ratio-side.right {
    --axis-color: var(--prop-red-text, #f87171);
    --axis-base: var(--prop-red, #ed1c24);
  }

  .ratio-side.both {
    --axis-color: color-mix(
      in srgb,
      var(--prop-blue-text, #818cf8) 50%,
      var(--prop-red-text, #f87171)
    );
    --axis-base: color-mix(
      in srgb,
      var(--prop-blue, #2e3192) 50%,
      var(--prop-red, #ed1c24)
    );
  }

  .side-head {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.45rem;
  }

  .axis-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    white-space: nowrap;
  }

  .axis-dot {
    width: 0.55rem;
    height: 0.55rem;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--axis-color);
    box-shadow: 0 0 0.65rem
      color-mix(in srgb, var(--axis-color) 42%, transparent);
  }

  .entry-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: end;
    gap: 0.35rem;
  }

  .part-field {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.58));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    text-align: center;
  }

  .part-stepper {
    display: grid;
    grid-template-columns:
      var(--min-touch-target, 44px) minmax(2.6rem, 1fr)
      var(--min-touch-target, 44px);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgb(255 255 255 / 0.2));
    border-radius: 9px;
    background: color-mix(in srgb, #000 34%, transparent);
    transition:
      border-color var(--duration-fast, 150ms) var(--transition-easing, ease),
      background var(--duration-fast, 150ms) var(--transition-easing, ease);
  }

  .part-stepper:hover {
    border-color: color-mix(in srgb, var(--axis-color) 48%, transparent);
  }

  .part-stepper:focus-within {
    border-color: var(--axis-color);
    outline: 2px solid color-mix(in srgb, var(--axis-color) 72%, transparent);
    outline-offset: 1px;
    background: color-mix(in srgb, var(--axis-base) 12%, #000 88%);
  }

  .part-stepper input,
  .part-stepper button {
    height: var(--min-touch-target, 44px);
    border: 0;
    background: transparent;
    color: var(--theme-text, #fff);
    font: inherit;
  }

  /* The number reads in its axis colour, as the level stepper value does. */
  .part-stepper input {
    width: 100%;
    min-width: 0;
    padding: 0 0.35rem;
    border-right: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-left: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    color: var(--axis-color);
    font-size: var(--value-size);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .part-stepper input:focus-visible {
    outline: 0;
  }

  /* Chevrons, the nudge glyphs the level stepper and the value scroller
     already use, at the same share of the value size. Font Awesome gives
     the icon a fixed 1.25em box; with the browser's 6px button padding
     that box started 6px in and ran past a corner-sized button, so the
     right chevron sat on the stepper's border and was clipped. No padding,
     as on the level stepper, keeps the box inside and the glyph centred. */
  .part-stepper button {
    display: grid;
    place-items: center;
    min-width: var(--min-touch-target, 44px);
    padding: 0;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    cursor: pointer;
    font-size: calc(var(--value-size) * 0.7);
    transition:
      color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  /* The glyph is narrower than the icon box; sizing the box to the glyph
     keeps it inside a button that is only as wide as the box would be. */
  .part-stepper button > i {
    width: auto;
  }

  .part-stepper button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--axis-color) 13%, transparent);
    color: var(--theme-text, #fff);
  }

  .part-stepper button:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: -3px;
  }

  .part-stepper button:disabled {
    color: color-mix(in srgb, var(--theme-text, #fff) 22%, transparent);
    cursor: not-allowed;
  }

  .entry-row.invalid .part-stepper {
    border-color: color-mix(
      in srgb,
      var(--semantic-danger, #ef4444) 68%,
      transparent
    );
  }

  .colon {
    display: grid;
    height: var(--min-touch-target, 44px);
    place-items: center;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.55));
    font-size: var(--value-size);
    font-weight: 750;
  }

  .feedback {
    min-width: 0;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.25;
  }

  .feedback:empty {
    display: none;
  }

  .problem {
    color: color-mix(in srgb, var(--semantic-danger, #ef4444) 30%, #fff);
  }

  .reduced {
    color: color-mix(in srgb, var(--theme-accent, #f59e0b) 82%, #fff);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .ratio-side.tray {
    width: 100%;
    padding-inline: 0;
  }

  /* The corner cell already carries the axis mark and colour, so the entry
     is its two numbers with their nudge buttons, sized in the cell's
     container units like the level stepper that shares this corner.
     Feedback is spoken through the live region; the invalid outline is the
     visible cue. */
  .ratio-side.corner {
    --nudge: clamp(1.1rem, 9.5cqi, 2.4rem);
    --field-height: clamp(1.5rem, 18cqi, 2.75rem);
    --value-size: clamp(0.9rem, 11cqi, 1.4rem);
    position: relative;
    width: auto;
    grid-template-rows: auto;
    gap: 0;
    padding: 0;
  }

  .ratio-side.corner .side-head,
  .ratio-side.corner .part-field > span:first-child,
  .ratio-side.corner .feedback {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .ratio-side.corner .entry-row {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.15rem;
  }

  .ratio-side.corner .part-stepper {
    grid-template-columns: var(--nudge) minmax(0, 1fr) var(--nudge);
    border-radius: 8px;
  }

  .ratio-side.corner .part-stepper input,
  .ratio-side.corner .part-stepper button,
  .ratio-side.corner .colon {
    height: var(--field-height);
  }

  .ratio-side.corner .part-stepper input {
    padding-inline: 0;
    text-align: center;
  }

  /* The global 44px floor belongs to touch hosts, which edit from the
     header; here the buttons take the cell's own scale. */
  .ratio-side.corner .part-stepper button {
    width: var(--nudge);
    min-width: 0;
    min-height: 0;
  }

  /* Below 10.5rem two nudge buttons per number leave no room for the
     numbers, so the corner keeps only the typed fields; arrow keys still
     nudge them. */
  @container (max-width: 10.499rem) {
    .ratio-side.corner .part-stepper {
      grid-template-columns: minmax(0, 1fr);
    }

    .ratio-side.corner .part-stepper button {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .ratio-side.corner .part-stepper input {
      padding-inline: 0.15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .part-stepper,
    .part-stepper button {
      transition: none;
    }
  }
</style>
