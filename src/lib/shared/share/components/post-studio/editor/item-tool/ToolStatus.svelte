<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";

  /** A notice above an item's tool, with the one action that clears it. */
  interface Props {
    text: string;
    icon: IconDefinition;
    action: string;
    run: () => void;
  }

  let { text, icon, action, run }: Props = $props();
</script>

<div class="status" role="status">
  <p>{text}</p>
  <PanelButton onclick={run}>
    <Icon {icon} />
    {action}
  </PanelButton>
</div>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    border: 1px solid var(--ve-semantic-warning, #fbbf24);
    border-radius: 0.625rem;
  }

  .status p {
    margin: 0;
    color: var(--ve-theme-text, #fff);
    font-size: 0.875rem;
  }
</style>
