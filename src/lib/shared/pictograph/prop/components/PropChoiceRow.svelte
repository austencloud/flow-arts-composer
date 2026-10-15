<!--
  PropChoiceRow - an inline prop choice: a roving radiogroup of prop image
  tiles, for pages that offer a short list of props in place without opening
  the full PropSelectionSheet. Callers pass the props to offer. Began as the
  shop's deck PropPicker, which now wraps it.
-->
<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

  interface Props {
    value: PropType;
    onchange: (prop: PropType) => void;
    options: readonly PropType[];
    /** Accessible name of the group. */
    label: string;
  }

  let { value, onchange, options, label }: Props = $props();

  const uid = $props.id();
  const optionId = (prop: PropType) => `${uid}-prop-${prop}`;

  // Roving radiogroup: arrows move selection, exactly one option tabbable.
  function onKeydown(e: KeyboardEvent) {
    const idx = options.indexOf(value);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (idx + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + options.length) % options.length;
    const target = next >= 0 ? options[next] : undefined;
    if (!target) return;
    e.preventDefault();
    onchange(target);
    document.getElementById(optionId(target))?.focus();
  }
</script>

<div class="prop-grid" role="radiogroup" aria-label={label}>
  {#each options as prop (prop)}
    {@const active = prop === value}
    {@const info = getPropTypeDisplayInfo(prop)}
    <button
      type="button"
      id={optionId(prop)}
      class="prop-option"
      class:active
      role="radio"
      aria-checked={active}
      tabindex={active ? 0 : -1}
      onclick={() => onchange(prop)}
      onkeydown={onKeydown}
    >
      <img class="prop-img" src={info.image} alt="" draggable="false" />
      <span class="prop-name">{info.label}</span>
    </button>
  {/each}
</div>

<style>
  .prop-grid {
    /* Compact tiles, left-aligned: 1fr tracks fattened each button to ~150px
       on wide columns. Wraps on narrow screens. */
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .prop-option {
    /* Wrap on the 88px base and grow to 104px, so a phone column takes three
       tiles a row where a 104px base left two and a gap. */
    flex: 1 1 88px;
    max-width: 104px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 8px 8px;
    border-radius: 12px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }
  .prop-option:hover {
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }
  .prop-option.active {
    border-color: #8b6cff;
    background: rgba(139, 108, 255, 0.12);
  }
  .prop-option:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .prop-img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    pointer-events: none;
  }

  .prop-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-option {
      transition: none;
    }
  }
</style>
