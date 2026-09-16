<script lang="ts">
  import CollectionAddTile from "$lib/features/browse/collections/components/CollectionAddTile.svelte";
  import CollectionCardSurface from "$lib/features/browse/collections/components/CollectionCardSurface.svelte";
  import SmartCollectionBuilderSheet from "$lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte";
  import SmartCollectionDetailSurface from "$lib/features/browse/collections/components/SmartCollectionDetailSurface.svelte";
  import SmartCollectionRuleSummary from "$lib/features/library/components/SmartCollectionRuleSummary.svelte";
  import SmartCollectionSaveForm from "$lib/features/library/components/SmartCollectionSaveForm.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    BUILT_IN_CARD,
    COMMUNITY_RULE,
    DENSE_COMMUNITY_RULE,
    LIBRARY_RULE,
    PERSONAL_CARD,
  } from "../smart-collection-review-fixtures";

  let {
    surface,
    variant,
  }: {
    surface: string;
    variant: string;
  } = $props();

  const FILTER_SECTION_BY_VARIANT = {
    "start-chooser": "chooser",
    "start-level": "level",
    "start-length": "length",
    "start-letter": "letter",
    "start-placement": "position",
    "start-gridmode": "gridmode",
    "start-loop": "loop",
    "start-author": "author",
    "start-family": "family",
    "start-max_turn_intensity": "max_turn_intensity",
    "filter-chooser": "chooser",
    "filter-level": "level",
    "filter-length": "length",
    "filter-letter": "letter",
    "filter-position": "position",
    "filter-gridmode": "gridmode",
    "filter-loop": "loop",
    "filter-author": "author",
    "filter-family": "family",
    "filter-max_turn_intensity": "max_turn_intensity",
  } as const;

  const seededBuilder = $derived(surface === "builder-refine");
  const initialFilterSection = $derived(
    FILTER_SECTION_BY_VARIANT[variant as keyof typeof FILTER_SECTION_BY_VARIANT]
  );

  let builderVisible = $state(
    surface === "builder-start" || surface === "builder-refine"
  );
  let builderKey = $state(0);
  let saveName = $state(
    variant === "long"
      ? "Workshop combinations that stay within the Level 2 turn limit"
      : ""
  );

  function reopenBuilder() {
    builderKey += 1;
    builderVisible = true;
  }
</script>

