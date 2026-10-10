<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    DEFAULT_FAN_APPEARANCE,
    fanAppearanceArtwork,
    fanAppearanceSignature,
    isFanPropType,
    normalizeFanAppearance,
    type FanAppearance,
  } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getRailPropGlyphPresentation } from "./rail-prop-optical-fit";

  let {
    propType,
    size = 24,
    fanAppearance = DEFAULT_FAN_APPEARANCE,
  }: {
    propType: PropType;
    size?: number;
    fanAppearance?: FanAppearance;
  } = $props();

  const resolvedFanAppearance = $derived(normalizeFanAppearance(fanAppearance));
  const presentation = $derived(getRailPropGlyphPresentation(propType));
  const propImage = $derived(
    (isFanPropType(propType)
      ? fanAppearanceArtwork(
          resolvedFanAppearance.build,
          resolvedFanAppearance.cover
        )
      : null) ?? getPropTypeDisplayInfo(propType).image
  );
  const artworkKey = $derived(
    isFanPropType(propType)
      ? `${propType}:${fanAppearanceSignature(resolvedFanAppearance)}`
      : propType
  );
</script>

<!-- The slot never changes size. A prop swap changes its meaning, not the rail's geometry. -->
<span
  class="rail-prop-glyph"
  style:--rail-prop-glyph-size={`${size}px`}
  aria-hidden="true"
>
  <Crossfade key={artworkKey} duration={DURATION.fast} fill>
    <span
      class="rail-prop-art"
      style:--rail-prop-image={`url("${propImage}")`}
      style:transform={`translate(${presentation.translateX}%, ${presentation.translateY}%) rotate(${presentation.rotation}deg) scale(${presentation.scale})`}
    ></span>
  </Crossfade>
</span>

<style>
  .rail-prop-glyph {
    position: relative;
    display: block;
    width: var(--rail-prop-glyph-size);
    height: var(--rail-prop-glyph-size);
    flex: 0 0 auto;
    /* Optical fitting may intentionally extend beyond this stable measuring
       slot. The button is the visual boundary; clipping here amputates wide
       shapes such as Mini Hoop and the physical fan builds. */
    overflow: visible;
  }

  .rail-prop-glyph :global(.layer) {
    display: grid;
    place-items: center;
  }

  .rail-prop-art {
    display: block;
    width: 100%;
    height: 100%;
    background: currentColor;
    -webkit-mask: var(--rail-prop-image) center / contain no-repeat;
    mask: var(--rail-prop-image) center / contain no-repeat;
    opacity: 0.96;
    transform-origin: center;
  }
</style>
