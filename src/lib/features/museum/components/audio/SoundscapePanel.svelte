<!--
  Expanded soundscape panel - shown when the bubble is open.
  Lists candidate tracks for the current wing. Click any to audition;
  "Set as default" commits the choice so it plays every time the player
  enters this room.
-->
<script lang="ts">
  import { getSoundscapeContext } from "../../audio/soundscape-context";
  import type { AudioCandidate } from "../../audio/soundscape";

  import "../museum-theme.css";
  const player = getSoundscapeContext();

  let wing = $derived(player.currentWing);
  let pref = $derived(wing ? player.getPreferenceFor(wing.wingId) : undefined);
  let activeId = $derived(player.activeCandidateId);

  function isDefault(cand: AudioCandidate): boolean {
    return pref?.candidateId === cand.id;
  }

  function pickCandidate(cand: AudioCandidate) {
    if (!wing) return;
    player.playCandidate(wing.wingId, cand.id);
  }

  function onMasterVolume(e: Event) {
    const target = e.target as HTMLInputElement;
    player.setMasterVolume(parseFloat(target.value));
  }

  function onCandidateVolume(e: Event, cand: AudioCandidate) {
    if (!wing) return;
    const target = e.target as HTMLInputElement;
    player.setCandidateVolume(wing.wingId, cand.id, parseFloat(target.value));
  }

  function candidateVolumeFor(cand: AudioCandidate): number {
    if (pref?.candidateId === cand.id && pref.volume !== undefined)
      return pref.volume;
    return cand.volume;
  }
</script>

<div
  class="panel museum-gold-scope"
  role="dialog"
  aria-label="Museum soundscape"
