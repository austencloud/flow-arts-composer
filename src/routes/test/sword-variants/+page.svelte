<script lang="ts">
  import { onMount } from "svelte";
  import {
    applyColorToSvg,
    applyMotionColorToSvg,
    getMotionColor,
    SELECTIVE_COLOR_PROP_TYPES,
  } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  type Variant = { id: string; label: string; note: string; file: string };
  type Concept = Variant & { parent: string; tradeoff: string };

  // Stage 1 of the energy-saber spec: three comparable concepts, no prop enum,
  // no picker entry, no premium behavior. Assets live under variants/ only.
  const concepts: Concept[] = [
    {
      id: "energy-core",
      label: "A. Core",
      parent: "Sword",
      note: "Straight capsule blade, narrow pale core, one restrained halo. Compact emitter, two grip bands.",
      tradeoff:
        "Clearest read at picker size, but the least distinctive of the three.",
      file: "/images/props/variants/sword-energy-core.svg",
    },
    {
      id: "energy-rift",
      label: "B. Rift",
      parent: "Sword",
      note: "Rigid straight centerline inside an irregular plasma envelope. Two short edge forks, one stable tip.",
      tradeoff:
        "Strongest personality of the single-blade pair; the irregular edge is what degrades first in the 52px tile.",
      file: "/images/props/variants/sword-energy-rift.svg",
    },
    {
      id: "energy-twin",
      label: "C. Twin",
      parent: "Staff",
      note: "Centered grip, two equal 176-unit blades. Thumb end is a long flared collar with three rings; pinky end is a short domed collar with one.",
      tradeoff:
        "Only concept that changes physical behavior: it needs staff placement and two-tip tracking, and the ends must stay visually distinct.",
      file: "/images/props/variants/staff-energy-twin.svg",
    },
  ];

  const variants: Variant[] = [
    {
      id: "current",
      label: "Current (flat)",
      note: "Today's asset: flat gray hardware, flat gold blade. Reference.",
      file: "/images/props/sword.svg",
    },
    {
      id: "knight",
      label: "Knight (new geometry)",
      note: "Tapered double-edge blade to a point, tall flared cross-guard, ringed grip, disc pommel.",
      file: "/images/props/variants/sword-knight.svg",
    },
    {
      id: "saber",
      label: "Saber (new geometry)",
      note: "Curved single-edge kevlar wick, tall oval tsuba, diamond-wrapped grip, angled kashira cap.",
      file: "/images/props/variants/sword-saber.svg",
    },
    {
      id: "flamberge",
      label: "Flamberge (new geometry)",
      note: "Undulating flame-wave blade (reads as fire even small), swept lens guard, teardrop pommel.",
      file: "/images/props/variants/sword-flamberge.svg",
    },
    {
      id: "claymore",
      label: "Claymore (new geometry)",
      note: "Massive straight blade, forward-sloping quillons with ring terminals, wheel pommel.",
      file: "/images/props/variants/sword-claymore.svg",
    },
    {
      id: "khopesh",
      label: "Khopesh (new geometry)",
      note: "Straight base hooking into a forward sickle. Unmistakable silhouette.",
      file: "/images/props/variants/sword-khopesh.svg",
    },
  ];

  // Sword is in the selective-color list, so match the real prop pipeline.
  const selective = (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
    "sword"
  );

  type Rendered = { raw: string; left: string; right: string; compact: string };
  let rendered = $state<Record<string, Rendered>>({});
  let failed = $state<Record<string, string>>({});
  let darkBg = $state(true);

  function colorize(raw: string, color: HandSide): string {
    return applyMotionColorToSvg(raw, color, {
      makeClassNamesUnique: true,
      themeMode: "dark",
      selectiveColorMode: selective,
    });
  }

  // Same production transform as colorize(), but with its own ID scope so the
  // picker-size copy cannot collide with the full-size blue copy in this
  // document. applyMotionColorToSvg pins colorSuffix to the motion color.
  function colorizeCompact(raw: string): string {
    return applyColorToSvg(raw, getMotionColor(HandSide.LEFT, "dark"), {
      makeClassNamesUnique: true,
      colorSuffix: "bluetile",
      selectiveColorMode: selective,
    });
  }

  async function load(entry: Variant) {
    const res = await fetch(entry.file);
    if (!res.ok) {
      failed[entry.id] = `${res.status} ${res.statusText}: ${entry.file}`;
      return;
    }
    const raw = await res.text();
    rendered[entry.id] = {
      raw,
      left: colorize(raw, HandSide.LEFT),
      right: colorize(raw, HandSide.RIGHT),
      compact: colorizeCompact(raw),
    };
  }

  onMount(async () => {
    await Promise.all([...concepts, ...variants].map(load));
  });
</script>

