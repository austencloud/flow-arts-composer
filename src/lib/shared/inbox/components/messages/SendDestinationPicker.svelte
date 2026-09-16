<!--
  Who a share goes to: the chosen recipients, the recent conversations, and
  the search for someone new. One presentation for the inbox send sheet and
  the viewer's send mode; the selection itself lives in SendAttachmentState.

  The host decides whether the list stays on screen once someone is chosen.
  The sheet's narrow layout collapses it (the note and Send need the height);
  every wide layout keeps it, so switching recipient is one tap instead of
  Change-then-repick.
-->
<script lang="ts">
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import UserSearchInput from "$lib/shared/user-search/UserSearchInput.svelte";
  import type { SendAttachmentState } from "../../state/send-attachment-state.svelte";
  import ConversationItem from "./ConversationItem.svelte";
  import GroupAvatarStack from "./GroupAvatarStack.svelte";

  interface Props {
    state: SendAttachmentState;
    /**
     * Hide the browser while a destination is chosen. The sheet flips this
     * from its own container query; the viewer never does.
     */
    collapseOnSelect?: boolean;
  }

  let { state, collapseOnSelect = false }: Props = $props();
</script>

<section
  class="destination-section"
  class:destination-selected={state.hasDestination}
  class:collapse-on-select={collapseOnSelect}
  aria-labelledby="share-destination-title"
