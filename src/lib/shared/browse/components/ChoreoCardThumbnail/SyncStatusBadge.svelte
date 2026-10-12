<!--
SyncStatusBadge.svelte

Small, non-interactive corner badge on a library card showing this
sequence's cloud sync state - but ONLY when it's NOT safely synced. A
sequence the user believes is "Saved!" that only landed in Dexie (offline,
sync error) gets a quiet signal here instead of silently looking identical
to a fully-synced one. See docs/superpowers/specs/active/
2026-07-18-onboarding-silent-work-loss.md (finding firestore-sync-console-only).

Always renders its slot and toggles opacity/visibility rather than mounting
conditionally, so its appearance never shifts sibling layout (it's also
absolutely positioned, so an unmount couldn't reflow anything either way -
this keeps the toggle explicit per .claude/rules/no-layout-shift.md).
-->
<script lang="ts">
  const { status }: { status?: "synced" | "pending" | "failed" } = $props();

  const visible = $derived(status === "pending" || status === "failed");
  const isFailed = $derived(status === "failed");
  const label = $derived(
    isFailed ? "Not yet synced to cloud, will retry" : "Saving to cloud"
  );
  const iconClass = $derived(
    isFailed ? "fa-cloud-exclamation" : "fa-cloud-arrow-up"
  );
</script>

<div
  class="sync-status-badge"
  class:visible
  class:failed={isFailed}
  role="status"
  aria-live="polite"
  aria-hidden={!visible}
  title={label}
  aria-label={label}
>
  <i class="fas {iconClass}" aria-hidden="true"></i>
</div>

<style>
  .sync-status-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 10;

    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;

    /* Subtle glassmorphic background, same language as VariationPill */
    background: var(--theme-overlay-bg, rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 11px;

    /* Reserved slot - always in the DOM, toggled by opacity/visibility only */
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .sync-status-badge.visible {
    opacity: 1;
    visibility: visible;
  }

  /* Failed = warning tint; pending stays the neutral default above */
  .sync-status-badge.failed {
    color: var(--semantic-warning, #f59e0b);
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 40%,
      var(--theme-stroke, rgba(255, 255, 255, 0.15))
    );
  }

  :global(.choreo-card.light-mode) .sync-status-badge {
    background: var(--theme-overlay-bg-light, rgba(255, 255, 255, 0.8));
    border-color: var(--theme-stroke-light, rgba(0, 0, 0, 0.15));
    color: var(--theme-text-light, rgba(0, 0, 0, 0.8));
  }

  @media (prefers-reduced-motion: reduce) {
    .sync-status-badge {
      transition: none;
    }
  }
</style>