>
  <header class="panel-header">
    <div class="header-text">
      <div class="panel-title">Ambient Score</div>
      <div class="wing-name">{wing?.wingName ?? "Not inside a wing yet"}</div>
    </div>
    <div class="header-buttons">
      <button
        type="button"
        class="icon-btn"
        onclick={() => player.toggleMute()}
        aria-label={player.muted ? "Unmute" : "Mute"}
      >
        <i
          class="fas {player.muted ? 'fa-volume-mute' : 'fa-volume-up'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="icon-btn"
        onclick={() => player.closePanel()}
        aria-label="Close"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  {#if !player.hasUserInteracted}
    <div class="hint">Click anywhere in the museum to unlock audio.</div>
  {/if}

  {#if wing && wing.candidates.length > 0}
    <ul class="track-list">
      {#each wing.candidates as cand (cand.id)}
        {@const active = cand.id === activeId}
        {@const def = isDefault(cand)}
        <li class="track" class:active class:default-track={def}>
          <button
            type="button"
            class="track-main"
            onclick={() => pickCandidate(cand)}
            aria-pressed={active}
          >
            <span class="track-indicator" aria-hidden="true">
              {#if active && player.isPlaying}
                <i class="fas fa-volume-up"></i>
              {:else if active}
                <i class="fas fa-pause"></i>
              {:else}
                <i class="fas fa-play"></i>
              {/if}
            </span>
            <span class="track-info">
              <span class="track-title">{cand.title}</span>
              <span class="track-meta">
                <span class="track-attr">{cand.attribution}</span>
                <span class="track-sep">·</span>
                <span class="track-license">{cand.license}</span>
                <span class="track-sep">·</span>
                <span class="track-duration">{cand.duration}</span>
                {#if def}
                  <span class="track-sep">·</span>
                  <span class="default-badge">default</span>
                {/if}
              </span>
            </span>
          </button>
          <div class="track-volume">
            <i class="fas fa-volume-down" aria-hidden="true"></i>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={candidateVolumeFor(cand)}
              oninput={(e) => onCandidateVolume(e, cand)}
              aria-label={`Volume for ${cand.title}`}
            />
          </div>
        </li>
      {/each}
    </ul>

    <div class="commit-row">
      {#if activeId && pref?.candidateId !== activeId}
        <button
          type="button"
          class="commit-btn"
          onclick={() => player.saveAsPreference()}
        >
          <i class="fas fa-check" aria-hidden="true"></i>
          Save as default for this wing
        </button>
      {:else if activeId}
        <div class="commit-status">
          This is the default for {wing.wingName}.
        </div>
      {/if}
    </div>
  {:else if wing}
    <div class="empty">
      No candidates yet for this wing. Run <code
        >node scripts/search-soundscapes.cjs --wing {wing.wingId}</code
      >.
    </div>
  {:else}
    <div class="empty">Walk into a museum wing to hear its score.</div>
  {/if}

  <footer class="master-volume">
    <label>
      <span class="master-label">Master</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={player.masterVolume}
        oninput={onMasterVolume}
        aria-label="Master volume"
      />
      <span class="master-value">{Math.round(player.masterVolume * 100)}%</span>
    </label>
  </footer>
</div>

<style>
  .panel {
    width: 360px;
    max-height: min(620px, calc(100vh - 120px));
    background: rgba(14, 11, 9, 0.96);
    backdrop-filter: blur(12px);
    border: 1px solid var(--museum-gold-18);
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6);
    color: rgba(220, 210, 190, 0.9);
    font-family: Georgia, "Times New Roman", serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: panel-in var(--duration-fast) var(--ease-standard-out);
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--museum-gold-12);
    gap: 8px;
  }

  .panel-title {
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(220, 200, 160, 0.55);
  }

  .wing-name {
    font-size: 16px;
    color: rgba(230, 215, 180, 0.95);
    margin-top: 2px;
  }

  .header-buttons {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--museum-gold-60);
    cursor: pointer;
    border-radius: 6px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .icon-btn:hover {
    background: var(--museum-gold-10);
    color: rgba(220, 200, 160, 0.9);
  }

  .icon-btn:focus-visible {
    outline: 2px solid rgba(220, 200, 160, 0.5);
    outline-offset: 1px;
  }

  .hint {
    padding: 10px 16px;
    font-size: 12px;
    color: rgba(220, 180, 140, 0.75);
    background: rgba(100, 80, 40, 0.15);
    border-bottom: 1px solid var(--museum-gold-08);
  }

  .track-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    flex: 1;
  }

  .track {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--museum-gold-06);
    transition: background var(--duration-fast) var(--ease-standard);
  }

  .track:hover {
    background: var(--museum-gold-04);
  }
  .track.active {
    background: var(--museum-gold-09);
  }

  .track-main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    width: 100%;
  }

  .track-indicator {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: rgba(220, 200, 160, 0.5);
    border: 1px solid var(--museum-gold-20);
    border-radius: 50%;
    transition:
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }

  .track.active .track-indicator {
    color: rgba(230, 215, 180, 0.95);
    border-color: rgba(220, 200, 160, 0.6);
    background: rgba(220, 200, 160, 0.1);
  }

  .track-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .track-title {
    font-size: 13px;
    color: rgba(230, 215, 190, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--museum-gold-50);
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .track-sep {
    opacity: 0.5;
  }

  .default-badge {
    color: rgba(180, 220, 180, 0.85);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: var(--font-size-compact, 12px);
  }

  .track-volume {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 10px 56px;
    color: var(--museum-gold-40);
    font-size: 10px;
  }

  .track-volume input[type="range"] {
    flex: 1;
    accent-color: rgba(220, 200, 160, 0.7);
  }

  .commit-row {
    padding: 10px 16px;
    border-top: 1px solid var(--museum-gold-08);
  }

  .commit-btn {
    width: 100%;
    padding: 8px 12px;
    background: rgba(220, 200, 160, 0.12);
    border: 1px solid rgba(220, 200, 160, 0.25);
    color: rgba(230, 215, 180, 0.95);
    border-radius: 6px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .commit-btn:hover {
    background: rgba(220, 200, 160, 0.2);
    border-color: rgba(220, 200, 160, 0.4);
  }

  .commit-status {
    font-size: var(--font-size-compact, 12px);
    color: rgba(180, 220, 180, 0.65);
    text-align: center;
  }

  .empty {
    padding: 20px 16px;
    font-size: 12px;
    color: var(--museum-gold-50);
    text-align: center;
  }

  .empty code {
    font-family: Menlo, Monaco, monospace;
    font-size: var(--font-size-compact, 12px);
    color: rgba(220, 200, 160, 0.8);
    background: rgba(0, 0, 0, 0.3);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .master-volume {
    padding: 10px 16px;
    border-top: 1px solid var(--museum-gold-12);
    background: rgba(8, 6, 5, 0.4);
  }

  .master-volume label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--museum-gold-60);
  }

  .master-label {
    letter-spacing: 0.08em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .master-volume input[type="range"] {
    flex: 1;
    accent-color: rgba(220, 200, 160, 0.7);
  }

  .master-value {
    font-variant-numeric: tabular-nums;
    min-width: 34px;
    text-align: right;
  }
</style>
