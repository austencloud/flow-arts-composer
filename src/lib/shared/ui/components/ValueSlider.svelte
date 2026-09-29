<!--
  One labeled amount: a track and thumb with the current value in a box
  beside it, the way phone editors present zoom, speed or volume. The native
  range input owns the pointer, touch and keyboard behavior (arrows, Page
  keys, Home, End) and the slider semantics; `format` supplies the value text
  on screen and to assistive technology alike. Pressing the box types an
  exact value (TypeableValue), kept within `min` and `max`.

  The fill runs from `origin` to the value, so a bipolar amount such as a
  rotation fills out from zero and a speed fills out from 1×.

  `marks` puts diamonds on the track, such as a clip's keyframes on its
  scrubber, drawn like the timeline's keyframes and over the thumb, so the
  thumb resting on one lights it up. With `onmark` each diamond is also a
  button that goes to its value; the one under the thumb lets presses
  through, so the thumb stays easy to grab.

  Dense desktop tools that scrub a bare number use ScrubbableNumber instead.
-->
<script lang="ts">
  import { tick } from "svelte";
  import TypeableValue from "./TypeableValue.svelte";
  import { parseTypedNumber } from "../typed-number";

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** Where the fill starts; defaults to `min`. */
    origin?: number;
    format?: (value: number) => string;
    disabled?: boolean;
    /** Values along the track to mark with a diamond. */
    marks?: readonly number[];
    /** Makes each mark a button that goes to its value. */
    onmark?: (mark: number) => void;
    /** A mark button's name; defaults to its formatted value. */
    markLabel?: (mark: number) => string;
    /**
     * Turns a typed reading into the slider's value, for a track that does
     * not run in the units it shows: speed moves in doublings but reads ×.
     */
    fromTyped?: (typed: number) => number;
    onchange: (value: number) => void;
  }

  let {
    label,
    value,
    min,
    max,
    step,
    origin,
    format,
    disabled = false,
    marks = [],
    onmark,
    markLabel,
    fromTyped,
    onchange,
  }: Props = $props();

  const id = $props.id();

  const clamped = $derived(Math.min(max, Math.max(min, value)));
  const text = $derived(format ? format(clamped) : String(clamped));
  const ends = $derived(
    [min, max].map((end) => (format ? format(end) : String(end)))
  );
  /** The longer end's reading holds the box's width. */
  const widest = $derived(ends[0].length >= ends[1].length ? ends[0] : ends[1]);
  /** A track that reads below zero is typed with a minus. */
  const signed = $derived(/^\s*[-−]/.test(ends[0]));

  function fraction(amount: number): number {
    return max > min
      ? (Math.min(max, Math.max(min, amount)) - min) / (max - min)
      : 0;
  }

  const valueFraction = $derived(fraction(clamped));
  const originFraction = $derived(fraction(origin ?? min));

  /** The thumb rests on a mark within half a step of it. */
  function isOn(mark: number): boolean {
    return Math.abs(mark - clamped) <= step / 2 + 1e-9;
  }

  function nameOf(mark: number): string {
    if (markLabel) return markLabel(mark);
    return format ? format(mark) : String(mark);
  }

  /** A typed reading as the slider's value, or null when it has none. */
  function readTyped(typed: string): number | null {
    const reading = parseTypedNumber(typed);
    if (reading === null) return null;
    const next = fromTyped ? fromTyped(reading) : reading;
    return Number.isNaN(next) ? null : next;
  }

  function setTyped(next: number): void {
    onchange(Math.min(max, Math.max(min, next)));
  }

  async function handleInput(
    event: Event & { currentTarget: HTMLInputElement }
  ): Promise<void> {
    const input = event.currentTarget;
    const next = Number(input.value);
    if (!Number.isFinite(next)) return;
    onchange(next);
    // An owner can keep its value, at a limit it will not pass or when
    // nothing may change. The thumb then goes back to that value rather than
    // staying where the pointer left it.
    await tick();
    if (Number(input.value) !== clamped) input.value = String(clamped);
  }
</script>

