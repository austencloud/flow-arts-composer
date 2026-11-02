<!-- packages/shape-engine/src/components/ElementStrip.svelte
  The six hands modes for one pair, outside the matrix: a host that already
  has a pick (the Poi Mirror demo) shows which elements the hands can take,
  the letters each spells, and the Hands to Props row for the current one.
  It composes the drill's own chip and bridge row, so the strip and the
  engine read the same. -->
<script lang="ts">
  import {
    MODE_FAMILY_ID,
    MODE_ORDER,
    TND_BY_FAMILY,
    type ElementIcons,
    type FlowerPair,
    type TurnValue,
    type VtgMode,
  } from "@tka/shape-domain";
  import { letterFor, realizationFor } from "../bridge";
  import type { ModeRealization } from "../services/build-mode-realizations";
  import { localizedElementName, localizedModeWords } from "../services/shape-matrix-display";
  import { provideStrings, setStrings, type ShapeEngineStrings } from "../strings.svelte.js";
  import {
    DEFAULT_ELEMENT_ICONS,
    elementIcon,
    setShapeEngineHostContext,
  } from "../app/context/shape-engine-host-context";
  import PropRelationshipChipRow from "./PropRelationshipChipRow.svelte";
  import RelationshipChoiceChip from "./RelationshipChoiceChip.svelte";

  let {
    pair,
    mode,
    turns,
    icons,
    strings,
    onChange,
  }: {
    pair: FlowerPair;
    mode: VtgMode;
    turns: [TurnValue, TurnValue];
    icons?: ElementIcons;
    strings?: Partial<ShapeEngineStrings>;
    onChange: (mode: VtgMode) => void;
  } = $props();

  // It mounts without ShapeMatrixApp, so it supplies the text and icons itself.
  // svelte-ignore state_referenced_locally
  provideStrings(strings);
  $effect.pre(() => {
    setStrings(strings);
  });
  setShapeEngineHostContext({
    variant: "mirror",
    get icons() {
      return icons ?? DEFAULT_ELEMENT_ICONS;
    },
  });

  const chips = MODE_ORDER.flatMap((chipMode) => {
    const element = TND_BY_FAMILY[MODE_FAMILY_ID[chipMode]];
    return element ? [{ mode: chipMode, element }] : [];
  });

  let letters = $state<Partial<Record<VtgMode, string>>>({});
  let realization = $state<ModeRealization | null>(null);
  let building = $state(true);

  // Letters belong to the pair, the bridge row to the pair and the mode; a
  // newer pick drops whatever an older one resolves to late.
  let lettersToken = 0;
  $effect(() => {
    const current = pair;
    const currentTurns = turns;
    const token = ++lettersToken;
    letters = {};
    for (const chipMode of MODE_ORDER) {
      void letterFor(current, chipMode, currentTurns).then((letter) => {
        if (token !== lettersToken || !letter) return;
        letters = { ...letters, [chipMode]: letter };
      });
    }
  });

  let realizationToken = 0;
  $effect(() => {
    const current = pair;
    const currentMode = mode;
    const currentTurns = turns;
    const token = ++realizationToken;
    building = true;
    void realizationFor(current, currentMode, currentTurns).then((next) => {
      if (token !== realizationToken) return;
      realization = next;
      building = false;
    });
  });
</script>

<div class="element-strip">
  <div class="chip-row" role="group">
    {#each chips as chip (chip.mode)}
      {@const words = localizedModeWords(chip.mode, true)}
      {@const spoken = localizedModeWords(chip.mode)}
      <RelationshipChoiceChip
        mode={chip.mode}
        letter={letters[chip.mode] ?? null}
        accent={chip.element.accentColor}
        icon={elementIcon(icons ?? DEFAULT_ELEMENT_ICONS, chip.element.element)}
        timing={words.timing}
        direction={words.direction}
        active={mode === chip.mode}
        ariaLabel={`${spoken.timing} ${spoken.direction}, ${localizedElementName(chip.element.element)} (${chip.mode})`}
        onpick={() => onChange(chip.mode)}
      />
    {/each}
  </div>
  <PropRelationshipChipRow
    realizations={realization ? [realization] : []}
    selectedMode={mode}
    selectedPropMode={null}
    activePropMode={realization?.propMode ?? null}
    {building}
    ontarget={() => {}}
  />
</div>

<style>
  /* The drill's row geometry: six equal tracks, the bridge row beneath. */
  .element-strip {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .chip-row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.35rem;
    min-width: 0;
  }
</style>
