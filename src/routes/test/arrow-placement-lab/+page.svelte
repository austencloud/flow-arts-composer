<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    HandSide,
    type RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import {
    isVisibleMotion,
    type MotionData,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import type { PipelineDiagnostics } from "$lib/shared/pictograph/arrow/positioning/calculation/domain/pipeline-diagnostics";
  import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
  import { arrowAdjustmentCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator";
  import { applyRotationMatrix } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-coordinate-transformer";
  import {
    getInitialPosition,
    getSceneCenter,
  } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-grid-coordinator";
  import {
    calculateArrowPoint,
    shouldMirrorArrow,
  } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
  import { generatePlacementKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator";
  import {
    buildPlacementFixture,
    buildPictographPlacementFixture,
    type PlacementFixture,
    type PlacementMotionName,
  } from "../arrow-placement-fixture";
  import type { PageData } from "./$types";

  interface FrameCalculation {
    point: { x: number; y: number };
    anchor: { x: number; y: number };
    adjustment: { x: number; y: number };
    rotation: number;
    mirrored: boolean;
    diagnostics: PipelineDiagnostics;
  }

  interface PlacementComparison {
    diamond: FrameCalculation;
    box: FrameCalculation;
    expectedBoxPoint: { x: number; y: number };
    expectedBoxRotation: number;
    positionResidual: number;
    rotationResidual: number;
    mirrorMatches: boolean;
  }

  type LabMode = "pictograph" | "placement";

  let { data }: { data: PageData } = $props();

  const POSITION_TOLERANCE = 0.1;
  const ANGLE_TOLERANCE = 0.1;
  const firstMotion = data.catalog[0]!;
  const firstKey = firstMotion.keys[0]!;
  const firstTurn = firstKey.turns[0]!;
  const PICTOGRAPH_TURN_OPTIONS = ["0", "0.5", "1", "1.5", "2", "2.5", "3"].map(
    (value) => ({ value })
  );

  let labMode = $state<LabMode>("pictograph");
  let selectedMotionType = $state<PlacementMotionName>(firstMotion.motionType);
  let selectedPlacementKey = $state(firstKey.placementKey);
  let selectedTurns = $state(firstTurn.value);
  let selectedRotation = $state<RotationDirection>(
    firstTurn.rotationDirections[0]!
  );
  let comparison = $state<PlacementComparison | null>(null);
  let calculationError = $state<string | null>(null);
  let pictographs = $state<PictographData[]>([]);
  let pictographLoading = $state(true);
  let pictographLoadError = $state<string | null>(null);
  let selectedLetter = $state("H");
  let selectedVariationIndex = $state(0);
  let calculationRevision = 0;

  const motionEntry = $derived(
    data.catalog.find((entry) => entry.motionType === selectedMotionType) ??
      firstMotion
  );
  const keyEntry = $derived(
    motionEntry.keys.find(
      (entry) => entry.placementKey === selectedPlacementKey
    ) ?? motionEntry.keys[0]!
  );
  const turnEntry = $derived(
    keyEntry.turns.find((entry) => entry.value === selectedTurns) ??
      keyEntry.turns[0]!
  );
  const selectablePictographs = $derived(
    pictographs.filter(
      (pictograph) =>
        Boolean(pictograph.letter) &&
        isVisibleMotion(pictograph.motions.left) &&
        isVisibleMotion(pictograph.motions.right)
    )
  );
  const letterOptions = $derived([
    ...new Set(
      selectablePictographs.map((pictograph) => String(pictograph.letter))
    ),
  ]);
  const variations = $derived(
    selectablePictographs.filter(
      (pictograph) => pictograph.letter === selectedLetter
    )
  );
  const selectedPictograph = $derived(
    variations[selectedVariationIndex] ?? variations[0] ?? null
  );
  const turnOptions = $derived(
    labMode === "pictograph" ? PICTOGRAPH_TURN_OPTIONS : keyEntry.turns
  );
  const fixture = $derived<PlacementFixture | null>(
    labMode === "pictograph"
      ? selectedPictograph && !pictographLoading && !pictographLoadError
        ? buildPictographPlacementFixture(
            selectedPictograph,
            Number(selectedTurns === "fl" ? 0 : selectedTurns)
          )
        : null
      : buildPlacementFixture(
          selectedMotionType,
          selectedPlacementKey,
          selectedTurns === "fl" ? "fl" : Number(selectedTurns),
          selectedRotation
        )
  );
  const activeMotionType = $derived(
    fixture
      ? normalizeMotionType(fixture.diamondMotion.motionType)
      : selectedMotionType
  );
  const activeMotionEntry = $derived(
    data.catalog.find((entry) => entry.motionType === activeMotionType) ??
      motionEntry
  );
  const resolvedPlacementKey = $derived(
    fixture
      ? generatePlacementKey(
          fixture.diamondMotion,
          fixture.diamond,
          activeMotionEntry.keys.map((entry) => entry.placementKey)
        )
      : null
  );
  const parityMatches = $derived(
    comparison
      ? comparison.positionResidual <= POSITION_TOLERANCE &&
          comparison.rotationResidual <= ANGLE_TOLERANCE &&
          comparison.mirrorMatches
      : false
  );

  $effect(() => {
    const currentFixture = fixture;
    const revision = ++calculationRevision;
    comparison = null;
    calculationError = null;

    if (!currentFixture) return;

    void calculateComparison(currentFixture)
      .then((result) => {
        if (revision === calculationRevision) comparison = result;
      })
      .catch((error: unknown) => {
        if (revision !== calculationRevision) return;
        calculationError =
          error instanceof Error
            ? error.message
            : "Placement calculation failed";
      });
  });

  onMount(() => {
    void loadPictographs();
  });

  async function loadPictographs(): Promise<void> {
    pictographLoading = true;
    pictographLoadError = null;
    try {
      pictographs = await letterQueryHandler.getAllPictographVariations(
        GridMode.DIAMOND
      );
      if (pictographs.length === 0) {
        throw new Error("The diamond pictograph dataframe returned no rows");
      }
      const hasSelectedLetter = pictographs.some(
        (pictograph) => pictograph.letter === selectedLetter
      );
      if (!hasSelectedLetter) {
        selectedLetter = String(pictographs[0]!.letter);
      }
      selectedVariationIndex = 0;
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      pictographLoadError = "Pictographs could not be loaded";
      getErrorHandler().showUserError({
        message: pictographLoadError,
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "test",
          tab: "arrow-placement-lab",
          action: "load-pictographs",
        },
      });
    } finally {
      pictographLoading = false;
    }
  }

  function normalizeMotionType(motionType: unknown): PlacementMotionName {
    const normalized = String(motionType).toLowerCase();
    if (
      normalized === "pro" ||
      normalized === "anti" ||
      normalized === "dash" ||
      normalized === "static" ||
      normalized === "float"
    ) {
      return normalized;
    }
    return "pro";
  }

  function chooseLabMode(mode: LabMode): void {
    labMode = mode;
    if (mode === "pictograph") {
      if (selectedTurns === "fl") selectedTurns = "0";
      return;
    }

    const nextTurn =
      keyEntry.turns.find((entry) => entry.value === selectedTurns) ??
      keyEntry.turns[0];
    const nextRotation = nextTurn?.rotationDirections[0];
    if (!nextTurn || !nextRotation) return;
    selectedTurns = nextTurn.value;
    selectedRotation = nextRotation;
  }

  function chooseLetter(letter: string): void {
    selectedLetter = letter;
    selectedVariationIndex = 0;
  }

  function randomizePictograph(): void {
    if (selectablePictographs.length === 0) return;
    const currentId = selectedPictograph?.id;
    let index = Math.floor(Math.random() * selectablePictographs.length);
    if (
      selectablePictographs.length > 1 &&
      selectablePictographs[index]?.id === currentId
    ) {
      index = (index + 1) % selectablePictographs.length;
    }

    const next = selectablePictographs[index]!;
    const nextLetter = String(next.letter);
    const nextVariations = selectablePictographs.filter(
      (pictograph) => pictograph.letter === nextLetter
    );
    selectedLetter = nextLetter;
    selectedVariationIndex = Math.max(
      0,
      nextVariations.findIndex((pictograph) => pictograph.id === next.id)
    );
    labMode = "pictograph";
    if (selectedTurns === "fl") selectedTurns = "0";
  }

  function variationLabel(pictograph: PictographData, index: number): string {
    const left = pictograph.motions.left;
    const right = pictograph.motions.right;
    const position = `${pictograph.startPlacement ?? "?"} → ${pictograph.endPlacement ?? "?"}`;
    const paths = `${left?.startLocation ?? "?"}→${left?.endLocation ?? "?"} / ${right?.startLocation ?? "?"}→${right?.endLocation ?? "?"}`;
    return `${index + 1}. ${position} · ${paths}`;
  }

  function chooseMotion(motionType: PlacementMotionName): void {
    const nextMotion = data.catalog.find(
      (entry) => entry.motionType === motionType
    );
    const nextKey = nextMotion?.keys[0];
    const nextTurn = nextKey?.turns[0];
    const nextRotation = nextTurn?.rotationDirections[0];
    if (!nextMotion || !nextKey || !nextTurn || !nextRotation) return;

    selectedMotionType = motionType;
    selectedPlacementKey = nextKey.placementKey;
    selectedTurns = nextTurn.value;
    selectedRotation = nextRotation;
  }

  function choosePlacementKey(placementKey: string): void {
    const nextKey = motionEntry.keys.find(
      (entry) => entry.placementKey === placementKey
    );
    const nextTurn = nextKey?.turns[0];
    const nextRotation = nextTurn?.rotationDirections[0];
    if (!nextKey || !nextTurn || !nextRotation) return;

    selectedPlacementKey = placementKey;
    selectedTurns = nextTurn.value;
    selectedRotation = nextRotation;
  }

  function chooseTurns(turns: string): void {
    if (labMode === "pictograph") {
      if (PICTOGRAPH_TURN_OPTIONS.some((entry) => entry.value === turns)) {
        selectedTurns = turns;
      }
      return;
    }

    const nextTurn = keyEntry.turns.find((entry) => entry.value === turns);
    const nextRotation = nextTurn?.rotationDirections[0];
    if (!nextTurn || !nextRotation) return;

    selectedTurns = turns;
    selectedRotation = nextRotation;
  }

  function formatTurn(turns: string): string {
    if (turns === "fl") return "float";
    const numeric = Number(turns);
    return `${turns} ${numeric === 1 ? "turn" : "turns"}`;
  }

  function formatDirection(direction: RotationDirection): string {
    if (direction === "cw") return "clockwise";
    if (direction === "ccw") return "counterclockwise";
    return "no rotation";
  }

  function pointStyle(point: { x: number; y: number }): string {
    return `left:${(point.x / 950) * 100}%;top:${(point.y / 950) * 100}%`;
  }

  function signed(value: number): string {
    const rounded = Math.abs(value) < 0.0005 ? 0 : value;
    return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
  }

  async function calculateComparison(
    currentFixture: PlacementFixture
  ): Promise<PlacementComparison> {
    const [diamond, box] = await Promise.all([
      calculateFrame(
        currentFixture.diamond,
        currentFixture.diamondMotion,
        GridMode.DIAMOND
      ),
      calculateFrame(
        currentFixture.box,
        currentFixture.boxMotion,
        GridMode.BOX
      ),
    ]);
    const center = getSceneCenter();
    const [relativeX, relativeY] = applyRotationMatrix(
      diamond.point.x - center.x,
      diamond.point.y - center.y,
      45
    );
    const expectedBoxPoint = {
      x: center.x + relativeX,
      y: center.y + relativeY,
    };
    const expectedBoxRotation = normalizeAngle(diamond.rotation + 45);

    return {
      diamond,
      box,
      expectedBoxPoint,
      expectedBoxRotation,
      positionResidual: Math.hypot(
        box.point.x - expectedBoxPoint.x,
        box.point.y - expectedBoxPoint.y
      ),
      rotationResidual: angularDistance(box.rotation, expectedBoxRotation),
      mirrorMatches: box.mirrored === diamond.mirrored,
    };
  }

  async function calculateFrame(
    pictograph: PictographData,
    motion: MotionData,
    gridMode: GridMode
  ): Promise<FrameCalculation> {
    const location = arrowLocationCalculator.calculateLocation(
      motion,
      pictograph
    );
    const [[x, y, rotation], diagnostics] = await Promise.all([
      calculateArrowPoint(pictograph, motion, gridMode),
      arrowAdjustmentCalculator.getDiagnostics(
        pictograph,
        motion,
        pictograph.letter || "A",
        location,
        HandSide.LEFT
      ),
    ]);
    const anchor = getInitialPosition(motion, location, gridMode);

    return {
      point: { x, y },
      anchor: { x: anchor.x, y: anchor.y },
      adjustment: { x: x - anchor.x, y: y - anchor.y },
      rotation,
      mirrored: shouldMirrorArrow({} as never, pictograph, motion),
      diagnostics,
    };
  }

  function normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }

  function angularDistance(actual: number, expected: number): number {
    const delta = Math.abs(normalizeAngle(actual) - normalizeAngle(expected));
    return Math.min(delta, 360 - delta);
  }
</script>

<svelte:head>
  <title>Arrow Placement Rotation Lab</title>
</svelte:head>

<main class="lab-shell">
  <header class="lab-header">
    <div>
      <p class="eyebrow">Arrow placement lab</p>
      <h1>Rotate it. Inspect it.</h1>
      <p class="lede">
        Choose a real authored placement. Both cards run the production
        positioning pipeline. The box arrow must land where a 45° rotation of
        the diamond point predicts.
      </p>
    </div>
    <div class="catalog-stats" aria-label="Placement catalog size">
      <div>
        <strong>{data.placementKeyCount}</strong><span>placement keys</span>
      </div>
      <div>
        <strong>{data.authoredContextCount}</strong><span
          >authored contexts</span
        >
      </div>
    </div>
  </header>

  <section class="control-deck" aria-label="Placement controls">
    <div class="control-block mode-control">
      <span class="control-label">Source</span>
      <div class="segmented-control">
        <button
          type="button"
          class:active={labMode === "pictograph"}
          aria-pressed={labMode === "pictograph"}
          onclick={() => chooseLabMode("pictograph")}>Pictograph</button
        >
        <button
          type="button"
          class:active={labMode === "placement"}
          aria-pressed={labMode === "placement"}
          onclick={() => chooseLabMode("placement")}>Placement key</button
        >
      </div>
    </div>

    {#if labMode === "placement"}
      <div class="control-block motion-control">
        <span class="control-label">Motion</span>
        <div class="segmented-control">
          {#each data.catalog as entry}
            <button
              type="button"
              class:active={entry.motionType === selectedMotionType}
              aria-pressed={entry.motionType === selectedMotionType}
              onclick={() => chooseMotion(entry.motionType)}
            >
              {entry.motionType}
            </button>
          {/each}
        </div>
      </div>

      <label class="control-block key-control">
        <span class="control-label">Placement key</span>
        <select
          id="placement-key"
          name="placement-key"
          value={selectedPlacementKey}
          onchange={(event) => choosePlacementKey(event.currentTarget.value)}
        >
          {#each motionEntry.keys as entry}
            <option value={entry.placementKey}>{entry.placementKey}</option>
          {/each}
        </select>
      </label>
    {:else}
      <div class="control-block letter-control">
        <label class="control-label" for="pictograph-letter">Pictograph</label>
        <div class="source-row">
          <select
            id="pictograph-letter"
            name="pictograph-letter"
            value={selectedLetter}
            disabled={pictographLoading || letterOptions.length === 0}
            onchange={(event) => chooseLetter(event.currentTarget.value)}
          >
            {#each letterOptions as letter}
              <option value={letter}>{letter}</option>
            {/each}
          </select>
          <button
            type="button"
            class="random-button"
            disabled={pictographLoading || selectablePictographs.length === 0}
            onclick={randomizePictograph}>Randomize</button
          >
        </div>
      </div>

      <label class="control-block variation-control">
        <span class="control-label">Variation</span>
        <select
          id="pictograph-variation"
          name="pictograph-variation"
          bind:value={selectedVariationIndex}
          disabled={pictographLoading || variations.length === 0}
        >
          {#each variations as variation, index}
            <option value={index}>{variationLabel(variation, index)}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="control-block">
      <span class="control-label">Turns</span>
      <div class="chip-row">
        {#each turnOptions as turn}
          <button
            type="button"
            class:active={turn.value === selectedTurns}
            aria-pressed={turn.value === selectedTurns}
            onclick={() => chooseTurns(turn.value)}
          >
            {formatTurn(turn.value)}
          </button>
        {/each}
      </div>
    </div>

    {#if labMode === "placement"}
      <div class="control-block">
        <span class="control-label">Rotation</span>
        <div class="chip-row">
          {#each turnEntry.rotationDirections as direction}
            <button
              type="button"
              class:active={direction === selectedRotation}
              aria-pressed={direction === selectedRotation}
              onclick={() => (selectedRotation = direction)}
            >
              {formatDirection(direction)}
            </button>
          {/each}
        </div>
      </div>
    {:else if pictographLoadError}
      <div class="control-block source-feedback error-feedback">
        <span>{pictographLoadError}</span>
        <button type="button" onclick={() => void loadPictographs()}
          >Retry</button
        >
      </div>
    {:else}
      <div class="control-block source-feedback">
        <span class="control-label">Motion data</span>
        {#if pictographLoading}
          <span>Loading pictographs</span>
        {:else if selectedPictograph}
          <span>
            Left {selectedPictograph.motions.left?.motionType},
            {formatDirection(
              selectedPictograph.motions.left
                ?.rotationDirection as RotationDirection
            )}. Right {selectedPictograph.motions.right?.motionType},
            {formatDirection(
              selectedPictograph.motions.right
                ?.rotationDirection as RotationDirection
            )}.
          </span>
        {/if}
      </div>
    {/if}
  </section>

  <section
    class:checking={!comparison && !calculationError}
    class:matched={parityMatches}
    class:mismatched={comparison && !parityMatches}
    class="parity-strip"
    aria-live="polite"
  >
    {#if labMode === "pictograph" && pictographLoading}
      <strong>Loading pictographs</strong>
      <span>The comparison will start when a pictograph is ready.</span>
    {:else if labMode === "pictograph" && pictographLoadError}
      <strong>Pictographs unavailable</strong>
      <span>Retry the load before checking placement.</span>
    {:else if labMode === "pictograph" && !fixture}
      <strong>No pictograph available</strong>
      <span>Choose a pictograph before checking placement.</span>
    {:else if calculationError}
      <strong>Calculation failed</strong>
      <span>{calculationError}</span>
    {:else if comparison}
      <strong
        >{parityMatches
          ? "Canonical presentation matches"
          : "Mismatch detected"}</strong
      >
      <span>Position residual: {comparison.positionResidual.toFixed(6)} px</span
      >
      <span>Angle residual: {comparison.rotationResidual.toFixed(3)}°</span>
      <span>Mirroring: {comparison.mirrorMatches ? "matches" : "differs"}</span>
      <span
        >Pass limits: {POSITION_TOLERANCE.toFixed(1)} px / {ANGLE_TOLERANCE.toFixed(
          1
        )}°</span
      >
      <span>Active tier: {comparison.box.diagnostics.activeTier}</span>
      {#if resolvedPlacementKey}
        <span>Active key: {resolvedPlacementKey}</span>
      {/if}
    {:else}
      <strong>Calculating placement</strong>
      <span>Running both production paths</span>
    {/if}
  </section>

  {#if fixture}
    <section class="viewer-grid" aria-label="Diamond and box comparison">
      <article class="render-card diamond-card">
        <header class="render-header">
          <div>
            <p class="frame-kicker">Source frame</p>
            <h2>Diamond</h2>
          </div>
          <span class="grid-badge">0°</span>
        </header>
        <div class="pictograph-stage">
          <PictographContainer
            pictographData={fixture.diamond}
            showRightMotion={false}
            showLeftMotion
            showTKA={false}
            disableTransitions
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
          />
          {#if comparison}
            <span
              class="point-ring diamond-ring"
              style={pointStyle(comparison.diamond.point)}
              aria-hidden="true"
            ></span>
          {/if}
        </div>
        {#if comparison}
          <dl class="readout-grid">
            <div>
              <dt>Arrow point</dt>
              <dd>
                {signed(comparison.diamond.point.x)}, {signed(
                  comparison.diamond.point.y
                )}
              </dd>
            </div>
            <div>
              <dt>Adjustment</dt>
              <dd>
                {signed(comparison.diamond.adjustment.x)}, {signed(
                  comparison.diamond.adjustment.y
                )}
              </dd>
            </div>
            <div>
              <dt>Glyph angle</dt>
              <dd>{comparison.diamond.rotation.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Prop orientation</dt>
              <dd>
                {fixture.diamondMotion.startOrientation} →
                {fixture.diamondMotion.endOrientation}
              </dd>
            </div>
          </dl>
        {/if}
      </article>

      <article class="render-card box-card">
        <header class="render-header">
          <div>
            <p class="frame-kicker">Rotated frame</p>
            <h2>Box</h2>
          </div>
          <span class="grid-badge">+45°</span>
        </header>
        <div class="pictograph-stage">
          <PictographContainer
            pictographData={fixture.box}
            showRightMotion={false}
            showLeftMotion
            showTKA={false}
            disableTransitions
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
          />
          {#if comparison}
            <span
              class="point-ring expected-ring"
              style={pointStyle(comparison.expectedBoxPoint)}
              aria-hidden="true"
            ></span>
            <span
              class="point-ring box-ring"
              style={pointStyle(comparison.box.point)}
              aria-hidden="true"
            ></span>
          {/if}
        </div>
        {#if comparison}
          <dl class="readout-grid">
            <div>
              <dt>Arrow point</dt>
              <dd>
                {signed(comparison.box.point.x)}, {signed(
                  comparison.box.point.y
                )}
              </dd>
            </div>
            <div>
              <dt>Expected point</dt>
              <dd>
                {signed(comparison.expectedBoxPoint.x)}, {signed(
                  comparison.expectedBoxPoint.y
                )}
              </dd>
            </div>
            <div>
              <dt>Adjustment</dt>
              <dd>
                {signed(comparison.box.adjustment.x)}, {signed(
                  comparison.box.adjustment.y
                )}
              </dd>
            </div>
            <div>
              <dt>Prop orientation</dt>
              <dd>
                {fixture.boxMotion.startOrientation} →
                {fixture.boxMotion.endOrientation}
              </dd>
            </div>
          </dl>
        {/if}
      </article>
    </section>
  {/if}

  <footer class="lab-footer">
    <p>
      Blue marks the calculated arrow point. The larger gold ring marks the
      independently predicted box point. A correct rotation makes the rings
      share one center.
    </p>
    <p>
      The 0.1 px pass limit covers the grid anchors stored to one decimal place.
    </p>
    {#if selectedTurns === "fl"}
      <p>Float has no turn count, so its authored state is labeled “float.”</p>
    {/if}
    <a href="/test/arrow-placement-frame">View the five retired box outliers</a>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 92%,
      var(--semantic-info)
    );
  }

  .lab-shell {
    --lab-page-bg: color-mix(
      in srgb,
      var(--theme-panel-bg) 92%,
      var(--semantic-info)
    );
    --lab-panel-bg: color-mix(
      in srgb,
      var(--theme-panel-bg) 86%,
      var(--semantic-info)
    );
    --lab-card-bg: color-mix(
      in srgb,
      var(--theme-card-bg) 94%,
      var(--semantic-info)
    );
    --lab-control-bg: color-mix(
      in srgb,
      var(--theme-card-bg) 82%,
      var(--semantic-info)
    );
    --lab-stage-bg: color-mix(
      in srgb,
      var(--theme-card-bg) 97%,
      var(--semantic-info)
    );
    --lab-text: var(--theme-text);
    --lab-muted: color-mix(
      in srgb,
      var(--theme-text-dim) 88%,
      var(--semantic-info)
    );
    --lab-blue: color-mix(in srgb, var(--semantic-info) 72%, var(--theme-text));
    --lab-stroke: color-mix(in srgb, var(--theme-stroke) 68%, var(--lab-blue));
    --lab-green: var(--semantic-success);
    --lab-error: var(--semantic-error);
    --lab-gold: var(--semantic-warning);
    min-height: 100vh;
    padding: clamp(1rem, 2.5vw, 3rem);
    color: var(--lab-text);
    background:
      radial-gradient(
        circle at 12% 4%,
        color-mix(in srgb, var(--semantic-info) 14%, transparent),
        transparent 30rem
      ),
      radial-gradient(
        circle at 90% 12%,
        color-mix(in srgb, var(--semantic-success) 10%, transparent),
        transparent 28rem
      ),
      var(--lab-page-bg);
  }

  .lab-header,
  .control-deck,
  .parity-strip,
  .viewer-grid,
  .lab-footer {
    width: min(100%, 1760px);
    margin-inline: auto;
  }

  .lab-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .eyebrow,
  .frame-kicker,
  .control-label {
    color: var(--lab-blue);
    font-size: max(0.78rem, 12px);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .eyebrow,
  .frame-kicker {
    margin: 0 0 0.45rem;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0;
    font-size: clamp(2.4rem, 5vw, 5.6rem);
    line-height: 0.94;
    letter-spacing: -0.05em;
  }

  .lede {
    max-width: 68rem;
    margin: 1rem 0 0;
    color: var(--lab-muted);
    font-size: clamp(1rem, 1.3vw, 1.35rem);
    line-height: 1.55;
  }

  .catalog-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(8.5rem, 1fr));
    overflow: hidden;
    flex: 0 0 auto;
    border: 1px solid var(--lab-stroke);
    border-radius: 1rem;
    background: var(--lab-panel-bg);
  }

  .catalog-stats div {
    padding: 1rem 1.25rem;
    text-align: right;
  }

  .catalog-stats div + div {
    border-left: 1px solid var(--lab-stroke);
  }

  .catalog-stats strong,
  .catalog-stats span {
    display: block;
  }

  .catalog-stats strong {
    color: var(--lab-blue);
    font-size: 1.7rem;
  }

  .catalog-stats span {
    margin-top: 0.2rem;
    color: var(--lab-muted);
    font-size: max(0.75rem, 12px);
  }

  .control-deck {
    display: grid;
    grid-template-columns: minmax(20rem, 1.3fr) minmax(20rem, 1.7fr);
    gap: 1rem 1.5rem;
    margin-bottom: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--lab-stroke);
    border-radius: 1.25rem;
    background: var(--lab-panel-bg);
  }

  .control-block {
    display: grid;
    align-content: start;
    gap: 0.55rem;
    min-width: 0;
  }

  .mode-control {
    grid-column: 1 / -1;
  }

  .source-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
  }

  .random-button {
    white-space: nowrap;
  }

  .source-feedback {
    align-content: center;
    min-height: 4.4rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--lab-stroke);
    border-radius: 0.72rem;
    color: var(--lab-muted);
    background: var(--lab-control-bg);
    font-size: max(0.82rem, 13px);
  }

  .error-feedback {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-color: color-mix(in srgb, var(--lab-error) 55%, transparent);
    color: var(--lab-error);
  }

  .segmented-control,
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  button,
  select {
    min-height: 44px;
    border: 1px solid var(--lab-stroke);
    border-radius: 0.72rem;
    color: var(--lab-text);
    background: var(--lab-control-bg);
    font: inherit;
  }

  button {
    padding: 0.65rem 0.9rem;
    font-size: max(0.86rem, 14px);
    font-weight: 750;
    cursor: pointer;
  }

  button:hover {
    border-color: color-mix(in srgb, var(--lab-blue) 62%, transparent);
    background: color-mix(in srgb, var(--lab-blue) 10%, var(--lab-control-bg));
  }

  button.active {
    border-color: var(--lab-blue);
    color: var(--lab-page-bg);
    background: var(--lab-blue);
  }

  button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  button:focus-visible,
  select:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--lab-gold);
    outline-offset: 3px;
  }

  select {
    width: 100%;
    padding: 0.65rem 2.5rem 0.65rem 0.85rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: max(0.78rem, 13px);
  }

  .parity-strip {
    display: flex;
    align-items: center;
    gap: 1rem 1.5rem;
    min-height: 3.5rem;
    margin-bottom: 1rem;
    padding: 0.75rem 1.1rem;
    border: 1px solid var(--lab-stroke);
    border-radius: 0.9rem;
    background: var(--lab-panel-bg);
  }

  .parity-strip strong {
    font-size: max(0.95rem, 15px);
  }

  .parity-strip span {
    color: var(--lab-muted);
    font-size: max(0.82rem, 13px);
  }

  .parity-strip.matched {
    border-color: color-mix(in srgb, var(--lab-green) 55%, transparent);
    box-shadow: inset 4px 0 var(--lab-green);
  }

  .parity-strip.matched strong {
    color: var(--lab-green);
  }

  .parity-strip.mismatched {
    border-color: color-mix(in srgb, var(--lab-error) 62%, transparent);
    box-shadow: inset 4px 0 var(--lab-error);
  }

  .parity-strip.mismatched strong {
    color: var(--lab-error);
  }

  .viewer-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .render-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--lab-stroke);
    border-radius: 1.25rem;
    background: var(--lab-card-bg);
  }

  .render-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--lab-stroke);
    background: var(--lab-panel-bg);
  }

  .render-header h2 {
    margin: 0;
    font-size: clamp(1.6rem, 2.6vw, 2.5rem);
    line-height: 1;
  }

  .frame-kicker {
    color: var(--lab-muted);
  }

  .grid-badge {
    padding: 0.45rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--lab-blue) 35%, transparent);
    border-radius: 999px;
    color: var(--lab-blue);
    background: color-mix(in srgb, var(--lab-blue) 8%, transparent);
    font:
      800 max(0.85rem, 14px) ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }

  .pictograph-stage {
    position: relative;
    width: min(100%, 720px);
    aspect-ratio: 1;
    margin: 1rem auto 0;
    background:
      linear-gradient(
        color-mix(in srgb, var(--lab-text) 1.8%, transparent),
        color-mix(in srgb, var(--lab-text) 1.8%, transparent)
      ),
      var(--lab-stage-bg);
  }

  .point-ring {
    position: absolute;
    z-index: 8;
    width: 1.15rem;
    height: 1.15rem;
    border: 3px solid var(--lab-blue);
    border-radius: 50%;
    box-shadow: 0 0 1rem color-mix(in srgb, var(--lab-blue) 90%, transparent);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .expected-ring {
    z-index: 7;
    width: 1.85rem;
    height: 1.85rem;
    border-color: var(--lab-gold);
    box-shadow: 0 0 1rem color-mix(in srgb, var(--lab-gold) 72%, transparent);
  }

  .readout-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin: 0;
    border-top: 1px solid var(--lab-stroke);
  }

  .readout-grid div {
    min-width: 0;
    padding: 0.85rem 1rem;
  }

  .readout-grid div:nth-child(even) {
    border-left: 1px solid var(--lab-stroke);
  }

  .readout-grid div:nth-child(n + 3) {
    border-top: 1px solid var(--lab-stroke);
  }

  .readout-grid dt {
    margin-bottom: 0.25rem;
    color: var(--lab-muted);
    font-size: max(0.72rem, 12px);
    font-weight: 750;
    text-transform: uppercase;
  }

  .readout-grid dd {
    overflow: hidden;
    margin: 0;
    font:
      750 max(0.82rem, 13px) ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lab-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem 2rem;
    margin-top: 1rem;
    padding: 1rem 1.2rem;
    border: 1px solid var(--lab-stroke);
    border-radius: 1rem;
    background: var(--lab-panel-bg);
  }

  .lab-footer p {
    margin: 0;
    color: var(--lab-muted);
    font-size: max(0.82rem, 13px);
    line-height: 1.45;
  }

  .lab-footer a {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--lab-blue);
    font-size: max(0.86rem, 14px);
    font-weight: 750;
    text-underline-offset: 0.22em;
  }

  @media (min-width: 2600px) {
    .lab-header,
    .control-deck,
    .parity-strip,
    .viewer-grid,
    .lab-footer {
      width: min(100%, 2400px);
    }

    .pictograph-stage {
      width: min(100%, 920px);
    }
  }

  @media (max-width: 900px) {
    .lab-header,
    .lab-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .catalog-stats {
      align-self: stretch;
    }

    .catalog-stats div {
      text-align: left;
    }

    .control-deck,
    .viewer-grid {
      grid-template-columns: 1fr;
    }

    .parity-strip {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }

    .lab-footer a {
      margin-left: 0;
    }
  }

  @media (max-width: 520px) {
    .lab-shell {
      padding: 0.85rem;
    }

    h1 {
      font-size: clamp(2.4rem, 13vw, 3.5rem);
    }

    .control-deck {
      padding: 0.85rem;
    }

    .segmented-control button,
    .chip-row button {
      flex: 1 1 auto;
    }

    .pictograph-stage {
      margin-top: 0.5rem;
    }

    .readout-grid {
      grid-template-columns: 1fr;
    }

    .readout-grid div:nth-child(even) {
      border-left: 0;
    }

    .readout-grid div + div {
      border-top: 1px solid var(--lab-stroke);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
