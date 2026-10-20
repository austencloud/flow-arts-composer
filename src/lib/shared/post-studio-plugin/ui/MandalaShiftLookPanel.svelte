<script lang="ts">
  /**
   * How a shifting mandala moves and looks: when it shifts and whether the
   * morph runs steadily or lands on the beat, then the line shape, colours,
   * weight, breath (its own switch, with Off) and spin. Every choice is a
   * visible button; the parent applies each patch.
   */
  import {
    MANDALA_BREATH_BEATS,
    MANDALA_LINE_WEIGHTS,
    MANDALA_SHIFT_EVERY,
    MANDALA_SHIFT_MORPH,
    MANDALA_SPINS,
    MandalaLookPresetSchema,
    type MandalaLook,
    type MandalaShift,
  } from "#lib/shared/mandala/domain/mandala-shift-types.js";
  import { shiftPace } from "#lib/shared/mandala/services/mandala-shift.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

  let {
    shift,
    look,
    onShift,
    onLook,
    locked = false,
    gridNote = null,
  }: {
    shift: MandalaShift;
    look: MandalaLook;
    onShift: (patch: Partial<MandalaShift>) => void;
    onLook: (patch: Partial<MandalaLook>) => void;
    locked?: boolean;
    /** Shown over the shift controls when the post has no beat grid. */
    gridNote?: string | null;
  } = $props();

  const num = (value: number) => String(value);
  const EVERY = MANDALA_SHIFT_EVERY.map((every) => ({
    value: num(every),
    label: num(every),
  }));
  const UNITS = [
    { value: "bars", label: "Bars" },
    { value: "beats", label: "Beats" },
  ] as const;
  const PACES = [
    { value: "steady", label: "Steady" },
    { value: "land", label: "Land on the beat" },
  ] as const;
  const MORPH = MANDALA_SHIFT_MORPH.map((morph) => ({
    value: num(morph),
    label: `${morph} ${morph === 1 ? "beat" : "beats"}`,
  }));
  const SHAPES = [
    { value: "arc", label: "Arc" },
    { value: "linear", label: "Linear" },
    { value: "concave", label: "Concave" },
    { value: "hybrid", label: "Hybrid" },
  ] as const;
  const COLOR_MODES = [
    { value: "flow", label: "Flowing" },
    { value: "solid", label: "Solid" },
  ] as const;
  const PRESETS = MandalaLookPresetSchema.options.map((preset) => ({
    value: preset,
    label: preset.charAt(0).toUpperCase() + preset.slice(1),
  }));
  const WEIGHT_NAMES: Record<string, string> = {
    "1.5": "Fine",
    "2.5": "Regular",
    "4": "Bold",
  };
  const WEIGHTS = MANDALA_LINE_WEIGHTS.map((weight) => ({
    value: num(weight),
    label: WEIGHT_NAMES[num(weight)] ?? num(weight),
  }));
  const BREATHS = MANDALA_BREATH_BEATS.map((beats) => ({
    value: num(beats),
    label: beats === 0 ? "Off" : `${beats} ${beats === 1 ? "beat" : "beats"}`,
  }));
  const pace = $derived(shiftPace(shift));
  const breathing = $derived(look.breathBeats > 0);
  const SPINS = MANDALA_SPINS.map((spin) => ({
    value: num(spin),
    label: spin === 0 ? "None" : `${spin}°`,
  }));

  const percent = (value: number) => `${Math.round(value)}%`;
</script>

<div class="mandala-look">
  <section class="group" aria-label="Shift">
    <span class="group-name">Shift every</span>
    <div class="pair">
      <SegmentedControl
        color="accent"
        size="sm"
        options={EVERY}
        value={num(shift.every)}
        onchange={(value) =>
          onShift({ every: Number(value) as MandalaShift["every"] })}
        ariaLabel="Shift every"
      />
      <SegmentedControl
        color="accent"
        size="sm"
        options={[...UNITS]}
        value={shift.unit}
        onchange={(unit) => onShift({ unit })}
        ariaLabel="Bars or beats"
      />
    </div>
    <span class="group-name">Pace</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={[...PACES]}
      value={pace}
      onchange={(value) => onShift({ pace: value })}
      ariaLabel="Pace"
    />
    {#if pace === "land"}
      <span class="group-name">Morph over</span>
      <SegmentedControl
        color="accent"
        size="sm"
        options={MORPH}
        value={num(shift.morph)}
        onchange={(value) =>
          onShift({ morph: Number(value) as MandalaShift["morph"] })}
        ariaLabel="Morph over"
      />
    {/if}
    {#if gridNote}
      <p class="hint">{gridNote}</p>
    {/if}
  </section>

  <section class="group" aria-label="Lines">
    <span class="group-name">Shape</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={[...SHAPES]}
      value={look.shape}
      onchange={(shape) => onLook({ shape })}
      ariaLabel="Line shape"
    />
    <span class="group-name">Weight</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={WEIGHTS}
      value={num(look.lineWeight)}
      onchange={(value) =>
        onLook({ lineWeight: Number(value) as MandalaLook["lineWeight"] })}
      ariaLabel="Line weight"
    />
  </section>

  <section class="group" aria-label="Colours">
    <span class="group-name">Colours</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={[...COLOR_MODES]}
      value={look.colorMode}
      onchange={(colorMode) => onLook({ colorMode })}
      ariaLabel="Colour mode"
    />
    <SegmentedControl
      color="accent"
      size="sm"
      columns={3}
      options={PRESETS}
      value={look.preset}
      onchange={(preset) => onLook({ preset })}
      ariaLabel="Colour preset"
    />
  </section>

  <section class="group" aria-label="Breath">
    <span class="group-name">Breath</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={BREATHS}
      value={num(look.breathBeats)}
      onchange={(value) =>
        onLook({ breathBeats: Number(value) as MandalaLook["breathBeats"] })}
      ariaLabel="Breath length"
    />
    {#if breathing}
      <ValueSlider
        label="Depth"
        value={look.depth}
        min={0}
        max={100}
        step={5}
        format={percent}
        disabled={locked}
        onchange={(depth) => onLook({ depth })}
      />
    {/if}
  </section>

  <section class="group" aria-label="Spin">
    <span class="group-name">Spin per bar</span>
    <SegmentedControl
      color="accent"
      size="sm"
      options={SPINS}
      value={num(look.spinPerBar)}
      onchange={(value) =>
        onLook({ spinPerBar: Number(value) as MandalaLook["spinPerBar"] })}
      ariaLabel="Spin per bar"
    />
  </section>
</div>

<style>
  .mandala-look {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .group-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.5rem;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
