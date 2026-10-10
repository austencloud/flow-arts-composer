<!-- FeedbackCard - Premium card with spring animations and swipe actions -->
<script lang="ts">
  import type {
    FeedbackItem,
    FeedbackStatus,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import {
    TYPE_CONFIG,
    STATUS_CONFIG,
    PRIORITY_CONFIG,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import { generateAvatarUrl } from "$lib/shared/foundation/utils/avatar-generator";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  const { item, isSelected, onClick, onStatusChange, onDelete } = $props<{
    item: FeedbackItem;
    isSelected: boolean;
    onClick: () => void;
    onStatusChange?: (status: FeedbackStatus) => void;
    onDelete?: () => void;
  }>();

  // Default configs for fallback
  const DEFAULT_TYPE_CONFIG = {
    color: "#6b7280",
    icon: "fa-question-circle",
    label: "Unknown",
  };
  const DEFAULT_STATUS_CONFIG = {
    color: "#6b7280",
    icon: "fa-circle",
    label: "Unknown",
  };

  const typeConfig = $derived(
    item.type && item.type in TYPE_CONFIG
      ? TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG]
      : DEFAULT_TYPE_CONFIG
  );
  const statusConfig = $derived(
    item.status && item.status in STATUS_CONFIG
      ? STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]
      : DEFAULT_STATUS_CONFIG
  );
  const priorityConfig = $derived(
    item.priority && item.priority in PRIORITY_CONFIG
      ? PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG]
      : null
  );

  // Use Google photo if available, fallback to generated avatar
  const avatarUrl = $derived(
    item.userPhotoURL || generateAvatarUrl(item.userDisplayName, 64)
  );

  // Reduced motion: inline swipe transitions bypass the stylesheet guard,
  // so JS-driven motion gates on the same media query directly.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Swipe state
  let swipeOffset = $state(0);
  let isSwiping = $state(false);
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let hasSwipeIntent = false;

  // Selection animation state
  let justSelected = $state(false);

  // Track selection changes for animation
  $effect(() => {
    if (isSelected) {
      justSelected = true;
      const timer = setTimeout(() => {
        justSelected = false;
      }, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  // Thresholds
  const SWIPE_THRESHOLD = 80;
  const DELETE_THRESHOLD = 120;
  const VELOCITY_THRESHOLD = 0.5;

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? t("feedback_time_just_now") : t("feedback_time_minutes_ago", { count: minutes });
      }
      return t("feedback_time_hours_ago", { count: hours });
    }
    if (days === 1) return t("feedback_time_yesterday");
    if (days < 7) return t("feedback_time_days_ago", { count: days });
    return date.toLocaleDateString();
  }

  // Touch handlers for swipe
  function handleTouchStart(e: TouchEvent) {
    if (!onStatusChange && !onDelete) return;
    const touch = e.touches[0];
    if (!touch) return;

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    hasSwipeIntent = false;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!onStatusChange && !onDelete) return;
    const touch = e.touches[0];
    if (!touch) return;

    const touchX = touch.clientX;
    const touchY = touch.clientY;
    const deltaX = touchX - touchStartX;
    const deltaY = touchY - touchStartY;

    // Determine swipe intent on first significant movement
    if (!hasSwipeIntent && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      hasSwipeIntent = Math.abs(deltaX) > Math.abs(deltaY);
      if (!hasSwipeIntent) return;
    }

    if (!hasSwipeIntent) return;

    // Prevent vertical scrolling when swiping horizontally
    e.preventDefault();
    isSwiping = true;

    // Apply rubber-band effect at extremes
    const maxOffset = 160;
    if (Math.abs(deltaX) > maxOffset) {
      const overflow = Math.abs(deltaX) - maxOffset;
      const dampened = maxOffset + Math.sqrt(overflow) * 8;
      swipeOffset = deltaX > 0 ? dampened : -dampened;
    } else {
      swipeOffset = deltaX;
    }
  }

  function handleTouchEnd() {
    if (!isSwiping) return;

    const velocity = swipeOffset / (Date.now() - touchStartTime);
    const absOffset = Math.abs(swipeOffset);
    const isLeftSwipe = swipeOffset < 0;
    const isRightSwipe = swipeOffset > 0;

    // Check for delete action (swipe left past delete threshold)
    if (
      isLeftSwipe &&
      (absOffset > DELETE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD)
    ) {
      if (onDelete) {
        if (prefersReducedMotion) {
          // Skip the fling-out animation; delete immediately
          onDelete();
          swipeOffset = 0;
          isSwiping = false;
          return;
        }
        // Animate out then delete
        swipeOffset = -300;
        setTimeout(() => {
          onDelete();
          swipeOffset = 0;
        }, 200);
        isSwiping = false;
        return;
      }
    }

    // Check for status action (swipe right past threshold)
    if (
      isRightSwipe &&
      (absOffset > SWIPE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD)
    ) {
      if (onStatusChange) {
        // Cycle through quick status changes: new → in-progress → in-review → archived → new
        const nextStatus: FeedbackStatus =
          item.status === "new"
            ? "in-progress"
            : item.status === "in-progress"
              ? "in-review"
              : item.status === "in-review"
                ? "archived"
                : "new";
        onStatusChange(nextStatus);
      }
    }

    // Spring back
    swipeOffset = 0;
    isSwiping = false;
  }

  // Computed styles
  const cardStyle = $derived(
    swipeOffset !== 0
      ? `transform: translateX(${swipeOffset}px); transition: ${isSwiping || prefersReducedMotion ? "none" : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)"}`
      : ""
  );

  const leftActionOpacity = $derived(
    Math.min(1, Math.abs(Math.min(0, swipeOffset)) / SWIPE_THRESHOLD)
  );
  const rightActionOpacity = $derived(
    Math.min(1, Math.max(0, swipeOffset) / SWIPE_THRESHOLD)
  );
  const leftActionScale = $derived(0.8 + leftActionOpacity * 0.2);
  const rightActionScale = $derived(0.8 + rightActionOpacity * 0.2);
