<script lang="ts">
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceSection } from "$lib/shared/browse/domain/models/browse-models";

  const TKA_LETTER_RE = /^[a-zA-ZͰ-Ͽ⊕]-?$/;

  interface Props {
    sections: SequenceSection[];
    onScrollToSection: (sectionTitle: string) => void;
    activeSection?: string;
  }

  const { sections, onScrollToSection, activeSection }: Props = $props();

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  interface Marker {
    label: string;
    title: string;
  }

  interface YearGroup {
    year: string;
    markers: Marker[];
  }

  interface LevelGroup {
    level: number;
    markers: Marker[];
  }

  /** Does this section title describe a relative time (today, 3 days ago, etc.)? */
  function isRelativeTime(title: string): boolean {
    const core = title
      .replace(/^[^\w\d]*/u, "")
      .replace(/\s*\([^)]*\)/gi, "")
      .trim();
    return /^(today|yesterday|\d+\s*(days?|weeks?|months?)\s*ago)$/i.test(core);
  }

  /** Resolve a section title to { month, year } */
  function resolveMonthYear(title: string): { month: string; year: string } {
    const core = title
      .replace(/^[^\w\d]*/u, "")
      .replace(/\s*\([^)]*\)/gi, "")
      .trim();

    // Exact date (M/D/YYYY)
    const dateMatch = core.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
    if (dateMatch) {
      const monthStr = dateMatch[1]!;
      const yearStr = dateMatch[2]!;
      const monthIdx = parseInt(monthStr, 10) - 1;
      return { month: MONTH_NAMES[monthIdx] || monthStr, year: yearStr };
    }

    // Relative time → calculate actual month/year
    const now = new Date();
    let target = new Date(now);

    if (/^today$/i.test(core)) {
      // already now
    } else if (/^yesterday$/i.test(core)) {
      target = new Date(now.getTime() - 86400000);
    } else {
      const daysMatch = core.match(/^(\d+)\s*days?\s*ago$/i);
      if (daysMatch)
        target = new Date(
          now.getTime() - parseInt(daysMatch[1]!, 10) * 86400000
        );
      const weeksMatch = core.match(/^(\d+)\s*weeks?\s*ago$/i);
      if (weeksMatch)
        target = new Date(
          now.getTime() - parseInt(weeksMatch[1]!, 10) * 7 * 86400000
        );
      const monthsMatch = core.match(/^(\d+)\s*months?\s*ago$/i);
      if (monthsMatch) {
        target = new Date(now);
        target.setMonth(target.getMonth() - parseInt(monthsMatch[1]!, 10));
      }
    }

    return {
      month: MONTH_NAMES[target.getMonth()]!,
      year: target.getFullYear().toString(),
    };
  }

  /** For non-date sort modes: extract a short label from the section title */
  function extractLabel(title: string): string {
    const core = title
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/^[^\p{L}\d⊕]*/u, "")
      .trim();

    const beatMatch = core.match(/^(\d+)\s*(?:steps?|beats?)$/i);
    if (beatMatch?.[1]) return beatMatch[1];

    // Difficulty sections render as "Level N" → show just the number.
    const levelMatch = core.match(/^Level\s+(\d+)$/i);
    if (levelMatch?.[1]) return levelMatch[1];

    if (core.length <= 4) return core;
    return core.slice(0, 4);
  }

  /** Level-sorted: every section carries a numeric `level` (difficulty grouping). */
  const isLevelSorted = $derived(
    sections.length > 0 && sections.every((s) => typeof s.level === "number")
  );

  /** Level-sorted: group by level (header) with letter markers underneath. */
  const levelGroups = $derived.by((): LevelGroup[] => {
    if (!isLevelSorted) return [];

    const groups: LevelGroup[] = [];
    for (const section of sections) {
      const level = section.level!;
      let group = groups.find((g) => g.level === level);
      if (!group) {
        group = { level, markers: [] };
        groups.push(group);
      }
      const label = section.groupLabel ?? "";
      if (!group.markers.some((m) => m.label === label)) {
        group.markers.push({ label, title: section.title });
      }
    }
    groups.sort((a, b) => a.level - b.level);
    return groups;
  });

  /** Which (level, letter) is currently active? */
  const activeLevelInfo = $derived.by(
    (): { level: number; label: string } | undefined => {
      if (!activeSection || !isLevelSorted) return undefined;
      const s = sections.find((x) => x.title === activeSection);
      return s ? { level: s.level!, label: s.groupLabel ?? "" } : undefined;
    }
  );

  /** Is the sort mode date-based? Check if any section has a relative-time or date title */
  const isDateSorted = $derived.by(() => {
    if (isLevelSorted) return false;
    return sections.some((s) => {
      const core = s.title
        .replace(/^[^\w\d]*/u, "")
        .replace(/\s*\([^)]*\)/gi, "")
        .trim();
      return isRelativeTime(s.title) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(core);
    });
  });

  /** Date-sorted: group markers by year with months underneath */
  const yearGroups = $derived.by((): YearGroup[] => {
    if (!isDateSorted) return [];

    const groups: YearGroup[] = [];
    const seenMonthKeys = new Set<string>();

    for (const section of sections) {
      const { month, year } = resolveMonthYear(section.title);
      const key = `${year}-${month}`;
      if (seenMonthKeys.has(key)) continue;
      seenMonthKeys.add(key);

      let group = groups.find((g) => g.year === year);
      if (!group) {
        group = { year, markers: [] };
        groups.push(group);
      }
      group.markers.push({ label: month, title: section.title });
    }

    return groups;
  });

  /** Non-date-sorted: flat markers (letters, beat counts, levels) */
  const flatMarkers = $derived.by((): Marker[] => {
    if (isDateSorted || isLevelSorted) return [];

    const result: Marker[] = [];
    const seen = new Set<string>();

    for (const section of sections) {
      const label = extractLabel(section.title);
      if (seen.has(label)) continue;
      seen.add(label);
      result.push({ label, title: section.title });
    }

    return result;
  });

  /** Which month label is currently active? */
  const activeMonthLabel = $derived.by(() => {
    if (!activeSection) return undefined;
    if (isDateSorted) {
      const { month } = resolveMonthYear(activeSection);
      return month;
    }
    return extractLabel(activeSection);
  });

  /** Which year is the active section in? */
  const activeYear = $derived.by(() => {
    if (!activeSection || !isDateSorted) return undefined;
    const { year } = resolveMonthYear(activeSection);
    return year;
  });

  function handleClick(title: string) {
    onScrollToSection(title);
  }

  let trackEl: HTMLElement | undefined = $state(undefined);

  // Scroll the active marker into view within the sidebar track
  $effect(() => {
    if (!trackEl) return;
    if (!activeMonthLabel && !activeLevelInfo) return;
    const activeBtn = trackEl.querySelector(
      ".month-btn.active, .marker.active, .letter-marker.active"
    ) as HTMLElement;
    if (activeBtn) {
      const trackRect = trackEl.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (btnRect.top < trackRect.top || btnRect.bottom > trackRect.bottom) {
        trackEl.scrollTop =
          activeBtn.offsetTop -
          trackEl.clientHeight / 2 +
          activeBtn.clientHeight / 2;
      }
    }
  });
