<script lang="ts">
  import { onDestroy } from "svelte";

  import { type CharacterId } from "$lib/shared/3d/domain/character-model";
  import type { CharacterInstanceState } from "$lib/shared/3d/state/character-instance-state.svelte";
  import { characterThumbnailUrl } from "../../constants/r2-cdn";
  import CharacterCardLivePreview from "./character-select/CharacterCardLivePreview.svelte";
  import { getCharacterCatalogContext } from "../../context/character-catalog-context";

  interface Props {
    selectedCharacterId: CharacterId | null;
    pendingCharacterId: CharacterId | null;
    previewPerformer: CharacterInstanceState | null;
    groupLabel?: string;
    onSelect: (id: CharacterId) => void;
    onIntent: (id: CharacterId) => void;
    onCancelIntent: () => void;
  }

  let {
    selectedCharacterId,
    pendingCharacterId,
    previewPerformer,
    groupLabel = "Select character",
    onSelect,
    onIntent,
    onCancelIntent,
  }: Props = $props();

  const getCatalog = getCharacterCatalogContext();
  const characters = $derived(getCatalog());
  const hasSelectedCharacter = $derived(
    characters.some(({ id }) => id === selectedCharacterId)
  );
  const personalCharacterId = $derived(
    (characters.find((definition) => definition.id === "personal-metaperson")
      ?.id as CharacterId | undefined) ?? null
  );

  let loadedThumbs = $state(new Set<string>());
  let hoveredCharacterId = $state<CharacterId | null>(null);
  let focusedCharacterId = $state<CharacterId | null>(null);
  let interactionReadyCharacterId = $state<CharacterId | null>(null);
  let personalPreviewReady = $state(false);
  let hoverPreviewTimer: ReturnType<typeof setTimeout> | null = null;

  const restingPreviewCharacterId = $derived(
    personalCharacterId ??
      selectedCharacterId ??
      (characters[0]?.id as CharacterId)
  );
  const livePreviewCharacterId = $derived(
    focusedCharacterId ?? hoveredCharacterId ?? restingPreviewCharacterId
  );
  const livePreviewActive = $derived(
    focusedCharacterId !== null || hoveredCharacterId !== null
  );

  function clearHoverPreviewTimer(): void {
    if (hoverPreviewTimer === null) return;
    clearTimeout(hoverPreviewTimer);
    hoverPreviewTimer = null;
  }

  function startPointerPreview(id: CharacterId): void {
    onIntent(id);
    clearHoverPreviewTimer();
    hoverPreviewTimer = setTimeout(() => {
      hoverPreviewTimer = null;
      interactionReadyCharacterId = null;
      hoveredCharacterId = id;
    }, 120);
  }

  function stopPointerPreview(id: CharacterId): void {
    onCancelIntent();
    clearHoverPreviewTimer();
    if (hoveredCharacterId === id) {
      hoveredCharacterId = null;
      interactionReadyCharacterId = null;
    }
  }

  function startFocusPreview(id: CharacterId): void {
    onIntent(id);
    focusedCharacterId = id;
    interactionReadyCharacterId = null;
  }

  function stopFocusPreview(id: CharacterId): void {
    onCancelIntent();
    if (focusedCharacterId === id) {
      focusedCharacterId = null;
      interactionReadyCharacterId = null;
    }
  }

  function moveSelection(event: KeyboardEvent, id: CharacterId): void {
    const currentIndex = characters.findIndex(
      (character) => character.id === id
    );
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex++;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex--;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = characters.length - 1;
    else return;

    event.preventDefault();
    nextIndex = (nextIndex + characters.length) % characters.length;
    const nextCharacter = characters[nextIndex];
    if (!nextCharacter) return;
    const group = (event.currentTarget as HTMLElement).closest(
      ".character-grid"
    );
    onSelect(nextCharacter.id as CharacterId);
    queueMicrotask(() => {
      group
        ?.querySelector<HTMLElement>(
          `[data-character-id="${nextCharacter.id}"]`
        )
        ?.focus();
    });
  }

  onDestroy(clearHoverPreviewTimer);
</script>

