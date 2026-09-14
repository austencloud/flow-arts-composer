<script lang="ts">
  /**
   * RoomPicker - teleport button + overlay for jumping between museum rooms.
   *
   * A small compass button in the top-right opens a grid overlay of all rooms.
   * Clicking a room teleports the player there and closes the overlay.
   * "Full Museum" restores the complete connected layout.
   *
   * The selected room is synced to the URL query param `?room=<id>`.
   */

  import { ROOM_PICKER_ROOMS } from "./room-picker-rooms";

  interface Props {
    selectedRoom: string | null;
    onSelect: (roomId: string | null) => void;
  }

  const { selectedRoom, onSelect }: Props = $props();

  let open = $state(false);

  // Derived from the walk, not hand-listed. The old hand-listed array named
  // `vulcan-cave`, a placeholder the authored cave replaced, and picking it
  // isolated to zero rooms and crashed the grid builder. It also offered none
  // of the eleven cave chambers.
  const ROOM_ORDER = ROOM_PICKER_ROOMS;

  const WING_THEME_COLORS: Record<string, string> = {
    institutional: "#8090a0",
    cave: "#c07030",
    classical: "#d4a850",
    renaissance: "#b08040",
    industrial: "#a09070",
    digital: "#5080c0",
    construction: "#c0a030",
    gallery: "#d4a060",
    retail: "#a0b0a0",
    outdoor: "#70a060",
  };

  function getThemeColor(theme: string): string {
    return WING_THEME_COLORS[theme] ?? "#888";
  }

  function handleSelect(roomId: string | null): void {
    onSelect(roomId);
    open = false;
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      open = false;
      event.stopPropagation();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Teleport button -->
<button class="teleport-btn" onclick={() => { open = !open; }} aria-label="Teleport to room">
  <i class="fas fa-compass" aria-hidden="true"></i>
</button>

<!-- Overlay -->
{#if open}
  <!-- Backdrop -->
  <button class="backdrop" onclick={() => { open = false; }} aria-label="Close room picker"></button>

  <div class="room-overlay">
    <div class="overlay-header">
      <span class="overlay-title">Teleport to Room</span>
      <button class="close-btn" onclick={() => { open = false; }} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="room-grid">
      <button
        class="room-card"
        class:active={selectedRoom === null}
        onclick={() => handleSelect(null)}
      >
        <span class="room-icon"><i class="fas fa-border-all" aria-hidden="true"></i></span>
        <span class="room-name">Full Museum</span>
      </button>

      {#each ROOM_ORDER as room}
        <button
          class="room-card"
          class:active={selectedRoom === room.id}
          style:--card-accent={getThemeColor(room.theme)}
          onclick={() => handleSelect(room.id)}
        >
          <span class="room-icon" style:color={getThemeColor(room.theme)}>
            <i class="fas fa-door-open" aria-hidden="true"></i>
          </span>
          <span class="room-name">{room.name}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .teleport-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 90;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.8);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .teleport-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: #fff;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    cursor: default;
  }

  .room-overlay {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 201;
    width: min(600px, 90vw);
    max-height: 80vh;
    background: rgba(18, 18, 28, 0.97);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 20px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .overlay-title {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: rgba(255, 255, 255, 0.8);
  }

  .room-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .room-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 8px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
  }

  .room-card:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: #fff;
  }

  .room-card.active {
    background: color-mix(in srgb, var(--card-accent, #888) 15%, transparent);
    border-color: var(--card-accent, rgba(255, 255, 255, 0.25));
    color: #fff;
  }

  .room-icon {
    font-size: 20px;
  }

  .room-name {
    font-size: 12px;
    text-align: center;
    line-height: 1.3;
  }
</style>
