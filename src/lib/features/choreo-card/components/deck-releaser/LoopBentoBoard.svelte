<!--
  LoopBentoBoard — the LOOP "Compose Your Catalog" surface as a bento card grid,
  matching the unified-generation prototype (src/routes/test/unified-generation).
  Every deck control is a real generate card (BaseCard / StepperCard) or opens a
  centered modal; the gorgeous gradient tiles replace the old three-column board.

  Wired to the seeded generation engine + recipe axes:
    Deck Size · Loop Type (modal) · Level · Period · Step Mix · Turns · Transform (modal)
  Loop type / level / period change the pool → onRebuildPool. The rest shape the
  draw/variation, not the pool. Reuses real primitives: BaseCard, StepperCard,
  LOOPExpandedOverlay, TransformPanel, SegmentedControl.
-->
<script lang="ts">
  import BaseCard from "$lib/features/create/generate/components/cards/BaseCard.svelte";
  import StepperCard from "$lib/features/create/generate/components/cards/StepperCard/StepperCard.svelte";
  import TurnIntensityCard from "$lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import GridModeCard from "$lib/features/create/generate/components/cards/GridModeCard.svelte";
  import PeriodCard from "$lib/features/create/generate/components/cards/PeriodCard.svelte";
  import { getCardColors } from "$lib/shared/create/domain/card-colors";
  import { BackgroundType } from "@austencloud/backgrounds";
  import LOOPExpandedOverlay from "$lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte";
  import {
    LOOPType,
    LOOP_TYPE_LABELS,
  } from "$lib/features/create/generate/circular/domain/models/circular-models";
  import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "$lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import TransformPanel from "./TransformPanel.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import OrientationCycler from "$lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DIFFICULTY_LEVELS } from "$lib/shared/config/difficulty-styles";
  import {
    type VariationConfig,
    type StartOriMode,
  } from "../../services/deck-variation";
  import type { ResolvedReversalPattern } from "../../domain/reversal-transform";
  import type { StepCountWeight } from "../../domain/models/DeckRelease";
  import type { CatalogSourceSummary } from "../../services/deck-composer";
  import { getDeckReleaserContext } from "./context/deck-releaser-context";

  const { state: rs } = getDeckReleaserContext();

  interface Props {
    weights: StepCountWeight[];
    totalCards: number;
    sourceSummaries: CatalogSourceSummary[];
    selectedSliceTypes: Set<"halved" | "quartered">;
    variationConfig: VariationConfig;
    startOriModes: Set<StartOriMode>;
    gridModes: Set<"diamond" | "box">;
    reversalPattern?: ResolvedReversalPattern | null;
    onWeightChange: (stepCount: number, weight: number) => void;
    onTotalCardsChange: (total: number) => void;
    onSliceTypeToggle: (sliceType: "halved" | "quartered") => void;
    onVariationConfigChange: (config: VariationConfig) => void;
    onToggleStartOriMode: (mode: StartOriMode) => void;
    onToggleGridMode: (mode: "diamond" | "box") => void;
    onReversalChange?: (pattern: ResolvedReversalPattern) => void;
  }

  let {
    weights,
    totalCards,
    sourceSummaries,
    selectedSliceTypes,
    variationConfig,
    startOriModes,
    gridModes,
    reversalPattern = null,
    onWeightChange,
    onTotalCardsChange,
    onSliceTypeToggle,
    onVariationConfigChange,
    onToggleStartOriMode,
    onToggleGridMode,
    onReversalChange,
  }: Props = $props();

  const c = getCardColors(BackgroundType.COSMIC);
  const LOOP_COLOR =
    "linear-gradient(135deg, #a3a32a 0%, #8a8a22 50%, #6b6b1a 100%)";
  const LOOP_SHADOW = "60deg 55% 35%";
  const POS_COLOR =
    "linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)";
  const POS_SHADOW = "175deg 65% 40%";
  const SIZE_COLOR =
    "linear-gradient(135deg, #e11d48 0%, #be123c 50%, #9f1239 100%)";
  const SIZE_SHADOW = "345deg 80% 45%";
  const PROP_TILE_COLOR =
    "linear-gradient(135deg, #a855f7 0%, #9333ea 50%, #7e22ce 100%)";
  const PROP_TILE_SHADOW = "275deg 70% 50%";
  const GRID_COLOR =
    "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)";
  const GRID_SHADOW = "200deg 80% 50%";

  // Deck size is user-set (1–500). 54 fills a print page neatly (6 sheets × 9);
  // larger values generate that many unique sequences. Clamp + persist on change.
  function setTotal(n: number) {
    if (!Number.isFinite(n)) return;
    rs.totalCards = Math.max(1, Math.min(500, Math.round(n)));
    rs.persist();
  }

  // Length: one fixed step count — every card is GENERATED live at this length.
  // Live generation makes any length at any level, so the full range is open (no
  // enumerated-pool restriction). Multiples of 4 keep halved + quartered seeds whole.
  const LENGTHS = [4, 8, 12, 16];
  function stepLength(dir: number) {
    const i = LENGTHS.indexOf(rs.selectedLength);
    rs.selectedLength =
      LENGTHS[
        Math.max(0, Math.min(LENGTHS.length - 1, (i < 0 ? 1 : i) + dir))
      ]!;
    rs.persist();
  }

  // Style axes (the prototype's Smooth/Mixed/Choppy steppers) — all LIVE generation
  // constraints: Props → constraintPreset, Hands → handPathMode, Dashes → motionTypeFilter.
  const PROP_STYLES = ["smooth", "mixed", "choppy"] as const;
  const PROP_LABELS = ["Smooth", "Mixed", "Choppy"];
  const DASH_STYLES = ["low", "mixed", "high"] as const;
  const DASH_LABELS = ["Low", "Mixed", "High"];
  const STYLE_COLORS = {
    props: { color: c.continuity.color, shadow: c.continuity.shadowColor },
    hands: {
      color: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)",
      shadow: "245deg 70% 55%",
    },
    dashes: {
      color: "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)",
      shadow: "25deg 90% 55%",
    },
  };
  const propIdx = $derived(PROP_STYLES.indexOf(rs.propStyle));
  const handIdx = $derived(PROP_STYLES.indexOf(rs.handStyle));
  const dashIdx = $derived(DASH_STYLES.indexOf(rs.dashStyle));
  function stepProp(dir: number) {
    rs.propStyle = PROP_STYLES[Math.max(0, Math.min(2, propIdx + dir))]!;
    rs.persist();
  }
  function stepHand(dir: number) {
    rs.handStyle = PROP_STYLES[Math.max(0, Math.min(2, handIdx + dir))]!;
    rs.persist();
  }
  function stepDash(dir: number) {
    rs.dashStyle = DASH_STYLES[Math.max(0, Math.min(2, dashIdx + dir))]!;
    rs.persist();
  }

  const currentLoop = $derived(
    ([...rs.selectedLoopTypes][0] as LOOPType) ?? LOOPType.ROTATED
  );
  const currentLevel = $derived([...rs.selectedLevels][0] ?? 1);
  // Level tile colors per level (baby-blue / silver / gold …), same source the
  // Generate panel's LevelCard uses.
  const levelColor = $derived(
    DIFFICULTY_LEVELS[currentLevel]?.cssBg ?? c.level.color
  );
  const levelTextColor = $derived(
    DIFFICULTY_LEVELS[currentLevel]?.text ?? "white"
  );
  const loopComponents = $derived(parseLoopComponents(currentLoop));

  const periodLabel = $derived(
    selectedSliceTypes.size === 2
      ? "Q + H"
      : selectedSliceTypes.has("quartered")
        ? "Quartered"
        : selectedSliceTypes.has("halved")
          ? "Halved"
          : "—"
  );
  // Max turn intensity follows the generator model (single scalar). Half-turns
  // unlock at Level 3, mirroring the Generate panel. Floors exclude 0: a
  // Level 2+ deck capped at 0 turns is just a Level 1 deck.
  const turnAllowed = $derived(
    currentLevel >= 3 ? [0.5, 1, 1.5, 2, 2.5, 3] : [1, 2, 3]
  );
  const ORI_LABEL: Record<string, string> = {
    radial: "Radial",
    nonradial: "Nonradial",
    split: "Mixed",
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const transformSummary = $derived(
    `${[...startOriModes].map((m) => ORI_LABEL[m] ?? m).join(", ")} · ${[...gridModes].map(cap).join("/")}`
  );

  // User-set deck size (read live).
  const effectiveTotal = $derived(rs.totalCards);

  // ── modals ───────────────────────────────────────────────────────────────
  let showLoop = $state(false);
  let showTransform = $state(false);
  let showPlacementOri = $state(false);
  let showProp = $state(false);

  // Deck prop. Shows the effective prop (chosen, else the global default).
  const propLabel = $derived(
    String(rs.leftPropType)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase())
  );

  // ── start placement + orientation (ported from the unified-generation prototype)
  // Placements follow the deck's active grid mode (set in Transform). Selection is
  // stored as GridPlacement strings; empty ⇒ any. Orientation is per-hand and
  // baked into every generated card's beat 0 via left/rightStartOrientation.
  let placementShowAll = $state(false);
  const placementGridMode = $derived(
    ([...rs.selectedGridModes][0] ?? "diamond") as GridMode
  );
  const placementList = $derived<PictographData[]>(
    placementShowAll
      ? startPlacementManager.getAllStartPlacementVariations(
          placementGridMode,
          rs.startOriLeft as Orientation,
          rs.startOriRight as Orientation
        )
      : startPlacementManager.getDefaultStartPlacements(
          placementGridMode,
          rs.startOriLeft as Orientation,
          rs.startOriRight as Orientation
        )
  );
  function togglePlacement(placement: string) {
    const next = new Set(rs.selectedStartPlacementIds);
    if (next.has(placement)) next.delete(placement);
    else next.add(placement);
    rs.selectedStartPlacementIds = next;
    rs.persist();
  }
  function clearPlacement() {
    rs.selectedStartPlacementIds = new Set();
    rs.persist();
  }
  function allPlacements() {
    rs.selectedStartPlacementIds = new Set(
      placementList.map((p) => String(p.startPlacement))
    );
    rs.persist();
  }
  const ORI_SHORT: Record<string, string> = {
    in: "In",
    out: "Out",
    clock: "Clock",
    counter: "Counter",
  };
  const oriLabel = (o: string) => ORI_SHORT[o] ?? o;
  const placementSummary = $derived(
    `${rs.selectedStartPlacementIds.size === 0 ? "Any" : `${rs.selectedStartPlacementIds.size} placements`} · ${oriLabel(rs.startOriLeft)}/${oriLabel(rs.startOriRight)}`
  );

  // ── actions ────────────────────────────────────────────────────────────────
  function pickLoop(lt: LOOPType) {
    rs.selectedLoopTypes = new Set([lt]);
    // loopComponents is $derived(parseLoopComponents(currentLoop)) and currentLoop
    // tracks rs.selectedLoopTypes, so it recomputes automatically from the line above.
    showLoop = false;
    rs.persist();
  }
  function setLevel(n: number) {
    rs.selectedLevels = new Set([Math.max(1, Math.min(3, n))]);
    rs.persist();
  }
  // Period + Grid are toggled by PeriodCard / GridModeCard (two-option toggles).
  // These labels feed the "This Deck" recipe readout only.
  const gridLabel = $derived(
    ([...rs.selectedGridModes][0] ?? "diamond") === "box" ? "Box" : "Diamond"
  );
