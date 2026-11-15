<!--
  StagePauseButton.svelte — the one pause / play control for a moving piece in
  Browse > Visuals: round, 44px, icon only, with a translated name. The front
  page stage and the piece page both use it, for tunnels and mandalas alike.
  The host places it (bottom right of a stage, or top right) and does not draw
  it at all under reduced motion.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    playing,
    onToggle,
  }: { playing: boolean; onToggle: () => void } = $props();
</script>

<button
  type="button"
  class="stage-pause"
  aria-label={playing ? t("viewer_detail_pause") : t("viewer_detail_play")}
  onclick={onToggle}
>
  <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
</button>

<style>
  .stage-pause {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.62);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  @media (hover: hover) {
    .stage-pause:hover {
      background: rgba(0, 0, 0, 0.8);
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
      color: white;
    }
  }

  .stage-pause:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-pause {
      transition: none;
    }
  }
</style>
