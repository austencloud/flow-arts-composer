<!--
  The director's chair: everything the film language can be told to do, with
  the count of each, and a seat to do it from.

  The films demonstrate capabilities one scene at a time. This reads them all at
  once — how many camera moves exist, how many effects, how many props — and
  says which of them the loaded film actually uses. Where a capability can be
  spent on the scene now on screen, its chip spends it; where it cannot, the
  chip jumps to a scene that proves it.

  It mounts through SceneControlWorkspace's host-panel seam, so it shares the
  rail, the dock geometry, and the one-panel-at-a-time rule with the viewer's
  own tools rather than opening a second column on the same edge.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  import { getFilmDirectorContext } from "../_lib/film-director-context";
  import {
    buildDirectorCapabilityGroups,
    findCapabilityUsage,
    type DirectorCapability,
  } from "../_lib/director-capability-catalog";
  import type { DirectorCameraMove } from "../_lib/camera-language";
  import { MAX_CAMERA_MOVES } from "../_lib/film-director-edit";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  const director = getFilmDirectorContext();

  /** Built once: the catalog is a function of the registries, not of the film. */
  const groups = buildDirectorCapabilityGroups();

  const usage = $derived(
    findCapabilityUsage(director.sourceInput, director.film)
  );

  const scene = $derived(director.frame.scene);
  const sceneIndex = $derived(director.frame.sceneIndex);

  /** The authored camera of the scene on screen. Moves live here, not in the
   *  resolved spec, where they have already been compiled into keyframes. */
  const authoredCamera = $derived.by(() => {
    const authored = director.sourceInput.scenes.find(
      (candidate) => candidate.id === scene.id
    );
    return (authored?.camera ?? null) as Record<string, unknown> | null;
  });

  const moves = $derived.by(() => {
    const list = authoredCamera?.moves;
    return Array.isArray(list) ? (list as DirectorCameraMove[]) : [];
  });

  /**
   * Why this camera cannot take a move, in the same words the edit would use.
   *
   * Framing grammar and preset grammar are exclusive in the schema, so a scene
   * written as a preset or a run of shots has nowhere to put one. Saying so up
   * front beats offering a chip that always fails.
   */
  const conflict = $derived.by(() => {
    const camera = authoredCamera;
    if (!camera) return null;
    if (Array.isArray(camera.shots)) return "a run of shots";
    if (Array.isArray(camera.keyframes)) return "raw keyframes";
    if (typeof camera.preset === "string" && camera.preset !== "custom") {
      return `the "${camera.preset}" preset`;
    }
    return null;
  });

  const full = $derived(moves.length >= MAX_CAMERA_MOVES);

  let openGroupId = $state<string | null>("camera-moves");

  function toggleGroup(id: string): void {
    openGroupId = openGroupId === id ? null : id;
  }

  function usedScenes(capability: DirectorCapability): string[] {
    return usage.get(capability.id) ?? [];
  }

  function usedCount(groupId: string): number {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return 0;
    return group.capabilities.filter(
      (capability) => usedScenes(capability).length > 0
    ).length;
  }

  /** Jumps the film to the first scene that proves this capability, soloed. */
  function proveIt(capability: DirectorCapability): void {
    const [first] = usedScenes(capability);
    if (!first) return;
    const index = director.film.scenes.findIndex(
      (candidate) => candidate.id === first
    );
    if (index >= 0) director.setSoloScene(index);
  }

  function spend(capability: DirectorCapability): void {
    const action = capability.action;
    if (action.kind === "camera-move") {
      director.editScene({
        sceneId: scene.id,
        kind: "append-camera-move",
        move: action.move,
      });
      return;
    }
    if (action.kind === "scene") {
      director.editScene({
        sceneId: scene.id,
        kind: action.field,
        value: action.value,
      });
      return;
    }
    proveIt(capability);
  }

  /** Whether pressing this chip would do anything, given the scene on screen. */
  function isLive(capability: DirectorCapability): boolean {
    const action = capability.action;
    if (action.kind === "camera-move") return !conflict && !full;
    if (action.kind === "scene") return true;
    return usedScenes(capability).length > 0;
  }

  function chipLabel(capability: DirectorCapability): string {
    const action = capability.action;
    if (action.kind === "camera-move") return `Add ${capability.label}`;
    if (action.kind === "scene") {
      return `Set this scene's ${action.field} to ${capability.label}`;
    }
    const scenes = usedScenes(capability);
    if (scenes.length === 0) return `${capability.label}, unused in this film`;
    return `Watch ${capability.label} in ${scenes[0]}`;
  }

  /**
   * How wide a move's segment is on the timeline.
   *
   * A move without a stated duration takes an equal share, which is what the
   * compiler does with it. One that states its own seconds gets that many
   * shares, so an eight-second push reads as longer than a one-second whip.
   */
  function moveWeight(move: DirectorCameraMove): number {
    const stated = move.durationSeconds;
    return typeof stated === "number" && stated > 0 ? stated : 1;
  }

  /**
   * A move as its film would spell it, minus the parts it left unsaid.
   *
   * An omitted amount stays omitted rather than being filled in with the
   * compiler's default: the timeline should read as what the document says,
   * and inventing a number here would make an unstated move look stated.
   */
  function moveLabel(move: DirectorCameraMove): string {
    const amount = move.amount;
    const size =
      amount && "degrees" in amount
        ? `${amount.degrees}°`
        : amount && "meters" in amount
          ? `${amount.meters}m`
          : amount && "match" in amount
            ? "to fit"
            : null;
    return [move.move, move.direction, size].filter(Boolean).join(" ");
  }