</script>

<div class="bento-stage">
  <!-- Row 1: core dials -->
  <div class="card-grid">
    <div class="tile">
      <BaseCard
        title="Loop Type"
        currentValue={LOOP_TYPE_LABELS[currentLoop]}
        color={LOOP_COLOR}
        shadowColor={LOOP_SHADOW}
        gridColumnSpan={2}
        onClick={() => (showLoop = true)}
      />
    </div>
    <div class="tile">
      <StepperCard
        title="Length"
        currentValue={rs.selectedLength}
        minValue={4}
        maxValue={16}
        description="STEP COUNT"
        color={c.length.color}
        shadowColor={c.length.shadowColor}
        gridColumnSpan={2}
        onIncrement={() => stepLength(1)}
        onDecrement={() => stepLength(-1)}
      />
    </div>
    <div class="tile">
      <StepperCard
        title="Level"
        currentValue={currentLevel}
        minValue={1}
        maxValue={3}
        description="BASE MOTIONS"
        color={levelColor}
        textColor={levelTextColor}
        shadowColor="0deg 0% 0%"
        gridColumnSpan={2}
        onIncrement={() => setLevel(currentLevel + 1)}
        onDecrement={() => setLevel(currentLevel - 1)}
      />
    </div>
    <div class="tile">
      <PeriodCard
        currentPeriod={rs.selectedSliceTypes.has("quartered") ? 4 : 2}
        onPeriodChange={(p: number) => {
          rs.selectedSliceTypes = new Set([p === 4 ? "quartered" : "halved"]);
          rs.persist();
        }}
        color={c.gridMode.color}
        shadowColor={c.gridMode.shadowColor}
      />
    </div>
  </div>

  <!-- Row 2: Grid + Prop, with Turns morphing in from the left at Level 2+
       (joining the pair to make three) and collapsing to zero-width at Level 1.
       Own flex row so the reflow stays contained. -->
  <div class="card-grid">
    <div
      class="tile turns"
      class:collapsed={currentLevel <= 1}
      aria-hidden={currentLevel <= 1}
    >
      <TurnIntensityCard
        currentIntensity={rs.turnIntensity}
        allowedValues={turnAllowed}
        onIntensityChange={(v: number) => {
          rs.turnIntensity = v;
          rs.persist();
        }}
        shadowColor="140deg 70% 45%"
        gridColumnSpan={2}
      />
    </div>
    <div class="tile">
      <GridModeCard
        currentMode={([...rs.selectedGridModes][0] ?? "diamond") as GridMode}
        onModeChange={(m: GridMode) => {
          rs.selectedGridModes = new Set([m as "diamond" | "box"]);
          rs.persist();
        }}
        color={GRID_COLOR}
        shadowColor={GRID_SHADOW}
      />
    </div>
    <div class="tile">
      <BaseCard
        title="Prop"
        currentValue={propLabel}
        color={PROP_TILE_COLOR}
        shadowColor={PROP_TILE_SHADOW}
        gridColumnSpan={2}
        onClick={() => (showProp = true)}
      />
    </div>
  </div>

  <!-- Row 3: motion style steppers -->
  <div class="card-grid">
    <div class="tile">
      <StepperCard
        title="Props"
        currentValue={propIdx}
        minValue={0}
        maxValue={2}
        description="REVERSALS"
        formatValue={(i: number) => PROP_LABELS[i] ?? ""}
        color={STYLE_COLORS.props.color}
        shadowColor={STYLE_COLORS.props.shadow}
        gridColumnSpan={2}
        onIncrement={() => stepProp(1)}
        onDecrement={() => stepProp(-1)}
      />
    </div>
    <div class="tile">
      <StepperCard
        title="Hands"
        currentValue={handIdx}
        minValue={0}
        maxValue={2}
        description="REVERSALS"
        formatValue={(i: number) => PROP_LABELS[i] ?? ""}
        color={STYLE_COLORS.hands.color}
        shadowColor={STYLE_COLORS.hands.shadow}
        gridColumnSpan={2}
        onIncrement={() => stepHand(1)}
        onDecrement={() => stepHand(-1)}
      />
    </div>
    <div class="tile">
      <StepperCard
        title="Dashes"
        currentValue={dashIdx}
        minValue={0}
        maxValue={2}
        description="FREQUENCY"
        formatValue={(i: number) => DASH_LABELS[i] ?? ""}
        color={STYLE_COLORS.dashes.color}
        shadowColor={STYLE_COLORS.dashes.shadow}
        gridColumnSpan={2}
        onIncrement={() => stepDash(1)}
        onDecrement={() => stepDash(-1)}
      />
    </div>
  </div>

  <!-- Row 4: deck-level — equal-width cards -->
  <div class="card-grid row-equal">
    <div class="tile size-tile">
      <BaseCard
        title="Deck Size"
        currentValue=""
        clickable={false}
        color={SIZE_COLOR}
        shadowColor={SIZE_SHADOW}
        gridColumnSpan={2}
      >
        <div class="size-row">
          <button
            class="size-step"
            aria-label="Fewer cards"
            onclick={() => setTotal(rs.totalCards - 1)}>−</button
          >
          <input
            class="size-input"
            type="number"
            min="1"
            max="500"
            inputmode="numeric"
            aria-label="Number of cards"
            value={rs.totalCards}
            onchange={(e) => setTotal(parseInt(e.currentTarget.value, 10))}
          />
          <button
            class="size-step"
            aria-label="More cards"
            onclick={() => setTotal(rs.totalCards + 1)}>+</button
          >
        </div>
        <span class="size-desc">CARDS</span>
      </BaseCard>
    </div>
    <div class="tile">
      <BaseCard
        title="Start · Ori"
        currentValue={placementSummary}
        color={POS_COLOR}
        shadowColor={POS_SHADOW}
        gridColumnSpan={2}
        onClick={() => (showPlacementOri = true)}
      />
    </div>
    <div class="tile">
      <BaseCard
        title="Transform"
        currentValue={transformSummary}
        color={c.duration.color}
        shadowColor={c.duration.shadowColor}
        gridColumnSpan={2}
        onClick={() => (showTransform = true)}
      />
    </div>
  </div>

  <section class="recipe">
    <span class="recipe-title">This Deck</span>
    <dl class="recipe-list">
      <div class="recipe-row">
        <dt>Cards</dt>
        <dd>{effectiveTotal}</dd>
      </div>
      <div class="recipe-row">
        <dt>Loop</dt>
        <dd>{LOOP_TYPE_LABELS[currentLoop]}</dd>
      </div>
      <div class="recipe-row">
        <dt>Length</dt>
        <dd>{rs.selectedLength} steps</dd>
      </div>
      <div class="recipe-row">
        <dt>Level</dt>
        <dd>{currentLevel}</dd>
      </div>
      <div class="recipe-row">
        <dt>Period</dt>
        <dd>{periodLabel}</dd>
      </div>
      <div class="recipe-row">
        <dt>Grid</dt>
        <dd>{gridLabel}</dd>
      </div>
      <div class="recipe-row">
        <dt>Prop</dt>
        <dd>{propLabel}</dd>
      </div>
      <div class="recipe-row">
        <dt>Max Turns</dt>
        <dd>{rs.turnIntensity}</dd>
      </div>
      <div class="recipe-row">
        <dt>Style</dt>
        <dd>
          {PROP_LABELS[propIdx]} · {PROP_LABELS[handIdx]} · {DASH_LABELS[
            dashIdx
          ]}
        </dd>
      </div>
      <div class="recipe-row">
        <dt>Start · Ori</dt>
        <dd>{placementSummary}</dd>
      </div>
      <div class="recipe-row">
        <dt>Transform</dt>
        <dd>{transformSummary}</dd>
      </div>
      <div class="recipe-row">
        <dt>Reversal</dt>
        <dd>{reversalPattern?.label ?? "Continuous"}</dd>
      </div>
    </dl>
  </section>
