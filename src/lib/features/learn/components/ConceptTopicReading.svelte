<script lang="ts">
  import { onMount } from "svelte";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";

  let {
    conceptId,
    open = $bindable(false),
  }: {
    conceptId: string;
    open: boolean;
  } = $props();

  let darkMode = $state(false);
  const topic = $derived(
    open
      ? conceptId === "grid"
        ? import("../../../../routes/(public)/guide/level-1/_topics/GridTopicPage.svelte")
        : import("../../../../routes/(public)/guide/level-1/_topics/PlacementsTopicPage.svelte")
      : null
  );

  onMount(() => {
    const root = document.documentElement;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const selectedTheme = root.getAttribute("data-theme");
      darkMode = selectedTheme ? selectedTheme === "dark" : colorScheme.matches;
    };
    syncTheme();
    colorScheme.addEventListener("change", syncTheme);
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      colorScheme.removeEventListener("change", syncTheme);
      observer.disconnect();
    };
  });
</script>

<BaseModal
  bind:open
  size="xl"
  class="concept-topic-reading"
  labelledBy="concept-topic-reading-title"
  onclose={() => (open = false)}
>
  {#snippet header()}
    <div class="reading-header">
      <button class="return-button" onclick={() => (open = false)}>
        <span aria-hidden="true">‹</span>
        {t("learn_ui_back_to_lesson")}
      </button>
      <span id="concept-topic-reading-title">
        {tDynamic(`learn_reference_${conceptId.replaceAll("-", "_")}`)}
      </span>
    </div>
  {/snippet}

  <div class="reading-page" class:dark={darkMode}>
    {#if topic}
      {#await topic}
        <div class="reading-loading" role="status">
          {t("learn_ui_loading_lesson")}
        </div>
      {:then loaded}
        {@const TopicPage = loaded.default}
        <TopicPage
          {darkMode}
          kicker={t("learn_ui_read_topic")}
          lessonHref={null}
        />
      {/await}
    {/if}
  </div>
</BaseModal>

<style>
  .reading-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--theme-stroke);
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .return-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  .return-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .return-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .return-button span {
    font-size: 1.5rem;
    line-height: 0.75;
  }

  .reading-page {
    min-height: 100%;
    background: #fbfaf7;
    color: #1a1a1a;
    --ink: #1a1a1a;
    --ink-dim: #555;
    --glyph-invert: 0;
    container-type: inline-size;
  }

  .reading-page.dark {
    background: var(--theme-panel-bg);
    color: #ececf2;
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
  }

  .reading-loading {
    display: grid;
    place-items: center;
    min-height: 12rem;
    color: var(--ink-dim);
  }

  @media (max-width: 40rem) {
    .reading-header {
      justify-content: space-between;
    }

    .reading-header > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
