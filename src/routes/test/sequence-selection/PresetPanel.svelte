<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "$lib/shared/selection/sequence-selection.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  let {
    presetClass,
    name,
    desc,
  }: { presetClass: string; name: string; desc: string } = $props();

  // Each panel owns its own scope so all four can show their selected state at once
  // for side-by-side comparison (setContext is scoped to this component's subtree).
  const scope = new SequenceSelection();
  setSequenceSelection(scope);

  const gp = (a: GridLocation, b: GridLocation) => {
    try {
      return getGridPlacementFromLocations(a, b);
    } catch {
      return null;
    }
  };

  function staticStep(step: number): StepData {
    const b = GridLocation.SOUTH;
    const r = GridLocation.NORTH;
    return {
      id: `${presetClass}-${step}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      startPlacement: gp(b, r),
      endPlacement: gp(b, r),
      motions: {
        left: createMotionData({
          motionType: MotionType.STATIC,
          startLocation: b,
          endLocation: b,
          hand: HandSide.LEFT,
          propType: PropType.HAND,
          gridMode: GridMode.DIAMOND,
        }),
        right: createMotionData({
          motionType: MotionType.STATIC,
          startLocation: r,
          endLocation: r,
          hand: HandSide.RIGHT,
          propType: PropType.HAND,
          gridMode: GridMode.DIAMOND,
        }),
      },
      stepNumber: step,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    } as unknown as StepData;
  }

  const STRIP = [0, 1, 2, 3, 4];
  const GROUP = [0, 1, 2, 3];
  const sid = `${presetClass}-strip`;
  const gid = `${presetClass}-group`;
</script>

<article class="card">
  <header>
    <h3>{name}</h3>
    <p>{desc}</p>
  </header>

  <div class="sheet {presetClass}">
    <div class="demo">
      <span class="cap">Guide strip — one ring</span>
      <div
        class="strip tka-seq-cell"
        class:is-hovered={scope.isHovered(sid)}
        class:is-selected={scope.isSelected(sid)}
      >
        {#each STRIP as c (c)}
          <div class="pcell">
            <PictographContainer
              pictographData={staticStep(c)}
              gridMode={GridMode.DIAMOND}
              leftPropTypeOverride={PropType.HAND}
              rightPropTypeOverride={PropType.HAND}
              showGrid={true}
              showTKA={false}
              showPlacements={c > 0}
              showHandPoints={true}
              darkMode={false}
              printMode={true}
              disableTransitions={true}
            />
          </div>
        {/each}
        <SelectionHit
          groupId={sid}
          isGroupStart
          label="Select the demo strip"
          onselect={(id) => scope.select(id)}
        />
      </div>
    </div>

    <div class="demo">
      <span class="cap">Choreo cells — wrap</span>
      <div class="grid">
        {#each GROUP as c (c)}
          <div
            class="gcell tka-seq-cell"
            class:is-hovered={scope.isHovered(gid)}
            class:is-selected={scope.isSelected(gid)}
          >
            <div class="pcell">
              <PictographContainer
                pictographData={staticStep(c)}
                gridMode={GridMode.DIAMOND}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
                showGrid={true}
                showTKA={false}
                showPlacements={c > 0}
                showHandPoints={true}
                darkMode={false}
                printMode={true}
                disableTransitions={true}
              />
            </div>
            <SelectionHit
              groupId={gid}
              isGroupStart={c === 0}
              label={c === 0 ? "Select the demo group" : ""}
              onselect={(id) => scope.toggle(id)}
            />
          </div>
        {/each}
      </div>
    </div>
  </div>
</article>

<style>
  .card {
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 16px;
    padding: 20px 20px 24px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.08);
  }
  header {
    margin-bottom: 16px;
  }
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #1a1a22;
  }
  header p {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.4;
    color: #6a6a78;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 22px;
    background: #fbfbfd;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 12px;
    padding: 20px 18px;
  }
  .cap {
    display: block;
    margin-bottom: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a8a96;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(5, 64px);
    border: 1px solid #c8c8d2;
    background: #fff;
    width: max-content;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 66px);
    gap: 6px;
    width: max-content;
  }
  .pcell {
    position: relative;
    width: 64px;
    height: 64px;
    overflow: hidden;
  }
  .gcell {
    border: 1px solid #c8c8d2;
    border-radius: 3px;
    overflow: hidden;
  }
</style>
