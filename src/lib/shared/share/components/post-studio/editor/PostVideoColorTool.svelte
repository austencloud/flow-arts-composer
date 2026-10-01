<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import type { PostVideoColorGrade } from "$lib/shared/media-composition/domain/post-video-color-grade";

  interface Props {
    grade?: PostVideoColorGrade;
    locked: boolean;
    grading: boolean;
    error: string;
    onAuto: () => void;
    onReset: () => void;
    onChange: (field: keyof PostVideoColorGrade, value: number) => void;
  }

  let { grade, locked, grading, error, onAuto, onReset, onChange }: Props =
    $props();

  const percent = (value: number) => `${Math.round(value)}%`;
  const degrees = (value: number) => `${Math.round(value)}°`;
</script>

<div class="color-tool">
  <div class="actions">
    <PanelButton onclick={onAuto} disabled={locked || grading}>
      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
      {grading ? "Analyzing video…" : "Auto adjust color"}
    </PanelButton>
    {#if grade}
      <PanelButton onclick={onReset} disabled={locked || grading}>
        Original color
      </PanelButton>
    {/if}
  </div>
  {#if error}<p class="status" role="status">{error}</p>{/if}
  <ValueSlider
    label="Brightness"
    value={(grade?.brightness ?? 1) * 100}
    min={50}
    max={150}
    step={1}
    origin={100}
    format={percent}
    disabled={locked || grading}
    onchange={(value) => onChange("brightness", value / 100)}
  />
  <ValueSlider
    label="Contrast"
    value={(grade?.contrast ?? 1) * 100}
    min={50}
    max={150}
    step={1}
    origin={100}
    format={percent}
    disabled={locked || grading}
    onchange={(value) => onChange("contrast", value / 100)}
  />
  <ValueSlider
    label="Saturation"
    value={(grade?.saturation ?? 1) * 100}
    min={0}
    max={200}
    step={1}
    origin={100}
    format={percent}
    disabled={locked || grading}
    onchange={(value) => onChange("saturation", value / 100)}
  />
  <ValueSlider
    label="Hue"
    value={grade?.hue ?? 0}
    min={-180}
    max={180}
    step={1}
    origin={0}
    format={degrees}
    disabled={locked || grading}
    onchange={(value) => onChange("hue", value)}
  />
</div>

<style>
  .color-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .status {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