</script>

<section class="chair" aria-labelledby="director-chair-title">
  <header class="chair-header">
    <span class="chair-icon" aria-hidden="true">
      <i class="fas fa-clapperboard"></i>
    </span>
    <h2 id="director-chair-title">Director's chair</h2>
    <button
      type="button"
      class="chair-close"
      aria-label="Close the director's chair"
      onclick={onClose}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="chair-body">
    <section class="timeline-block">
      <div class="block-head">
        <h3>Camera timeline</h3>
        <span class="block-sub"
          >Scene {sceneIndex + 1} of {director.film.scenes.length} · {scene.title}</span
        >
      </div>

      {#if conflict}
        <p class="note">
          This scene's camera is written as {conflict}, so it holds no moves.
          Open a scene with its own moves, or rewrite this one in the JSON
          editor.
        </p>
      {:else if moves.length === 0}
        <p class="note">
          No moves on this camera yet. Every chip below adds one to the end.
        </p>
      {:else}
        <ol class="timeline">
          {#each moves as move, index (index)}
            <li class="move" style:flex-grow={moveWeight(move)}>
              <span class="move-label">{moveLabel(move)}</span>
              <button
                type="button"
                class="move-remove"
                aria-label="Remove {moveLabel(move)} from this camera"
                onclick={() =>
                  director.editScene({
                    sceneId: scene.id,
                    kind: "remove-camera-move",
                    index,
                  })}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ol>
        <p class="capacity">{moves.length} of {MAX_CAMERA_MOVES} moves</p>
      {/if}

      {#if director.lastEditError}
        <p class="edit-error" role="alert">{director.lastEditError}</p>
      {/if}
    </section>

    {#each groups as group (group.id)}
      {@const open = openGroupId === group.id}
      <section class="group" class:open>
        <button
          type="button"
          class="group-head"
          aria-expanded={open}
          onclick={() => toggleGroup(group.id)}
        >
          <span class="group-label">{group.label}</span>
          <span class="group-count">{group.capabilities.length}</span>
          <i
            class="fas fa-chevron-down group-chevron"
            class:flipped={open}
            aria-hidden="true"
          ></i>
        </button>

        {#if open}
          <div
            class="group-body"
            transition:growFade={{ duration: DURATION.normal }}
          >
            <p class="group-summary">{group.summary}</p>
            <p class="group-usage">
              {usedCount(group.id)} of {group.capabilities.length} appear in this
              film · from <code>{group.source}</code>
            </p>
            <div class="chips">
              {#each group.capabilities as capability (capability.id)}
                {@const scenes = usedScenes(capability)}
                <FilterChipBase
                  label={capability.label}
                  mode={isLive(capability) ? "action" : "display"}
                  size="sm"
                  active={scenes.length > 0}
                  count={scenes.length > 0 ? scenes.length : null}
                  chipColor={capability.color ?? "var(--theme-accent)"}
                  ariaLabel={chipLabel(capability)}
                  onclick={() => spend(capability)}
                />
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/each}
  </div>
</section>

<style>
  .chair {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: auto;
    /*
     * Percent, not `inherit`. The dock anchor is absolutely positioned with
     * both top and bottom, so its height is definite but its own max-height
     * computes to `none` — inheriting that leaves this panel unbounded, and a
     * catalog of 148 chips then runs 300px past the bottom of a 1080 viewport
     * instead of scrolling inside the dock.
     */
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
  }

  .chair-header {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    align-items: center;
    gap: 0.625rem;
    min-height: 4rem;
    padding: 0.625rem 0.625rem 0.625rem 0.875rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex: none;
  }

  .chair-icon {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
  }

  .chair-header h2 {
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: 1rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chair-close {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .chair-close:hover,
  .chair-close:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .chair-close:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .chair-body {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .timeline-block {
    /*
     * The scroller is a flex column, so its children shrink by default. Left at
     * the default they compress to fit the dock instead of letting the body
     * scroll, and `.group`'s `overflow: hidden` then clips the row's own label.
     */
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: var(--theme-card-bg);
  }

  .block-head {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .block-head h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--theme-text);
  }

  .block-sub {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
  }

  .note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--theme-text-dim);
  }

  .timeline {
    display: flex;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    flex-wrap: wrap;
  }

  .move {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1 1 7rem;
    min-width: 7rem;
    min-height: 2.75rem;
    padding: 0.25rem 0.25rem 0.25rem 0.625rem;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: 0.625rem;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  .move-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 0.8125rem;
    line-height: 1.2;
    color: var(--theme-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .move-remove {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .move-remove:hover,
  .move-remove:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .move-remove:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .capacity,
  .group-usage {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .edit-error {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--semantic-danger, #ff8080);
  }

  .group {
    /* Same reason as `.timeline-block`: keep the natural height, let body scroll. */
    flex: none;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: var(--theme-card-bg);
    overflow: hidden;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
  }

  .group-head:hover,
  .group-head:focus-visible {
    background: var(--theme-card-hover-bg);
  }

  .group-head:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .group-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-count {
    flex: none;
    min-width: 2rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    color: var(--theme-accent);
    font-size: 0.8125rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .group-chevron {
    flex: none;
    color: var(--theme-text-dim);
    transition: transform var(--transition-fast, 150ms) ease;
  }

  .group-chevron.flipped {
    transform: rotate(180deg);
  }

  .group-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.75rem 0.75rem;
  }

  .group-summary {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--theme-text-dim);
  }

  .group-usage code {
    font-size: 0.75rem;
    color: var(--theme-text);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .group-chevron {
      transition: none;
    }
  }
</style>
