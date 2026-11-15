<!--
TypeGroupLabel.svelte - One-line type name above a section's tiles

Where the Types 4-6 panel is too short for SectionHeader's chip (phones), this
still says which tiles are Dash, Dual-Dash and Static: "Type 4 · Dash", with
the type word in its usual colour. The grouped layout planner reserves
TYPE_GROUP_LABEL_HEIGHT for it, so its height is fixed here.
-->
<script lang="ts" module>
  /** Line height plus the gap below it; the planner reserves exactly this. */
  export const TYPE_GROUP_LABEL_HEIGHT = 20;
  /** Narrowest section that still shows "Type 5 · Dual-Dash" whole. */
  export const TYPE_GROUP_LABEL_MIN_WIDTH = 120;
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { EMANATE_LEAD_MS } from "#lib/shared/transitions/emanate.js";
  import { getColoredTextParts } from "../../services/letter-type-text-painter";
  import {
    getTypeDescription,
    localizedTypeName,
  } from "../../services/section-title-formatter";

  const { letterType } = $props<{ letterType: string }>();

  const descriptor = $derived(getTypeDescription(letterType));
  const parts = $derived(
    descriptor ? getColoredTextParts(t(descriptor.translationKey)) : []
  );
</script>

{#if descriptor}
  <div
    class="type-group-label"
    in:flyFade|global={{ y: 6, delay: EMANATE_LEAD_MS }}
  >
    {localizedTypeName(descriptor)} ·
    {#each parts as part, i (i)}<span style:color={part.color}>{part.text}</span
      >{/each}
  </div>
{/if}

<style>
  .type-group-label {
    flex: 0 0 auto;
    width: 100%;
    height: 16px;
    margin-bottom: 4px;
    line-height: 16px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    letter-spacing: 0.01em;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: color-mix(
      in srgb,
      var(--option-header-text, currentColor) 72%,
      transparent
    );
  }
</style>
