<!--
  One labeled amount: a track and thumb with the current value shown beside
  its name, the way phone editors present zoom, speed or volume. The native
  range input owns the pointer, touch and keyboard behavior (arrows, Page
  keys, Home, End) and the slider semantics; `format` supplies the value text
  on screen and to assistive technology alike.

  The fill runs from `origin` to the value, so a bipolar amount such as a
  rotation fills out from zero and a speed fills out from 1×.

  Dense desktop tools that scrub a bare number use ScrubbableNumber instead.
-->
<script lang="ts">
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
    onchange,
  }: Props = $props();

  const id = $props.id();

  const clamped = $derived(Math.min(max, Math.max(min, value)));
  const text = $derived(format ? format(clamped) : String(clamped));

  function fraction(amount: number): number {
    return max > min
      ? (Math.min(max, Math.max(min, amount)) - min) / (max - min)
      : 0;
  }

  const valueFraction = $derived(fraction(clamped));
  const originFraction = $derived(fraction(origin ?? min));

  function handleInput(
    event: Event & { currentTarget: HTMLInputElement }
  ): void {
    const next = Number(event.currentTarget.value);
    if (Number.isFinite(next)) onchange(next);
  }
</script>

<div class="value-slider" class:disabled>
  <div class="head">
    <span class="name" id="{id}-name">{label}</span>
    <span class="reading" aria-hidden="true">{text}</span>
  </div>
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
</div>

<style>
  .value-slider {
    --thumb: 1.25rem;
    --track: 0.25rem;
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
  }

  .name {
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .reading {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
  }
</style>
