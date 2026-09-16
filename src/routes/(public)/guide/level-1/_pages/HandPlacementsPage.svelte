<script lang="ts">
  /**
   * Hand Placements - body page 2. Now a thin host: the layout + prose live in the
   * single-source content model (hand-placements.content.ts), rendered here by
   * SheetFrame (print-faithful) and by FlowFrame on the crawlable route. Migrated
   * to single-source per docs/superpowers/specs/2026-07-14-guide-reflow-single-source-design.md
   * (was a bespoke absolute-positioned sheet; the geometry moved into the content).
   */
  import SheetFrame from "../_components/SheetFrame.svelte";
  import { handPlacementsContent } from "../_data/content/hand-placements.content";
</script>

<SheetFrame content={handPlacementsContent} />