<div class="character-picker">
  <div class="character-grid" role="radiogroup" aria-label={groupLabel}>
    {#each characters as definition, index (definition.id)}
      {@const characterId = definition.id as CharacterId}
      {@const thumbnailUrl = characterThumbnailUrl(definition.id)}
      {@const isPersonalCharacter = personalCharacterId === definition.id}
      {@const hasLivePreview =
        isPersonalCharacter || livePreviewCharacterId === definition.id}
      {@const livePreviewReady = isPersonalCharacter
        ? personalPreviewReady
        : interactionReadyCharacterId === definition.id}
      <button
        class="character-card"
        class:selected={selectedCharacterId === definition.id}
        class:preparing={pendingCharacterId === definition.id}
        class:live-ready={livePreviewReady}
        type="button"
        role="radio"
        aria-checked={selectedCharacterId === definition.id}
        aria-busy={pendingCharacterId === definition.id}
        tabindex={selectedCharacterId === definition.id ||
        (!hasSelectedCharacter && index === 0)
          ? 0
          : -1}
        data-character-id={definition.id}
        onpointerenter={() => startPointerPreview(characterId)}
        onpointerleave={() => stopPointerPreview(characterId)}
        onfocus={() => startFocusPreview(characterId)}
        onblur={() => stopFocusPreview(characterId)}
        onkeydown={(event) => moveSelection(event, characterId)}
        onclick={() => onSelect(characterId)}
        title={definition.description}
        aria-label={pendingCharacterId === definition.id
          ? `${definition.name}, loading`
          : selectedCharacterId === definition.id
            ? `${definition.name}, active character`
            : `${definition.name}, hover for live preview`}
      >
        <span class="portrait-backdrop" aria-hidden="true"></span>

        <i
          class="fas {definition.icon ?? 'fa-user'} character-fallback-icon"
          class:hidden={loadedThumbs.has(definition.id) ||
            (hasLivePreview && livePreviewReady)}
          aria-hidden="true"
        ></i>

        {#if thumbnailUrl}
          <img
            class="character-thumb"
            class:loaded={loadedThumbs.has(definition.id)}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            onload={() =>
              (loadedThumbs = new Set(loadedThumbs).add(definition.id))}
          />
        {/if}

        {#if hasLivePreview}
          <span class="live-preview-layer" aria-hidden="true">
            <CharacterCardLivePreview
              {characterId}
              sourcePerformer={previewPerformer}
              active={livePreviewCharacterId === definition.id &&
                livePreviewActive}
              onReady={() => {
                if (isPersonalCharacter) {
                  personalPreviewReady = true;
                } else if (livePreviewCharacterId === characterId) {
                  interactionReadyCharacterId = characterId;
                }
              }}
            />
          </span>
        {/if}

        {#if pendingCharacterId === definition.id}
          <span class="character-loading" aria-hidden="true"></span>
        {/if}
        {#if selectedCharacterId === definition.id}
          <span class="character-selected-mark" aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
        {/if}
        {#if isPersonalCharacter}
          <span class="character-personal-badge" aria-hidden="true">You</span>
        {/if}

        <span class="character-card-name">{definition.name}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .character-picker {
    container-type: inline-size;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .character-card {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    overflow: hidden;
    border: 2px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    isolation: isolate;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .portrait-backdrop {
    position: absolute;
    inset: 0;
    z-index: -2;
    background:
      radial-gradient(
        circle at 50% 34%,
        color-mix(in srgb, var(--performer-color) 15%, transparent),
        transparent 54%
      ),
      linear-gradient(160deg, var(--theme-card-bg), var(--surface-inset-deep));
  }

  .character-fallback-icon {
    color: color-mix(
      in srgb,
      var(--performer-color) 65%,
      var(--theme-text-dim)
    );
    font-size: clamp(1.5rem, 12cqi, 2.5rem);
    opacity: 0.72;
  }

  .character-fallback-icon.hidden {
    opacity: 0;
  }

  .character-thumb {
    position: absolute;
    inset: 0;
    z-index: -1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
    opacity: 0;
    transform: scale(2.15);
    transform-origin: 50% 17%;
    filter: saturate(0.92) contrast(1.04);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast),
      filter var(--transition-fast);
  }

  .character-thumb.loaded {
    opacity: 0.9;
  }

  .live-preview-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .character-card.live-ready .live-preview-layer {
    opacity: 1;
  }

  .character-selected-mark {
    position: absolute;
    z-index: 3;
    top: 0.3125rem;
    left: 0.3125rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid color-mix(in srgb, white 42%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--performer-color) 88%, black);
    color: white;
    font-size: 0.6875rem;
    box-shadow: 0 0.125rem 0.5rem color-mix(in srgb, black 45%, transparent);
  }

  .character-personal-badge {
    position: absolute;
    z-index: 3;
    top: 0.3125rem;
    right: 0.3125rem;
    padding: 0.1875rem 0.4375rem;
    border: 1px solid color-mix(in srgb, white 12%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-inset-deep) 88%, black);
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
    backdrop-filter: blur(0.375rem);
  }

  .character-card-name {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 1.25rem 0.375rem 0.375rem;
    overflow: hidden;
    color: var(--theme-text);
    font-size: clamp(var(--font-size-min, 14px), 1.65cqi, 1.125rem);
    font-weight: 680;
    line-height: 1.2;
    text-align: center;
    text-overflow: ellipsis;
    text-shadow: 0 1px 3px black;
    white-space: nowrap;
    background: linear-gradient(
      transparent,
      color-mix(in srgb, var(--surface-darker) 96%, black)
    );
  }

  .character-card:hover {
    border-color: color-mix(
      in srgb,
      var(--performer-color) 58%,
      var(--theme-stroke)
    );
    color: var(--theme-text);
    transform: translateY(-0.125rem);
    box-shadow: 0 0.4rem 1rem color-mix(in srgb, black 38%, transparent);
  }

  .character-card:hover .character-thumb,
  .character-card:focus-visible .character-thumb {
    opacity: 1;
    transform: scale(2.2);
    filter: saturate(1) contrast(1.06);
  }

  .character-card.selected {
    border-color: var(--performer-color);
    color: var(--theme-text);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--performer-color) 32%, transparent),
      0 0.375rem 1.25rem
        color-mix(in srgb, var(--performer-color) 22%, transparent);
  }

  .character-card.preparing {
    border-color: color-mix(in srgb, var(--performer-color) 68%, transparent);
  }

  .character-loading {
    position: absolute;
    z-index: 4;
    top: 50%;
    left: 50%;
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid
      color-mix(in srgb, var(--performer-color) 25%, transparent);
    border-top-color: var(--performer-color);
    border-radius: 50%;
    animation: character-loading-spin calc(var(--duration-dramatic) * 2) linear
      infinite;
  }

  @keyframes character-loading-spin {
    from {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  button:focus-visible {
    outline: 2px solid var(--performer-color);
    outline-offset: 2px;
  }

  @container (min-width: 26rem) {
    .character-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 42rem) {
    .character-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container (min-width: 62rem) {
    .character-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .character-card,
    .character-thumb,
    .live-preview-layer {
      transition: none;
    }

    .character-card:hover {
      transform: none;
    }

    .character-thumb,
    .character-card:hover .character-thumb,
    .character-card:focus-visible .character-thumb {
      transform: scale(2.15);
    }

    .character-loading {
      animation: none;
    }
  }
</style>
