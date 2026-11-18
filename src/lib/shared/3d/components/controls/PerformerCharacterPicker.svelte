<script lang="ts">
  import { type CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import { resolveCharacterGrid } from "#lib/shared/3d/domain/character-grid.js";
  import { characterThumbnailUrl } from "../../constants/r2-cdn";
  import { getCharacterCatalogContext } from "../../context/character-catalog-context";

  interface Props {
    selectedCharacterId: CharacterId | null;
    pendingCharacterId: CharacterId | null;
    groupLabel?: string;
    /**
     * True when the host gives the picker a bounded height to fill. The tiles
     * then share that height so every character is on screen at once. A host
     * that only gives it a width (a lab page) leaves this off.
     */
    fill?: boolean;
    onSelect: (id: CharacterId) => void;
    onIntent: (id: CharacterId) => void;
    onCancelIntent: () => void;
  }

  let {
    selectedCharacterId,
    pendingCharacterId,
    groupLabel = "Select character",
    fill = false,
    onSelect,
    onIntent,
    onCancelIntent,
  }: Props = $props();

  /** The gap between tiles, in px. The grid function and the CSS read the same number. */
  const GRID_GAP = 8;

  const getCatalog = getCharacterCatalogContext();
  const characters = $derived(getCatalog());
  const hasSelectedCharacter = $derived(
    characters.some(({ id }) => id === selectedCharacterId)
  );
  const personalCharacterId = $derived(
    (characters.find((definition) => definition.id === "personal-metaperson")
      ?.id as CharacterId | undefined) ?? null
  );

  // The measured box never takes its size from the tiles, so the grid it
  // resolves cannot feed back into the measurement.
  let pickerWidth = $state(0);
  let pickerHeight = $state(0);
  const grid = $derived(
    resolveCharacterGrid(
      characters.length,
      pickerWidth,
      fill ? pickerHeight : 0,
      GRID_GAP
    )
  );

  // A tile is its portrait and nothing else. Picking one puts that body on the
  // stage beside the picker, at full size, which is the preview. Reaching a
  // tile only warms its body (onIntent) so the pick is quick.
  let loadedThumbs = $state(new Set<string>());
  let missingThumbs = $state(new Set<string>());

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
</script>

<div
  class="character-picker"
  class:bounded={fill}
  bind:clientWidth={pickerWidth}
  bind:clientHeight={pickerHeight}
>
  <div
    class="character-grid"
    class:fills={grid.fills}
    style:--grid-columns={grid.columns}
    style:--grid-rows={grid.rows}
    style:--grid-gap="{GRID_GAP}px"
    role="radiogroup"
    aria-label={groupLabel}
  >
    {#each characters as definition, index (definition.id)}
      {@const characterId = definition.id as CharacterId}
      {@const thumbnailUrl = characterThumbnailUrl(definition.id)}
      {@const isPersonalCharacter = personalCharacterId === definition.id}
      {@const portraitShown = loadedThumbs.has(definition.id)}
      <button
        class="character-card"
        class:selected={selectedCharacterId === definition.id}
        class:preparing={pendingCharacterId === definition.id}
        type="button"
        role="radio"
        aria-checked={selectedCharacterId === definition.id}
        aria-busy={pendingCharacterId === definition.id}
        tabindex={selectedCharacterId === definition.id ||
        (!hasSelectedCharacter && index === 0)
          ? 0
          : -1}
        data-character-id={definition.id}
        onpointerenter={() => onIntent(characterId)}
        onpointerleave={onCancelIntent}
        onfocus={() => onIntent(characterId)}
        onblur={onCancelIntent}
        onkeydown={(event) => moveSelection(event, characterId)}
        onclick={() => onSelect(characterId)}
        title={definition.description}
        aria-label={pendingCharacterId === definition.id
          ? `${definition.name}, loading`
          : selectedCharacterId === definition.id
            ? `${definition.name}, active character`
            : definition.name}
      >
        <span class="portrait-backdrop" aria-hidden="true"></span>

        <i
          class="fas {definition.icon ?? 'fa-user'} character-fallback-icon"
          class:hidden={portraitShown}
          aria-hidden="true"
        ></i>

        {#if !missingThumbs.has(definition.id)}
          <img
            class="character-thumb"
            class:loaded={portraitShown}
            src={thumbnailUrl}
            alt=""
            decoding="async"
            draggable="false"
            onload={() =>
              (loadedThumbs = new Set(loadedThumbs).add(definition.id))}
            onerror={() =>
              (missingThumbs = new Set(missingThumbs).add(definition.id))}
          />
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
    min-width: 0;
  }

  /* A host that bounds the picker's height: this box takes that height and
     nothing from its tiles, so it can be measured before they are laid out. */
  .character-picker.bounded {
    flex: 1 1 0;
    min-height: 0;
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-columns, 3), minmax(0, 1fr));
    gap: var(--grid-gap, 8px);
  }

  /* Every character on screen at once: the rows share the host's height. */
  .character-grid.fills {
    height: 100%;
    grid-template-rows: repeat(var(--grid-rows, 1), minmax(0, 1fr));
  }

  /* Too short to hold them all (a phone sheet): the tiles keep their shape and
     the host scrolls. The padding keeps the last row off the sheet's edge. */
  .character-picker.bounded > .character-grid:not(.fills) {
    padding-bottom: 0.75rem;
  }

  .character-card {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 3 / 4;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    overflow: hidden;
    border: 2px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    isolation: isolate;
    transition:
      border-color var(--transition-fast),
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .character-grid.fills .character-card {
    aspect-ratio: auto;
    height: 100%;
    min-height: 0;
  }

  /* A soft light from above and behind the head, so a dark jacket or dark
     hair still stands off the tile. */
  .portrait-backdrop {
    position: absolute;
    inset: 0;
    z-index: -2;
    background:
      radial-gradient(
        120% 62% at 50% 22%,
        color-mix(in srgb, white 15%, transparent),
        transparent 68%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--theme-card-bg) 86%, white),
        var(--surface-inset-deep)
      );
    transition: opacity var(--transition-fast);
  }

  /* The chosen tile takes the performer's colour over its whole surface. */
  .character-card.selected .portrait-backdrop {
    background:
      radial-gradient(
        120% 62% at 50% 22%,
        color-mix(in srgb, var(--performer-color) 46%, transparent),
        transparent 70%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--performer-color) 20%, var(--theme-card-bg)),
        var(--surface-inset-deep)
      );
  }

  .character-fallback-icon {
    color: color-mix(
      in srgb,
      var(--performer-color) 65%,
      var(--theme-text-dim)
    );
    font-size: 2rem;
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
    transform-origin: 50% 30%;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-normal);
    user-select: none;
  }

  .character-thumb.loaded {
    opacity: 1;
  }

  .character-selected-mark {
    position: absolute;
    z-index: 3;
    top: 0.375rem;
    left: 0.375rem;
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
    top: 0.375rem;
    right: 0.375rem;
    padding: 0.1875rem 0.4375rem;
    border: 1px solid color-mix(in srgb, white 16%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-inset-deep) 92%, black);
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }

  .character-card-name {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 1.5rem 0.375rem 0.4375rem;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
    text-overflow: ellipsis;
    text-shadow: 0 1px 3px black;
    white-space: nowrap;
    background: linear-gradient(
      transparent,
      color-mix(in srgb, var(--surface-darker) 82%, transparent) 55%,
      color-mix(in srgb, var(--surface-darker) 96%, black)
    );
  }

  .character-card:hover {
    border-color: color-mix(
      in srgb,
      var(--performer-color) 58%,
      var(--theme-stroke)
    );
    transform: translateY(-0.125rem);
    box-shadow: 0 0.4rem 1rem color-mix(in srgb, black 38%, transparent);
  }

  .character-card:hover .character-thumb,
  .character-card:focus-visible .character-thumb {
    transform: scale(1.05);
  }

  .character-card.selected {
    border-color: var(--performer-color);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--performer-color) 36%, transparent),
      0 0.375rem 1.25rem
        color-mix(in srgb, var(--performer-color) 26%, transparent);
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
    border-radius: 50%;
    animation: character-loading-spin calc(var(--duration-dramatic) * 2) linear
      infinite;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .character-loading {
    border-top-color: var(--performer-color);
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

  @media (prefers-reduced-motion: reduce) {
    .character-card,
    .character-thumb,
    .portrait-backdrop {
      transition: none;
    }

    .character-card:hover {
      transform: none;
    }

    .character-card:hover .character-thumb,
    .character-card:focus-visible .character-thumb {
      transform: none;
    }

    .character-loading {
      animation: none;
    }
  }
</style>
