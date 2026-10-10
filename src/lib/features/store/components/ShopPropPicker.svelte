<!--
  Exactly-one prop chip row for the shop pages (listing configurator + Deck
  Architect). One surface per chip, the prop art directly inside — no frame
  boxes. Art ships in per-prop stroke colors that vanish on dark chips, so
  it's flattened to light silhouettes.
-->
<script lang="ts">
  import {
    SHOP_PROP_OPTIONS,
    shopPropImage,
    shopPropLabel,
  } from "../domain/shop-prop-options";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  interface Props {
    value: PropType;
    onchange: (prop: PropType) => void;
  }
  let { value, onchange }: Props = $props();
</script>

<div class="prop-row" role="radiogroup" aria-label="Prop">
  {#each SHOP_PROP_OPTIONS as p (p)}
    <button
      type="button"
      class="prop-chip"
      class:selected={value === p}
      role="radio"
      aria-checked={value === p}
      onclick={() => onchange(p)}
    >
      <img class="prop-chip-img" src={shopPropImage(p)} alt="" draggable="false" />
      <span class="prop-chip-label">{shopPropLabel(p)}</span>
    </button>
  {/each}
</div>

<style>
  .prop-row {
    container-type: inline-size;
    container-name: prop-row;
    display: flex;
    /* Wrapping never fires at desktop widths — every chip has a 0 flex-basis,
       so five of them always fit one line. It exists for the narrow case below. */
    flex-wrap: wrap;
    justify-content: center;
    gap: clamp(4px, 1vw, 8px);
    width: 100%;
    min-width: 0;
  }
  .prop-chip {
    flex: 1 1 0;
    min-width: 0;
    max-width: 112px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 4px 7px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
  }
  .prop-chip:hover {
    border-color: rgba(216, 180, 254, 0.55);
  }
  .prop-chip:active {
    transform: scale(0.97);
  }
  .prop-chip:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .prop-chip.selected {
    border-color: #d8b4fe;
    background: linear-gradient(135deg, #a855f7 0%, #9333ea 50%, #7e22ce 100%);
    box-shadow: 0 4px 14px rgba(147, 51, 234, 0.35);
  }
  .prop-chip-img {
    width: 42px;
    height: 42px;
    object-fit: contain;
    pointer-events: none;
    filter: brightness(0) invert(0.9) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
  }
  .prop-chip.selected .prop-chip-img {
    filter: brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
  }
  .prop-chip-label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 13px);
    font-weight: 700;
  }
  /* Narrow row: five chips across leaves ~47px for a label and clips "Buugeng"
     to "Buug…". The prop name is the whole point of the chip, so the row takes
     a second line instead. Container query, not a viewport one: the same picker
     sits in a wide panel on the Architect and a narrow tile on the listing. */
  @container prop-row (max-width: 22rem) {
    .prop-chip {
      flex: 1 1 27%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-chip {
      transition: none;
    }
  }
</style>
