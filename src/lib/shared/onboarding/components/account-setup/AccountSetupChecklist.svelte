<script lang="ts">
  import {
    logAccountSetupTaskSelected,
    logAccountSetupViewed,
  } from "$lib/shared/analytics/services/onboarding-events";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type {
    AccountSetupState,
    AccountSetupTask,
    AccountSetupTaskId,
  } from "../../state/account-setup-state.svelte";

  let {
    state,
    onTaskAction,
    variant = "standard",
  } = $props<{
    state: AccountSetupState;
    onTaskAction: (taskId: AccountSetupTaskId) => void;
    variant?: "standard" | "prompt";
  }>();

  const progressPercent = $derived(
    state.totalCount === 0
      ? 0
      : Math.round((state.completedCount / state.totalCount) * 100)
  );
  const remainingTasks = $derived(
    state.tasks.filter((task: AccountSetupTask) => !task.complete)
  );
  const visibleTasks = $derived(
    variant === "prompt" ? remainingTasks : state.tasks
  );
  let viewRecorded = false;

  $effect(() => {
    if (state.loading || !state.available || viewRecorded) return;
    if (variant === "prompt" && state.isComplete) return;
    viewRecorded = true;
    logAccountSetupViewed({
      surface: variant === "prompt" ? "reminder" : "settings_checklist",
      completed_count: state.completedCount,
      total_count: state.totalCount,
    });
  });

  function handleTaskAction(task: AccountSetupTask): void {
    logAccountSetupTaskSelected({
      task: task.id,
      was_complete: task.complete,
      surface: variant === "prompt" ? "reminder" : "settings_checklist",
    });
    onTaskAction(task.id);
  }

  function taskLabel(task: AccountSetupTask): string {
    return t(
      (
        {
          "display-name": "onboarding_display_name",
          "profile-photo": "onboarding_profile_photo",
          props: "onboarding_props_you_spin",
          theme: "tab_settings_theme",
        } as const
      )[task.id]
    );
  }

  function taskDescription(task: AccountSetupTask): string {
    return t(
      (
        {
          "display-name": "onboarding_display_name_desc",
          "profile-photo": "onboarding_profile_photo_desc",
          props: "onboarding_props_desc",
          theme: "onboarding_theme_desc",
        } as const
      )[task.id]
    );
  }

  function taskAction(task: AccountSetupTask): string {
    if (task.complete)
      return t(
        task.id === "display-name" ? "onboarding_edit" : "onboarding_change"
      );
    return t(
      (
        {
          "display-name": "onboarding_add_name",
          "profile-photo": "onboarding_add_photo",
          props: "onboarding_choose_props",
          theme: "onboarding_choose",
        } as const
      )[task.id]
    );
  }
</script>