>
  <div class="section-heading">
    <div>
      <span class="section-kicker">Destination</span>
      <h3 id="share-destination-title">Send to</h3>
    </div>
  </div>

  <div class="selected-slot" aria-live="polite">
    {#if state.destinationCount > 1}
      <!-- Two or more: chips, so every recipient is visible and individually
           removable. A single "3 people" summary hides WHO, which is the one
           thing worth double-checking before sending a photo. -->
      <div class="selected-destination selected-many">
        <div class="destination-chips">
          {#each state.destinationChips as chip (chip.key)}
            <span class="destination-chip">
              {#if chip.isGroup}
                <span class="chip-avatar group-fallback" aria-hidden="true">
                  <i class="fas fa-user-group"></i>
                </span>
              {:else}
                <RobustAvatar
                  src={chip.avatar}
                  name={chip.name}
                  alt=""
                  customSize={28}
                />
              {/if}
              <span class="chip-name">{chip.name}</span>
              <button
                type="button"
                class="chip-remove"
                onclick={chip.remove}
                disabled={state.sending}
                aria-label={`Remove ${chip.name}`}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </span>
          {/each}
        </div>
        <button
          type="button"
          class="clear-destination"
          onclick={state.clearDestination}
          disabled={state.sending}
        >
          Clear
        </button>
      </div>
    {:else if state.hasDestination}
      <div class="selected-destination">
        <div class="selected-avatar">
          {#if state.selectedConversationIsGroup && state.selectedConversation}
            {#if state.selectedConversation.participantPreviews?.length}
              <GroupAvatarStack
                participants={state.selectedConversation.participantPreviews}
                customAvatar={state.selectedConversation.groupAvatar}
                size={44}
                maxVisible={3}
              />
            {:else}
              <span class="group-fallback" aria-hidden="true">
                <i class="fas fa-user-group"></i>
              </span>
            {/if}
          {:else}
            <RobustAvatar
              src={state.selectedConversation?.otherParticipant?.avatar ??
                state.selectedUser?.avatar}
              name={state.destinationName}
              alt=""
              customSize={44}
            />
          {/if}
        </div>
        <div class="selected-copy">
          <strong>{state.destinationName}</strong>
          <span>{state.destinationDetail}</span>
        </div>
        <button
          type="button"
          class="clear-destination"
          onclick={state.clearDestination}
          disabled={state.sending}
        >
          Change
        </button>
      </div>
    {:else}
      <div class="destination-placeholder">
        <span class="placeholder-icon" aria-hidden="true">
          <i class="fas fa-paper-plane"></i>
        </span>
        <div>
          <strong>Choose a conversation</strong>
          <span>Pick a recent chat or find someone new.</span>
        </div>
      </div>
    {/if}
  </div>

  <div
    class="destination-browser"
    inert={state.sending}
    aria-label="Share destinations"
  >
    {#if state.recentConversations.length > 0}
      <div class="destination-group">
        <h4>Recent conversations</h4>
        <div class="conversation-options">
          {#each state.recentConversations as conversation (conversation.id)}
            <ConversationItem
              {conversation}
              selectionMode
              selected={state.isConversationSelected(conversation.id)}
              onclick={() => state.toggleConversation(conversation)}
            />
          {/each}
        </div>
      </div>
    {/if}

    <div class="destination-group new-conversation">
      <h4>
        {state.recentConversations.length > 0
          ? "Start a new conversation"
          : "Find someone"}
      </h4>
      {#key state.searchResetKey}
        <UserSearchInput
          selectedUserId={state.searchUserId}
          selectedUserDisplay={state.searchUserDisplay}
          onSelect={state.selectUser}
          placeholder="Search by username or name"
          inlineResults
          excludeUserIds={state.excludeUserIds}
          autofocus={state.recentConversations.length === 0 &&
            !state.hasDestination}
        />
      {/key}
    </div>
  </div>
</section>

<style>
  .section-kicker {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .destination-section {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.625rem;
    min-height: 0;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-heading h3 {
    margin: 0.1rem 0 0;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    line-height: 1.2;
  }

  .clear-destination {
    min-width: 4.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.875rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-accent, var(--semantic-info));
    font: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
  }

  .clear-destination:hover:not(:disabled) {
    border-color: var(--theme-accent, var(--semantic-info));
  }

  .clear-destination:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .selected-slot {
    min-height: 4.5rem;
  }

  .selected-destination,
  .destination-placeholder {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 4.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
  }

  .selected-destination {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 55%,
      var(--theme-stroke)
    );
  }

  .selected-many {
    align-items: start;
    padding-block: 0.5rem;
  }

  .destination-chips {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
  }

  .destination-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    padding: 0.25rem 0.25rem 0.25rem 0.3rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 14%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 42%,
        transparent
      );
    border-radius: 999px;
  }

  .chip-name {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    /* Below the 44px floor on purpose: this is a secondary control INSIDE a
       chip, and the chip row sits beside a full-size Clear button that does
       the same job. Sizing it to 44px would make three recipients wrap to
       three lines. */
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    cursor: pointer;
  }

  .chip-remove:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 12%, transparent);
    color: var(--theme-text);
  }

  .chip-avatar {
    width: 28px;
    height: 28px;
    font-size: var(--font-size-compact, 0.75rem);
  }

  .selected-avatar,
  .placeholder-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  .group-fallback,
  .placeholder-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 14%,
      transparent
    );
    border-radius: 50%;
    color: var(--theme-accent, var(--semantic-info));
  }

  .selected-copy,
  .destination-placeholder > div:last-child {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .selected-copy strong,
  .destination-placeholder strong {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-base, 1rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-copy span,
  .destination-placeholder span {
    margin-top: 0.15rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .destination-browser {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke) transparent;
  }

  .destination-browser[inert] {
    opacity: 0.65;
  }

  .destination-group {
    padding: 0.75rem;
  }

  .destination-group + .destination-group {
    border-top: 1px solid var(--theme-stroke);
  }

  .destination-group h4 {
    margin: 0 0 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .conversation-options {
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }

  .conversation-options :global(.conversation-item:last-child) {
    border-bottom: 0;
  }

  .new-conversation {
    position: relative;
    z-index: 1;
  }

  /* Choosing a destination collapses the browser. The host that opted in
     can hand the list back through the two custom properties when its own
     container query says there is room for it: the sheet's wide layout does,
     and a property beats fighting this rule's specificity from outside. */
  .collapse-on-select.destination-selected {
    grid-template-rows: var(--destination-rows-selected, auto auto);
  }

  .collapse-on-select.destination-selected .destination-browser {
    display: var(--destination-browser-display, none);
  }

  @container (min-width: 34rem) {
    .destination-group {
      padding: 0.875rem;
    }
  }

  /* A short window: every row gives back what it can. */
  @media (max-height: 31rem) {
    .section-kicker {
      display: none;
    }

    .section-heading h3 {
      margin-top: 0;
    }

    .destination-section {
      gap: 0.35rem;
    }

    .selected-slot,
    .selected-destination,
    .destination-placeholder {
      min-height: 3rem;
    }

    .selected-destination,
    .destination-placeholder {
      padding: 0.25rem 0.5rem;
    }

    .selected-avatar,
    .placeholder-icon,
    .group-fallback {
      width: 36px;
      height: 36px;
    }

    .clear-destination {
      min-width: 4.25rem;
    }

    .destination-browser {
      min-height: 5rem;
    }

    .destination-group {
      padding: 0.5rem;
    }

    .destination-group h4 {
      margin-bottom: 0.25rem;
    }
  }
</style>
