<script module lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  /**
   * Per-hand picking for hosts whose props live in settings. The Props page
   * gains the Cat Dog chip and, while it is on, Left/Right hand segments to
   * pick which hand the grid below addresses. Hosts with one local prop
   * (Post Studio, profile photo, landing) omit this and keep the single grid.
   */
  export interface HandPropToolbarProps {
    catDog: boolean;
    hand: "left" | "right";
    leftPropType: PropType;
    rightPropType: PropType;
    onToggleCatDog: () => void;
    onHandChange: (hand: "left" | "right") => void;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import CatDogToggle from "./CatDogToggle.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  let {
    handProps,
    actions,
    compact = false,
  }: { handProps: HandPropToolbarProps; actions?: Snippet; compact?: boolean } = $props();
</script>

<!-- Same chip and hand segments as the global prop drawer, so the viewer
     picks a pair the way every other settings-backed picker does. -->
<div class="hand-toolbar" class:with-actions={!!actions} class:compact>
  <div class="cat-dog-control">
    <CatDogToggle
      catDogMode={handProps.catDog}
      onToggle={handProps.onToggleCatDog}
    />
  </div>
  {#if actions}<div class="toolbar-actions">{@render actions()}</div>{/if}
  {#if handProps.catDog}
    <div class="hand-segments" transition:growFade={{ axis: "y" }}>
      <SegmentedControl
        options={[
          { value: "left", label: "Left", tone: "blue" },
          { value: "right", label: "Right", tone: "red" },
        ]}
        value={handProps.hand}
        onchange={handProps.onHandChange}
        ariaLabel="Prop hand selection"
        semantics="radiogroup"
      />
    </div>
  {/if}
</div>

<style>
  /* Cat Dog chip and hand segments above the grid; mirrors the global prop
     drawer's toolbar so the pair reads the same wherever it is picked. */
  .hand-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 16px 4px;
    flex-shrink: 0;
  }
  .hand-toolbar.with-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    justify-items: center;
    padding: 8px 12px 4px;
  }
  .cat-dog-control {
    min-width: 0;
  }
  .with-actions .cat-dog-control {
    grid-column: 2;
  }
  .toolbar-actions {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }
  .hand-segments {
    min-width: 0;
  }
  .with-actions .hand-segments {
    grid-column: 1 / -1;
    justify-self: center;
  }
  .hand-toolbar.compact,
  .hand-toolbar.compact.with-actions {
    display: flex;
    justify-content: flex-start;
    gap: 6px;
    padding: 0;
  }
  .compact .toolbar-actions,
  .compact.with-actions .cat-dog-control,
  .compact.with-actions .hand-segments {
    grid-column: auto;
    grid-row: auto;
    justify-self: auto;
  }
</style>
