<!-- Mobile status tab button with count badge -->
<script lang="ts">
  import type { FeedbackStatus } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";

  interface Props {
    status: FeedbackStatus;
    isActive: boolean;
    count: number;
    onClick: () => void;
  }

  const { status, isActive, count, onClick }: Props = $props();

  const config = $derived(STATUS_CONFIG[status]);
</script>

<button
  type="button"
  role="tab"
  id="tab-{status}"
  class="status-tab"
  class:active={isActive}
  style="--tab-color: {config.color}"
  onclick={onClick}
  aria-selected={isActive}
  aria-controls="column-{status}"
  tabindex={isActive ? 0 : -1}
>
  <i class="fas {config.icon}" aria-hidden="true"></i>
  <span class="tab-label">{config.label.replace("Won't Fix", "Declined")}</span>
  {#if count > 0}
    <span class="tab-count">{count}</span>
  {/if}
</button>

<style>
  .status-tab {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 0.5cqi, 6px);
    min-height: clamp(48px, 14cqi, 64px);
    padding: clamp(8px, 2cqi, 12px) clamp(6px, 1.5cqi, 12px);
    background: var(--theme-card-bg);
    border: none;
    border-radius: clamp(12px, 3cqi, 18px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .status-tab i {
    font-size: clamp(1rem, 3cqi, 1.25rem);
    color: var(--tab-color);
    opacity: 0.8;
    flex-shrink: 0;
  }

  .status-tab:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .status-tab:active {
    transform: scale(0.96);
  }

  .status-tab.active {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--tab-color) 85%, #fff) 0%,
      var(--tab-color) 100%
    );
    color: rgba(0, 0, 0, 0.9);
    box-shadow:
      0 4px 20px color-mix(in srgb, var(--tab-color) 40%, transparent),
      0 0 0 1px color-mix(in srgb, var(--tab-color) 50%, transparent);
  }

  .status-tab.active i {
    color: rgba(0, 0, 0, 0.8);
    opacity: 1;
  }

  .tab-label {
    font-size: clamp(0.6875rem, 2cqi, 0.8125rem);
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .tab-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: clamp(20px, 5cqi, 26px);
    height: clamp(20px, 5cqi, 26px);
    padding: 0 clamp(4px, 1cqi, 8px);
    background: rgba(0, 0, 0, 0.2);
    border-radius: 999px;
    font-size: clamp(0.8125rem, 2cqi, 0.875rem);
    font-weight: 700;
    flex-shrink: 0;
  }

  .status-tab.active .tab-count {
    background: rgba(0, 0, 0, 0.25);
    color: rgba(0, 0, 0, 0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    .status-tab {
      transition: none;
    }
  }
</style>
