<!--
  ChangelogRichText - renders changelog entry text with inline links and icons

  Entry text supports three tokens, all authored by the release pipeline:
    [label](url)   -> real link. Internal URLs (tkaflowarts.com / relative)
                      client-route in-app; external URLs open a new tab.
    {icon:name}    -> inline FontAwesome glyph, e.g. {icon:play}
    **text**       -> bold run; may contain links and icons.

  Shared by WhatsNewModal and the Release Notes tab so both surfaces render
  identically. Plain text passes through untouched — no @html anywhere.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import {
    getModuleDefinition,
    isValidModule,
    isValidTabForModule,
  } from "#lib/shared/navigation/services/navigation-validator.js";
  import { openSheet } from "#lib/shared/navigation/services/sheet-router.js";
  import {
    toChangelogSegments,
    type ChangelogInlineSegment,
  } from "#lib/shared/versioning/domain/utils/changelog-rich-text.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  let {
    text,
    onNavigate,
  }: {
    text: string;
    /** Called when an internal link is clicked (hosts close their modal). */
    onNavigate?: () => void;
  } = $props();

  function handleLinkClick(
    event: MouseEvent,
    href: string,
    external: boolean
  ): void {
    const isModifiedClick =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;

    if (external || event.defaultPrevented || isModifiedClick) return;

    event.preventDefault();
    onNavigate?.();

    const destination = new URL(href, "https://tkaflowarts.com");
    if (destination.searchParams.get("sheet") === "inbox") {
      openSheet("inbox");
      return;
    }

    const [moduleId, tabId, extraPath] = destination.pathname
      .split("/")
      .filter(Boolean);
    if (moduleId && !extraPath && isValidModule(moduleId)) {
      const moduleDefinition = getModuleDefinition(moduleId);
      const isModuleDestination =
        !moduleDefinition?.linkHref &&
        (!tabId || isValidTabForModule(moduleId, tabId));

      if (isModuleDestination) {
        void handleModuleChange(moduleId, tabId);
        return;
      }
    }

    void goto(href);
  }

  const segments = $derived(toChangelogSegments(text));
</script>

{#snippet inline(
  segment: ChangelogInlineSegment
)}{#if segment.kind === "text"}{segment.value}{:else if segment.kind === "link"}<LinkChip
      class="entry-link"
      size="inline"
      wrap
      href={segment.href}
      onclick={(event) =>
        handleLinkClick(event, segment.href, segment.external)}
      >{segment.label}</LinkChip
    >{:else}<span class="inline-icon" aria-hidden="true"
      ><i class="fas {segment.name}"></i></span
    >{/if}{/snippet}

<span class="rich-text">
  {#each segments as segment}
    {#if segment.kind === "strong"}<strong
        >{#each segment.children as child}{@render inline(child)}{/each}</strong
      >{:else}{@render inline(segment)}{/if}
  {/each}
</span>

<style>
  .rich-text {
    display: inline;
  }

  .rich-text strong {
    font-weight: 700;
    color: var(--theme-text, inherit);
  }

  .inline-icon {
    display: inline;
    margin: 0 0.1em;
    color: var(--theme-accent, #6ea8fe);
    font-size: 0.85em;
  }
</style>