</script>

<div class="card-wrapper">
  <!-- Swipe action backgrounds -->
  {#if onDelete}
    <div
      class="swipe-action delete-action"
      style="opacity: {leftActionOpacity}"
    >
      <div class="action-content" style="transform: scale({leftActionScale})">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
        <span>{t("feedback_delete")}</span>
      </div>
    </div>
  {/if}

  {#if onStatusChange}
    <div
      class="swipe-action status-action"
      style="opacity: {rightActionOpacity}"
    >
      <div class="action-content" style="transform: scale({rightActionScale})">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        <span
          >{item.status === "new"
            ? t("feedback_swipe_start")
            : item.status === "in_progress"
              ? t("feedback_swipe_resolve")
              : t("feedback_swipe_reopen")}</span
        >
      </div>
    </div>
  {/if}

  <!-- Main card -->
  <button
    class="feedback-card"
    class:selected={isSelected}
    class:just-selected={justSelected}
    class:swiping={isSwiping}
    onclick={onClick}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    type="button"
    style={cardStyle}
  >
    <!-- Left column: Type icon -->
    <div class="card-type" style="--type-color: {typeConfig.color}">
      <i class="fas {typeConfig.icon}" aria-hidden="true"></i>
    </div>

    <!-- Main content -->
    <div class="card-content">
      <!-- Title row -->
      <div class="card-header">
        <h3 class="card-title">{item.title}</h3>
        <span class="status-badge" style="--badge-color: {statusConfig.color}">
          {statusConfig.label}
        </span>
      </div>

      <!-- Description -->
      <p class="card-description">{item.description}</p>

      <!-- Footer row -->
      <div class="card-footer">
        <span class="user-info">
          <img
            src={avatarUrl}
            alt=""
            class="user-avatar"
            referrerpolicy="no-referrer"
            crossorigin="anonymous"
          />
          {item.userDisplayName}
        </span>
        <span class="separator">·</span>
        <span class="date-info">{formatDate(item.createdAt)}</span>
        {#if priorityConfig}
          <span
            class="priority-badge"
            style="--badge-color: {priorityConfig.color}"
          >
            <i class="fas {priorityConfig.icon}" aria-hidden="true"></i>
            <span class="priority-label">{priorityConfig.label}</span>
          </span>
        {/if}
      </div>
    </div>

    <!-- Selection indicator -->
    {#if isSelected}
      <div class="selection-indicator"></div>
    {/if}
  </button>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     DESIGN TOKENS
     ═══════════════════════════════════════════════════════════════════════════ */
  .card-wrapper {
    --fb-space-3xs: 4px;
    --fb-space-2xs: 6px;
    --fb-space-xs: 8px;
    --fb-space-sm: 13px;
    --fb-space-md: 21px;

    --fb-text-xs: 0.75rem;
    --fb-text-sm: 0.875rem;
    --fb-text-base: 1rem;

    --fb-radius-sm: 8px;
    --fb-radius-md: 12px;

    --fb-primary: var(--semantic-success, var(--semantic-success));
    --fb-error: var(--semantic-error, var(--semantic-error));
    --fb-surface: var(--theme-card-bg);
    --fb-surface-hover: var(--theme-card-hover-bg);
    --fb-border: var(--theme-stroke);
    --fb-border-hover: var(--theme-stroke-strong);
    --fb-text: var(--theme-text);
    --fb-text-muted: var(--theme-text-dim);
    --fb-text-subtle: color-mix(
      in srgb,
      var(--theme-text-dim) 80%,
      transparent
    );

    /* Spring animation */
    --spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
    --spring-smooth: cubic-bezier(0.4, 0, 0.2, 1);

    position: relative;
    touch-action: pan-y;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SWIPE ACTION BACKGROUNDS
     ═══════════════════════════════════════════════════════════════════════════ */
  .swipe-action {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    padding: 0 var(--fb-space-md);
    pointer-events: none;
    opacity: 0;
  }

  .action-content {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    font-size: var(--fb-text-sm);
    font-weight: 600;
    color: white;
    transition: transform var(--duration-instant) ease;
  }

  .action-content i {
    font-size: 1.2em;
  }

  .delete-action {
    right: 0;
    justify-content: flex-end;
    background: linear-gradient(90deg, transparent 0%, var(--fb-error) 40%);
    border-radius: 0 var(--fb-radius-md) var(--fb-radius-md) 0;
    width: 50%;
  }

  .status-action {
    left: 0;
    justify-content: flex-start;
    background: linear-gradient(270deg, transparent 0%, var(--fb-primary) 40%);
    border-radius: var(--fb-radius-md) 0 0 var(--fb-radius-md);
    width: 50%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN CARD
     ═══════════════════════════════════════════════════════════════════════════ */
  .feedback-card {
    position: relative;
    display: flex;
    gap: var(--fb-space-sm);
    width: 100%;
    padding: var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.35s var(--spring-bounce);
    will-change: transform;
  }

  .feedback-card:hover:not(.swiping) {
    background: var(--fb-surface-hover);
    border-color: var(--fb-border-hover);
  }

  /* Desktop hover lift effect */
  @media (hover: hover) and (pointer: fine) {
    .feedback-card:hover:not(.swiping) {
      transform: translateY(-2px);
    }

    .feedback-card:active:not(.swiping) {
      transform: translateY(0) scale(0.99);
    }
  }

  .feedback-card.selected {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 30%,
      transparent
    );
  }

  .feedback-card.just-selected {
    animation: selectPop var(--duration-dramatic) var(--spring-bounce);
  }

  @keyframes selectPop {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.01);
    }
    100% {
      transform: scale(1);
    }
  }

  .feedback-card.swiping {
    transition: none;
  }

  /* Selection indicator */
  .selection-indicator {
    position: absolute;
    left: 0;
    top: var(--fb-space-sm);
    bottom: var(--fb-space-sm);
    width: 3px;
    background: var(--fb-primary);
    border-radius: 0 2px 2px 0;
    animation: indicatorSlide var(--duration-emphasis) var(--spring-bounce);
  }

  @keyframes indicatorSlide {
    from {
      transform: scaleY(0);
      opacity: 0;
    }
    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TYPE COLUMN - 48px touch target
     ═══════════════════════════════════════════════════════════════════════════ */
  .card-type {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border-radius: var(--fb-radius-sm);
    color: var(--type-color);
    font-size: var(--font-size-lg);
    transition: all var(--duration-normal) var(--spring-bounce);
  }

  .feedback-card:hover:not(.swiping) .card-type {
    background: color-mix(in srgb, var(--type-color) 20%, transparent);
    transform: scale(1.05);
  }

  .feedback-card.selected .card-type {
    background: color-mix(in srgb, var(--type-color) 25%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--type-color) 30%, transparent);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTENT AREA
     ═══════════════════════════════════════════════════════════════════════════ */
  .card-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-xs);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: var(--fb-space-sm);
  }

  .card-title {
    flex: 1;
    margin: 0;
    font-size: var(--fb-text-base);
    font-weight: 600;
    color: var(--fb-text);
    line-height: 1.3;
    letter-spacing: -0.01em;

    /* Truncate */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: var(--fb-space-3xs) var(--fb-space-xs);
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    border-radius: 999px;
    font-size: var(--fb-text-xs);
    font-weight: 500;
    color: var(--badge-color);
    white-space: nowrap;
  }

  .card-description {
    margin: 0;
    font-size: var(--fb-text-sm);
    color: var(--fb-text-muted);
    line-height: 1.5;

    /* 2-line clamp */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════════════ */
  .card-footer {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    margin-top: var(--fb-space-2xs);
    font-size: var(--fb-text-xs);
    color: var(--fb-text-subtle);
  }

  .user-info,
  .date-info {
    display: flex;
    align-items: center;
    gap: var(--fb-space-3xs);
  }

  .user-avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
  }

  .separator {
    opacity: 0.5;
  }

  .priority-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--fb-space-3xs);
    margin-left: auto;
    padding: var(--fb-space-3xs) var(--fb-space-xs);
    background: color-mix(in srgb, var(--badge-color) 12%, transparent);
    border-radius: 999px;
    font-size: var(--fb-text-xs);
    font-weight: 500;
    color: var(--badge-color);
  }

  .priority-badge i {
    font-size: 0.85em;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Mobile optimizations */
  @media (max-width: 479px) {
    .feedback-card {
      padding: var(--fb-space-sm);
    }

    .card-type {
      width: 44px;
      height: 44px;
      font-size: var(--font-size-base);
    }

    .card-title {
      font-size: var(--fb-text-sm);
    }

    .card-description {
      font-size: var(--fb-text-xs);
    }

    .priority-label {
      display: none;
    }
  }

  /* Tablet+ */
  @media (min-width: 768px) {
    .card-type {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-xl);
    }

    .card-title {
      white-space: normal;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      display: -webkit-box;
      -webkit-box-orient: vertical;
    }

    /* Disable swipe on desktop */
    .card-wrapper {
      touch-action: auto;
    }

    .swipe-action {
      display: none;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .feedback-card,
    .card-type,
    .selection-indicator {
      animation: none;
      transition: none;
    }
  }
</style>
