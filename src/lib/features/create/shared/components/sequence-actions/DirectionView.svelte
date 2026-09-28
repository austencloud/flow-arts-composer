<!--
  DirectionView.svelte

  Folds the two prop-spin interfaces into one Direction drawer:
  - Reversals (default): relative reverse-on/off pattern strip (the native TKA
    vocabulary — Book / Alternating / Solo, the colored-dot readout).
  - Direction: absolute cw/ccw per beat (the existing rotation-direction Apply /
    Save / templates / saved patterns).
  Both act on the same axis (prop spin); this is the single destination for it.
-->
<script lang="ts">
  import { t, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import SettingsDrillRow from "$lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import ReversalPatternView from "./ReversalPatternView.svelte";
  import RotationDirectionView from "./RotationDirectionView.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { TargetHand } from "../../state/panel-coordination-state.svelte";
  import type { DirectionDrillRoute } from "./direction-drill-route";

  interface Props {
    sequence: SequenceData | null;
    targetHand: TargetHand;
    route: DirectionDrillRoute;
    initialRotationMode?: "apply" | "save";
    onRouteChange: (route: DirectionDrillRoute) => void;
    onReversalApply: (result: {
      sequence: SequenceData;
      warnings?: readonly string[];
    }) => void;
    onRotationApply: (result: {
      sequence: SequenceData;
      warnings?: readonly string[];
    }) => void;
  }

  let {
    sequence,
    targetHand,
    route,
    initialRotationMode = "apply",
    onRouteChange,
    onReversalApply,
    onRotationApply,
  }: Props = $props();
</script>

<div class="direction-view">
  {#if route === "hub"}
    <div class="hub-surface">
      <div class="direction-choices">
        <SettingsDrillRow
          label={t("create_review_reversals")}
          value={tDynamic("create_action_flip_spinning_props_rhythm")}
          onclick={() => onRouteChange("reversals")}
        />
        <SettingsDrillRow
          label={t("create_review_rotation_direction")}
          value={tDynamic("create_action_set_rotation_sequence")}
          onclick={() => onRouteChange("absolute")}
        />
      </div>
    </div>
  {:else if route === "absolute"}
    <RotationDirectionView
      {sequence}
      {targetHand}
      initialMode={initialRotationMode}
      onApply={onRotationApply}
    />
  {:else}
    <ReversalPatternView {sequence} onApply={onReversalApply} />
  {/if}
</div>

<style>
  .direction-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* The two choices centre in the drawer. `safe center` rather than `margin:
     auto` so a viewport too short to hold them clips nothing off the top, and
     the surface scrolls instead of swallowing a row. */
  .hub-surface {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    overflow-y: auto;
  }

  .direction-choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(100%, 620px);
    margin-inline: auto;
    padding: 10px 12px;
  }
</style>
