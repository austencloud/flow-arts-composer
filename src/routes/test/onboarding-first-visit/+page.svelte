<script lang="ts">
  import { onMount } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import {
    clearToasts,
    showToast,
    toastQueue,
  } from "$lib/shared/toast/state/toast-state.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import FirstVisitAppFrame from "./FirstVisitAppFrame.svelte";
  import {
    createFirstVisitSimulationState,
    type FirstVisitScene,
  } from "./simulation-state.svelte";

  const REMINDER_DELAY_MS = 1_800;

  const sceneCopy: Record<
    FirstVisitScene,
    { title: string; body: string; note: string }
  > = {
    arrival: {
      title: "The workspace gets the first second.",
      body: "Construct is already open. A small guide offer sits inside the workspace, but nothing covers the app or traps focus.",
      note: "The start choices remain usable underneath it.",
    },
    guide: {
      title: "The guide starts only when asked.",
      body: "Choosing Show guide begins the existing Construct lesson. The lesson is now the result of a decision, not the price of entering the app.",
      note: "Leaving the guide returns to the same unfinished workspace.",
    },
    workspace: {
      title: "Not now ends the interruption.",
      body: "The offer folds back into the normal start-placement heading. No replacement prompt appears and no setup task is marked complete.",
      note: "The guide stays available from its replay control later.",
    },
    compose: {
      title: "The app waits for intent.",
      body: "A start has been chosen. Account setup still has not appeared because the person is busy making something.",
      note: "Add the first move to create a natural pause for the reminder.",
    },
    reminder: {
      title: "The reminder follows the work.",
      body: "After an intentional action and a short delay, one polite toast points to Profile. It can be closed without blocking Construct.",
      note: "Closing it snoozes the reminder. The account menu still shows progress.",
    },
    profile: {
      title: "Account setup has one home.",
      body: "The full checklist lives in Profile settings. Each row opens the real kind of destination before anything counts as complete.",
      note: "Open a sandbox editor, then use its save or choose action. Nothing touches the signed-in account.",
    },
  };

  const simulation = createFirstVisitSimulationState();
  const activeCopy = $derived(sceneCopy[simulation.scene]);
  const hasToast = $derived(toastQueue.length > 0);
  const primaryLabel = $derived.by(() => {
    switch (simulation.scene) {
      case "arrival":
        return "Not now";
      case "guide":
        return "Leave guide";
      case "workspace":
        return "Choose a start";
      case "compose":
        return "Add first move";
      case "reminder":
        return "Open profile";
      case "profile":
        return "Restart";
    }
  });

  let reminderTimer: number | null = null;

  function cancelReminderTimer(): void {
    if (reminderTimer === null) return;
    window.clearTimeout(reminderTimer);
    reminderTimer = null;
  }

  function openProfile(): void {
    cancelReminderTimer();
    clearToasts();
    simulation.openProfile();
  }

  function showReminder(delay = REMINDER_DELAY_MS): void {
    cancelReminderTimer();
    clearToasts();

    reminderTimer = window.setTimeout(() => {
      reminderTimer = null;
      showToast({
        message: `Finish setup: ${simulation.accountSetup.completedCount} of ${simulation.accountSetup.totalCount} done`,
        type: "info",
        duration: 10_000,
        announcement: "polite",
        onDismiss: simulation.markReminderDismissed,
        action: {
          label: "Open profile",
          onClick: openProfile,
        },
      });
    }, delay);
  }

  function chooseStart(): void {
    cancelReminderTimer();
    clearToasts();
    simulation.chooseStart();
  }

  function addFirstMove(): void {
    simulation.addFirstMove();
    showReminder();
  }

  async function restart(): Promise<void> {
    cancelReminderTimer();
    clearToasts();
    await simulation.reset();
  }

  function advance(): void {
    if (simulation.scene === "profile") {
      void restart();
      return;
    }

    cancelReminderTimer();
    clearToasts();
    const nextScene = simulation.advance();
    if (nextScene === "reminder") showReminder();
  }

  function goBack(): void {
    cancelReminderTimer();
    clearToasts();
    const previousScene = simulation.previous();
    if (previousScene === "reminder") showReminder(0);
  }

  onMount(() => {
    clearToasts();
    void simulation.initialize();

    return () => {
      cancelReminderTimer();
      clearToasts();
    };
  });
</script>