<div class="value-slider" class:disabled>
  <span class="name" id="{id}-name">{label}</span>
  <div class="row">
    <div class="track">
      <input
        type="range"
        {min}
        {max}
        {step}
        value={clamped}
        {disabled}
        aria-labelledby="{id}-name"
        aria-valuetext={text}
        style:--from={Math.min(originFraction, valueFraction)}
        style:--to={Math.max(originFraction, valueFraction)}
        oninput={handleInput}
      />
      {#each marks as mark, index (index)}
        {#if onmark}
          <button
            type="button"
            class="mark"
            class:on={isOn(mark)}
            style:--at={fraction(mark)}
            aria-label={nameOf(mark)}
            aria-current={isOn(mark) || undefined}
            {disabled}
            onclick={() => onmark(mark)}
          >
            <span class="glyph" aria-hidden="true"></span>
          </button>
        {:else}
          <span
            class="mark"
            class:on={isOn(mark)}
            aria-hidden="true"
            style:--at={fraction(mark)}
          >
            <span class="glyph"></span>
          </span>
        {/if}
      {/each}
    </div>
    <span class="value">
      <TypeableValue
        {label}
        {text}
        parse={readTyped}
        sizer={widest}
        {signed}
        {disabled}
        oncommit={setTyped}
      />
    </span>
  </div>
</div>

<style>
  .value-slider {
    --thumb: 1.25rem;
    --track: 0.25rem;
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  .name {
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-weight: 500;
  }

  /* One box width for every slider, so stacked tracks end together. */
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .track {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .value {
    --typeable-min-width: 5rem;
    display: flex;
    flex: none;
  }

  /* On the thumb's path: half a thumb in from each end, as the fill is. A
     button mark is a touch target's width, centred on its value. */
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--at));
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translateX(-50%);
    pointer-events: none;
  }

  button.mark {
    pointer-events: auto;
    cursor: pointer;
  }

  /* The thumb sits under this one: presses go to the thumb. */
  button.mark.on,
  button.mark:disabled {
    pointer-events: none;
  }

  button.mark:focus-visible {
    outline: none;
  }

  /* The timeline's keyframe: near-white with a dark outline reads on the
     fill and the bare track alike. Under the thumb it takes the accent. */
  .glyph {
    box-sizing: border-box;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--theme-bg, #101018);
    border-radius: 3px;
    background: var(--theme-text, #fff);
    transform: rotate(45deg);
    transition:
      background-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .mark.on .glyph {
    background: var(--theme-accent, #d4813a);
    box-shadow: 0 0 0 2px var(--theme-text, #fff);
    transform: rotate(45deg) scale(1.2);
  }

  @media (hover: hover) {
    button.mark:hover .glyph {
      background: var(--theme-accent, #d4813a);
      transform: rotate(45deg) scale(1.2);
    }
  }

  button.mark:focus-visible .glyph {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 3px;
  }

  input {
    /* The fill's stops follow the thumb's centre, which travels half a
       thumb in from each end of the track. */
    --start: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--from));
    --end: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--to));
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: 100%;
    height: var(--min-touch-target, 44px);
    margin: 0;
    background: transparent;
    cursor: pointer;
  }

  input:disabled {
    cursor: not-allowed;
  }

  input:focus-visible {
    outline: none;
  }

  input::-webkit-slider-runnable-track {
    height: var(--track);
    border-radius: 999px;
    background: linear-gradient(
      to right,
      var(--theme-stroke, #484755) var(--start),
      var(--theme-accent, #d4813a) var(--start),
      var(--theme-accent, #d4813a) var(--end),
      var(--theme-stroke, #484755) var(--end)
    );
  }

  input::-moz-range-track {
    height: var(--track);
    border-radius: 999px;
    background: linear-gradient(
      to right,
      var(--theme-stroke, #484755) var(--start),
      var(--theme-accent, #d4813a) var(--start),
      var(--theme-accent, #d4813a) var(--end),
      var(--theme-stroke, #484755) var(--end)
    );
  }

  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: var(--thumb);
    height: var(--thumb);
    margin-top: calc((var(--track) - var(--thumb)) / 2);
    border: 2px solid var(--theme-accent, #d4813a);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.45);
  }

  input::-moz-range-thumb {
    box-sizing: border-box;
    width: var(--thumb);
    height: var(--thumb);
    border: 2px solid var(--theme-accent, #d4813a);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.45);
  }

  input:focus-visible::-webkit-slider-thumb {
    box-shadow:
      0 0 0 2px var(--theme-panel-bg, #111),
      0 0 0 4px var(--theme-text, #fff);
  }

  input:focus-visible::-moz-range-thumb {
    box-shadow:
      0 0 0 2px var(--theme-panel-bg, #111),
      0 0 0 4px var(--theme-text, #fff);
  }

  .disabled {
    opacity: 0.5;
  }

  @media (forced-colors: active) {
    input {
      forced-color-adjust: none;
    }

    input::-webkit-slider-runnable-track {
      background: ButtonText;
    }

    input::-moz-range-track {
      background: ButtonText;
    }

    input::-webkit-slider-thumb {
      border-color: ButtonText;
      background: ButtonFace;
    }

    input::-moz-range-thumb {
      border-color: ButtonText;
      background: ButtonFace;
    }

    input:focus-visible::-webkit-slider-thumb {
      box-shadow: 0 0 0 3px Highlight;
    }

    input:focus-visible::-moz-range-thumb {
      box-shadow: 0 0 0 3px Highlight;
    }

    .glyph {
      forced-color-adjust: none;
      border-color: ButtonFace;
      background: ButtonText;
    }

    .mark.on .glyph {
      background: Highlight;
      box-shadow: 0 0 0 2px ButtonText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph {
      transition: none;
    }
  }
</style>
