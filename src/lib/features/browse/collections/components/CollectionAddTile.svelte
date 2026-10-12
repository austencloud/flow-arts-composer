<script lang="ts">
  interface Props {
    label: string;
    hint: string;
    icon: string;
    onclick: () => void;
    ariaLabel?: string;
  }

  let { label, hint, icon, onclick, ariaLabel }: Props = $props();
</script>

<button type="button" class="add-tile" {onclick} aria-label={ariaLabel}>
  <span class="add-icon">
    <i class="fas {icon}" aria-hidden="true"></i>
  </span>
  <span class="add-copy">
    <span class="add-label">{label}</span>
    <span class="add-hint">{hint}</span>
  </span>
</button>

<style>
  .add-tile {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 72px;
    padding: 14px 16px;
    text-align: left;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px dashed var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    font: inherit;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .add-tile:hover {
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 6%,
      var(--theme-card-bg)
    );
  }

  .add-tile:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .add-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex-shrink: 0;
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 14%,
      transparent
    );
    font-size: var(--font-size-sm, 14px);
  }

  .add-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .add-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .add-hint {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .add-tile {
      transition: none;
    }
  }
</style>