<svelte:head>
  <title>First Visit Walkthrough | Flow Arts Composer</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="simulation-shell">
  <header class="page-header">
    <div class="header-copy">
      <p class="kicker">First visit walkthrough</p>
      <h1>Open the app. Make something. Set up the rest when it fits.</h1>
      <p class="header-summary">
        The framed app is a sandbox. It shows the new-user pacing without
        changing the signed-in account.
      </p>
    </div>
    <PanelButton variant="secondary" onclick={() => void restart()}>
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      Restart
    </PanelButton>
  </header>

  <main class="journey-layout">
    <aside class="story-card" aria-live="polite">
      <div class="story-progress-row">
        <span class="step-count">
          Step {simulation.currentStep} of 5
        </span>
        <ol class="step-track" aria-label="Walkthrough progress">
          {#each [1, 2, 3, 4, 5] as step}
            <li
              class:complete={step < simulation.currentStep}
              class:current={step === simulation.currentStep}
            >
              <span class="sr-only">Step {step}</span>
            </li>
          {/each}
        </ol>
      </div>

      <div class="story-copy">
        <Crossfade key={simulation.scene} duration={DURATION.normal}>
          <div class="story-text">
            <h2>{activeCopy.title}</h2>
            <p>{activeCopy.body}</p>
            <div class="story-note">
              <i class="fas fa-eye" aria-hidden="true"></i>
              <span>{activeCopy.note}</span>
            </div>
          </div>
        </Crossfade>
      </div>

      <div class="story-controls">
        <PanelButton
          variant="secondary"
          fullWidth
          disabled={simulation.scene === "arrival"}
          onclick={goBack}
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          Back
        </PanelButton>
        <PanelButton variant="primary" fullWidth onclick={advance}>
          {primaryLabel}
          <i
            class="fas {simulation.scene === 'profile'
              ? 'fa-rotate-left'
              : 'fa-arrow-right'}"
            aria-hidden="true"
          ></i>
        </PanelButton>
      </div>
    </aside>

    <FirstVisitAppFrame
      {simulation}
      {hasToast}
      onOpenProfile={openProfile}
      onChooseStart={chooseStart}
      onAddFirstMove={addFirstMove}
      onShowReminder={() => showReminder(0)}
    />
  </main>
</div>

<ToastContainer />

