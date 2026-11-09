<!--
  ReleaseShowMe - the "Show me" pill on a release note that names where it
  happened. Shared by What's New and the Release Notes tab.

  Renders nothing for an app-wide note, a note with no surface, or one whose
  module or tab no longer exists or is closed to this reader, so old notes
  never grow dead buttons. A highlight also hands its anchor or callout to the
  release tour, which greets the reader on arrival.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import type { ChangelogEntry } from "#lib/shared/versioning/domain/models/version-models.js";
  import { resolveShowMeTarget } from "#lib/shared/versioning/domain/utils/release-surface.js";
  import {
    liveSurfaceChecks,
    releaseTourState,
  } from "../../../state/release-tour-state.svelte";

  let {
    entry,
    onNavigate,
  }: {
    entry: ChangelogEntry;
    /** Called before navigating (hosts close their modal). */
    onNavigate?: () => void;
  } = $props();

  const target = $derived(resolveShowMeTarget(entry, liveSurfaceChecks()));
  const href = $derived(
    target ? `/${target.module}${target.tab ? `/${target.tab}` : ""}` : ""
  );

  function handleClick(event: MouseEvent) {
    if (!target) return;
    const modified =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (modified) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate?.();
    void releaseTourState.go(target);
  }
</script>

{#if target}
  <LinkChip class="release-show-me" {href} onclick={handleClick}
    >{t("settings_show_me")}</LinkChip
  >
{/if}

<style>
  /* A small companion to the note's text, not a second headline. */
  :global(a.link-chip.release-show-me) {
    align-self: flex-start;
    margin-top: 6px;
    min-height: 36px;
    padding: 0.35rem 0.9rem;
    font-size: var(--font-size-compact, 0.85rem);
  }
</style>
