<!--
  PropChoiceRow - the app's inline prop choice: a roving radiogroup of prop
  image tiles, each named, for pages that offer props in place without opening
  the full PropSelectionSheet. Callers pass the props to offer, either as one
  list (`options`) or as labelled groups (`sections`) that sit side by side
  and wrap. `iconOnly` drops the visible names where height is short; each
  name stays the tile's accessible name and shows on hover. Arrow keys move
  through every tile in order, across groups. Began
  as the shop's deck PropPicker, which now wraps it.
-->
<script module lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  export interface PropChoiceSection {
    /** Shown over the group's tiles. */
    label?: string;
    props: readonly PropType[];
  }
</script>

<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";

  interface Props {
    value: PropType;
    onchange: (prop: PropType) => void;
    /** One ungrouped list of props. */
    options?: readonly PropType[];
    /** Labelled groups, in place of `options`. */
    sections?: readonly PropChoiceSection[];
    /** Accessible name of the group. */
    label: string;
    /** Images only: names move to the hover tooltip and screen readers. */
    iconOnly?: boolean;
  }

  let {
    value,
    onchange,
    options = [],
    sections,
    label,
    iconOnly = false,
  }: Props = $props();

  const groups = $derived<readonly PropChoiceSection[]>(
    sections ?? [{ props: options }]
  );
  const all = $derived(groups.flatMap((group) => group.props));

  const uid = $props.id();
  const optionId = (prop: PropType) => `${uid}-prop-${prop}`;

  // Roving radiogroup: arrows move selection, exactly one option tabbable.
  function onKeydown(e: KeyboardEvent) {
    const idx = all.indexOf(value);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (idx + 1) % all.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + all.length) % all.length;
    const target = next >= 0 ? all[next] : undefined;
    if (!target) return;
    e.preventDefault();
    onchange(target);
    document.getElementById(optionId(target))?.focus();
  }
</script>

{#snippet tiles(props: readonly PropType[])}
  {#each props as prop (prop)}
    {@const active = prop === value}
    <button
      type="button"
      id={optionId(prop)}
      class="prop-option"
      class:active
      class:icon-only={iconOnly}
      title={iconOnly ? localizedPropName(prop) : undefined}
      role="radio"
      aria-checked={active}
      tabindex={active || (!all.includes(value) && prop === all[0]) ? 0 : -1}
      onclick={() => onchange(prop)}
      onkeydown={onKeydown}
    >
      <img
        class="prop-img"
        src={getPropTypeDisplayInfo(prop).image}
        alt=""
        draggable="false"
      />
      <span class="prop-name">{localizedPropName(prop)}</span>
    </button>
  {/each}
{/snippet}

{#if sections}
  <div class="prop-sections" role="radiogroup" aria-label={label}>
    {#each groups as group, index (index)}
      <div class="prop-section" role="group" aria-label={group.label}>
        {#if group.label}
          <span class="section-label" aria-hidden="true">{group.label}</span>
        {/if}
        <div class="prop-grid">{@render tiles(group.props)}</div>
      </div>
    {/each}
  </div>
{:else}
  <div class="prop-grid" role="radiogroup" aria-label={label}>
    {@render tiles(options)}
  </div>
{/if}

<style>
  /* Groups sit side by side and wrap as whole groups; each group's tiles wrap
     inside it on a phone. */
  .prop-sections {
    display: flex;
    flex-wrap: wrap;
    justify-content: var(--prop-choice-justify, flex-start);
    gap: 14px 24px;
  }

  .prop-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .prop-section .prop-grid {
    justify-content: var(--prop-choice-justify, flex-start);
  }

  /* Grouped tiles keep one fixed width, so a group is exactly as wide as
     its tiles and only wraps when the line runs out. Hosts size them with
     the --prop-tile-* tokens. */
  .prop-sections .prop-grid {
    gap: var(--prop-tile-gap, 8px);
  }

  .prop-sections .prop-option {
    flex: 0 0 var(--prop-tile-width, 5rem);
    max-width: none;
    padding: 8px 4px 6px;
  }

  .prop-sections .prop-img {
    width: var(--prop-img-size, 30px);
    height: var(--prop-img-size, 30px);
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    text-align: var(--prop-choice-label-align, start);
  }

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
    line-height: 1.2;
    text-align: center;
  }

  /* The name keeps naming the tile for assistive tech; only the eye loses it. */
  .prop-option.icon-only {
    position: relative;
    gap: 0;
    justify-content: center;
    padding: 6px 4px;
  }
  .prop-option.icon-only .prop-name {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-option {
      transition: none;
    }
  }
</style>
