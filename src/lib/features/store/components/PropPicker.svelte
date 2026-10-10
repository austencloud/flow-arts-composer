<!--
  PropPicker — the buyer's print-prop choice on deck configurators. A roving
  radiogroup of prop image buttons (same interaction pattern as the flavor /
  volume pickers on the configurator pages). Options come from the limited
  shop offering (shop-prop-options), not the full app prop taxonomy.
-->
<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    SHOP_PROP_OPTIONS,
    shopPropImage,
    shopPropLabel,
  } from "../domain/shop-prop-options";

  interface Props {
    value: PropType;
    onchange: (prop: PropType) => void;
    options?: readonly PropType[];
  }

  let { value, onchange, options = SHOP_PROP_OPTIONS }: Props = $props();

  // Roving radiogroup: arrows move selection, exactly one option tabbable.
  function onKeydown(e: KeyboardEvent) {
    const idx = options.indexOf(value);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    const target = next >= 0 ? options[next] : undefined;
    if (!target) return;
    e.preventDefault();
    onchange(target);
    document.getElementById(`shop-prop-${target}`)?.focus();
  }
</script>

<div class="prop-grid" role="radiogroup" aria-label="Prop">
  {#each options as prop (prop)}
    {@const active = prop === value}
    <button
      type="button"
      id="shop-prop-{prop}"
      class="prop-option"
      class:active
      role="radio"
      aria-checked={active}
      tabindex={active ? 0 : -1}
      onclick={() => onchange(prop)}
      onkeydown={onKeydown}
    >
      <img class="prop-img" src={shopPropImage(prop)} alt="" draggable="false" />
      <span class="prop-name">{shopPropLabel(prop)}</span>
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
    flex: 0 1 104px;
    min-width: 88px;
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
    transition: border-color 0.15s ease, background 0.15s ease;
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
