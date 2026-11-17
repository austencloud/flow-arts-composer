<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import TypeableValue from "#lib/shared/ui/components/TypeableValue.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    GRID_FINE_STEP_SECONDS,
    MIN_MOVE_SECONDS,
    steppedGridOffset,
  } from "#lib/shared/media-composition/domain/take-timing.js";
  import { formatGridOffset, gridOffsetDraft } from "./post-builder-format";

  /**
   * Whole grid: how far a part's beats sit off its taps. The arrows slide
   * it 10 ms a press (a frame with Shift) and the box takes a typed number.
   * The Timing step and the editor's Nudge beats panel both show it; in the
   * editor it works while the post plays with its song.
   */
  let {
    offsetSeconds,
    onchange,
    disabled = false,
  }: {
    offsetSeconds: number;
    onchange: (seconds: number) => void;
    disabled?: boolean;
  } = $props();

  function step(direction: -1 | 1, event: MouseEvent): void {
    const size = event.shiftKey ? MIN_MOVE_SECONDS : GRID_FINE_STEP_SECONDS;
    onchange(steppedGridOffset(offsetSeconds, direction * size));
  }
</script>

<div class="grid-offset">
  <div class="paired">
    <PanelButton
      onclick={(event) => step(-1, event)}
      {disabled}
      ariaLabel="Grid 10 ms earlier"
    >
      <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      10 ms
    </PanelButton>
    <TypeableValue
      label={t("share_studio_deep_whole_grid")}
      text={offsetSeconds !== 0
        ? formatGridOffset(offsetSeconds)
        : t("share_studio_deep_on_taps")}
      draft={gridOffsetDraft(offsetSeconds)}
      unit="s"
      signed
      {disabled}
      oncommit={onchange}
    />
    <PanelButton
      onclick={(event) => step(1, event)}
      {disabled}
      ariaLabel="Grid 10 ms later"
    >
      10 ms
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </PanelButton>
  </div>
  <p class="help">
    Shift steps one frame. The export shows a change only where it carries a
    landing across a frame (33 ms).
  </p>
</div>

<style>
  .grid-offset {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .paired {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
  }
  .help {
    margin: 0;
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
    line-height: 1.4;
  }
</style>
