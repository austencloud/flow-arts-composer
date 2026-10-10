<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * PanelSearch - Search input component
   *
   * Provides consistent search input styling.
   */

  import type { Snippet } from "svelte";

  interface Props {
    /** Current search value */
    value: string;
    /** Placeholder text */
    placeholder?: string;
    /** Input handler */
    oninput?: (value: string) => void;
    /** Optional max width */
    maxWidth?: string;
    /** Accessible name for the search field */
    ariaLabel?: string;
    /** Focus the field when its containing surface opens */
    autofocus?: boolean;
    /** Exposes the input for focus management */
    inputRef?: HTMLInputElement | null;
    /** Form-field name used by browser accessibility tooling */
    name?: string;
    /** Stable id for labels and composite-widget relationships */
    id?: string;
    /** Keyboard handler for search-driven surfaces such as command menus */
    onkeydown?: (event: KeyboardEvent) => void;
    /** Optional content shown inside the field at the trailing edge */
    trailing?: Snippet;
    /** Composite widget semantics when search controls a result list */
    role?: "searchbox" | "combobox";
    ariaControls?: string;
    ariaExpanded?: boolean;
    ariaActiveDescendant?: string;
  }

  let {
    value = $bindable(""),
    placeholder,
    oninput,
    maxWidth = "600px",
    ariaLabel,
    autofocus = false,
    inputRef = $bindable(null),
    name = "panel-search",
    id,
    onkeydown,
    trailing,
    role = "searchbox",
    ariaControls,
    ariaExpanded,
    ariaActiveDescendant,
  }: Props = $props();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
    oninput?.(target.value);
  }
</script>

<div class="panel-search" style:max-width={maxWidth}>
  <i class="fas fa-search panel-search__icon" aria-hidden="true"></i>
  <input
    bind:this={inputRef}
    {id}
    {name}
    type="text"
    class="panel-search__input"
    class:panel-search__input--trailing={trailing !== undefined}
    placeholder={placeholder ?? t("search_placeholder")}
    {value}
    oninput={handleInput}
    {onkeydown}
    aria-label={ariaLabel ?? t("shared_search_label")}
    aria-controls={ariaControls}
    aria-expanded={ariaExpanded}
    aria-activedescendant={ariaActiveDescendant}
    aria-autocomplete={role === "combobox" ? "list" : undefined}
    {role}
    {autofocus}
    autocomplete="off"
    spellcheck="false"
  />
  {#if trailing}
    <div class="panel-search__trailing" aria-hidden="true">
      {@render trailing()}
    </div>
  {/if}
</div>

<style>
  .panel-search {
    position: relative;
    width: 100%;
    padding: 0 20px;
  }

  .panel-search__icon {
    position: absolute;
    left: 32px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-dim, var(--theme-text-dim));
    pointer-events: none;
  }

  .panel-search__input {
    width: 100%;
    padding: 10px 12px 10px 40px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
  }

  .panel-search__input:focus {
    outline: none;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-color: var(--theme-stroke-strong);
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 15%,
        transparent
      );
  }

  .panel-search__input::placeholder {
    color: var(--theme-text-dim);
  }

  .panel-search__input--trailing {
    padding-right: 6rem;
  }

  .panel-search__trailing {
    position: absolute;
    right: 32px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .panel-search {
      padding: 0 16px;
    }

    .panel-search__icon {
      left: 28px;
    }

    .panel-search__trailing {
      right: 28px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-search__input {
      transition: none;
    }
  }
</style>
