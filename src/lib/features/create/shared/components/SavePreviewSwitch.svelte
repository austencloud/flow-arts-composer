<script lang="ts">
  /**
   * The Card | Animation switch under the preview while the save view is open.
   *
   * It holds no state of its own. What it reads comes straight from the panel
   * state, so the corner X, Escape, a background click or a failed load all
   * move it without anything having to tell it.
   */
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { getCreateModuleContext } from "../context/create-module-context";

  type PreviewChoice = "card" | "animation";

  let { size = "md" }: { size?: "sm" | "md" } = $props();

  const { CreateModuleState, panelState } = getCreateModuleContext();

  const options = $derived<{ value: PreviewChoice; label: string }[]>([
    { value: "card", label: t("create_ui_preview_card") },
    { value: "animation", label: t("create_ui_preview_animation") },
  ]);
  const choice = $derived<PreviewChoice>(
    panelState.isWorkspacePreviewChosen ? "animation" : "card"
  );

  function choose(next: PreviewChoice) {
    if (next === choice) return;
    if (next === "card") {
      panelState.stopWorkspacePlayback();
      return;
    }
    const sequenceState = CreateModuleState.getActiveTabSequenceState();
    if (!sequenceState.currentSequence) return;
    panelState.startWorkspacePlayback(
      sequenceState.currentSequence,
      sequenceState.currentSequenceRevision,
      navigationState.activeTab
    );
  }
</script>

<div
  class="save-preview-switch"
  class:small={size === "sm"}
  data-playback-foreground
>
  <SegmentedControl
    {options}
    {size}
    value={choice}
    onchange={choose}
    color="accent"
    semantics="radiogroup"
    ariaLabel={t("create_ui_preview")}
  />
</div>

<style>
  .save-preview-switch {
    width: min(100%, 16rem);
    pointer-events: auto;
  }

  /* The shared control carries its size as an attribute but draws every size
     at 44px. Phones give the canvas that height back: with the control's own
     3px padding and 1px border this comes to 36px, which the room under the
     workspace counts on (SAVE_SWITCH_HEIGHT in StandardWorkspaceLayout). */
  .small :global(.segment) {
    min-height: 28px;
    padding-block: 0;
  }
</style>
