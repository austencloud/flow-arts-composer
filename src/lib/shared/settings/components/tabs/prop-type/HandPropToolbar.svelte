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
  import CatDogToggle from "./CatDogToggle.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  let { handProps }: { handProps: HandPropToolbarProps } = $props();
</script>

<!-- Same chip and hand segments as the global prop drawer, so the viewer
     picks a pair the way every other settings-backed picker does. -->
<div class="hand-toolbar">
  <CatDogToggle
    catDogMode={handProps.catDog}
    onToggle={handProps.onToggleCatDog}
  />
  {#if handProps.catDog}
    <div transition:growFade={{ axis: "y" }}>
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
</style>
