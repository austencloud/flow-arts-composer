<script lang="ts">
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    DEFAULT_FAN_APPEARANCE,
    fanBuildPreviewOptions,
    isFanPropType,
    type FanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import {
    getAllPropTypes,
    getBasePropType,
    getPropTypeDisplayInfo,
    isPropActive,
  } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";

  let look = $state<PropLook>("pictograph");
  let chirality = $state("normal");
  let cover = $state<"bare" | "covered">("bare");
  let colors = $state({ left: "#36d6c5", right: "#ff8dba" });
  const types = getAllPropTypes().filter(isPropActive);
  const families = [...new Set(types.map(getBasePropType))];
  const fanBuilds = fanBuildPreviewOptions(DEFAULT_FAN_APPEARANCE);
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

<main>
  <header>
    <h1>Prop pair gallery</h1>
    <p>
      Every family, variant and fan build. The two small buttons show the actual
      mobile and sidebar sizes.
    </p>
    <LabeledColorPairPicker
      left={colors.left}
      right={colors.right}
      onchange={(hand, color) => (colors = { ...colors, [hand]: color })}
    />
    <div class="controls">
      <SegmentedControl
        options={[
          { value: "pictograph", label: "Pictograph" },
          { value: "model", label: "3D model" },
        ]}
        value={look}
        onchange={(value) => (look = value)}
        ariaLabel="Prop artwork"
      />
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
      {#each families as family}<a href={`#family-${family}`}
          >{getPropTypeDisplayInfo(family).label}</a
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
            <h3>{choice.label}</h3>
          </article>
        {/each}
      </div>
    </section>
  {/each}
</main>

{#snippet glyph(type: PropType, fan: FanAppearance, size: number)}
  <PropCompositionPreview
    propType={type}
    {size}
    pairedGlyph
    darkBackground
    useSavedOverrides={false}
    {colors}
    appearanceOverride={{ fanAppearance: { ...fan, cover }, propLook: look }}
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
  nav a {
    color: var(--theme-text-dim, #b8bdcc);
    font-size: 14px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    text-decoration: underline;
    text-underline-offset: 4px;
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
