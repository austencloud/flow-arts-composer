<script lang="ts">
  import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    format,
    isSameMonth,
    isToday,
    differenceInCalendarDays,
  } from "date-fns";
  import type { Festival } from "../../domain/models/festival";
  import type { UserFestivalTracker } from "../../domain/models/festival-tracker";
  import { toDate } from "../../domain/models/timestamp-utils";
  import FestivalDayCell from "./FestivalDayCell.svelte";
  import type { CalendarEntry } from "./FestivalDayCell.svelte";

  interface Props {
    festivals: Festival[];
    trackers: Map<string, UserFestivalTracker>;
  }

  const { festivals, trackers }: Props = $props();

  let currentMonth = $state(new Date());

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const monthStart = $derived(startOfMonth(currentMonth));
  const monthEnd = $derived(endOfMonth(currentMonth));
  const gridStart = $derived(startOfWeek(monthStart));
  const gridEnd = $derived(endOfWeek(monthEnd));
  const days = $derived(eachDayOfInterval({ start: gridStart, end: gridEnd }));

  const weeks = $derived.by(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  });

  const monthTitle = $derived(format(currentMonth, "MMMM yyyy"));

  //
  // Each tracked festival contributes:
  //   - One "festival" entry per day in its date range
  //   - One "deadline" entry on its applicationDeadline date (if set)

  const entriesByDate = $derived.by(() => {
    const map = new Map<string, CalendarEntry[]>();

    function push(dateKey: string, entry: CalendarEntry) {
      const list = map.get(dateKey) ?? [];
      list.push(entry);
      map.set(dateKey, list);
    }

    const today = new Date();

    for (const festival of festivals) {
      const tracker = trackers.get(festival.id);
      if (!tracker) continue;

      // Festival date range entries
      const start = toDate(festival.dates.start);
      const end = toDate(festival.dates.end);

      try {
        const festivalDays = eachDayOfInterval({ start, end });
        for (const day of festivalDays) {
          push(format(day, "yyyy-MM-dd"), {
            type: "festival",
            name: festival.name,
            festivalId: festival.id,
            status: tracker.status,
          });
        }
      } catch {
        // eachDayOfInterval throws if start > end - skip malformed data
      }

      // Deadline entry
      if (festival.applicationDeadline) {
        const deadlineDate = toDate(festival.applicationDeadline);
        const daysLeft = differenceInCalendarDays(deadlineDate, today);
        push(format(deadlineDate, "yyyy-MM-dd"), {
          type: "deadline",
          name: festival.name,
          festivalId: festival.id,
          daysLeft,
        });
      }
    }

    return map;
  });

  function getEntriesForDay(day: Date): CalendarEntry[] {
    return entriesByDate.get(format(day, "yyyy-MM-dd")) ?? [];
  }

  function prevMonth() {
    currentMonth = subMonths(currentMonth, 1);
  }

  function nextMonth() {
    currentMonth = addMonths(currentMonth, 1);
  }

  function goToToday() {
    currentMonth = new Date();
  }
</script>

<div class="month-view-shell">
  <!-- Navigation header -->
  <div class="calendar-nav" aria-label="Calendar navigation">
    <div class="nav-controls">
      <button
        class="nav-btn"
        onclick={prevMonth}
        aria-label="Previous month"
        type="button"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>

      <button
        class="nav-btn today-btn"
        onclick={goToToday}
        aria-label="Go to today"
        type="button"
      >
        Today
      </button>

      <button
        class="nav-btn"
        onclick={nextMonth}
        aria-label="Next month"
        type="button"
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <h2 class="month-title" aria-live="polite" aria-atomic="true">
      {monthTitle}
    </h2>
  </div>

  <!-- Month grid -->
  <div
    class="month-grid"
    role="grid"
    aria-label="Monthly calendar - {monthTitle}"
  >
    <!-- Day name header row -->
    <div class="header-row" role="row">
      {#each DAY_NAMES as name}
        <div class="header-cell" role="columnheader">{name}</div>
      {/each}
    </div>

    <!-- Week rows -->
    {#each weeks as week, weekIndex (weekIndex)}
      <div class="week-row" role="row">
        {#each week as day (format(day, "yyyy-MM-dd"))}
          <div class="cell-wrapper">
            <FestivalDayCell
              date={day}
              entries={getEntriesForDay(day)}
              isToday={isToday(day)}
              isCurrentMonth={isSameMonth(day, currentMonth)}
            />
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .month-view-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0;
  }

  .calendar-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    flex-shrink: 0;
  }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    padding: 0 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-family: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .nav-btn:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .nav-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .today-btn {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .month-title {
    flex: 1;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .month-grid {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    margin: 12px 16px;
  }

  .header-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .header-cell {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    text-align: center;
    padding: 6px 4px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.04em;
    user-select: none;
  }

  .week-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    flex: 1;
    gap: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .cell-wrapper {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 767px) {
    .calendar-nav {
      padding: 8px 12px;
    }

    .month-title {
      font-size: 15px;
    }

    .month-grid {
      margin: 8px 12px;
    }

    .header-cell {
      font-size: var(--font-size-compact, 12px);
      padding: 4px 2px;
    }
  }

  @media (max-width: 480px) {
    .header-cell {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: clip;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-btn {
      transition: none;
    }
  }
</style>
