<!--
  CommunityCityPicker

  A city search built from TKA's own primitives, with Places supplying the
  predictions as data. The combobox owns the interaction; this component owns
  the data source, the row, the attribution, and the cancel affordance.

  `useFixedPosition` is load-bearing rather than decorative: this renders inside
  CreatorsPanel, whose module box is `overflow: hidden`. That clipping has
  already eaten a control off the panel's edge once. A fixed-position list also
  contributes no height to the band, which is why the band reserves only the
  closed slot.
-->
<script lang="ts">
  import AsyncSuggestionCombobox from "#lib/shared/ui/components/AsyncSuggestionCombobox.svelte";
  import type { CitySuggestion } from "../domain/canonical-city";
  import { createPlacesCitySearch } from "../services/places-city-search";

  interface Props {
    apiKey: string;
    onPick: (suggestion: CitySuggestion) => void;
    onCancel: () => void;
    /** A write is in flight; the input stops accepting a second one. */
    busy?: boolean;
    placeholder?: string;
  }

  let {
    apiKey,
    onPick,
    onCancel,
    busy = false,
    placeholder = "Search for your city",
  }: Props = $props();

  const citySearch = createPlacesCitySearch(apiKey);

  // The billing session ends with the component. A picker that is opened,
  // abandoned, and reopened starts a new session rather than continuing to
  // bill keystrokes against a session nobody is in.
  $effect(() => () => citySearch.reset());

  function labelFor(suggestion: CitySuggestion): string {
    return suggestion.region
      ? `${suggestion.city}, ${suggestion.region}`
      : suggestion.city;
  }

  function handleKeydown(event: KeyboardEvent): void {
    // The combobox swallows Escape while its list is open, so this only fires
    // for the closed state — one Escape dismisses the list, the next the
    // picker, which is the order people expect.
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }
</script>

<div class="city-picker" onkeydown={handleKeydown} role="presentation">
  <div class="field">
    <AsyncSuggestionCombobox
      search={(query: string) => citySearch.search(query)}
      getKey={(suggestion: CitySuggestion) => suggestion.id}
      getLabel={labelFor}
      onSelect={onPick}
      {placeholder}
      disabled={busy}
      useFixedPosition
      autofocus
      ariaLabel="Search for your city"
      listLabel="City suggestions"
      name="community-city-query"
      emptyMessage="No cities match that."
      errorMessage="City search is unavailable right now."
      announceCount={(count: number) =>
        `${count} cit${count === 1 ? "y" : "ies"} found`}
    >
      {#snippet row(suggestion: CitySuggestion)}
        <i class="fas fa-location-dot pin" aria-hidden="true"></i>
        <span class="labels">
          <span class="city">{suggestion.city}</span>
          {#if suggestion.region}
            <span class="region">{suggestion.region}</span>
          {/if}
        </span>
      {/snippet}

      {#snippet empty(searchError: unknown)}
        {#if searchError}
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          City search is unavailable right now.
        {:else}
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          No cities match that.
        {/if}
      {/snippet}

      {#snippet listFooter()}
        <!-- The mark has to travel with the predictions. Placed in this
             component's own layout it would be correct only until a prediction
             list opened over it — the panel is fixed-position and lands exactly
             on the row below the input. -->
        <span class="attribution" translate="no">Google Maps</span>
      {/snippet}
    </AsyncSuggestionCombobox>
  </div>

  <div class="footer">
    <!-- Required whenever Places data is shown outside a Google map, and the
         accepted short form is the words "Google Maps" — "Powered by Google" is
         not an accepted form. `translate="no"` is the mechanism the policy
         names for keeping it out of machine translation.

         This is the closed-list case: the input still shows a chosen
         prediction's label after a selection. The open-list case is the
         `listFooter` above, and exactly one of the two is ever on screen. -->
    <span class="attribution" translate="no">Google Maps</span>
    <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
  </div>
</div>

<style>
  .city-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    width: 100%;
  }

  .field {
    /* The combobox measures its own dropdown from this box, so it must be the
       full width the picker occupies. */
    width: 100%;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    /* Same token the input and every panel button use, so the picker's two
       in-flow rows sum to exactly the height the invitation slot reserves for
       every other state. */
    min-height: var(--min-touch-target);
  }

  .attribution {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    letter-spacing: 0.01em;
  }

  .cancel {
    min-height: var(--min-touch-target);
    padding: 0.5em 1em;
    border-radius: 0.5em;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cancel:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .pin {
    flex-shrink: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .labels {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .city {
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .region {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-compact);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (prefers-reduced-motion: reduce) {
    .cancel {
      transition: none;
    }
  }
</style>
