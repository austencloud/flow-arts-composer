<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import type { FestivalRegion } from "../../domain/models/festival";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  const { state } = getFestivalContext();

  const REGIONS: { value: string; label: string }[] = [
    { value: "all", label: "All Regions" },
    { value: "north-america", label: "N. America" },
    { value: "europe", label: "Europe" },
    { value: "oceania", label: "Oceania" },
    { value: "asia", label: "Asia" },
    { value: "south-america", label: "S. America" },
    { value: "africa", label: "Africa" },
  ];

  const TIME_WINDOWS: { value: string; label: string }[] = [
    { value: "upcoming", label: "Upcoming" },
    { value: "3months", label: "3 Months" },
    { value: "6months", label: "6 Months" },
    { value: "year", label: "This Year" },
  ];

  const SEEKING: { value: string; label: string; icon: string }[] = [
    { value: "all", label: "All", icon: "fas fa-globe" },
    { value: "applications-open", label: "Apps Open", icon: "fas fa-door-open" },
    { value: "instructors", label: "Instructors", icon: "fas fa-chalkboard-teacher" },
    { value: "performers", label: "Performers", icon: "fas fa-fire" },
  ];

  function applyFilters() {
    const uid = auth.currentUser?.uid;
    if (uid) state.loadFestivals(uid);
  }

  function setRegion(value: string) {
    state.filters = {
      ...state.filters,
      region: value === "all" ? undefined : (value as FestivalRegion),
    };
    applyFilters();
  }

  function setTimeWindow(value: string) {
    state.filters = {
      ...state.filters,
      timeWindow: value === "upcoming" ? undefined : (value as typeof state.filters.timeWindow),
    };
    applyFilters();
  }

  function setSeeking(value: string) {
    state.filters = {
      ...state.filters,
      seeking: value === "all" ? undefined : (value as typeof state.filters.seeking),
    };
    applyFilters();
  }

  const activeRegion = $derived(state.filters.region ?? "all");
  const activeTime = $derived(state.filters.timeWindow ?? "upcoming");
  const activeSeeking = $derived(state.filters.seeking ?? "all");
</script>

<div class="filter-bar" role="search" aria-label="Festival filters">
  <div class="seg seg-region" role="group" aria-label="Filter by region">
    <SegmentedControl
      options={REGIONS}
      value={activeRegion}
      onchange={setRegion}
      color="accent"
      size="sm"
    />
  </div>

  <div class="seg seg-time" role="group" aria-label="Filter by time">
    <SegmentedControl
      options={TIME_WINDOWS}
      value={activeTime}
      onchange={setTimeWindow}
      color="accent"
      size="sm"
    />
  </div>

  <div class="seg seg-seeking" role="group" aria-label="Filter by type">
    <SegmentedControl
      options={SEEKING}
      value={activeSeeking}
      onchange={setSeeking}
      color="accent"
      size="sm"
    />
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .filter-bar::-webkit-scrollbar {
    display: none;
  }

  /* Each segmented control gets a min-width so its segments stay legible; the
     bar scrolls horizontally rather than crushing the 7-option region group. */
  .seg {
    flex-shrink: 0;
  }

  .seg-region {
    min-width: 560px;
  }

  .seg-time {
    min-width: 320px;
  }

  .seg-seeking {
    min-width: 380px;
  }
</style>
