<script lang="ts">
  import type { FeedbackSubtask } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { getFeedbackSubtaskManager } from "#lib/features/feedback/get-feedback-subtask-manager.js";

  interface Props {
    subtasks: FeedbackSubtask[];
  }

  const { subtasks }: Props = $props();

  const subtaskService = getFeedbackSubtaskManager();

  function isBlocked(subtask: FeedbackSubtask): boolean {
    if (!subtaskService) return false;
    return subtaskService.isSubtaskBlocked(subtask, subtasks);
  }

  const completedCount = $derived(
    subtasks.filter((s: FeedbackSubtask) => s.status === "completed").length
  );
</script>

{#if subtasks.length > 0}
  <section class="section subtasks-section">
    <h3 class="section-title">
      <i class="fas fa-tasks" aria-hidden="true"></i>
      Subtasks
      <span class="subtask-count">
        {completedCount}/{subtasks.length}
      </span>
    </h3>
    <div class="subtasks-list">
      {#each subtasks as subtask (subtask.id)}
        {@const blocked = isBlocked(subtask)}
        <div
          class="subtask-item"
          class:completed={subtask.status === "completed"}
          class:in-progress={subtask.status === "in-progress"}
          class:blocked={blocked && subtask.status === "pending"}
        >
          <div class="subtask-status-icon">
            {#if subtask.status === "completed"}
              <i class="fas fa-check-circle" aria-hidden="true"></i>
            {:else if subtask.status === "in-progress"}
              <i class="fas fa-spinner fa-pulse" aria-hidden="true"></i>
            {:else if blocked}
              <i class="fas fa-lock" aria-hidden="true"></i>
            {:else}
              <i class="far fa-circle" aria-hidden="true"></i>
            {/if}
          </div>
          <div class="subtask-content">
            <span class="subtask-id">#{subtask.id}</span>
            <span class="subtask-title">{subtask.title}</span>
            {#if subtask.description}
              <p class="subtask-description">{subtask.description}</p>
            {/if}
            {#if subtask.dependsOn && subtask.dependsOn.length > 0}
              <span class="subtask-deps">
                <i class="fas fa-link" aria-hidden="true"></i>
                Depends on: {subtask.dependsOn
                  .map((id: string) => `#${id}`)
                  .join(", ")}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    margin: 0;
    font-size: var(--fb-text-xs);
    font-weight: 600;
    color: var(--fb-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .subtask-count {
    margin-left: auto;
    font-size: var(--fb-text-xs);
    color: var(--fb-text-muted);
    text-transform: none;
    letter-spacing: normal;
  }

  .subtasks-list {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  .subtask-item {
    display: flex;
    gap: var(--fb-space-md);
    padding: var(--fb-space-sm) var(--fb-space-md);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius-md);
    transition: all var(--duration-normal) ease;
  }

  .subtask-item.completed {
    opacity: 0.6;
  }

  .subtask-item.in-progress {
    border-color: var(--theme-accent, var(--semantic-info));
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 5%,
      transparent
    );
  }

  .subtask-item.blocked {
    border-color: var(--semantic-warning, var(--semantic-warning));
    background: color-mix(
      in srgb,
      var(--semantic-warning, var(--semantic-warning)) 5%,
      transparent
    );
  }

  .subtask-status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    font-size: 1.2em;
    color: var(--fb-text-muted);
  }

  .subtask-item.completed .subtask-status-icon {
    color: var(--semantic-success, var(--semantic-success));
  }

  .subtask-item.in-progress .subtask-status-icon {
    color: var(--theme-accent, var(--semantic-info));
  }

  .subtask-item.blocked .subtask-status-icon {
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .subtask-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .subtask-id {
    font-size: var(--fb-text-xs);
    color: var(--fb-text-muted);
    font-weight: 600;
  }

  .subtask-title {
    font-size: var(--fb-text-sm);
    color: var(--fb-text);
    font-weight: 500;
  }

  .subtask-description {
    margin: 0;
    font-size: var(--fb-text-xs);
    color: var(--fb-text-muted);
  }

  .subtask-deps {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: var(--fb-text-xs);
    color: var(--fb-text-subtle);
  }
</style>
