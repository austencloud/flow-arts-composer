<script lang="ts">
  /**
   * UserSearch - Shared search component for user lists
   * Simple wrapper around PanelSearch with user-specific defaults
   */

  interface Props {
    value: string;
    placeholder?: string;
    maxWidth?: string;
    oninput?: (value: string) => void;
  }

  let {
    value = $bindable(""),
    placeholder = "Search users...",
    maxWidth,
    oninput,
  }: Props = $props();
</script>

<div class="user-search">
  <i class="fas fa-search user-search__icon" aria-hidden="true"></i>
  <input
    type="text"
    class="user-search__input"
    {placeholder}
    {value}
    style:max-width={maxWidth}
    oninput={(e) => {
      value = e.currentTarget.value;
      oninput?.(value);
    }}
  />
</div>

<style>
  .user-search {
    position: relative;
    width: 100%;
  }

  .user-search__icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75)); /* WCAG AAA */
    pointer-events: none;
  }

  .user-search__input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: white;
    font-size: var(--font-size-sm);
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .user-search__input:focus {
    outline: none;
    background: var(--theme-card-bg);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .user-search__input::placeholder {
    color: rgba(255, 255, 255, 0.75); /* WCAG AAA compliant */
  }
</style>
