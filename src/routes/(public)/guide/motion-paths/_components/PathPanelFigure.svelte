<script lang="ts">
  /**
   * The app's own Motion Paths control (PathShapePanel: the Arc, Linear,
   * Concave and Hybrid tiles with their mandalas), mounted read-only on its
   * own animation scope. It is the control the page's "Where the setting
   * applies" screen sends the reader to. Four tiles across; nothing here changes any saved setting.
   */
  import PathShapePanel from "#lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { createAnimationScope } from "#lib/shared/animation-engine/state/animation-scope.svelte.js";
  import { applySequencePathPreview } from "#lib/shared/sequence-viewer/services/sequence-path-policy.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
  import { motionPathExamples } from "../_data/motion-path-examples";

  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.visibility.setDarkMode(true);
  scope.visibility.setPathPolicy({ pathShape: "arc", motionAwarePaths: true });

  const original = motionPathExamples[2]!;
  const variants = Object.fromEntries(
    (["arc", "linear", "concave", "hybrid"] as const).map((path) => [
      path,
      applySequencePathPreview(original, {
        pathShape: path === "hybrid" ? "arc" : path,
        motionAwarePaths: path === "hybrid",
      })!,
    ])
  );
</script>

<div class="panel" inert>
  <PathShapePanel
    showHelp={false}
    columns={4}
    visibilityManagerOverride={scope.visibility}
  >
    {#snippet preview(path: MandalaPathShape, size: number)}
      <SequenceMandala
        sequence={variants[path]}
        pathShape={path}
        show="both"
        {size}
        mode="gallery"
        darkMode
        leftPropType={PropType.STAFF}
        rightPropType={PropType.STAFF}
        tipEnds={1}
        tipDx={0}
        animate={false}
      />
    {/snippet}
  </PathShapePanel>
</div>

<style>
  .panel {
    /* Four tiles across, never wider than the screen's content. */
    width: min(calc(22rem * var(--fit, 1)), 100%);
    flex: none;
    margin-inline: auto;
  }
</style>
