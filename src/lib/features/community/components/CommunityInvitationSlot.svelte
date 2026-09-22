<!--
  CommunityInvitationSlot

  One box, five states, one geometry.

  Every variant — unresolved, guest, suggest, pick, member, plus the
  key-missing and error variants that overlay them — occupies the same two
  in-flow rows: a message row and an action row, each the height of the shared
  touch-target token, with a reserved status line underneath. Reserving height
  for the tallest state is not enough on its own; the states have to live in
  the same box, or switching between them moves the roster underneath
  (no-layout-shift.md).

  The picker's prediction list is deliberately NOT part of that arithmetic. It
  renders `position: fixed` and is out of flow, so it contributes nothing to
  this height and is verified for clipping and viewport containment instead.
-->
<script lang="ts">
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    CityResolutionError,
    type CitySuggestion,
  } from "../domain/canonical-city";
  import { getCommunityMapContext } from "../context/community-map-context";
  import CommunityCityPicker from "./CommunityCityPicker.svelte";

  // Not named `state`: a variable of that name in scope turns every
  // `$state(...)` in this module into a store subscription.
  const { state: mapState, getApiKey } = getCommunityMapContext();

  const slot = $derived(mapState.slot);
  const apiKey = $derived(getApiKey());

  /**
   * The dev placeholder counts as absent. Otherwise a checkout that never set
   * the variable offers an Add button whose only possible outcome is a failed
   * geocode with no explanation.
   */
  const configured = $derived(
    Boolean(apiKey) && apiKey !== "your-google-maps-api-key",
  );

  /** Restores focus when the picker closes, so Escape does not strand it. */
  let pickTrigger = $state<HTMLButtonElement | null>(null);

  const status = $derived.by(() => {
    const error = mapState.mutationError;
    if (!error) return "";
    // Only a CityResolutionError carries copy written for a person. Anything
    // else is a Firestore or network object whose message is a diagnostic, not
    // a sentence to show someone.
    if (error instanceof CityResolutionError) return error.message;
    return "We couldn't save your city. Try again.";
  });

  function signIn(): void {
    authDrawerState.show("signin", "community-map");
  }

  function openPicker(trigger: HTMLButtonElement | null): void {
    pickTrigger = trigger;
    mapState.openPicker();
  }

  function closePicker(): void {
    mapState.closePicker();
    pickTrigger?.focus();
    pickTrigger = null;
  }

  function addSuggested(): void {
    if (slot.kind !== "suggest" || !slot.suggestion) return;
    const suggestion = slot.suggestion;
    void mapState.addCity({
      label: suggestion.city,
      canonicalize: suggestion.canonicalize,
    });
  }

  function addPicked(suggestion: CitySuggestion): void {
    pickTrigger = null;
    void mapState.addCity({
      label: suggestion.city,
      canonicalize: suggestion.canonicalize,
    });
  }
</script>

<div class="slot">
  <div class="body">
    {#if slot.kind === "pick"}
      <CommunityCityPicker
        {apiKey}
        busy={slot.pending}
        onPick={addPicked}
        onCancel={closePicker}
      />
    {:else}
      <p class="line">
        {#if slot.kind === "unresolved"}
          <!-- Reserved on purpose. A spinner here would announce work the
               user did not ask for, on a band they may never interact with. -->
          &nbsp;
        {:else if !configured}
          The community map needs <code>PUBLIC_GOOGLE_MAPS_API_KEY</code>.
        {:else if slot.kind === "guest"}
          Sign in to add your city to the map.
        {:else if slot.kind === "member"}
          {#if slot.pending}
            Adding you in {slot.city.city}…
          {:else}
            You're on the map in {slot.city.city}.
          {/if}
        {:else if slot.canAdd && slot.suggestion}
          Practicing in {slot.suggestion.city}? Add yourself to the map.
        {:else}
          We couldn't check whether you're already on the map.
        {/if}
      </p>

      <div class="actions">
        {#if slot.kind === "guest" && configured}
          <PanelButton variant="primary" onclick={signIn}>Sign in</PanelButton>
        {:else if slot.kind === "member" && configured}
          <PanelButton
            variant="secondary"
            disabled={slot.pending}
            ariaBusy={slot.pending}
            onclick={(event) =>
              openPicker(event.currentTarget as HTMLButtonElement)}
          >
            Change city
          </PanelButton>
          <PanelButton
            variant="secondary"
            disabled={slot.pending}
            onclick={() => void mapState.removeCity()}
          >
            Remove
          </PanelButton>
        {:else if slot.kind === "suggest" && configured}
          {#if slot.canAdd && slot.suggestion}
            <PanelButton
              variant="primary"
              disabled={slot.pending}
              ariaBusy={slot.pending}
              onclick={addSuggested}
            >
              Add {slot.suggestion.city}
            </PanelButton>
            <PanelButton
              variant="secondary"
              disabled={slot.pending}
              onclick={(event) =>
                openPicker(event.currentTarget as HTMLButtonElement)}
            >
              Pick another city
            </PanelButton>
          {:else}
            {#if slot.retryable}
              <PanelButton
                variant="secondary"
                disabled={slot.pending}
                onclick={() => void mapState.retryOwnMembership()}
              >
                Try again
              </PanelButton>
            {/if}
            <PanelButton
              variant="secondary"
              disabled={slot.pending}
              onclick={(event) =>
                openPicker(event.currentTarget as HTMLButtonElement)}
            >
              Pick your city
            </PanelButton>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- Always in flow, empty or not: a message that appears only on failure
       would push the roster down at the worst possible moment. -->
  <p class="status" role="status" aria-live="polite">{status}&nbsp;</p>
</div>

<style>
  .slot {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
  }

  .body {
    display: grid;
    gap: 0.5em;
    align-content: center;
    /* Two touch-target rows plus their gap. The picker composes its own two
       rows to exactly this sum, so opening it moves nothing. */
    min-height: calc(var(--min-touch-target) * 2 + 0.5em);
  }

  .line {
    display: flex;
    align-items: center;
    min-height: var(--min-touch-target);
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    line-height: 1.35;
  }

  .line code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.95em;
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5em;
    min-height: var(--min-touch-target);
  }

  .status {
    /* Two lines' worth. The longest failure copy ("We couldn't place Chicago
       on the map. Search for your city instead.") wraps on a phone, and a
       status line that grows on failure moves the roster at the exact moment
       the user is reading why something went wrong. */
    min-height: 2.2em;
    margin: 0;
    font-size: var(--font-size-compact);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
</style>
