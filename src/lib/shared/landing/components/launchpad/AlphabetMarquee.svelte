<!--
  AlphabetMarquee.svelte

  Living media for the homepage Alphabet tile: a slow, single-row marquee of
  every real TKA letter, rendered in the TKA Letters webfont (real, typeable
  glyphs — see src/styles/tka-font.css and the /test/tka-font harness this
  typing convention is exercised at).

  Modeled directly on the established marquee pattern in
  src/lib/features/learn/play/components/previews/LetterStreamPreview.svelte
  (doubled content array + translateX(-50%) loop, [prefers-reduced-motion]
  freeze) rather than hand-rolling a new one — slowed to a single row per
  this tile's "slow strip" brief instead of that component's dual-row race.

  The 47-letter set and its typed forms are the real TKA dataframe: Type1
  (A-V) types directly; Type2 shift (W-Z + uppercase Greek names); Type3
  cross-shift (base + "-"); Type4/5 dash (Greek dash names); Type6 static
  (lowercase Greek names). Verified against
  mcp__Flow_Arts_Knowledge__list_available_letters and cross-checked against
  the typed-form convention documented in tka-font.css / exercised at
  /test/tka-font (identical token strings, e.g. "Sigma-", "alpha").
-->
<script lang="ts">
  const LETTERS = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "Sigma",
    "Delta",
    "Theta",
    "Omega",
    "W-",
    "X-",
    "Y-",
    "Z-",
    "Sigma-",
    "Delta-",
    "Theta-",
    "Omega-",
    "Phi",
    "Psi",
    "Lambda",
    "Phi-",
    "Psi-",
    "Lambda-",
    "alpha",
    "beta",
    "gamma",
  ];
</script>

<div class="alphabet-strip" aria-hidden="true">
  <div class="track">
    {#each [...LETTERS, ...LETTERS] as letter, i (i)}
      <span class="tka-font">{letter}</span>
    {/each}
  </div>
</div>

<style>
  .alphabet-strip {
    width: 100%;
    height: 100%;
    container-type: inline-size;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .track {
    display: inline-flex;
    align-items: center;
    gap: 3.4cqi;
    padding-inline: 2cqi;
    white-space: nowrap;
    animation: alphabet-stream 48s linear infinite;
    will-change: transform;
  }
  .track span {
    font-size: 15cqi;
    line-height: 1;
    color: var(--c);
    opacity: 0.5;
    text-shadow: 0 0 14px color-mix(in srgb, var(--c) 40%, transparent);
  }

  @keyframes alphabet-stream {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track {
      animation: none;
    }
  }

  /* 4K tier: the tile grows via LaunchpadTile's own ramp, so the cqi-sized
	   glyphs already scale with it — this nudges gap/opacity to match the
	   slightly heavier type treatment the rest of the tile gets at this tier. */
  @media (min-width: 2200px) {
    .track {
      gap: 4cqi;
    }
    .track span {
      opacity: 0.58;
    }
  }
</style>