<style>
  .simulation-shell {
    --simulation-blue: var(--prop-blue, #3b82f6);
    --simulation-red: var(--prop-red, #ef3340);

    min-height: 100dvh;
    padding: clamp(0.75rem, 2vw, 2rem);
    color: var(--theme-text, #f8fafc);
    background:
      radial-gradient(
        circle at 9% 12%,
        color-mix(in srgb, var(--simulation-blue) 14%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 88% 86%,
        color-mix(in srgb, var(--simulation-red) 9%, transparent),
        transparent 26%
      ),
      #080a0f;
  }

  .page-header,
  .journey-layout {
    width: min(100%, var(--shell-w, min(108rem, 94vw)));
    margin-inline: auto;
  }

  .page-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: clamp(0.75rem, 1.5vw, 1.5rem);
    padding: clamp(1rem, 1.8vw, 1.75rem);
    background: var(--theme-panel-bg, rgba(15, 17, 24, 0.96));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 1.25rem);
  }

  .header-copy {
    min-width: 0;
  }

  .kicker,
  h1,
  .header-summary {
    margin: 0;
  }

  .kicker {
    color: color-mix(in srgb, var(--simulation-blue) 70%, white);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 0.25rem;
    font-size: clamp(1.7rem, 1.25rem + 1.4vw, 3rem);
    line-height: 1.06;
    letter-spacing: -0.035em;
  }

  .header-summary {
    margin-top: 0.65rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .journey-layout {
    display: grid;
    grid-template-columns: minmax(19rem, 0.72fr) minmax(0, 2.28fr);
    align-items: stretch;
    gap: clamp(0.75rem, 1.5vw, 1.5rem);
  }

  .story-card {
    display: flex;
    min-width: 0;
    overflow: hidden;
    flex-direction: column;
    gap: clamp(1rem, 2vw, 1.75rem);
    padding: clamp(1rem, 2vw, 1.75rem);
    background: var(--theme-panel-bg, rgba(15, 17, 24, 0.97));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 1.25rem);
  }

  .story-progress-row {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .step-count {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .step-track {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step-track li {
    height: 0.35rem;
    background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
    border-radius: 999px;
    transition: background var(--duration-normal, 200ms) ease;
  }

  .step-track li.complete {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 74%,
      transparent
    );
  }

  .step-track li.current {
    background: var(--simulation-blue);
  }

  .story-copy {
    min-height: 17rem;
  }

  .story-text {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .story-text h2 {
    margin: 0;
    font-size: clamp(1.45rem, 1.1rem + 1vw, 2.25rem);
    line-height: 1.08;
    letter-spacing: -0.025em;
  }

  .story-text > p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.65;
  }

  .story-note {
    display: flex;
    align-items: start;
    gap: 0.7rem;
    padding: 0.85rem;
    color: color-mix(in srgb, var(--simulation-blue) 62%, white);
    background: color-mix(in srgb, var(--simulation-blue) 10%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--simulation-blue) 24%, transparent);
    border-radius: var(--radius-md, 0.75rem);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  .story-note i {
    margin-top: 0.15rem;
  }

  .story-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: auto;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 64rem) {
    .journey-layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .story-card {
      display: grid;
      grid-template-columns: minmax(10rem, 0.6fr) minmax(0, 1.4fr);
      align-items: center;
    }

    .story-copy {
      min-height: 0;
    }

    .story-controls {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 44rem) {
    .simulation-shell {
      padding: 0.6rem;
    }

    .page-header {
      align-items: start;
      gap: 0.75rem;
      padding: 0.9rem;
    }

    .header-summary {
      display: none;
    }

    h1 {
      font-size: 1.35rem;
    }

    .story-card {
      display: flex;
      order: 2;
      gap: 0.8rem;
      padding: 0.9rem;
    }

    .story-copy {
      min-height: 13rem;
    }

    .story-text h2 {
      font-size: 1.3rem;
    }
  }

  @media (max-width: 24rem) {
    .page-header > :global(.panel-btn) {
      padding-inline: 0.75rem;
    }

    .story-note {
      display: none;
    }

    .story-copy {
      min-height: 10.5rem;
    }
  }

  @media (max-height: 35rem) and (min-width: 48rem) {
    .simulation-shell {
      padding: 0.5rem;
    }

    .page-header {
      align-items: center;
      margin-bottom: 0.5rem;
      padding: 0.55rem 0.75rem;
    }

    .kicker,
    .header-summary {
      display: none;
    }

    h1 {
      margin: 0;
      font-size: 1.25rem;
    }

    .journey-layout {
      grid-template-columns: minmax(16rem, 0.72fr) minmax(0, 2.28fr);
      gap: 0.5rem;
    }

    .story-card {
      display: flex;
      gap: 0.65rem;
      padding: 0.7rem;
    }

    .story-copy {
      min-height: 0;
    }

    .story-text {
      gap: 0.45rem;
    }

    .story-text h2 {
      font-size: 1.05rem;
    }

    .story-text > p {
      font-size: var(--font-size-compact, 0.75rem);
      line-height: 1.35;
    }

    .story-note {
      display: none;
    }

    .story-controls {
      display: none;
    }
  }

  @media (min-width: 105rem) {
    .page-header,
    .story-card {
      padding: 2rem;
    }

    .journey-layout {
      grid-template-columns: minmax(22rem, 0.65fr) minmax(0, 2.35fr);
    }

    h1 {
      font-size: 3.25rem;
    }

    .header-summary,
    .story-text > p,
    .story-note {
      font-size: 1rem;
    }

    .story-text h2 {
      font-size: 2.5rem;
    }
  }

  @media (min-width: 162.5rem) {
    .simulation-shell {
      display: flex;
      height: 100dvh;
      min-height: 100dvh;
      box-sizing: border-box;
      overflow: hidden;
      flex-direction: column;
      padding: clamp(2.5rem, 1.5vw, 4rem);
    }

    .page-header,
    .journey-layout {
      width: min(94vw, 220rem);
    }

    .page-header {
      align-items: center;
      flex: 0 0 auto;
      margin-bottom: 2rem;
      padding: 2.5rem 3rem;
      border-radius: 2rem;
    }

    .journey-layout {
      grid-template-columns: minmax(42rem, 0.72fr) minmax(0, 2.28fr);
      min-height: 0;
      flex: 1;
      gap: 2rem;
    }

    .story-card {
      min-height: 0;
      gap: 2.5rem;
      padding: 3rem;
      border-radius: 2rem;
    }

    .story-copy {
      display: flex;
      min-height: 0;
      flex: 1;
      align-items: center;
    }

    .story-text {
      gap: 1.5rem;
    }

    .kicker {
      font-size: 1.1rem;
    }

    h1 {
      font-size: 5rem;
    }

    .header-summary {
      font-size: 1.35rem;
    }

    .step-count {
      font-size: 1.25rem;
    }

    .step-track {
      gap: 0.65rem;
    }

    .step-track li {
      height: 0.65rem;
    }

    .story-text > p,
    .story-note {
      font-size: 1.35rem;
    }

    .story-text h2 {
      font-size: 4rem;
    }

    .story-note {
      gap: 1rem;
      padding: 1.35rem;
      border-radius: 1rem;
    }

    .page-header > :global(.panel-btn),
    .story-controls :global(.panel-btn) {
      min-height: 4.5rem;
      padding: 1.1rem 1.5rem;
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-track li {
      transition: none;
    }
  }
</style>
