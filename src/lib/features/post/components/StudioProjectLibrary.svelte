<script lang="ts">
  import { flip } from "svelte/animate";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    flipDuration,
    growFade,
    popIn,
  } from "#lib/shared/transitions/motion.js";
  import type { PostProjectChoice } from "../services/post-workspace-projects.js";
  import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
  import {
    studioKindLabels,
    studioLibraryEntries,
    type StudioIntent,
    type StudioLibraryEntry,
  } from "./studio-library-entry.js";
  import StudioProjectCard from "./StudioProjectCard.svelte";
  import StudioProjectCreate from "./StudioProjectCreate.svelte";
  import StudioArrangements from "./StudioArrangements.svelte";

  let {
    projects,
    features,
    loading,
    error,
    featureError,
    unreadableFeatures,
    onopen,
    onfeature,
    onrefresh,
  }: {
    projects: PostProjectChoice[];
    features: FeatureVideoSummary[];
    loading: boolean;
    error: string | null;
    featureError: string | null;
    unreadableFeatures: string[];
    onopen: (id: string, footage?: File) => void;
    onfeature: (slug: string) => void;
    onrefresh: () => void;
  } = $props();
  type KindFilter = StudioIntent | "all";
  type SortOrder = "recent" | "name";
  const kinds: StudioIntent[] = ["tutorial", "showcase", "arrangement"];
  let query = $state("");
  let filter = $state<KindFilter>("all");
  let sort = $state<SortOrder>("recent");
  let activePreview = $state<string | null>(null);
  let creating = $state(false);
  let intent = $state<StudioIntent | null>(null);
  let copying = $state<string | null>(null);
  let copyError = $state<string | null>(null);
  let width = $state(0);
  const entries = $derived(studioLibraryEntries(projects, features));
  const shown = $derived(
    entries
      .filter(
        (entry) =>
          (filter === "all" || entry.kind === filter) &&
          `${entry.title} ${entry.subtitle ?? ""} ${entry.word}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())
      )
      .sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title)
          : b.updatedAt - a.updatedAt
      )
  );
  /** At phone width the kind filter goes two by two so every label fits. */
  const narrow = $derived(width > 0 && width <= 500);
  const filters: {
    value: KindFilter;
    label: string;
    ariaLabel: string;
    count: number;
  }[] = $derived([
    {
      value: "all",
      label: "All",
      ariaLabel: `All projects, ${entries.length}`,
      count: entries.length,
    },
    ...kinds.map((kind) => {
      const count = entries.filter((entry) => entry.kind === kind).length;
      return {
        value: kind,
        label: studioKindLabels[kind].many,
        ariaLabel: `${studioKindLabels[kind].many}, ${count}`,
        count,
      };
    }),
  ]);
  const sorts: { value: SortOrder; label: string }[] = [
    { value: "recent", label: "Recent" },
    { value: "name", label: "Name" },
  ];
  function start(value: StudioIntent): void {
    intent = value;
    creating = true;
    activePreview = null;
  }
  async function copy(entry: StudioLibraryEntry): Promise<void> {
    copying = entry.id;
    copyError = null;
    activePreview = null;
    try {
      const service = await import("../services/studio-project-library.js");
      if (entry.featureSlug)
        onfeature(
          await service.duplicateSoftwareFeatureVideo(
            entry.featureSlug,
            `${entry.title} copy`
          )
        );
      else if (entry.sequenceId)
        onopen(
          await service.duplicateStudioProject(
            entry.sequenceId,
            `${entry.title} copy`
          )
        );
    } catch (cause) {
      copyError =
        cause instanceof Error
          ? cause.message
          : "The project could not be copied.";
    } finally {
      copying = null;
    }
  }
</script>

<div class="studio-library" bind:clientWidth={width}>
  <div class="library-top">
    <header class="library-header">
      <h1>Your projects <span class="count">{entries.length}</span></h1>
      <div class="start" role="group" aria-label="Start a project">
        {#each kinds as kind (kind)}
          <button
            type="button"
            class="start-button"
            aria-label={`New ${studioKindLabels[kind].one.toLocaleLowerCase()}`}
            onclick={() => start(kind)}
            ><i class="fas fa-plus" aria-hidden="true"></i><span
              >{studioKindLabels[kind].one}</span
            ></button
          >
        {/each}
      </div>
    </header>
    <div class="library-tools">
      <div class="filter">
        <SegmentedControl
          options={filters}
          value={filter}
          columns={narrow ? 2 : undefined}
          ariaLabel="Project types"
          onchange={(value) => {
            filter = value;
            activePreview = null;
          }}
        />
      </div>
      <label class="search"
        ><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input
          aria-label="Search projects"
          type="search"
          bind:value={query}
          placeholder="Find a project"
        /></label
      >
      <div class="sort">
        <SegmentedControl
          options={sorts}
          value={sort}
          ariaLabel="Sort projects"
          onchange={(value) => (sort = value)}
        />
      </div>
    </div>
  </div>
  <div class="library-scroll">
    {#if error || featureError || copyError}
      <div class="library-error" role="alert" transition:growFade>
        <p>{error || featureError || copyError}</p>
        <button
          type="button"
          onclick={() => {
            copyError = null;
            onrefresh();
          }}>Try again</button
        >
      </div>
    {/if}
    {#if unreadableFeatures.length}<p
        class="notice"
        role="status"
        transition:growFade
      >
        Could not read: {unreadableFeatures.join(", ")}. Earlier copies remain
        in each project’s history.
      </p>{/if}
    {#if copying}<p class="notice" role="status" transition:growFade>
        Creating a separate copy…
      </p>{/if}
    {#if loading && !entries.length}
      <div class="empty" role="status">
        <i class="fas fa-film" aria-hidden="true"></i>
        <h2>Loading your projects…</h2>
        <p>Finding saved edits and previews.</p>
      </div>
    {:else if !shown.length}
      <div class="empty">
        <i class="fas fa-film" aria-hidden="true"></i>
        <h2>
          {entries.length
            ? "No matching projects"
            : "Make something worth watching"}
        </h2>
        <p>
          {entries.length
            ? "Try a different name or project type."
            : "Start a tutorial, a showcase or an arrangement with the buttons above."}
        </p>
        {#if entries.length}<button
            type="button"
            onclick={() => {
              query = "";
              filter = "all";
            }}>Clear filters</button
          >{/if}
      </div>
    {:else}
      <div class="project-grid" aria-label="Saved projects">
        {#each shown as entry (entry.id + ":" + entry.updatedAt)}
          <div
            class="card-slot"
            animate:flip={{ duration: flipDuration() }}
            in:popIn
          >
            <StudioProjectCard
              {entry}
              active={activePreview === entry.id}
              onpreview={(id) => (activePreview = id)}
              onopen={() =>
                entry.featureSlug
                  ? onfeature(entry.featureSlug)
                  : onopen(entry.sequenceId!)}
              oncopy={() => void copy(entry)}
              disabled={copying !== null}
            />
          </div>
        {/each}
      </div>
    {/if}
    <StudioArrangements {onopen} />
    <footer class="library-footer">
      <span
        ><i class="fas fa-cloud" aria-hidden="true"></i>
        {authState.user && !authState.user.isAnonymous
          ? "Edits sync with your account."
          : "Edits are saved on this device."} Device videos are kept in this browser;
        on another device, pick them again.</span
      >
      {#if features.length}<span
          >Software project folders are saved on this computer.</span
        >{/if}
    </footer>
  </div>
</div>
<StudioProjectCreate
  open={creating}
  {intent}
  {entries}
  onclose={() => (creating = false)}
  {onopen}
  {onfeature}
/>

<style>
  /* One fixed screen: the header and tools stay put, only the grid area scrolls. */
  .studio-library {
    --library-pad: clamp(16px, 3vw, 48px);
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 16px;
    padding-top: var(--library-pad);
    overflow: hidden;
    container: studio-library / inline-size;
  }
  .library-top {
    display: grid;
    gap: 16px;
    padding-inline: var(--library-pad);
  }
  .library-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 20px;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: -0.02em;
    line-height: 1.15;
    font-weight: 650;
  }
  .count {
    margin-left: 8px;
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  button,
  input {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .start {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .start-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }
  .start-button i {
    font-size: 12px;
    color: var(--theme-accent);
  }
  .start-button:hover {
    border-color: var(--theme-text-secondary);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }
  .library-tools {
    display: grid;
    grid-template-columns: minmax(0, 34rem) minmax(0, 1fr) minmax(12rem, 18rem) 10rem;
    grid-template-areas: "filter . search sort";
    align-items: center;
    gap: 12px;
  }
  .filter {
    grid-area: filter;
    min-width: 0;
  }
  .search {
    grid-area: search;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-left: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-secondary);
    background: var(--theme-card-bg);
  }
  .sort {
    grid-area: sort;
    min-width: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 42px;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 14px;
  }
  .library-scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px var(--library-pad) var(--library-pad);
  }
  .project-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
    align-items: start;
    gap: 24px;
  }
  .card-slot {
    min-width: 0;
  }
  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    min-height: 240px;
    padding: 30px 16px;
    border: 1px dashed var(--theme-stroke);
    border-radius: 10px;
  }
  .empty > i {
    font-size: 28px;
    color: var(--theme-text-secondary);
  }
  .empty h2 {
    margin: 18px 0 8px;
    font-size: 20px;
    font-weight: 600;
  }
  .empty p {
    margin: 0 0 20px;
    max-width: 360px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .empty button,
  .library-error button {
    padding: 10px 14px;
    min-height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--theme-card-bg);
    font-size: 14px;
  }
  .library-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: 14px;
  }
  .library-error p {
    margin: 0;
  }
  .notice {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .library-footer {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    border-top: 1px solid var(--theme-stroke);
    padding-top: 20px;
    margin-top: 32px;
    color: var(--theme-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  @container studio-library (max-width: 850px) {
    .library-tools {
      grid-template-columns: minmax(0, 1fr) 10rem;
      grid-template-areas:
        "search sort"
        "filter filter";
    }
  }
  @container studio-library (max-width: 500px) {
    h1 {
      font-size: 1.375rem;
    }
    .library-header {
      display: grid;
    }
    .start {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .start-button {
      flex-direction: column;
      gap: 4px;
      min-height: 56px;
      padding: 8px 4px;
      border-radius: 12px;
    }
    .project-grid {
      gap: 16px;
    }
  }
  @container studio-library (min-width: 2000px) {
    .project-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
