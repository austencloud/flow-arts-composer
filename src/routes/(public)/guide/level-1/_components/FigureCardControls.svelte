<script lang="ts">
  /**
   * The figure card's two controls (2026-11-12 Staff Motions review):
   * Replay plays the card once from Start; ½× halves the speed of every
   * figure card on the page, the play in progress included.
   *
   * They sit on the figure's bottom corners, just above its progress line,
   * as a media player's do, instead of in a band of their own between the
   * figure and its strip (Austen, 2026-11-12: the band "feels weird and out
   * of place"; it split the figure from the strip that spells it out). The
   * card spends no height on them, so the figure is larger.
   *
   * Both are GuideFigureButton glyphs in the guide's ink palette. Replay is
   * its icon alone, with the player's replay words as its name and tooltip;
   * the icon is inline SVG, not the icon font, which public pages load late.
   */
  import { faRotateRight } from "@austencloud/video-editor/icons";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideFigureButton from "./GuideFigureButton.svelte";
  import { guideHalfSpeed } from "./guide-half-speed.svelte";

  let {
    onreplay,
    disabled = false,
  }: {
    onreplay: () => void;
    /** The player has not loaded yet. */
    disabled?: boolean;
  } = $props();
</script>

<div class="card-controls">
  <GuideFigureButton
    size="glyph"
    icon={faRotateRight}
    ariaLabel={t("learn_lesson_pictograph_replay")}
    title={t("viewer_ui_replay")}
    {disabled}
    onclick={onreplay}
  />
  <GuideFigureButton
    size="glyph"
    label="½×"
    ariaLabel={t("viewer_detail_half_speed")}
    title={t("viewer_detail_half_speed")}
    pressed={guideHalfSpeed.on}
    onclick={() => (guideHalfSpeed.on = !guideHalfSpeed.on)}
  />
</div>

<style>
  /* Laid over the canvas box's bottom edge. The row itself lets pointers
     through, so the progress line between the two keeps its grab area.
     The player's canvas is dark in both page themes, so the glyphs take the
     dark page's ink and ground, not the page's: on the light page, its cream
     ground made grey blobs on the dark canvas. */
  .card-controls {
    --ink: #ececf2;
    --guide-plate: var(--guide-canvas, oklch(0.13 0.015 270));
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 4;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0 6px 8px;
    pointer-events: none;
  }
  .card-controls > :global(.figure-btn) {
    pointer-events: auto;
  }
</style>
