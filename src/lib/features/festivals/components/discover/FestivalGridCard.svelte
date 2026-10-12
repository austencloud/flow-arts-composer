<script lang="ts">
  import { format, differenceInDays } from "date-fns";
  import type { Festival } from "../../domain/models/festival";
  import type { UserFestivalTracker } from "../../domain/models/festival-tracker";
  import { toDate } from "../../domain/models/timestamp-utils";
  import AttendanceBadge from "./AttendanceBadge.svelte";

  interface Props {
    festival: Festival;
    tracker?: UserFestivalTracker;
    attendanceCount: number;
    onselect: () => void;
    onbookmark: () => void;
  }
  let { festival, tracker, attendanceCount, onselect, onbookmark }: Props =
    $props();

  let imageLoaded = $state(false);
  let imageError = $state(false);

  const startDate = $derived(toDate(festival.dates.start));
  const endDate = $derived(toDate(festival.dates.end));
  const dateRange = $derived(
    `${format(startDate, "MMM d")} – ${format(endDate, "MMM d")}`
  );

  const now = new Date();
  const applicationsOpen = $derived(
    festival.applicationDeadline != null &&
      toDate(festival.applicationDeadline) > now &&
      (festival.seekingInstructors || festival.seekingPerformers)
  );

  const daysLeft = $derived(
    festival.applicationDeadline != null
      ? differenceInDays(toDate(festival.applicationDeadline), now)
      : null
  );

  const locationLabel = $derived(
    festival.location.city && festival.location.country
      ? `${festival.location.city}, ${festival.location.country}`
      : festival.location.city || festival.location.country
  );

  const nameHue = $derived(
    festival.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  );

  const regionLabels: Record<string, string> = {
    "north-america": "N. America",
    "south-america": "S. America",
    europe: "Europe",
    asia: "Asia",
    oceania: "Oceania",
    africa: "Africa",
  };

  function handleBookmark(e: MouseEvent) {
    e.stopPropagation();
    onbookmark();
  }

  function handleCardKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onselect();
    }
  }
</script>

<div
  class="grid-card"
  role="button"
  tabindex="0"
  onclick={onselect}
  onkeydown={handleCardKeydown}
  aria-label={`View details for ${festival.name}`}
>
  <div
    class="card-image"
    style="--fallback-bg: linear-gradient(135deg, hsl({nameHue}, 60%, 25%), hsl({nameHue}, 60%, 15%))"
  >
    {#if festival.imageUrl && !imageError}
      <img
        src={festival.imageUrl}
        alt={festival.name}
        class="festival-img"
        class:loaded={imageLoaded}
        onload={() => (imageLoaded = true)}
        onerror={() => (imageError = true)}
      />
    {/if}

    <div class="fallback-text" class:hidden={imageLoaded && !imageError}>
      <span>{festival.name}</span>
    </div>

    <span class="region-badge"
      >{regionLabels[festival.region] ?? festival.region}</span
    >

    <button
      class="bookmark-btn"
      onclick={handleBookmark}
      aria-label={tracker?.status === "interested"
        ? "Remove bookmark"
        : "Bookmark festival"}
      aria-pressed={tracker?.status === "interested"}
    >
      <i
        class={tracker ? "fas fa-bookmark" : "far fa-bookmark"}
        aria-hidden="true"
      ></i>
    </button>
  </div>

  <div class="card-body">
    <h3 class="festival-name">{festival.name}</h3>
    <span class="location">
      <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
      {locationLabel}
    </span>
    <span class="dates">
      <i class="fas fa-calendar" aria-hidden="true"></i>
      {dateRange}
    </span>
  </div>

  <div class="card-footer">
    <AttendanceBadge count={attendanceCount} />
    {#if applicationsOpen}
      <span class="badge-open">
        Open
        {#if daysLeft !== null && daysLeft >= 0}
          · {daysLeft}d left
        {/if}
      </span>
    {/if}
  </div>
</div>

<style>
  .grid-card {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
    cursor: pointer;
    color: var(--theme-text, #ffffff);
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .grid-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .grid-card:active {
    transform: translateY(0);
  }

  .grid-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .card-image {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--fallback-bg);
  }

  .festival-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  .festival-img.loaded {
    opacity: 1;
  }

  .fallback-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .fallback-text.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .region-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: var(--font-size-xs, 11px);
    font-weight: 500;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
  }

  .bookmark-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    font-size: 14px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .bookmark-btn:hover {
    background: rgba(0, 0, 0, 0.7);
    color: var(--theme-accent, #6366f1);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px 8px;
  }

  .festival-name {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .location,
  .dates {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .location i,
  .dates i {
    font-size: 10px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px 12px;
  }

  .badge-open {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 8px;
    font-size: var(--font-size-xs, 11px);
    font-weight: 500;
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .grid-card {
      transition: none;
    }

    .grid-card:hover {
      transform: none;
      box-shadow: none;
    }

    .festival-img {
      transition: none;
    }

    .bookmark-btn {
      transition: none;
    }
  }
</style>