</script>

<nav
  class="section-sidebar"
  aria-label={tDynamic("browse_results_section_navigation")}
>
  <div class="track" bind:this={trackEl}>
    {#if isLevelSorted}
      <!-- Level-sorted: colored level badge headers with letter markers below -->
      {#each levelGroups as group (group.level)}
        <div
          class="level-group"
          class:active-level={activeLevelInfo?.level === group.level}
        >
          <div class="level-header">
            <DifficultyBadge level={group.level} size="30px" />
          </div>
          <div class="letter-list">
            {#each group.markers as marker (marker.label)}
              <button
                class="letter-marker"
                data-ghost="safe"
                data-ghost-kind="browse-section"
                class:active={activeLevelInfo?.level === group.level &&
                  activeLevelInfo?.label === marker.label}
                onclick={() => handleClick(marker.title)}
                title={marker.title}
                aria-label={tDynamic("browse_results_jump_level_letter", {
                  level: group.level,
                  letter: marker.label,
                })}
              >
                {#if TKA_LETTER_RE.test(marker.label)}
                  <TKAWordGlyph word={marker.label} height={24} />
                {:else}
                  {marker.label}
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {:else if isDateSorted}
      <!-- Date-sorted: Year headers with months grouped below -->
      {#each yearGroups as group (group.year)}
        <div class="year-group" class:active-year={activeYear === group.year}>
          <div class="year-header">{group.year}</div>
          <div class="month-list">
            {#each group.markers as marker (marker.label)}
              <button
                class="month-btn"
                data-ghost="safe"
                data-ghost-kind="browse-section"
                class:active={activeYear === group.year &&
                  activeMonthLabel === marker.label}
                onclick={() => handleClick(marker.title)}
                title={marker.title}
                aria-label={tDynamic("browse_results_jump_month", {
                  month: marker.label,
                  year: group.year,
                })}
              >
                {marker.label}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {:else}
      <!-- Non-date sort: flat marker list (letters, beat counts, levels) -->
      {#each flatMarkers as marker (marker.label)}
        <button
          class="marker"
          class:active={activeMonthLabel === marker.label}
          onclick={() => handleClick(marker.title)}
          title={marker.title}
          aria-label={tDynamic("browse_results_jump_section", {
            label: marker.label,
          })}
        >
          {#if TKA_LETTER_RE.test(marker.label)}
            <TKAWordGlyph word={marker.label} height={18} />
          {:else}
            {marker.label}
          {/if}
        </button>
      {/each}
    {/if}
  </div>

  <!-- Fade edges -->
  <div class="fade-top" aria-hidden="true"></div>
  <div class="fade-bottom" aria-hidden="true"></div>
</nav>

<style>
  .section-sidebar {
    display: none;
    flex-shrink: 0;
    width: 88px;
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    overflow: hidden;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--theme-panel-bg, #12121c);
    isolation: isolate;
  }

  @media (min-width: 768px) {
    .section-sidebar {
      display: flex;
      flex-direction: column;
    }
  }

  /* Fade edges for scroll hints */
  .fade-top,
  .fade-bottom {
    position: absolute;
    left: 0;
    right: 0;
    height: 20px;
    pointer-events: none;
    z-index: 2;
  }

  .fade-top {
    top: 0;
    background: linear-gradient(
      180deg,
      var(--theme-panel-bg, #12121c) 0%,
      transparent 100%
    );
  }

  .fade-bottom {
    bottom: 0;
    background: linear-gradient(
      0deg,
      var(--theme-panel-bg, #12121c) 0%,
      transparent 100%
    );
  }

  .track {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow-y: auto;
    padding: 24px 0;
    gap: 0;
    scrollbar-width: none;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  /* ── Year groups (date-sorted mode) ── */

  .year-group {
    padding: 0 0 4px;
  }

  .year-group + .year-group {
    margin-top: 4px;
    border-top: 1px solid
      color-mix(in srgb, var(--theme-text, white) 6%, transparent);
    padding-top: 8px;
  }

  .year-header {
    padding: 6px 14px 4px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    user-select: none;
  }

  /* Highlight the year header when its year is active */
  .year-group.active-year .year-header {
    color: var(--theme-accent, #818cf8);
  }

  .month-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .month-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 7px 14px 7px 20px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    line-height: 1;
    user-select: none;
    white-space: nowrap;
    position: relative;
    transition:
      color 180ms ease,
      background 180ms ease;
  }

  .month-btn:hover {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text, white) 5%, transparent);
  }

  .month-btn:active {
    background: color-mix(in srgb, var(--theme-text, white) 8%, transparent);
  }

  .month-btn.active {
    color: var(--theme-accent, #818cf8);
    font-weight: 700;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  /* Accent bar on the right edge of the active month (faces the content) */
  .month-btn.active::before {
    content: "";
    position: absolute;
    right: 0;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 3px 0 0 3px;
    background: var(--theme-accent, #6366f1);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .month-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  /* ── Level groups (level-sorted mode) ── */

  .level-group {
    padding: 0 0 6px;
  }

  .level-group + .level-group {
    margin-top: 8px;
    border-top: 1px solid
      color-mix(in srgb, var(--theme-text, white) 6%, transparent);
    padding-top: 10px;
  }

  .level-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 8px 8px;
  }

  /* Lift the active level's badge so it reads as the current group. */
  .level-group.active-level .level-header :global(.difficulty-badge) {
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .letter-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .letter-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 38px;
    padding: 5px 10px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    cursor: pointer;
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    line-height: 1;
    user-select: none;
    white-space: nowrap;
    position: relative;
    transition:
      color 180ms ease,
      background 180ms ease;
  }

  .letter-marker:hover {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text, white) 5%, transparent);
  }

  .letter-marker.active {
    color: var(--theme-accent, #818cf8);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .letter-marker.active::before {
    content: "";
    position: absolute;
    right: 0;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 3px 0 0 3px;
    background: var(--theme-accent, #6366f1);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .letter-marker :global(.glyph img) {
    filter: brightness(0) invert(1);
    opacity: 0.55;
    transition: opacity 180ms ease;
  }

  .letter-marker:hover :global(.glyph img),
  .letter-marker.active :global(.glyph img) {
    opacity: 1;
  }

  .letter-marker :global(.dash-bar) {
    opacity: 0.55;
    transition: opacity 180ms ease;
  }

  .letter-marker:hover :global(.dash-bar),
  .letter-marker.active :global(.dash-bar) {
    opacity: 1;
  }

  .letter-marker:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  /* ── Flat markers (non-date sort modes) ── */

  .marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 32px;
    padding: 4px 10px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    cursor: pointer;
    border-radius: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    line-height: 1;
    user-select: none;
    white-space: nowrap;
    position: relative;
    transition:
      color 180ms ease,
      background 180ms ease;
  }

  .marker:hover {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text, white) 5%, transparent);
  }

  .marker:active {
    background: color-mix(in srgb, var(--theme-text, white) 8%, transparent);
  }

  .marker.active {
    color: var(--theme-accent, #818cf8);
    font-weight: 700;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .marker.active::before {
    content: "";
    position: absolute;
    right: 0;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 3px 0 0 3px;
    background: var(--theme-accent, #6366f1);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .marker :global(.glyph img) {
    filter: brightness(0) invert(1);
    opacity: 0.5;
    transition: opacity 180ms ease;
  }

  .marker:hover :global(.glyph img) {
    opacity: 1;
  }

  .marker.active :global(.glyph img) {
    opacity: 1;
  }

  .marker :global(.dash-bar) {
    opacity: 0.5;
    transition: opacity 180ms ease;
  }

  .marker:hover :global(.dash-bar),
  .marker.active :global(.dash-bar) {
    opacity: 1;
  }

  .marker:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .month-btn,
    .marker,
    .letter-marker {
      transition: none !important;
    }
  }
</style>
