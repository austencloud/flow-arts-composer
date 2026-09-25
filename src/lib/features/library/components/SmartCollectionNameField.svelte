<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  interface Props {
    inputId: string;
    suggestedName: string;
    name?: string;
    usingSuggestion?: boolean;
    autofocus?: boolean;
    onEnter?: () => void;
  }

  let {
    inputId,
    suggestedName,
    name = $bindable(""),
    usingSuggestion = $bindable(true),
    autofocus = false,
    onEnter,
  }: Props = $props();

  const suggestionStatusId = $derived(`${inputId}-suggestion-status`);

  // While the title is still automatic, the input carries the real value that
  // will be saved. Changing a filter therefore updates both what is shown and
  // what assistive technology reads without waiting for focus.
  $effect.pre(() => {
    if (usingSuggestion && name !== suggestedName) name = suggestedName;
  });

  function handleInput(event: Event) {
    usingSuggestion = false;
    name = (event.currentTarget as HTMLInputElement).value;
  }

  function handleFocus(event: FocusEvent) {
    if (!usingSuggestion) return;
    const input = event.currentTarget as HTMLInputElement;
    requestAnimationFrame(() => input.select());
  }

  function handleBlur() {
    if (name.trim()) return;
    usingSuggestion = true;
    name = suggestedName;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || !onEnter || !name.trim()) return;
    event.preventDefault();
    onEnter();
  }
</script>

<div class="name-control" data-suggested={usingSuggestion}>
  <div class="name-label-row">
    <label for={inputId}>{t("library_ui_collection_name")}</label>
    <span
      id={suggestionStatusId}
      class="suggestion-status"
      class:inactive={!usingSuggestion}
      aria-hidden={!usingSuggestion}
    >
      Suggested
    </span>
  </div>

  <!-- svelte-ignore a11y_autofocus -->
  <input
    id={inputId}
    name="smart-collection-name"
    class:suggested-value={usingSuggestion}
    type="text"
    value={name}
    oninput={handleInput}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeydown}
    aria-describedby={usingSuggestion ? suggestionStatusId : undefined}
    maxlength="60"
    {autofocus}
    autocomplete="off"
  />

  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {usingSuggestion ? `Suggested collection name: ${suggestedName}` : ""}
  </span>
</div>

<style>
  .name-control {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--settings-spacing-xs, 6px);
  }

  .name-label-row {
    display: flex;
    min-height: 1.25rem;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
  }

  .name-label-row label {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 650;
  }

  .suggestion-status {
    min-width: 5.25rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: right;
    text-transform: uppercase;
    transition: opacity var(--duration-fast, 150ms) ease;
  }

  .suggestion-status.inactive {
    opacity: 0;
  }

  input {
    width: 100%;
    min-width: 0;
    height: max(3rem, var(--min-touch-target, 44px));
    padding: 0 var(--settings-spacing-md, 14px);
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #8b6cff) 18%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
    border-radius: var(--settings-radius-md, 12px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    transition:
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  input.suggested-value:not(:focus) {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  input:focus-visible {
    border-color: var(--theme-accent, #8b6cff);
    outline: none;
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent, #8b6cff) 18%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .suggestion-status,
    input {
      transition: none;
    }
  }
</style>
