<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import LabeledColorPairPicker from "#lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    DEFAULT_FAN_APPEARANCE,
    fanBuildPreviewOptions,
    isFanPropType,
    type FanAppearance,
  } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import {
    getAllPropTypes,
    getBasePropType,
    getPropTypeDisplayInfo,
    isPropActive,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { isBuugengFamilyProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";

  // The boxes the chosen-prop buttons really have; each is outlined below.
  const BOXES = [
    { width: 20, height: 16 },
    { width: 26, height: 26 },
    { width: 30, height: 22 },
    { width: 36, height: 36 },
    { width: 40, height: 40 },
  ];
  let chirality = $state("normal");
  let cover = $state<"bare" | "covered">("bare");
  let colors = $state({ left: "#36d6c5", right: "#ff8dba" });
  let pickerWidth = $state<"full" | "mid" | "narrow">("full");
  const PICKER_MAX_WIDTH = { full: "none", mid: "30rem", narrow: "19rem" } as const;
  const types = getAllPropTypes().filter(isPropActive);
  const families = [...new Set(types.map(getBasePropType))];
  const fanBuilds = fanBuildPreviewOptions(DEFAULT_FAN_APPEARANCE).filter(
    (build) => !build.waitingOnMaker
  );
  function choices(family: PropType) {
    return types
      .filter((type) => getBasePropType(type) === family)
      .flatMap((type) => {
        const label = getPropTypeDisplayInfo(type).label;
        return isFanPropType(type)
          ? fanBuilds.map((build) => ({
              type,
              label: `${label} · ${build.label}`,
              fan: { ...DEFAULT_FAN_APPEARANCE, build: build.id },
            }))
          : [{ type, label, fan: DEFAULT_FAN_APPEARANCE }];
      });
  }
</script>

<svelte:head><title>Prop pair gallery</title></svelte:head>

{#snippet preview(pair: { left: string; right: string })}
  <PropCompositionPreview
    propType={families[0]!}
    size={96}
    pairedGlyph
    darkBackground
    useSavedOverrides={false}
    colors={pair}
  />
{/snippet}

<main>
  <header>
    <h1>Prop pair gallery</h1>
    <p>
      Every family, variant and fan build. The two small buttons show the actual
      mobile and sidebar sizes. The dashed boxes show the pair fitted to the
      slots of the chosen-prop buttons (20x16, 26x26, 30x22, 36x36, 40x40).
    </p>
    <SegmentedControl
      options={[
        { value: "full", label: "Full width" },
        { value: "mid", label: "30rem" },
        { value: "narrow", label: "19rem" },
      ]}
      value={pickerWidth}
      onchange={(value) => (pickerWidth = value)}
      ariaLabel="Picker width"
    />
    <div class="picker-box" style:max-width={PICKER_MAX_WIDTH[pickerWidth]}>
      <LabeledColorPairPicker
        left={colors.left}
        right={colors.right}
        {preview}
        onchange={(hand, color) => (colors = { ...colors, [hand]: color })}
        onswap={() => (colors = { left: colors.right, right: colors.left })}
      />
    </div>
    <div class="controls">
      <SegmentedControl
        options={[
          { value: "normal", label: "Normal grip" },
          { value: "flipped", label: "Flipped grip" },
        ]}
        value={chirality}
        onchange={(value) => (chirality = value)}
        ariaLabel="Buugeng grip"
      />
      <SegmentedControl
        options={[
          { value: "bare", label: "Bare fans" },
          { value: "covered", label: "Covered fans" },
        ]}
        value={cover}
        onchange={(value) => (cover = value)}
        ariaLabel="Fan covers"
      />
    </div>
    <nav aria-label="Prop families">
      {#each families as family}<LinkChip href={`#family-${family}`}
          >{getPropTypeDisplayInfo(family).label}</LinkChip
        >{/each}
    </nav>
  </header>
  {#each families as family}
    <section id={`family-${family}`} aria-labelledby={`title-${family}`}>
      <h2 id={`title-${family}`}>{getPropTypeDisplayInfo(family).label}</h2>
      <div class="choices">
        {#each choices(family) as choice}
          <article data-prop={choice.type} data-build={choice.fan.build}>
            <div class="samples">
              {@render glyph(choice.type, choice.fan, 88)}
              <div class="small-samples">
                <div class="sample">
                  <span class="button mobile"
                    >{@render glyph(choice.type, choice.fan, 36)}</span
                  ><small>Mobile</small>
                </div>
                <div class="sample">
                  <span class="button"
                    >{@render glyph(choice.type, choice.fan, 40)}</span
                  ><small>Sidebar</small>
                </div>
              </div>
            </div>
            <div class="boxes" aria-label="Box fits">
              {#each BOXES as box}
                <div class="box-sample">
                  <span
                    class="box"
                    style:width="{box.width}px"
                    style:height="{box.height}px"
                    >{@render glyph(choice.type, choice.fan, 0, box)}</span
                  ><small>{box.width}x{box.height}</small>
                </div>
              {/each}
            </div>
            <h3>{choice.label}</h3>
          </article>
        {/each}
      </div>
    </section>
  {/each}
</main>

{#snippet glyph(
  type: PropType,
  fan: FanAppearance,
  size: number,
  box?: { width: number; height: number }
)}
  <PropCompositionPreview
    propType={type}
    {size}
    {box}
    pairedGlyph
    darkBackground
    useSavedOverrides={false}
    {colors}
    appearanceOverride={{ fanAppearance: { ...fan, cover } }}
    leftFlipped={isBuugengFamilyProp(type) && chirality === "flipped"}
    rightFlipped={type === PropType.HAND ||
      (isBuugengFamilyProp(type) && chirality === "flipped")}
  />
{/snippet}

<style>
  main {
    max-width: 1160px;
    margin: auto;
    padding: clamp(16px, 3vw, 32px);
    color: var(--theme-text, white);
  }
  h1 {
    font-size: 28px;
    margin: 0 0 8px;
  }
  p {
    font-size: 14px;
    line-height: 1.5;
    margin: 0 0 20px;
  }
  .picker-box {
    width: 100%;
    margin-inline: auto;
    margin-block: 12px 0;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-block: 16px;
  }
  nav {
    display: flex;
    gap: 8px 16px;
    flex-wrap: wrap;
  }
  section {
    margin-top: 32px;
    scroll-margin-top: 16px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 18px;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: 12px;
  }
  article {
    background: var(--theme-card-bg, #080f16);
    border: 1px solid var(--theme-stroke, #314047);
    border-radius: 14px;
    padding: 14px;
    min-width: 0;
  }
  .samples {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 100px;
  }
  .small-samples {
    display: flex;
    gap: 12px;
  }
  .sample {
    display: grid;
    justify-items: center;
    gap: 8px;
  }
  .button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, #314047);
    border-radius: 12px;
    background: #060c12;
  }
  .button.mobile {
    border-radius: 50%;
  }
  .boxes {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    margin-top: 12px;
  }
  .box-sample {
    display: grid;
    justify-items: center;
    gap: 4px;
  }
  /* The outline is the box the drawing is told to fit; the drawing must not
     touch or cross it except where it fills it. */
  .box {
    display: block;
    box-sizing: content-box;
    outline: 1px dashed var(--theme-text-dim, #b8bdcc);
    outline-offset: 0;
  }
  small {
    font-size: 12px;
    color: var(--theme-text-dim, #b8bdcc);
  }
  h3 {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    margin: 10px 0 0;
    min-height: 42px;
  }
</style>