<main class="frame-page" class:detail-page={surface === "detail"}>
  {#if surface === "entry"}
    <div class="entry-stage">
      <CollectionAddTile
        label="New collection"
        hint="Choose the sequences yourself"
        icon="fa-plus"
        onclick={() => {}}
      />
      <CollectionAddTile
        label="New Smart Collection"
        hint="Build a live collection from filters"
        icon="fa-wand-magic-sparkles"
        onclick={() => (builderVisible = true)}
      />
    </div>

    {#if builderVisible}
      {#key builderKey}
        <SmartCollectionBuilderSheet
          mode="create"
          onClose={() => (builderVisible = false)}
        />
      {/key}
    {/if}
  {:else if surface === "builder-start" || surface === "builder-refine"}
    <div class="underlay" aria-hidden="true">
      <span>Library</span>
      <div class="underlay-line wide"></div>
      <div class="underlay-line"></div>
    </div>

    {#if builderVisible}
      {#key builderKey}
        <SmartCollectionBuilderSheet
          mode="create"
          initialSpec={seededBuilder
            ? variant === "focused"
              ? COMMUNITY_RULE
              : DENSE_COMMUNITY_RULE
            : undefined}
          {initialFilterSection}
          onClose={() => (builderVisible = false)}
        />
      {/key}
    {:else}
      <div class="reopen-card">
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        <p>The builder is closed.</p>
        <PanelButton variant="primary" onclick={reopenBuilder}>
          Reopen builder
        </PanelButton>
      </div>
    {/if}
  {:else if surface === "summary"}
    <div class="summary-stage">
      <SmartCollectionRuleSummary
        spec={variant === "library" ? LIBRARY_RULE : COMMUNITY_RULE}
        matchCount={variant === "counting"
          ? null
          : variant === "library"
            ? 8
            : 127}
      />
    </div>
  {:else if surface === "save"}
    <div class="save-stage">
      <SmartCollectionSaveForm
        spec={variant === "library" ? LIBRARY_RULE : COMMUNITY_RULE}
        matchCount={variant === "library" ? 8 : 127}
        bind:name={saveName}
        inputId="smart-collection-review-name"
        onSave={() => {}}
      />
    </div>
  {:else if surface === "cards"}
    <div class="card-stage">
      {#if variant === "built-in"}
        <CollectionCardSurface
          collection={BUILT_IN_CARD}
          readonly
          onOpen={() => {}}
        />
      {:else}
        <CollectionCardSurface
          collection={variant === "long"
            ? {
                ...PERSONAL_CARD,
                name: "Favorites with a very long turn-intensity criterion for workshops",
                sequenceCount: 8,
                filterSpec: LIBRARY_RULE,
              }
            : PERSONAL_CARD}
          onOpen={() => {}}
          onOptions={() => {}}
        />
      {/if}
    </div>
  {:else if surface === "detail"}
    <div class="detail-stage">
      {#if variant === "loading"}
        <SmartCollectionDetailSurface
          name="Workshop favorites"
          color="#ec4899"
          spec={LIBRARY_RULE}
          matchCount={null}
          loading
          onBack={() => {}}
          onEdit={() => {}}
          onOptions={() => {}}
        />
      {:else if variant === "error"}
        <SmartCollectionDetailSurface
          name="Level 1 practice"
          color="#8b6cff"
          spec={COMMUNITY_RULE}
          matchCount={null}
          error
          showBack={false}
          onEdit={() => {}}
          onOptions={() => {}}
          onRetry={() => {}}
        />
      {:else if variant === "built-in"}
        <SmartCollectionDetailSurface
          name="TKA Core Level 1"
          description="Maintained by TKA."
          color="#36c3ff"
          spec={COMMUNITY_RULE}
          matchCount={0}
          readOnly
          showBack={false}
        />
      {:else}
        <SmartCollectionDetailSurface
          name="Level 1 practice"
          color="#8b6cff"
          spec={COMMUNITY_RULE}
          matchCount={0}
          onBack={() => {}}
          onEdit={() => {}}
          onOptions={() => {}}
        />
      {/if}
    </div>
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: #0b0d13;
  }

  .frame-page {
    display: grid;
    min-height: 100dvh;
    padding: clamp(12px, 2.4vw, 40px);
    place-items: center;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 18% 12%,
        rgba(139, 108, 255, 0.13),
        transparent 32%
      ),
      #0b0d13;
    color: var(--theme-text, #f7f8fb);
    font-family: system-ui, sans-serif;
  }

  .frame-page.detail-page {
    display: block;
    padding: 0;
  }

  .entry-stage,
  .card-stage {
    display: grid;
    width: min(100%, clamp(300px, 32vw, 760px));
    gap: 12px;
  }

  .summary-stage,
  .save-stage {
    width: min(100%, clamp(320px, 48vw, 1760px));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: clamp(14px, 1vw, 24px);
    background: var(--theme-panel-bg, #11131a);
    box-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
  }

  .summary-stage {
    padding: clamp(12px, 1.2vw, 28px);
  }

  .card-stage {
    padding: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background: var(--theme-panel-bg, #11131a);
  }

  .detail-stage {
    width: 100%;
    height: 100dvh;
    min-height: 0;
  }

  .underlay {
    position: absolute;
    top: clamp(18px, 4vw, 48px);
    left: clamp(18px, 4vw, 48px);
    display: grid;
    width: min(320px, 52vw);
    gap: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.52));
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
  }

  .underlay-line {
    width: 68%;
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
  }

  .underlay-line.wide {
    width: 100%;
  }

  .reopen-card {
    display: flex;
    width: min(320px, calc(100vw - 32px));
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 18px;
    background: var(--theme-panel-bg, #11131a);
    text-align: center;
  }

  .reopen-card > i {
    color: var(--theme-accent, #8b6cff);
    font-size: var(--font-size-xl, 22px);
  }

  .reopen-card p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-sm, 14px);
  }

  @media (max-width: 560px) {
    .frame-page {
      align-items: start;
    }

    .entry-stage,
    .card-stage,
    .summary-stage,
    .save-stage {
      width: 100%;
    }
  }

  @media (min-width: 2600px) {
    .frame-page {
      --font-size-compact: clamp(12px, 0.38vw, 16px);
      --font-size-sm: clamp(14px, 0.44vw, 18px);
      --font-size-base: clamp(16px, 0.5vw, 20px);
      --font-size-lg: clamp(18px, 0.56vw, 22px);
      --font-size-xl: clamp(20px, 0.66vw, 26px);
      --min-touch-target: clamp(44px, 1.35vw, 56px);
    }
  }
</style>
