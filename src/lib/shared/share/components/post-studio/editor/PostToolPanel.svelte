<script lang="ts">
  import type { Snippet } from "svelte";
  import type { PluginTool } from "@austencloud/video-editor";
  import { useStrings } from "@austencloud/video-editor/strings";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { PostPanelToolId } from "./post-editor-tools";
  import { toolIcon, toolLabel } from "./post-editor-labels";
  import { Icon, faCheck } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /**
   * One tool's panel: its name, what it edits, and its controls. On a phone
   * it stands in for the tool row and closes with Done; beside the preview
   * or in the viewer's side panel it stays until another tool is picked.
   */
  interface Props {
    tool: PostPanelToolId;
    /** The plugin's tools, which bring their own icons. */
    pluginTools?: readonly PluginTool[];
    /** The selected item's name; nothing for the post's own tools. */
    subject?: string;
    /** Given on a phone, where Done returns to the tool row. */
    onDone?: () => void;
    /** `side` fills a sized column and scrolls inside it. */
    placement: "dock" | "side";
    /**
     * For a screen whose own bar already names the tool and closes it: the
     * heading stays for assistive tech and the controls get its room.
     */
    bare?: boolean;
    /** The panel itself, so focus can move into it when it opens. */
    element?: HTMLElement | null;
    children: Snippet;
  }

  let {
    tool,
    pluginTools = [],
    subject,
    onDone,
    placement,
    bare = false,
    element = $bindable(null),
    children,
  }: Props = $props();

  const id = $props.id();
  const icon = $derived(toolIcon(tool, pluginTools));
</script>

<section
  class="tool-panel {placement}"
  class:bare
  tabindex="-1"
  aria-labelledby="{id}-title"
  data-tool-panel={tool}
  bind:this={element}
>
  <header class="head" class:sr-only={bare}>
    {#if icon}<Icon {icon} class="icon" />{/if}
    <div class="titles">
      <h3 id="{id}-title" class="title">{toolLabel(t, tool)}</h3>
      {#if subject}
        <p class="subject">{subject}</p>
      {/if}
    </div>
    {#if onDone}
      <PanelButton variant="primary" onclick={onDone}>
        <Icon icon={faCheck} />
        {t("share_studio_done")}
      </PanelButton>
    {/if}
  </header>
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .tool-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
    min-width: 0;
    min-height: 0;
  }

  .tool-panel:focus {
    outline: none;
  }

  .side {
    height: 100%;
  }

  .bare {
    position: relative;
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .head :global(.icon) {
    box-sizing: border-box;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0.625rem;
    border-radius: 0.5rem;
    color: var(--ve-theme-accent, #d4813a);
    background: color-mix(
      in srgb,
      var(--ve-theme-accent, #d4813a) 14%,
      transparent
    );
  }

  .titles {
    display: grid;
    flex: 1;
    gap: 0.125rem;
    min-width: 0;
  }

  .title {
    margin: 0;
    color: var(--ve-theme-text, #fff);
    font-size: 1rem;
    font-weight: 600;
  }

  .subject {
    overflow: hidden;
    margin: 0;
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The body scrolls inside itself: past half the screen on a phone, past
     the column's height beside the preview. */
  /* The padding keeps focus rings inside the scroller's clip. */
  .body {
    min-width: 0;
    min-height: 0;
    padding: 0.25rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* The editor sets the room left under the preview. */
  .dock {
    max-height: var(--post-dock-panel-max, none);
  }

  .dock .body {
    max-height: 50dvh;
  }
</style>
