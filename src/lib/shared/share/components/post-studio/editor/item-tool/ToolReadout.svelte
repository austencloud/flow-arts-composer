<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import { parseClock } from "@austencloud/video-editor/ui";
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /**
   * A named time that takes a typed time, with an optional button that moves
   * it to the playhead.
   */
  interface Props {
    name: string;
    value: string;
    typed: (seconds: number) => void;
    set: { icon: IconDefinition; run: () => void } | null;
    locked: boolean;
    /** Far enough inside that an edge moved to the playhead leaves a piece. */
    playheadInside: boolean;
  }

  let { name, value, typed, set, locked, playheadInside }: Props = $props();
</script>

<div class="readout">
  <div class="readout-text">
    <span class="readout-name" aria-hidden="true">{name}</span>
    <TypeableValue
      label={name}
      text={value}
      draft={value}
      parse={parseClock}
      disabled={locked}
      oncommit={typed}
    />
  </div>
  {#if set}
    <PanelButton
      onclick={set.run}
      disabled={locked || !playheadInside}
      ariaLabel={`${t("post_editor_set_to_playhead")}: ${name}`}
    >
      <Icon icon={set.icon} />
      {t("post_editor_set_to_playhead")}
    </PanelButton>
  {/if}
</div>

<style>
  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    min-width: 0;
  }

  /* The time sits in a box that takes a typed time. */
  .readout-text {
    --typeable-font-size: 1rem;
    --typeable-min-width: 6rem;
    display: grid;
    justify-items: start;
    gap: 0.125rem;
  }

  .readout-name {
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }
</style>
