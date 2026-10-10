<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import FestivalFilterBar from "./FestivalFilterBar.svelte";
  import FestivalGridCard from "./FestivalGridCard.svelte";
  import FestivalSubmissionForm from "../submit/FestivalSubmissionForm.svelte";
  import ModerationQueue from "../moderation/ModerationQueue.svelte";

  const { state: festivalState } = getFestivalContext();

  let showSubmitForm = $state(false);

  async function handleBookmark(festivalId: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await festivalState.updateTracker(uid, festivalId, { status: "interested" });
  }
</script>

<div class="discover-tab">
  <ModerationQueue />

  <FestivalFilterBar />

  {#if festivalState.festivals.length === 0}
    <div class="empty-state">
      <i class="fas fa-compass" aria-hidden="true"></i>
      <p>No festivals match your filters.</p>
      <p class="empty-hint">Try adjusting the region or time window.</p>
    </div>
  {:else}
    <div class="festival-grid" role="list" aria-label="Festival results">
      {#each festivalState.festivals as festival (festival.id)}
        <div role="listitem">
          <FestivalGridCard
            {festival}
            tracker={festivalState.trackers.get(festival.id)}
            attendanceCount={festivalState.attendanceCounts.get(festival.id) ?? 0}
            onselect={() => (festivalState.selectedFestival = festival)}
            onbookmark={() => handleBookmark(festival.id)}
          />
        </div>
      {/each}
    </div>
  {/if}

  <div class="submit-row">
    <button
      type="button"
      class="submit-festival-btn"
      onclick={() => (showSubmitForm = true)}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      Submit a festival
    </button>
  </div>
</div>

<FestivalSubmissionForm
  open={showSubmitForm}
  onclose={() => (showSubmitForm = false)}
/>

<style>
  .discover-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .festival-grid {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.25rem;
    align-content: start;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent;
  }

  .festival-grid::-webkit-scrollbar {
    width: 6px;
  }

  .festival-grid::-webkit-scrollbar-track {
    background: transparent;
  }

  .festival-grid::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 24px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    text-align: center;
  }

  .empty-state i {
    font-size: 40px;
    opacity: 0.3;
    margin-bottom: 8px;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
  }

  .empty-hint {
    font-size: var(--font-size-compact, 12px) !important;
    opacity: 0.7;
  }

  .submit-row {
    padding: 16px;
    display: flex;
    justify-content: center;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .submit-festival-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    padding: 10px 24px;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .submit-festival-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, #ffffff);
  }

  @media (prefers-reduced-motion: reduce) {
    .submit-festival-btn {
      transition: none;
    }
  }
</style>
