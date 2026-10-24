<!--
  What a Browse screen hands the header bar, declared as markup.

  Render one of these anywhere inside a Browse screen. Its props flow to the
  bar through the header context while it is mounted and leave with it. With
  no Browse header around (a test route, a picker inside a modal) it renders
  nothing and the screen keeps its own chrome.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { tryGetBrowseHeaderContext } from "#lib/shared/browse/context/browse-header-context.js";

  let {
    leaf = null,
    leafContent = null,
    actions = null,
    toolbar = null,
    accent = null,
  }: {
    /** The current crumb's label. Null while it is still loading. */
    leaf?: string | null;
    /** Replaces the leaf label while it is being edited in place. */
    leafContent?: Snippet | null;
    /** Pill buttons for the bar's right slot. */
    actions?: Snippet | null;
    /** A toolbar that takes over the whole bar while it is set. */
    toolbar?: Snippet | null;
    /** The screen's tint for the bar's hover and focus colors. */
    accent?: string | null;
  } = $props();

  const header = tryGetBrowseHeaderContext();

  $effect(() => {
    if (!header) return;
    return header.register({
      leaf: () => leaf,
      leafContent: () => leafContent,
      actions: () => actions,
      toolbar: () => toolbar,
      accent: () => accent,
    });
  });
</script>
