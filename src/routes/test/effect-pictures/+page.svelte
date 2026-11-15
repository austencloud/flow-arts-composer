<script lang="ts">
  import EffectPresetThumbnail from "#lib/shared/animation-engine/components/effects-panel/EffectPresetThumbnail.svelte";
  import {
    EFFECTS,
    getRegistration,
  } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { createEffectLookPreview } from "#lib/shared/animation-engine/components/effects-panel/effect-look-preview.js";
  import type { EffectPreset } from "#lib/shared/animation-engine/components/effects-panel/presets/types.js";

  /**
   * Every effect picture at the sizes it is used at, so the sixteen can be
   * compared side by side: the card (228x86), the tile format (74x27 inside the
   * 86x49 phone-list tile, with its name), the chip format (29x20 inside the
   * 56px rail item), then the tile and the chip each at three times, which is
   * the density they are painted at (240x90 and 96x64 backing stores). The
   * second block puts every look of every effect in both small formats.
   */
  interface Row {
    id: string;
    label: string;
    looks: {
      preset: EffectPreset;
      model: ReturnType<typeof createEffectLookPreview>;
    }[];
  }

  const rows: Row[] = EFFECTS.filter((effect) => effect.id !== "frost").map(
    (effect) => {
      const presets: EffectPreset[] =
        getRegistration(effect.id)?.presetGroup.presets ?? [];
      const list: EffectPreset[] = presets.length
        ? presets
        : [
            {
              id: `${effect.id}-default`,
              name: effect.label,
              previewColor: effect.color,
            },
          ];
      return {
        id: effect.id,
        label: effect.label,
        looks: list.map((preset) => ({
          preset,
          model: createEffectLookPreview(effect.id, preset),
        })),
      };
    }
  );
</script>

<svelte:head><title>Effect pictures</title></svelte:head>

<main>
  <header>
    <h1>Effect pictures</h1>
    <p>
      One row per effect, its default look. Card, tile and chip at the sizes the
      app draws them, then the tile and the chip at three times.
    </p>
  </header>

  <section class="sheet" aria-label="Default look at every size">
    <div class="head">
      <span>Effect</span>
      <span>Card 228x86</span>
      <span>Tile 74x27</span>
      <span>Chip 29x20</span>
      <span>Tile x3</span>
      <span>Chip x3</span>
    </div>
    {#each rows as row (row.id)}
      {@const look = row.looks[0]!}
      <div class="row">
        <span class="name">{row.label}</span>
        <span class="card" style:width="228px" style:height="86px">
          <EffectPresetThumbnail
            effectType={row.id}
            preset={look.preset}
            legacyModel={look.model}
          />
        </span>
        <span class="phone-tile">
          <span class="pic" style:width="74px" style:height="27px">
            <EffectPresetThumbnail
              effectType={row.id}
              preset={look.preset}
              legacyModel={look.model}
              format="tile"
            />
          </span>
          <span class="tile-name">{row.label}</span>
        </span>
        <span class="pill">
          <span class="pic" style:width="29px" style:height="20px">
            <EffectPresetThumbnail
              effectType={row.id}
              preset={look.preset}
              legacyModel={look.model}
              format="chip"
            />
          </span>
          <span class="pill-name">Effects</span>
        </span>
        <span class="pic" style:width="222px" style:height="81px">
          <EffectPresetThumbnail
            effectType={row.id}
            preset={look.preset}
            legacyModel={look.model}
            format="tile"
          />
        </span>
        <span class="pic" style:width="87px" style:height="58px">
          <EffectPresetThumbnail
            effectType={row.id}
            preset={look.preset}
            legacyModel={look.model}
            format="chip"
          />
        </span>
      </div>
    {/each}
  </section>

  <h2>Every look, tile and chip</h2>
  <section class="looks" aria-label="Every look in the small formats">
    {#each rows as row (row.id)}
      <div class="look-row">
        <span class="name">{row.label}</span>
        <div class="look-set">
          {#each row.looks as look (look.preset.id)}
            <span class="look" title={look.preset.name}>
              <span class="pic" style:width="74px" style:height="27px">
                <EffectPresetThumbnail
                  effectType={row.id}
                  preset={look.preset}
                  legacyModel={look.model}
                  format="tile"
                />
              </span>
              <span class="pic" style:width="29px" style:height="20px">
                <EffectPresetThumbnail
                  effectType={row.id}
                  preset={look.preset}
                  legacyModel={look.model}
                  format="chip"
                />
              </span>
            </span>
          {/each}
        </div>
      </div>
    {/each}
  </section>
</main>

<style>
  :global(body) {
    background: #0c0d12;
    color: #e8e9f0;
  }
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 24px 80px;
    font-family: system-ui, sans-serif;
  }
  h1 {
    margin: 0 0 4px;
    font-size: var(--font-size-xl);
  }
  h2 {
    margin: 36px 0 12px;
    font-size: var(--font-size-base);
  }
  p {
    margin: 0 0 16px;
    color: #9aa0b4;
    font-size: var(--font-size-sm);
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: 96px 228px 110px 120px 222px 87px;
    gap: 16px;
    align-items: center;
  }
  .head {
    padding-bottom: 6px;
    color: #9aa0b4;
    font-size: var(--font-size-compact);
  }
  .row {
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .name,
  .tile-name,
  .pill-name {
    font-size: var(--font-size-compact);
  }
  .card,
  .pic {
    display: block;
    overflow: hidden;
    border-radius: 6px;
  }
  .phone-tile {
    box-sizing: border-box;
    width: 86px;
    height: 49px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 2px 4px;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }
  .tile-name {
    font-size: var(--font-size-compact);
    line-height: 1;
    white-space: nowrap;
  }
  .pill {
    box-sizing: border-box;
    width: 56px;
    height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.05);
  }
  .pill-name {
    font-size: var(--font-size-compact);
  }
  .pic > :global(div),
  .card > :global(div) {
    height: 100%;
  }
  .pic > :global(div) {
    border: 0;
    border-radius: 0;
  }
  .look-row {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 16px;
    align-items: start;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .look-set {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
  }
  .look {
    display: flex;
    gap: 6px;
    align-items: center;
  }
</style>
