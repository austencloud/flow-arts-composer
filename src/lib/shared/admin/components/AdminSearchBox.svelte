<script lang="ts">
  /**
   * AdminSearchBox
   * Reusable search input with icon and clear button
   */

  interface AdminSearchBoxProps {
    value: string;
    placeholder?: string;
    icon?: string;
    disabled?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onclear?: () => void;
  }

  let {
    value = $bindable(""),
    placeholder = "Search...",
    icon = "fa-search",
    disabled = false,
    class: className = "",
    oninput,
    onclear,
  }: AdminSearchBoxProps = $props();

  function handleClear() {
    value = "";
    onclear?.();
  }
</script>

<div class="admin-search-box {className}" role="search" aria-label="Search">
  <i class="fas {icon} search-icon" aria-hidden="true"></i>
  <input
    type="text"
    bind:value
    {placeholder}
    {disabled}
    {oninput}
    class="search-input"
  />
  {#if value}
    <button class="clear-btn" onclick={handleClear} aria-label="Clear search">
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  {/if}
</div>

<style>
  .admin-search-box {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 10px;
    padding: 10px 12px;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
    min-height: var(--min-touch-target); /* Touch target */
    box-sizing: border-box;
  }

  @media (min-width: 480px) {
    .admin-search-box {
      gap: 12px;
      border-radius: 8px;
    }
  }

  .admin-search-box:focus-within {
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 10%, transparent);
  }

  .search-icon {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-text, white);
    font-size: var(--font-size-base); /* Prevent zoom on iOS */
    min-width: 0;
  }

  @media (min-width: 480px) {
    .search-input {
      font-size: var(--font-size-sm);
    }
  }

  .search-input::placeholder {
    color: var(
      --theme-text-dim,
      rgba(255, 255, 255, 0.75)
    ); /* WCAG AAA compliant */
  }

  .clear-btn {
    background: var(--theme-card-bg);
    border: none;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
    border-radius: 6px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  @media (hover: hover) {
    .clear-btn:hover {
      color: var(--theme-text);
      background: var(--theme-card-hover-bg);
    }
  }

  .clear-btn:active {
    transform: scale(0.95);
  }
</style>
