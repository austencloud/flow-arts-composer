<script lang="ts">
  interface Props {
    mode: "default" | "custom" | "overrides";
    overrideCount?: number;
    categoryLabel?: string;
    onReset?: () => void;
  }

  let {
    mode,
    overrideCount = 0,
    categoryLabel = "",
    onReset,
  }: Props = $props();
</script>

{#if mode === "default"}
  <span class="cascade-badge inherited">Default</span>
{:else if mode === "custom"}
  <button
    class="cascade-badge custom"
    onclick={onReset}
    aria-label="Reset to default"
  >
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
    Custom
  </button>
{:else if mode === "overrides" && overrideCount > 0}
  <button
    class="cascade-badge overrides"
    onclick={onReset}
    aria-label="Reset all {categoryLabel} overrides"
  >
    {overrideCount} performer{overrideCount > 1 ? "s" : ""} custom
  </button>
{/if}

<style>
  .cascade-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: none;
    cursor: default;
  }
  .cascade-badge.inherited {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.35);
  }
  .cascade-badge.custom {
    background: rgba(251, 191, 36, 0.12);
    color: rgba(251, 191, 36, 0.8);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }
  .cascade-badge.custom:hover {
    background: rgba(251, 191, 36, 0.2);
    color: rgba(251, 191, 36, 1);
  }
  .cascade-badge.overrides {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }
  .cascade-badge.overrides:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
  }
</style>
