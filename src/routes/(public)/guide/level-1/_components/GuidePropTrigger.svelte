<script lang="ts">
  /**
   * The guide's prop choice button: the current prop's real button art and
   * name, opening the app-wide PropSelectionSheet the host renders. Shared by
   * the Codex companion controls and pages that switch their players' prop.
   */
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let {
    propType,
    expanded,
    onclick,
  }: {
    propType: PropType;
    /** Whether the sheet this button opens is open. */
    expanded: boolean;
    onclick: () => void;
  } = $props();

  const info = $derived(getPropTypeDisplayInfo(propType));
</script>

<button
  type="button"
  class="prop-trigger"
  {onclick}
  aria-haspopup="dialog"
  aria-expanded={expanded}
>
  <img class="prop-art" src={info.image} alt="" aria-hidden="true" />
  <span class="prop-name">{info.label}</span>
  <i class="fas fa-chevron-down" aria-hidden="true"></i>
</button>

<style>
  .prop-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  @media (hover: hover) and (pointer: fine) {
    .prop-trigger:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
  }
  .prop-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .prop-trigger .fa-chevron-down {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }
  .prop-art {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .prop-name {
    flex: 1;
    text-align: left;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
</style>