{#if !state.loading && state.available && (variant !== "prompt" || !state.isComplete)}
  <section
    class="setup-card"
    class:prompt={variant === "prompt"}
    style:--setup-task-count={visibleTasks.length}
    aria-labelledby="account-setup-title"
  >
    <header class="setup-header">
      <div class="header-copy">
        {#if variant === "standard"}<p class="eyebrow">
            {t("onboarding_account_setup")}
          </p>{/if}
        <h2 id="account-setup-title">
          {variant === "prompt"
            ? t("onboarding_finish_account")
            : state.isComplete
              ? t("onboarding_account_set")
              : t("onboarding_finish_setting_up")}
        </h2>
      </div>
      <span class="progress-count">
        {variant === "prompt"
          ? t("onboarding_items_left", { count: remainingTasks.length })
          : t("onboarding_progress_done", {
              done: state.completedCount,
              total: state.totalCount,
            })}
      </span>
    </header>

    {#if variant === "standard"}
      <div
        class="progress-track"
        role="progressbar"
        aria-label={t("onboarding_setup_progress")}
        aria-valuemin="0"
        aria-valuemax={state.totalCount}
        aria-valuenow={state.completedCount}
      >
        <span class="progress-fill" style:width={`${progressPercent}%`}></span>
      </div>
    {/if}

    <p class="completion-status" role="status" aria-live="polite">
      {variant === "prompt"
        ? t("onboarding_tasks_remain", { count: remainingTasks.length })
        : state.isComplete
          ? t("onboarding_setup_complete")
          : t("onboarding_tasks_complete", {
              done: state.completedCount,
              total: state.totalCount,
            })}
    </p>

    {#if state.saveError}
      <div class="save-error" role="status">
        <span>{t("onboarding_save_failed")}</span>
        <button type="button" onclick={() => void state.retrySave()}
          >{t("action_retry")}</button
        >
      </div>
    {/if}

    <div class="task-grid">
      {#each visibleTasks as task (task.id)}
        <button
          class="task-row"
          class:complete={task.complete}
          onclick={() => handleTaskAction(task)}
          aria-label={`${taskAction(task)}: ${taskLabel(task)}`}
        >
          <span class="task-status" aria-hidden="true">
            <i class="fas {task.complete ? 'fa-check' : task.icon}"></i>
          </span>
          <span class="task-copy">
            <span class="task-label">{taskLabel(task)}</span>
            <span class="task-description">{taskDescription(task)}</span>
          </span>
          <span class="task-action">{taskAction(task)}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .setup-card {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: clamp(16px, 2.5cqi, 24px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
  }

  .setup-card.prompt {
    gap: 0.7rem;
    padding: 0.85rem 1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98)) 94%,
      var(--theme-accent, #8b5cf6) 6%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 26%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
  }

  .setup-card.prompt h2 {
    margin-top: 0;
    font-size: var(--font-size-lg, 1.125rem);
  }

  .setup-card.prompt .progress-count {
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-min, 0.875rem);
  }

  .setup-card.prompt .task-description {
    display: none;
  }

  .setup-card.prompt .task-row {
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.7rem;
  }

  .setup-card.prompt .task-status {
    width: 2rem;
    height: 2rem;
  }

  .setup-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .header-copy {
    min-width: 0;
  }

  .eyebrow,
  h2,
  .progress-count {
    margin: 0;
  }

  .eyebrow {
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 3px;
    color: var(--theme-text, #fff);
    font-size: clamp(1.05rem, 3.2cqi, 1.4rem);
    line-height: 1.2;
  }

  .progress-count {
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .progress-track {
    width: 100%;
    height: 8px;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
    border-radius: 999px;
  }

  .progress-fill {
    display: block;
    height: 100%;
    min-width: 0;
    background: var(--theme-accent, #8b5cf6);
    border-radius: inherit;
    transition: width var(--duration-normal, 200ms) ease;
  }

  .task-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .completion-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .save-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--min-touch-target, 48px);
    padding: 10px 12px;
    color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 12px;
    font-size: var(--font-size-min, 14px);
  }

  .save-error button {
    min-height: var(--min-touch-target, 44px);
    padding: 8px 14px;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 9px;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .save-error button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .task-row {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target, 48px);
    padding: 10px 12px;
    text-align: left;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .task-row:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .task-row:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .task-status {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--theme-accent, #8b5cf6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 14%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent);
    border-radius: 50%;
    font-size: var(--font-size-compact, 12px);
  }

  .task-row.complete .task-status {
    color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 34%,
      transparent
    );
  }

  .task-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .task-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .task-description {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-action {
    color: var(--theme-accent, #8b5cf6);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    white-space: nowrap;
  }

  @container (min-width: 680px) {
    .task-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .setup-card.prompt .task-grid {
      grid-template-columns: repeat(var(--setup-task-count), minmax(0, 1fr));
    }
  }

  @container (min-width: 1050px) {
    .task-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .task-row {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .task-action {
      grid-column: 2;
    }
  }

  @container (max-width: 420px) {
    .setup-header {
      align-items: start;
      flex-direction: column;
      gap: 6px;
    }

    .task-description {
      white-space: normal;
    }
  }

  @container (min-width: 100rem) {
    .setup-card {
      gap: 24px;
      padding: 36px;
      border-radius: 24px;
    }

    .setup-header {
      gap: 24px;
    }

    .eyebrow {
      font-size: 1rem;
    }

    h2 {
      margin-top: 6px;
      font-size: 2rem;
    }

    .progress-count {
      font-size: 1.125rem;
    }

    .progress-track {
      height: 12px;
    }

    .task-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .task-row {
      grid-template-columns: 56px minmax(0, 1fr) auto;
      gap: 16px;
      min-height: 8.5rem;
      padding: 20px 24px;
      border-radius: 16px;
    }

    .task-status {
      width: 52px;
      height: 52px;
      font-size: 1.125rem;
    }

    .task-copy {
      gap: 6px;
    }

    .task-label,
    .task-action {
      font-size: 1.125rem;
    }

    .task-action {
      grid-column: auto;
    }

    .task-description {
      font-size: 1rem;
    }

    .save-error {
      padding: 16px 20px;
      font-size: 1.125rem;
    }

    .setup-card.prompt .task-grid {
      grid-template-columns: repeat(var(--setup-task-count), minmax(0, 1fr));
      gap: 0.5em;
    }

    .setup-card.prompt .task-row {
      grid-template-columns: 2.375em minmax(0, 1fr);
      gap: 0.625em;
      min-height: var(--min-touch-target, 48px);
      padding: 0.625em 0.75em;
      border-radius: 0.75em;
    }

    .setup-card.prompt .task-status {
      width: 2.25em;
      height: 2.25em;
      font-size: var(--font-size-compact, 0.75em);
    }

    .setup-card.prompt .task-copy {
      gap: 0.125em;
    }

    .setup-card.prompt .task-label,
    .setup-card.prompt .task-action {
      font-size: var(--font-size-min, 0.875em);
    }

    .setup-card.prompt .task-action {
      grid-column: 2;
    }

    .setup-card.prompt .task-description {
      font-size: var(--font-size-compact, 0.75em);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill,
    .task-row {
      transition: none;
    }
  }
</style>
