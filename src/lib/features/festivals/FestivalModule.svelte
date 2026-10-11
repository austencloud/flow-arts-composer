<script lang="ts">
  import * as festivalLoader from "./services/festival-loader";
  import * as festivalTrackerRepository from "./services/festival-tracker-repository";
  import * as festivalAttendanceRepository from "./services/festival-attendance-repository";
  import * as workshopPortfolioRepository from "./services/workshop-portfolio-repository";
  import { createFestivalState, type FestivalTab } from "./state/festival-state.svelte";
  import { setFestivalContext } from "./context/festival-context";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { auth } from "#lib/shared/auth/firebase.js";
  import DiscoverTab from "./components/discover/DiscoverTab.svelte";
  import FestivalMap from "./components/map/FestivalMap.svelte";
  import FestivalDetailView from "./components/discover/FestivalDetailView.svelte";
  import FestivalCalendar from "./components/calendar/FestivalCalendar.svelte";
  import WorkshopPortfolioEditor from "./components/portfolio/WorkshopPortfolioEditor.svelte";

  const festivalState = createFestivalState(
    festivalLoader,
    festivalTrackerRepository,
    festivalAttendanceRepository,
    workshopPortfolioRepository,
  );

  setFestivalContext({ state: festivalState });

  const VALID_TABS: FestivalTab[] = ["discover", "map", "calendar", "portfolio"];

  // Sync sidebar navigation state → internal festival tab state
  $effect(() => {
    const navTab = navigationState.activeTab;
    if (VALID_TABS.includes(navTab as FestivalTab)) {
      festivalState.activeTab = navTab as FestivalTab;
    }
  });

  $effect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      festivalState.loadFestivals(uid);
      festivalState.loadPortfolio(uid);
    }
  });
</script>

<div class="festival-module">
  <div class="tab-content" role="tabpanel">
    {#if festivalState.isLoading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <p>Loading festivals...</p>
      </div>
    {:else if festivalState.activeTab === "discover"}
      <DiscoverTab />
    {:else if festivalState.activeTab === "map"}
      <FestivalMap />
    {:else if festivalState.activeTab === "calendar"}
      <FestivalCalendar />
    {:else if festivalState.activeTab === "portfolio"}
      <WorkshopPortfolioEditor />
    {/if}
  </div>
</div>

<FestivalDetailView
  open={!!festivalState.selectedFestival}
  festival={festivalState.selectedFestival}
  tracker={festivalState.selectedFestival
    ? festivalState.trackers.get(festivalState.selectedFestival.id)
    : undefined}
  onclose={() => (festivalState.selectedFestival = null)}
/>

<style>
  .festival-module {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #ffffff);
  }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
    padding: 24px;
  }

  .tab-content {
    flex: 1;
    overflow: hidden;
  }
</style>
