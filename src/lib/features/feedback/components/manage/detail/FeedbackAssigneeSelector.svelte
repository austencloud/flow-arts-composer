<!-- FeedbackAssigneeSelector - Assign a feedback item to a contributor -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Contributor } from "#lib/shared/feedback/domain/models/contributor-models.js";
  import type { FeedbackDetailState } from "../../../state/feedback-detail-state.svelte";
  import { getContributorLoader } from "#lib/shared/feedback/get-contributor-loader.js";

  const {
    detailState,
    readOnly = false,
  }: {
    detailState: FeedbackDetailState;
    readOnly?: boolean;
  } = $props();

  let contributors = $state<Contributor[]>([]);
  let isOpen = $state(false);
  let isSaving = $state(false);

  const currentAssignee = $derived(
    detailState.item.assignedTo
      ? contributors.find((c) => c.userId === detailState.item.assignedTo) ?? null
      : null
  );

  onMount(() => {
    const loader = getContributorLoader();
    loader.getAll().then((list) => {
      contributors = list;
    });
  });

  async function assignTo(contributor: Contributor | null) {
    if (readOnly || isSaving) return;
    isSaving = true;
    isOpen = false;

    try {
      await detailState.saveAssignment(
        contributor?.userId,
        contributor?.displayName
      );
    } finally {
      isSaving = false;
    }
  }

  function handlePointerDownOutside(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".assignee-selector")) {
      isOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="section assignee-selector" onpointerdown={handlePointerDownOutside}>
  <h3 class="section-title">
    <i class="fas fa-user-check" aria-hidden="true"></i>
    Assigned To
  </h3>

  {#if readOnly}
    <!-- Read-only display -->
    {#if currentAssignee}
      <div class="assignee-badge">
        {#if currentAssignee.avatarUrl}
          <img
            src={currentAssignee.avatarUrl}
            alt=""
            class="assignee-avatar"
          />
        {:else}
          <div class="assignee-avatar placeholder">
            <i class="fas fa-user" aria-hidden="true"></i>
          </div>
        {/if}
        <span class="assignee-name">{currentAssignee.displayName}</span>
      </div>
    {:else if detailState.item.assignedToName}
      <div class="assignee-badge">
        <div class="assignee-avatar placeholder">
          <i class="fas fa-user" aria-hidden="true"></i>
        </div>
        <span class="assignee-name">{detailState.item.assignedToName}</span>
      </div>
    {:else}
      <span class="unassigned">Unassigned</span>
    {/if}
  {:else}
    <!-- Editable: click to open dropdown -->
    <button
      type="button"
      class="assignee-trigger"
      class:has-assignee={!!currentAssignee || !!detailState.item.assignedToName}
      onclick={() => (isOpen = !isOpen)}
      disabled={isSaving || contributors.length === 0}
    >
      {#if currentAssignee}
        {#if currentAssignee.avatarUrl}
          <img
            src={currentAssignee.avatarUrl}
            alt=""
            class="assignee-avatar"
          />
        {:else}
          <div class="assignee-avatar placeholder">
            <i class="fas fa-user" aria-hidden="true"></i>
          </div>
        {/if}
        <span class="assignee-name">{currentAssignee.displayName}</span>
      {:else if detailState.item.assignedToName}
        <div class="assignee-avatar placeholder">
          <i class="fas fa-user" aria-hidden="true"></i>
        </div>
        <span class="assignee-name">{detailState.item.assignedToName}</span>
      {:else}
        <i class="fas fa-user-plus" aria-hidden="true"></i>
        <span>Assign developer</span>
      {/if}
      {#if isSaving}
        <i class="fas fa-spinner fa-spin saving-icon" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-chevron-down dropdown-icon" aria-hidden="true"></i>
      {/if}
    </button>

    {#if isOpen}
      <div class="assignee-dropdown">
        <!-- Unassign option -->
        {#if detailState.item.assignedTo}
          <button
            type="button"
            class="dropdown-item unassign"
            onclick={() => assignTo(null)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
            <span>Unassign</span>
          </button>
          <div class="dropdown-divider"></div>
        {/if}

        {#each contributors as contributor (contributor.id)}
          <button
            type="button"
            class="dropdown-item"
            class:active={contributor.userId === detailState.item.assignedTo}
            onclick={() => assignTo(contributor)}
          >
            {#if contributor.avatarUrl}
              <img
                src={contributor.avatarUrl}
                alt=""
                class="dropdown-avatar"
              />
            {:else}
              <div class="dropdown-avatar placeholder">
                <i class="fas fa-user" aria-hidden="true"></i>
              </div>
            {/if}
            <span>{contributor.displayName}</span>
            {#if contributor.userId === detailState.item.assignedTo}
              <i class="fas fa-check check-icon" aria-hidden="true"></i>
            {/if}
          </button>
        {/each}

        {#if contributors.length === 0}
          <div class="dropdown-empty">
            No contributors yet. Add them from Admin &gt; Users.
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text-dim) 65%, transparent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .assignee-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .assignee-trigger:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .assignee-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .assignee-trigger.has-assignee {
    color: var(--theme-text);
  }

  .assignee-trigger .dropdown-icon {
    margin-left: auto;
    font-size: 0.7em;
    opacity: 0.6;
  }

  .assignee-trigger .saving-icon {
    margin-left: auto;
    font-size: 0.7em;
  }

  .assignee-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .assignee-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-hover-bg);
    color: var(--theme-text-dim);
    font-size: 0.65rem;
  }

  .assignee-name {
    font-weight: 500;
  }

  .assignee-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    width: fit-content;
  }

  .unassigned {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-style: italic;
  }

  .assignee-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 20;
    margin-top: 4px;
    padding: 4px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    max-height: 240px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  .dropdown-item:hover {
    background: var(--theme-card-hover-bg);
  }

  .dropdown-item.active {
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }

  .dropdown-item.unassign {
    color: var(--theme-text-dim);
  }

  .dropdown-item.unassign:hover {
    color: var(--semantic-error);
  }

  .dropdown-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .dropdown-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-hover-bg);
    color: var(--theme-text-dim);
    font-size: 0.6rem;
  }

  .check-icon {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--theme-accent);
  }

  .dropdown-divider {
    height: 1px;
    background: var(--theme-stroke);
    margin: 4px 8px;
  }

  .dropdown-empty {
    padding: 12px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .assignee-trigger,
    .dropdown-item {
      transition: none;
    }
  }
</style>
