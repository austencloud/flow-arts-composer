<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import type { CollectedFilm } from "#lib/features/film-collection/domain/film-collection-types.js";
  import { filmCollectionState } from "#lib/features/film-collection/state/film-collection-state.svelte.js";
  import { parseFilmKey } from "#lib/features/film-director/domain/film-director-link.js";
  import FilmDirectorMarquee from "./_components/FilmDirectorMarquee.svelte";
  import { getLibraryFilm, isLibraryFilmKey } from "./_capabilities/index";
  import type { FilmDirectorInput } from "./_lib/film-director-schema";
  import type { FilmOrigin } from "./_lib/film-origin";

  type WorkbenchComponent =
    typeof import("./_components/FilmDirectorWorkbench.svelte").default;

  type Stage = { film: FilmDirectorInput; origin: FilmOrigin };

  let Workbench = $state<WorkbenchComponent | null>(null);
  let loadError = $state<string | null>(null);
  // raw, not deep: the director structuredClones the film document it is given,
  // and a deep $state proxy throws DataCloneError. Nothing mutates a field of
  // `stage` — entering and leaving replace it whole — so raw loses nothing.
  let stage = $state.raw<Stage | null>(null);

  const requested = parseFilmKey(
    page.url.searchParams.get("film"),
    isLibraryFilmKey
  );

  // Read once, at entry. After this the workbench owns the parameter — it
  // writes the soloed scene back as the user moves around — and re-reading it
  // would fight those writes. Only an address typed for a film opens soloed;
  // picking a different film from the marquee starts it from the top.
  const requestedSceneId = page.url.searchParams.get("scene");
  let pendingSceneId = $state<string | null>(
    requested.kind === "unknown" ? null : requestedSceneId
  );

  // A saved link waits on the marquee while the collection loads rather than
  // booting an unrelated film and swapping it out. A link to an entry the user
  // cannot see simply stays on the marquee.
  let pendingSavedId = $state<string | null>(
    requested.kind === "saved" ? requested.id : null
  );

  if (requested.kind === "library") {
    stage = {
      film: getLibraryFilm(requested.key),
      origin: { kind: "library", key: requested.key },
    };
  }

  $effect(() => {
    const id = pendingSavedId;
    if (!id || filmCollectionState.loading) return;
    const entry = filmCollectionState.collection.find((item) => item.id === id);
    pendingSavedId = null;
    if (entry) openSavedFilm(entry);
  });

  // Choosing a capability from the marquee is a fresh start, so a scene id
  // left over from the address that opened the page does not follow it into a
  // demo that may not even have that scene.
  function pickCapability(id: string): void {
    pendingSceneId = null;
    stage = { film: getLibraryFilm(id), origin: { kind: "library", key: id } };
  }

  // The shell below shows only while the workbench module is still loading,
  // so it names the demo being opened rather than a position in a film.
  const preparingLabel = $derived(
    stage ? `Preparing ${stage.film.title}` : "Preparing"
  );

  function pickSavedFilm(entry: CollectedFilm): void {
    pendingSceneId = null;
    openSavedFilm(entry);
  }

  function openSavedFilm(entry: CollectedFilm): void {
    // The entry is a $state proxy and the director structuredClones its input,
    // which throws on a proxy. Snapshot to a plain object first.
    stage = {
      film: $state.snapshot(entry.film) as unknown as FilmDirectorInput,
      origin: { kind: "saved", id: entry.id, name: entry.name },
    };
  }

  function exitToMarquee(): void {
    stage = null;
    pendingSceneId = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("film");
    url.searchParams.delete("scene");
    goto(url, { shallow: true, replace: true });
  }

  onMount(() => {
    // This route owns starting the collection: the marquee's saved-films list
    // and the ?film=saved: resolution both read it, and FilmCollectionModule
    // does not start it itself.
    filmCollectionState.initLocal();

    let active = true;
    void import("./_components/FilmDirectorWorkbench.svelte")
      .then(({ default: component }) => {
        if (active) Workbench = component;
      })
      .catch((error: unknown) => {
        if (!active) return;
        loadError = error instanceof Error ? error.message : String(error);
      });

    return () => {
      active = false;
    };
  });
</script>

<svelte:head>
  <title>3D Film Director</title>
  <meta
    name="description"
    content="Private workbench for directing repeatable TKA 3D showcase films."
  />
</svelte:head>

{#if !stage}
  <FilmDirectorMarquee
    onOpenCapability={pickCapability}
    onOpenSavedFilm={pickSavedFilm}
  />
{:else if Workbench}
  <!-- createFilmDirectorState runs once per instance, so switching films has to
       remount the workbench. -->
  {#key stage.origin}
    <Workbench
      film={stage.film}
      initialOrigin={stage.origin}
      initialSceneId={pendingSceneId}
      onExit={exitToMarquee}
    />
  {/key}
{:else}
  <main class="loading-shell">
    <section
      class:error={Boolean(loadError)}
      class="loading-card"
      role={loadError ? "alert" : "status"}
    >
      <i
        class="fas {loadError ? 'fa-triangle-exclamation' : 'fa-clapperboard'}"
        aria-hidden="true"
      ></i>
      <div>
        <span>Director</span>
        <h1>{loadError ?? preparingLabel}</h1>
      </div>
    </section>
  </main>
{/if}

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #070812;
  }

  .loading-shell {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    color: var(--theme-text, #fff);
    background:
      radial-gradient(
        circle at 50% 40%,
        rgba(110, 91, 220, 0.22),
        transparent 34%
      ),
      #070812;
  }

  .loading-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    width: min(31rem, 100%);
    padding: 1.2rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #10111b);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.44);
  }

  .loading-card > i {
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.9rem;
    color: var(--theme-accent, #b0a4ff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 18%,
      transparent
    );
    font-size: 1.25rem;
  }

  .loading-card.error > i {
    color: var(--semantic-error, #ff9393);
  }

  span,
  h1 {
    margin: 0;
  }

  span {
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 0.25rem;
    font-size: 1.15rem;
    line-height: 1.25;
  }
</style>
