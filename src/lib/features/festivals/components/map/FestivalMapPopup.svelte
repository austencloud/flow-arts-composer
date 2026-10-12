<!--
  FestivalMapPopup.svelte

  Popup card shown when a festival pin is clicked on the map.
  Shows key info and a button to open the full detail view.
-->
<script lang="ts">
  import { format } from "date-fns";
  import type { Festival } from "../../domain/models/festival";
  import { toDate } from "../../domain/models/timestamp-utils";

  interface Props {
    festival: Festival;
    onviewdetails: () => void;
    onclose: () => void;
  }

  let { festival, onviewdetails, onclose }: Props = $props();

  const startDate = $derived(toDate(festival.dates.start));
  const endDate = $derived(toDate(festival.dates.end));

  const dateRange = $derived(
    `${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")}`
  );

  const locationLabel = $derived(
    festival.location.city && festival.location.country
      ? `${festival.location.city}, ${festival.location.country}`
      : festival.location.city || festival.location.country
  );

  const now = new Date();

  const applicationsOpen = $derived(
    festival.applicationDeadline != null &&
      toDate(festival.applicationDeadline) > now &&
      (festival.seekingInstructors || festival.seekingPerformers)
  );

  let imageLoaded = $state(false);
  let imageError = $state(false);

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
</script>

<div class="festival-popup">
  <button
    class="close-btn"
    onclick={onclose}
    aria-label="Close popup"
    type="button"
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>

  <div
    class="popup-image"
    style="--fallback-bg: linear-gradient(135deg, hsl({nameHue}, 60%, 25%), hsl({nameHue}, 60%, 15%))"
  >
    {#if festival.imageUrl && !imageError}
      <img
        src={festival.imageUrl}
        alt={festival.name}
        class="popup-img"
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
  </div>

  <div class="popup-body">
    <h3 class="festival-name">{festival.name}</h3>

    <div class="meta-row">
      <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
      <span>{locationLabel}</span>
    </div>

    <div class="meta-row">
      <i class="fas fa-calendar-alt" aria-hidden="true"></i>
      <span>{dateRange}</span>
    </div>

    {#if applicationsOpen}
      <span class="badge-open">Applications Open</span>
    {/if}
  </div>

  <button class="view-details-btn" onclick={onviewdetails} type="button">
    View Details
    <i class="fas fa-arrow-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .festival-popup {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 20px;
    min-width: 260px;
    max-width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
  }

  .popup-image {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--fallback-bg);
    border-radius: 16px 16px 0 0;
    margin: -20px -20px 0;
  }

  .popup-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  .popup-img.loaded {
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
    font-size: 1.1rem;
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

  .close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    border: none;
    border-radius: 8px;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.85);
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
    z-index: 1;
  }

  .close-btn:hover {
    background: rgba(0, 0, 0, 0.7);
    color: var(--theme-text, #ffffff);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--festival-pin-color, #f97316);
    outline-offset: 2px;
  }

  .popup-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 0 16px 0;
  }

  .festival-name {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    line-height: 1.3;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
  }

  .meta-row i {
    font-size: 11px;
    color: var(--festival-pin-color, #f97316);
    flex-shrink: 0;
    width: 12px;
    text-align: center;
  }

  .badge-open {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 10px;
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
    align-self: flex-start;
  }

  .view-details-btn {
    width: 100%;
    padding: 12px 16px;
    background: var(--festival-pin-color, #f97316);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .view-details-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .view-details-btn:focus-visible {
    outline: 2px solid var(--festival-pin-color, #f97316);
    outline-offset: 2px;
  }

  .view-details-btn i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .close-btn,
    .view-details-btn,
    .popup-img {
      transition: none;
    }

    .view-details-btn:hover {
      transform: none;
    }
  }
</style>
