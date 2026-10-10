<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { PostProjectChoice } from "../services/post-workspace-projects.js";
  import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
  import {
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
    onopen: (id: string) => void;
    onfeature: (slug: string) => void;
    onrefresh: () => void;
  } = $props();
  let query = $state("");
  let filter = $state<StudioIntent | "all">("all");
  let sort = $state("recent");
  let activePreview = $state<string | null>(null);
  let creating = $state(false);
  let intent = $state<StudioIntent | null>(null);
  let copying = $state<string | null>(null);
  let copyError = $state<string | null>(null);
  const entries = $derived(studioLibraryEntries(projects, features));
  const shown = $derived(
    entries
      .filter(
        (entry) =>
          (filter === "all" || entry.kind === filter) &&
          `${entry.title} ${entry.word}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())
      )
      .sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title)
          : b.updatedAt - a.updatedAt
      )
  );
  const filters = [
    { id: "all" as const, label: "All projects" },
    { id: "tutorial" as const, label: "Sequence videos" },
    { id: "showcase" as const, label: "Showcases" },
    { id: "arrangement" as const, label: "Arrangements" },
  ];
  function start(value: StudioIntent | null): void {
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

<div class="studio-library">
  <header class="library-header">
    <div>
      <p class="eyebrow">STUDIO</p>
      <h1>Your projects</h1>
      <p class="intro">Open an edit, reuse a project or start something new.</p>
    </div>
    <button class="new-project" type="button" onclick={() => start(null)}
      ><i class="fas fa-plus" aria-hidden="true"></i> New project</button
    >
  </header>
  <section class="starting-points" aria-label="Start a project">
    <button type="button" onclick={() => start("tutorial")}
      ><i class="fas fa-person-chalkboard" aria-hidden="true"></i><span
        ><strong>Tutorial video</strong><span
          >Repeat an edit or teach another sequence</span
        ></span
      ><i class="fas fa-arrow-right" aria-hidden="true"></i></button
    >
    <button type="button" onclick={() => start("showcase")}
      ><i class="fas fa-display" aria-hidden="true"></i><span
        ><strong>Software showcase</strong><span
          >Turn app captures into a finished video</span
        ></span
      ><i class="fas fa-arrow-right" aria-hidden="true"></i></button
    >
    <button type="button" onclick={() => start("arrangement")}
      ><i class="fas fa-table-cells" aria-hidden="true"></i><span
        ><strong>Sequence arrangement</strong><span
          >Layer, arrange and animate sequences</span
        ></span
      ><i class="fas fa-arrow-right" aria-hidden="true"></i></button
    >
  </section>
  <div class="collection-heading">
    <h2>Project library <span>{entries.length}</span></h2>
    <div class="library-tools">
      <label class="search"
        ><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input
          aria-label="Search projects"
          type="search"
          bind:value={query}
          placeholder="Find a project"
        /></label
      >
      <select bind:value={sort} aria-label="Sort projects"
        ><option value="recent">Recently edited</option><option value="name"
          >Name A–Z</option
        ></select
      >
    </div>
  </div>
  <div class="filters" role="group" aria-label="Project types">
    {#each filters as item}
      <button
        type="button"
        class:selected={filter === item.id}
        aria-pressed={filter === item.id}
        onclick={() => {
          filter = item.id;
          activePreview = null;
        }}>{item.label}</button
      >
    {/each}
  </div>
  {#if error || featureError || copyError}
    <div class="library-error" role="alert">
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
  {#if unreadableFeatures.length}<p class="notice" role="status">
      Could not read: {unreadableFeatures.join(", ")}. Earlier copies remain in
      each project’s history.
    </p>{/if}
  {#if copying}<p class="notice" role="status">
      Creating a separate copy…
    </p>{/if}
  {#if loading && !entries.length}
    <div class="empty" role="status">
      <i class="fas fa-film" aria-hidden="true"></i>
      <h3>Loading your projects…</h3>
      <p>Finding saved edits and previews.</p>
    </div>
  {:else if !shown.length}
    <div class="empty">
      <i class="fas fa-film" aria-hidden="true"></i>
      <h3>
        {entries.length
          ? "No matching projects"
          : "Make something worth watching"}
      </h3>
      <p>
        {entries.length
          ? "Try a different name or project type."
          : "Start a tutorial, show off the software, or bring sequences together."}
      </p>
      {#if entries.length}<button
          type="button"
          onclick={() => {
            query = "";
            filter = "all";
          }}>Clear filters</button
        >{:else}<button type="button" onclick={() => start(null)}
          >Create your first project</button
        >{/if}
    </div>
  {:else}
    <div class="project-grid" aria-label="Saved projects">
      {#each shown as entry (entry.id + ":" + entry.updatedAt)}
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
      {/each}
    </div>
  {/if}
  <StudioArrangements {onopen} />
  <footer class="library-footer">
    <span
      ><i class="fas fa-cloud" aria-hidden="true"></i>
      {authState.user && !authState.user.isAnonymous
        ? "Edits sync with your account."
        : "Sequence edits are saved on this device."} Device videos may need to be
      selected again elsewhere.</span
    >
    {#if features.length}<span
        >Software project folders are saved on this computer.</span
      >{/if}
  </footer>
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
  .studio-library {
    padding: clamp(20px, 3vw, 48px);
    container: studio-library / inline-size;
  }
  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 28px;
  }
  .eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.12em;
    color: var(--theme-text-secondary);
  }
  h1 {
    margin: 0;
    font-size: clamp(28px, 3vw, 40px);
    letter-spacing: -0.025em;
    line-height: 1.15;
    font-weight: 650;
  }
  .intro {
    margin: 12px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  button,
  input,
  select {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .new-project {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 46px;
    flex: none;
    padding: 12px 18px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    background: var(--theme-card-bg);
    font-weight: 600;
    font-size: 14px;
  }
  .new-project:hover {
    border-color: var(--theme-text-secondary);
  }
  .starting-points {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    overflow: hidden;
    background: var(--theme-stroke);
  }
  .starting-points button {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    padding: 22px;
    border: 0;
    text-align: left;
    background: var(--theme-panel-bg);
  }
  .starting-points button:hover {
    background: var(--theme-card-bg);
  }
  .starting-points button > i:first-child {
    font-size: 22px;
    color: var(--theme-accent);
    width: 26px;
    text-align: center;
  }
  .starting-points button > span {
    display: grid;
    gap: 7px;
    flex: 1;
    min-width: 0;
  }
  .starting-points strong {
    font-size: 15px;
  }
  .starting-points span span {
    color: var(--theme-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  .starting-points button > i:last-child {
    font-size: 12px;
    color: var(--theme-text-secondary);
  }
  .collection-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 38px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  h2 span {
    font-size: 14px;
    color: var(--theme-text-secondary);
    font-weight: 400;
    margin-left: 8px;
  }
  .library-tools {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    padding-left: 12px;
    color: var(--theme-text-secondary);
    background: var(--theme-card-bg);
  }
  input {
    width: 190px;
    min-height: 42px;
    padding: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-size: 14px;
  }
  select {
    min-height: 42px;
    padding: 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--theme-card-bg);
    font-size: 14px;
  }
  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 18px 0 22px;
  }
  .filters button {
    min-height: 38px;
    padding: 8px 14px;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 14px;
    color: var(--theme-text-secondary);
    background: transparent;
  }
  .filters button.selected {
    border-color: var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }
  .filters button:hover {
    color: var(--theme-text);
    background: var(--theme-card-bg);
  }
  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
    align-items: start;
    gap: 24px;
  }
  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    min-height: 280px;
    padding: 30px 16px;
    border: 1px dashed var(--theme-stroke);
    border-radius: 10px;
  }
  .empty > i {
    font-size: 28px;
    color: var(--theme-text-secondary);
  }
  .empty h3 {
    margin: 18px 0 8px;
    font-size: 20px;
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
    margin-bottom: 20px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: 14px;
  }
  .library-error p {
    margin: 0;
  }
  .notice {
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
    .starting-points {
      grid-template-columns: 1fr;
    }
    .starting-points button {
      padding: 16px;
    }
  }
  @container studio-library (max-width: 500px) {
    .library-header {
      align-items: start;
      flex-direction: column;
    }
    .new-project {
      width: 100%;
    }
    .library-tools {
      width: 100%;
    }
    .search {
      flex: 1;
    }
    input {
      width: 100%;
    }
    .collection-heading {
      margin-top: 28px;
    }
    .project-grid {
      gap: 18px;
    }
  }
  @container studio-library (min-width: 2000px) {
    .project-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