</div>

<BaseModal
  bind:open={showLoop}
  size="xl"
  animation="none"
  class="loop-picker-modal"
  labelledBy="deck-loop-picker-title"
  onclose={() => (showLoop = false)}
>
  <div class="loop-host">
    <h2 id="deck-loop-picker-title" class="visually-hidden">Deck Loop Type</h2>
    <LOOPExpandedOverlay
      currentType={currentLoop}
      selectedComponents={loopComponents}
      onChange={(lt: LOOPType) => pickLoop(lt)}
      onClose={() => (showLoop = false)}
    />
  </div>
</BaseModal>

<BaseModal
  bind:open={showTransform}
  size="xl"
  animation="pop"
  class="deck-picker-modal"
  labelledBy="deck-transform-picker-title"
  onclose={() => (showTransform = false)}
>
  {#snippet header()}
    <ModalHeader
      id="deck-transform-picker-title"
      title="Transform"
      icon="fa-shuffle"
      onClose={() => (showTransform = false)}
    />
  {/snippet}
  <div class="picker-body">
    <TransformPanel
      {startOriModes}
      {onToggleStartOriMode}
      {gridModes}
      {onToggleGridMode}
      {reversalPattern}
      onReversalChange={(p) => onReversalChange?.(p)}
      reversalCustomDefault={false}
    />
  </div>
  {#snippet footer()}
    <ModalFooter align="stretch">
      <button
        type="button"
        class="primary"
        onclick={() => (showTransform = false)}>Done</button
      >
    </ModalFooter>
  {/snippet}
</BaseModal>

<BaseModal
  bind:open={showProp}
  size="xl"
  animation="pop"
  class="deck-picker-modal"
  labelledBy="deck-prop-picker-title"
  onclose={() => (showProp = false)}
>
  {#snippet header()}
    <ModalHeader
      id="deck-prop-picker-title"
      title="Deck Prop"
      icon="fa-wand-magic-sparkles"
      onClose={() => (showProp = false)}
    />
  {/snippet}
  <div class="picker-body">
    <BentoPropGrid
      selectedPropType={rs.leftPropType}
      variant="inline"
      title="Select Prop"
      onSelect={(p: PropType) => {
        rs.selectedPropType = p;
        rs.persist();
        showProp = false;
      }}
    />
  </div>
  {#snippet footer()}
    <ModalFooter align="stretch">
      <button type="button" class="primary" onclick={() => (showProp = false)}
        >Done</button
      >
    </ModalFooter>
  {/snippet}
</BaseModal>

<BaseModal
  bind:open={showPlacementOri}
  size="xl"
  animation="pop"
  class="deck-picker-modal placement-picker-modal"
  labelledBy="deck-placement-picker-title"
  onclose={() => (showPlacementOri = false)}
>
  {#snippet header()}
    <ModalHeader
      id="deck-placement-picker-title"
      title="Start Placement & Orientation"
      icon="fa-location-crosshairs"
      onClose={() => (showPlacementOri = false)}
    />
  {/snippet}
  <div class="picker-body placement-picker-body">
    <div class="placement-controls">
      <button class="pc-btn" onclick={allPlacements}>All</button>
      <button class="pc-btn" onclick={clearPlacement}>Clear</button>
      <button
        class="pc-btn pc-scope"
        class:active={placementShowAll}
        onclick={() => (placementShowAll = !placementShowAll)}
      >
        {placementShowAll ? "Simple (3)" : "All Variations"}
      </button>
    </div>
    <div class="placement-grid" class:all={placementShowAll}>
      {#each placementList as p (p.id)}
        {@const sel = rs.selectedStartPlacementIds.has(String(p.startPlacement))}
        <button
          class="placement-cell"
          class:on={sel}
          aria-pressed={sel}
          aria-label={`Start placement ${String(p.startPlacement)}${sel ? " (selected)" : ""}`}
          onclick={() => togglePlacement(String(p.startPlacement))}
        >
          <PictographContainer pictographData={p} />
          {#if sel}<span class="placement-check">✓</span>{/if}
        </button>
      {/each}
    </div>
    <div class="placement-ori-row">
      <OrientationCycler
        orientation={rs.startOriLeft as Orientation}
        onOrientationChange={(o: Orientation) => {
          rs.startOriLeft = o;
          rs.persist();
        }}
        color="blue"
      />
      <OrientationCycler
        orientation={rs.startOriRight as Orientation}
        onOrientationChange={(o: Orientation) => {
          rs.startOriRight = o;
          rs.persist();
        }}
        color="red"
      />
    </div>
    <p class="placement-hint">
      No selection = any start placement. Orientation applies to every card in
      the deck.
    </p>
  </div>
  {#snippet footer()}
    <ModalFooter align="stretch">
      <button type="button" class="primary" onclick={() => (showPlacementOri = false)}
        >Done</button
      >
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  .bento-stage {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    /* theme vars the real generate cards read */
    --card-text-size: 22px;
    --card-text-weight: 800;
    --card-text-spacing: 0.3px;
    --card-text-shadow: 0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.45));
    --element-spacing: 10px;
  }
  .card-grid {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 12px;
    width: 100%;
  }
  .card-grid > .tile {
    flex: 1 1 230px;
    min-width: 200px;
    height: 120px;
  }
  /* Row 4: force equal widths regardless of content (Deck Size / Start·Ori /
     Transform all share the row evenly). */
  .card-grid.row-equal > .tile {
    flex: 1 1 0;
  }
  /* The row recomposes immediately. The card's opacity/transform provide the
     cue without animating flex math on every frame. */
  .card-grid > .tile.turns {
    min-width: 0;
    overflow: hidden;
    transition:
      opacity var(--transition-emphasis),
      transform var(--transition-spring);
  }
  .card-grid > .tile.turns.collapsed {
    flex: 0 0 0;
    opacity: 0;
    transform: translateX(-0.75rem) scale(0.96);
    pointer-events: none;
    margin-right: -12px;
  }
  @media (prefers-reduced-motion: reduce) {
    .card-grid > .tile.turns {
      transition: none;
    }
  }
  .tile > :global(*) {
    width: 100%;
    height: 100%;
  }
  /* Unify type scale across the cards (matches the prototype). */
  .card-grid :global(.value-number),
  .card-grid :global(.base-card .card-value) {
    font-size: 24px !important;
    line-height: 1.15 !important;
  }
  .card-grid :global(.card-title) {
    font-size: var(--font-size-compact, 12px) !important;
    letter-spacing: 0.8px !important;
  }

  .recipe {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px 22px;
    padding: 16px 18px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
  }
  .recipe-title {
    grid-column: 1 / -1;
    font-size: 12px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .recipe-list {
    display: contents;
  }
  .recipe-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .recipe-row dt {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }
  .recipe-row dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, #fff);
    text-align: right;
  }

  /* BaseModal owns top-layer placement, backdrop, Escape, focus, and motion. */
  :global(dialog.base-modal.loop-picker-modal[data-size="xl"]) {
    width: min(1000px, 94vw);
    height: min(860px, 90dvh);
  }
  :global(dialog.base-modal.deck-picker-modal[data-size="xl"]) {
    width: min(880px, 94vw);
    height: min(840px, 90dvh);
  }
  :global(dialog.base-modal.placement-picker-modal[data-size="xl"]) {
    height: min(740px, 90dvh);
  }
  .loop-host {
    position: relative;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
  .loop-host :global(.loop-expanded-overlay) {
    position: relative !important;
    inset: auto !important;
    width: 100%;
    max-height: 82vh;
  }
  .loop-host :global(.grid-container) {
    flex: 0 0 auto;
  }
  .picker-body {
    min-height: 0;
    padding: 1rem;
  }
  .placement-picker-body {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .placement-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .pc-btn {
    min-height: 36px;
    padding: 6px 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .pc-btn:hover {
    background: var(--theme-card-hover-bg);
  }
  .pc-scope {
    margin-left: auto;
  }
  .pc-scope.active {
    background: color-mix(in srgb, var(--theme-accent) 35%, transparent);
    border-color: var(--theme-accent);
  }
  .placement-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .placement-grid.all {
    grid-template-columns: repeat(4, 1fr);
  }
  .placement-cell {
    position: relative;
    aspect-ratio: 1;
    padding: 6px;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      transform var(--transition-spring);
  }
  .placement-cell:hover {
    background: var(--theme-card-hover-bg);
    transform: translateY(-1px);
  }
  .placement-cell.on {
    border-color: var(--placement-active-accent, #14b8a6);
    background: color-mix(
      in srgb,
      var(--placement-active-accent, #14b8a6) 18%,
      transparent
    );
  }
  /* Scope to the pictograph wrapper + its SVG only — NOT every descendant.
     `:global(*) { width/height: 100% }` blows up the prop groups inside the SVG. */
  .placement-cell :global(.pictograph),
  .placement-cell :global(.pictograph svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .placement-check {
    position: absolute;
    top: 4px;
    right: 6px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--placement-active-accent, #14b8a6);
    color: var(--theme-text-on-accent, #042f2a);
    font-size: 13px;
    font-weight: 900;
    border-radius: 50%;
    box-shadow: 0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.4));
  }
  .placement-ori-row {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 16px;
  }
  .placement-hint {
    margin: 12px 2px 0;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
  }

  /* ── deck size tile: reuse BaseCard's frame, repurpose its content slot for a
        numeric input. Collapse the (empty) value div; center the input column. */
  .size-tile :global(.card-value) {
    display: none;
  }
  .size-tile :global(.card-content) {
    margin-top: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .size-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .size-step {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-hover-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }
  .size-step:hover {
    background: color-mix(
      in srgb,
      var(--theme-card-hover-bg) 75%,
      var(--theme-text) 25%
    );
  }
  .size-input {
    width: 74px;
    background: transparent;
    border: none;
    color: var(--theme-text);
    font-size: 32px;
    font-weight: 800;
    text-align: center;
    text-shadow: var(--card-text-shadow);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .size-input::-webkit-outer-spin-button,
  .size-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .size-input:focus {
    outline: none;
  }
  .size-desc {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.8px;
    color: var(--theme-text-muted);
    text-transform: uppercase;
  }
</style>