<div class="page" class:light={!darkBg}>
  <header>
    <h1>Prop art studies</h1>
    <p>
      Every sample is rendered through the real <code
        >applyMotionColorToSvg</code
      >
      pipeline (selective mode = {String(selective)}). Left / Right show the
      recolored region; preserved fills stay put.
    </p>
    <button onclick={() => (darkBg = !darkBg)}>
      Toggle background: {darkBg ? "dark" : "light"}
    </button>
  </header>

  <div class="group" id="energy-saber-concepts">
    <h2 class="group-title">Energy saber concepts</h2>
    <p class="group-note">
      Concept round only. No prop enum, picker entry, or premium behavior
      changes. Blade layers are flat neutral gray so the motion color drives
      them; the pale core and the dark hilt are preserved by selective mode. The
      compact sample is the real 52px picker-tile footprint.
    </p>

    {#each concepts as c (c.id)}
      {@const r = rendered[c.id]}
      <section>
        <div class="meta">
          <h3>{c.label}</h3>
          <p class="parent">Parent family: <strong>{c.parent}</strong></p>
          <p>{c.note}</p>
          <p class="tradeoff">Tradeoff: {c.tradeoff}</p>
          <code>{c.file}</code>
        </div>
        {#if r}
          <div class="concept-swatches">
            <figure>
              <div class="stage">{@html r.raw}</div>
              <figcaption>raw</figcaption>
            </figure>
            <figure>
              <div class="stage">{@html r.left}</div>
              <figcaption>left prop</figcaption>
            </figure>
            <figure>
              <div class="stage">{@html r.right}</div>
              <figcaption>right prop</figcaption>
            </figure>
            <figure>
              <div class="stage tile-cell">
                <div class="tile">{@html r.compact}</div>
              </div>
              <figcaption>blue @ 52px picker tile</figcaption>
            </figure>
          </div>
        {:else if failed[c.id]}
          <p class="failed">failed to load: {failed[c.id]}</p>
        {:else}
          <p class="loading">loading…</p>
        {/if}
      </section>
    {/each}
  </div>

  <div class="group">
    <h2 class="group-title">Sword study</h2>

    {#each variants as v (v.id)}
      {@const r = rendered[v.id]}
      <section>
        <div class="meta">
          <h3>{v.label}</h3>
          <p>{v.note}</p>
          <code>{v.file}</code>
        </div>
        {#if r}
          <div class="swatches">
            <figure>
              <div class="stage">
                {@html r.raw}
              </div>
              <figcaption>raw</figcaption>
            </figure>
            <figure>
              <div class="stage">
                {@html r.left}
              </div>
              <figcaption>left prop</figcaption>
            </figure>
            <figure>
              <div class="stage">
                {@html r.right}
              </div>
              <figcaption>right prop</figcaption>
            </figure>
          </div>
        {:else if failed[v.id]}
          <p class="failed">failed to load: {failed[v.id]}</p>
        {:else}
          <p class="loading">loading…</p>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 2rem;
    background: #15171c;
    color: #e8e8ea;
    font-family: system-ui, sans-serif;
  }
  .page.light {
    background: #e9eaee;
    color: #1a1a1c;
  }
  header {
    max-width: 70ch;
    margin-bottom: 2rem;
  }
  h1 {
    margin: 0 0 0.5rem;
  }
  header p {
    opacity: 0.8;
    line-height: 1.5;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .group {
    scroll-margin-top: 1rem;
    margin-bottom: 2.5rem;
  }
  .group-title {
    margin: 0 0 0.4rem;
    font-size: 1.35rem;
  }
  .group-note {
    margin: 0;
    max-width: 80ch;
    opacity: 0.75;
    line-height: 1.5;
  }
  section {
    border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    padding: 1.5rem 0;
  }
  .meta h3 {
    margin: 0 0 0.25rem;
    font-size: 1.05rem;
  }
  .meta p {
    margin: 0 0 0.25rem;
    opacity: 0.75;
  }
  .meta .parent,
  .meta .tradeoff {
    opacity: 0.9;
  }
  .meta code {
    font-size: 0.78rem;
    opacity: 0.6;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  /* Four samples: pin the count per tier so the row never strands one item. */
  .concept-swatches {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }
  @media (min-width: 640px) {
    .concept-swatches {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1100px) {
    /* The tile column hugs its 52px content instead of stretching into a
       panel of dead space. */
    .concept-swatches {
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    }
  }
  .concept-swatches figure {
    display: flex;
    flex-direction: column;
  }
  .concept-swatches .stage {
    flex: 1;
  }
  .concept-swatches .tile-cell {
    width: fit-content;
    margin-inline: auto;
    padding: 0.75rem;
  }
  figure {
    margin: 0;
  }
  .stage {
    border-radius: 12px;
    padding: 1.25rem;
    background: color-mix(in srgb, currentColor 6%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .concept-swatches .stage {
    min-height: 92px;
    box-sizing: border-box;
  }
  /* Render the prop SVGs at a readable size. */
  .stage :global(svg) {
    width: 100%;
    height: auto;
    max-height: 90px;
  }
  /* The real BentoPropGrid flat-grid cell is 52px wide and the button asset is
     the full-length prop, so this is the footprint the choice is made at. */
  .tile {
    width: 52px;
    flex: 0 0 auto;
  }
  .tile :global(svg) {
    width: 52px;
    height: auto;
  }
  figcaption {
    text-align: center;
    font-size: 0.8rem;
    opacity: 0.7;
    margin-top: 0.4rem;
  }
  .loading {
    opacity: 0.6;
  }
  .failed {
    color: #ff6b6b;
  }
</style>
