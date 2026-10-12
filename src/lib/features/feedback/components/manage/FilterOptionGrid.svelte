<!-- FilterOptionGrid - Generic option grid for filter options -->
<script lang="ts">
  interface FilterOption {
    value: string;
    label: string;
    icon: string;
    color: string;
  }

  interface Props {
    options: FilterOption[];
    selectedValue: string | undefined;
    onSelect: (value: string) => void;
    showIcons?: boolean;
    isVertical?: boolean;
  }

  const {
    options,
    selectedValue,
    onSelect,
    showIcons = true,
    isVertical = false,
  }: Props = $props();
</script>

<div class="option-grid" class:vertical={isVertical}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="filter-option"
      class:selected={selectedValue === option.value}
      style="--option-color: {option.color}"
      onclick={() => onSelect(option.value)}
    >
      {#if isVertical}
        <span class="option-radio"></span>
      {/if}
      {#if showIcons && option.icon}
        <i class="fas {option.icon}" aria-hidden="true"></i>
      {/if}
      <span class="option-label">{option.label}</span>
      {#if !isVertical}
        <span class="option-radio"></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .option-grid {
    display: flex;
    gap: 2px;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .option-grid.vertical {
    flex-direction: column;
  }

  .filter-option {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: var(--min-touch-target);
    padding: 0 21px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      width var(--duration-fast) var(--ease-standard);
    text-align: left;
  }

  .filter-option i {
    font-size: 0.9em;
    width: 18px;
    text-align: center;
  }

  .filter-option:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .filter-option:active {
    transform: scale(0.99);
  }

  /* Radio indicator */
  .option-radio {
    width: 20px;
    height: 20px;
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    transition:
      background var(--duration-normal) var(--ease-spring),
      border-color var(--duration-normal) var(--ease-spring),
      color var(--duration-normal) var(--ease-spring),
      opacity var(--duration-normal) var(--ease-spring),
      transform var(--duration-normal) var(--ease-spring),
      box-shadow var(--duration-normal) var(--ease-spring),
      width var(--duration-normal) var(--ease-spring),
      height var(--duration-normal) var(--ease-spring);
  }

  .option-radio::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    background: var(--option-color, var(--semantic-success));
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    transition: transform var(--duration-normal) var(--ease-spring);
  }

  .filter-option.selected {
    background: color-mix(
      in srgb,
      var(--option-color, var(--semantic-success)) 10%,
      transparent
    );
    color: var(--theme-text);
  }

  .filter-option.selected .option-radio {
    border-color: var(--option-color, var(--semantic-success));
  }

  .filter-option.selected .option-radio::after {
    transform: translate(-50%, -50%) scale(1);
  }

  .filter-option.selected i {
    color: var(--option-color, var(--semantic-success));
  }

  .option-label {
    flex: 1;
  }
</style>
