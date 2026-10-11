<!--
  LoopChips — display-only, color-coded LOOP component badges for a deck flavor.
  Colors/icons come from LOOP_COMPONENT_MAP (the canonical mapping shared with
  the card back and the LOOP filter strip). Never interactive (a *Badge*, not a
  filter chip — see chip-primitives keep-separate).

  AAA: near-white label on a dark tinted chip so every brand color reads,
  including the dark mirrored purple. Color identity lives in the icon + border.
-->
<script lang="ts">
  import { LOOP_COMPONENT_MAP } from "#lib/shared/browse/domain/constants/loop-constants.js";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import CheckerboardCircleIcon from "#lib/shared/icons/CheckerboardCircleIcon.svelte";

  interface Props {
    /** LOOP component ids (enum string values, e.g. "mirrored"). */
    components: readonly string[];
    size?: "sm" | "md";
    /** Same semantics as LOOPIconStrip: quartered swaps Rotated to
     *  fa-arrows-spin / Inverted to the checkerboard glyph. Undefined keeps
     *  the halved-default icons, so existing callers render unchanged. */
    rotationPeriod?: Period;
    inversionPeriod?: Period;
  }
  let {
    components,
    size = "md",
    rotationPeriod,
    inversionPeriod,
  }: Props = $props();

  const infos = $derived(
    components
      .map((c) => LOOP_COMPONENT_MAP.get(c as LOOPComponent))
      .filter((i): i is NonNullable<typeof i> => i != null)
  );

  const quarteredRotation = $derived(rotationPeriod === Period.QUARTERED);
  const quarteredInversion = $derived(inversionPeriod === Period.QUARTERED);
</script>

<span class="loop-chips" class:sm={size === "sm"}>
  {#each infos as info (info.component)}
    {@const quarteredLabel =
      info.component === LOOPComponent.ROTATED && quarteredRotation
        ? "Rotated (quartered)"
        : info.component === LOOPComponent.INVERTED && quarteredInversion
          ? "Inverted (quartered)"
          : undefined}
    <span
      class="loop-chip"
      style:--c={info.color}
      title={quarteredLabel}
      aria-label={quarteredLabel}
    >
      {#if info.component === LOOPComponent.INVERTED && quarteredInversion}
        <CheckerboardCircleIcon size="1em" color={info.color} />
      {:else}
        <i
          class="fas fa-{info.component === LOOPComponent.ROTATED &&
          quarteredRotation
            ? 'arrows-spin'
            : info.icon}"
          aria-hidden="true"
        ></i>
      {/if}
      <span>{info.shortLabel}</span>
    </span>
  {/each}
</span>

<style>
  .loop-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .loop-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #eef2fb;
    background: color-mix(in srgb, var(--c) 24%, #0c0f1a);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
    white-space: nowrap;
  }

  .loop-chip i {
    color: color-mix(in srgb, var(--c) 62%, white);
  }

  .sm .loop-chip {
    font-size: 0.66rem;
    padding: 2px 7px;
    gap: 4px;
  }
</style>
