<script lang="ts">
  import type { ViewerControlSink } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import PerformerHubDetail from "./controls/PerformerHubDetail.svelte";
  import PerformerSpine from "./controls/PerformerSpine.svelte";
  import type { PerformerEditSink } from "./controls/performer-hub-types";

  interface Props {
    onSettingChange?: ViewerControlSink;
    /** Forwarded to the detail panel — see PerformerHubDetail's Props. */
    onPerformerEdit?: PerformerEditSink;
  }

  let { onSettingChange, onPerformerEdit }: Props = $props();
</script>

<!--
  A compact workspace has no rail and no stage performer bar, so the sheet
  carries the same selection strip the stage shows on wider screens. Both are
  the one PerformerSpine; only the surface around it differs.
-->
<div class="performer-sheet">
  <div class="scope-row">
    <PerformerSpine {onSettingChange} />
  </div>
  <PerformerHubDetail {onSettingChange} {onPerformerEdit} />
</div>

<style>
  .performer-sheet {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .scope-row {
    flex: none;
    min-width: 0;
  }

  /* A short landscape has horizontal room but almost no vertical room. Put
     cast selection beside the detail workspace so Character, Prop, Effort and
     Effects keep a real scrolling region instead of collapsing to one line. */
  @media (min-width: 48rem) and (max-height: 34rem) {
    .performer-sheet {
      display: grid;
      grid-template-columns: minmax(17rem, 19rem) minmax(0, 1fr);
      gap: 0.75rem;
    }

    .scope-row {
      padding-right: 0.75rem;
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    }
  }
</style>
