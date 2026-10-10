<script lang="ts">
  import { page } from "$app/state";
  import AuthModal from "#lib/shared/auth/components/AuthModal.svelte";
  import ContextualAuthPrompt from "#lib/shared/auth/components/ContextualAuthPrompt.svelte";
  import {
    getAuthPromptContent,
    type AuthNudgeTrigger,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import type { GuestEncorePrompt } from "#lib/shared/auth/domain/auth-nudge-trigger.js";

  type ScenarioKey = "share" | "library" | "step-cap";

  type Scenario = {
    key: ScenarioKey;
    label: string;
    reason: AuthNudgeTrigger;
  };

  const scenarios: Record<ScenarioKey, Scenario> = {
    share: {
      key: "share",
      label: "Share",
      reason: "share-sequence",
    },
    library: {
      key: "library",
      label: "Library",
      reason: "guest-first-save",
    },
    "step-cap": {
      key: "step-cap",
      label: "Longer sequence",
      reason: "step-cap-guest",
    },
  };

  const scenarioOptions = (Object.values(scenarios) as Scenario[]).map(
    (scenario) => ({
      value: scenario.key,
      label: scenario.label,
    })
  );

  const requestedScenario = page.url.searchParams.get("scenario");
  let selectedKey = $state<ScenarioKey>(
    requestedScenario && requestedScenario in scenarios
      ? (requestedScenario as ScenarioKey)
      : "share"
  );
  let modalOpen = $state(page.url.searchParams.get("modal") === "1");
  const selected = $derived(scenarios[selectedKey]);
  const encore = $derived.by((): GuestEncorePrompt => {
    if (selectedKey !== "step-cap") return null;
    const value = page.url.searchParams.get("encore");
    return value === "offer" || value === "spent" || value === "limit"
      ? value
      : null;
  });
  const selectedContent = $derived(
    getAuthPromptContent(selected.reason, "signup", 1, encore)
  );
</script>

<svelte:head>
  <title>Contextual Auth Prompt Lab | Flow Arts Composer</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="lab-shell">
  <header class="lab-header">
    <div class="lab-heading">
      <p class="lab-kicker">Sign-in prototype</p>
      <h1>Try each sign-in context.</h1>
      <p>
        The copy changes with the action. Google and email below are the
        production components.
      </p>
    </div>

    <div class="lab-controls">
      <div class="scenario-control">
        <span id="scenario-label">What opened it</span>
        <SegmentedControl
          options={scenarioOptions}
          value={selectedKey}
          onchange={(value) => (selectedKey = value)}
          ariaLabelledby="scenario-label"
          semantics="radiogroup"
          color="blue"
        />
      </div>

      <button
        class="open-modal-button"
        type="button"
        onclick={() => (modalOpen = true)}
      >
        <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
        Open as real modal
      </button>
    </div>
  </header>

  <main class="preview-stage">
    <div class="stage-context" aria-hidden="true">
      <div class="stage-wordmark">TKA</div>
      <div class="stage-lines">
        <span></span><span></span><span></span>
      </div>
      <div class="stage-cards">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>

    <div class="inline-preview">
      <div class="preview-meta">
        <span>Inline component</span>
        <code>{selected.reason}</code>
      </div>

      {#key selected.key}
        <ContextualAuthPrompt
          content={selectedContent}
          encoreOffer={encore === "offer"}
          onAcceptEncore={() => (modalOpen = true)}
          idPrefix="inline-contextual-auth"
        />
      {/key}
    </div>
  </main>
</div>

<AuthModal
  open={modalOpen}
  initialMode="signup"
  reason={selected.reason}
  {encore}
  onAcceptEncore={() => (modalOpen = false)}
  onClose={() => (modalOpen = false)}
/>

<style>
  .lab-shell {
    --lab-blue: var(--prop-blue, #4155d8);
    --lab-red: var(--prop-red, #ef3340);

    min-height: 100dvh;
    padding: clamp(1rem, 2.4vw, 2.5rem);
    color: var(--theme-text, #f8fafc);
    background:
      radial-gradient(
        circle at 12% 14%,
        color-mix(in srgb, var(--lab-blue) 13%, transparent),
        transparent 30%
      ),
      radial-gradient(
        circle at 86% 82%,
        color-mix(in srgb, var(--lab-red) 10%, transparent),
        transparent 28%
      ),
      #080a0f;
  }

  .lab-header {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(34rem, auto);
    align-items: end;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: min(100%, var(--shell-w, min(108rem, 94vw)));
    margin: 0 auto clamp(1.25rem, 2vw, 2rem);
    padding: clamp(1rem, 1.8vw, 1.75rem);
    background: var(--theme-panel-bg, rgba(15, 17, 24, 0.96));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 1.25rem);
  }

  .lab-heading {
    min-width: 0;
  }

  .lab-kicker {
    margin: 0 0 0.45rem;
    color: color-mix(in srgb, var(--lab-blue) 72%, white);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 1.3rem + 1.5vw, 3rem);
    line-height: 1.05;
    letter-spacing: -0.035em;
  }

  .lab-heading > p:last-child {
    max-width: 48rem;
    margin: 0.7rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .lab-controls {
    display: flex;
    align-items: end;
    justify-content: end;
    gap: 0.75rem;
    min-width: 0;
  }

  .scenario-control {
    --prop-blue: #3347c4;

    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    width: min(34rem, 46vw);
  }

  .scenario-control > span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
  }

  .open-modal-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.7rem 1rem;
    white-space: nowrap;
    color: #ffffff;
    background: var(--lab-blue);
    border: 1px solid color-mix(in srgb, var(--lab-blue) 68%, white);
    border-radius: var(--radius-md, 0.75rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .open-modal-button:hover {
    background: color-mix(in srgb, var(--lab-blue) 84%, white);
    transform: translateY(-1px);
  }

  .open-modal-button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--lab-blue) 58%, white);
    outline-offset: 3px;
  }

  .preview-stage {
    position: relative;
    display: grid;
    place-items: center;
    width: min(100%, var(--shell-w, min(108rem, 94vw)));
    min-height: calc(100dvh - clamp(12rem, 20vh, 16rem));
    margin: 0 auto;
    padding: clamp(1rem, 4vw, 4rem);
    overflow: hidden;
    background:
      linear-gradient(rgba(4, 6, 10, 0.68), rgba(4, 6, 10, 0.78)),
      radial-gradient(
        circle at 25% 30%,
        rgba(65, 85, 216, 0.16),
        transparent 24%
      ),
      radial-gradient(
        circle at 74% 72%,
        rgba(239, 51, 64, 0.12),
        transparent 26%
      ),
      #0a0d13;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .stage-context {
    position: absolute;
    inset: 0;
    opacity: 0.18;
    filter: blur(1px);
  }

  .stage-wordmark {
    position: absolute;
    top: 8%;
    left: 6%;
    color: var(--theme-text, #ffffff);
    font-size: clamp(2rem, 5vw, 6rem);
    font-weight: 800;
    letter-spacing: -0.06em;
  }

  .stage-lines {
    position: absolute;
    top: 26%;
    left: 6%;
    display: grid;
    gap: 0.8rem;
    width: min(28rem, 34vw);
  }

  .stage-lines span {
    height: 0.7rem;
    border-radius: 999px;
    background: var(--theme-text, #ffffff);
  }

  .stage-lines span:nth-child(2) {
    width: 74%;
  }

  .stage-lines span:nth-child(3) {
    width: 48%;
  }

  .stage-cards {
    position: absolute;
    right: 6%;
    bottom: 8%;
    display: grid;
    grid-template-columns: repeat(2, minmax(7rem, 12rem));
    gap: 1rem;
  }

  .stage-cards span {
    aspect-ratio: 1.3;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .inline-preview {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    width: min(100%, 72rem);
  }

  .preview-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: min(calc(100vw - 2rem), clamp(46rem, 34vw, 60rem));
    max-width: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .preview-meta code {
    padding: 0.25rem 0.5rem;
    color: color-mix(in srgb, var(--lab-blue) 66%, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.4rem;
    font-size: inherit;
  }

  @media (max-width: 64rem) {
    .lab-header {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    .lab-controls {
      justify-content: start;
    }

    .scenario-control {
      width: min(34rem, 100%);
    }
  }

  @media (max-width: 44rem) {
    .lab-shell {
      padding: 0.75rem;
    }

    .lab-header {
      gap: 0.9rem;
      padding: 1rem;
    }

    .lab-kicker,
    .lab-heading > p:last-child {
      display: none;
    }

    h1 {
      font-size: 1.5rem;
    }

    .lab-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .scenario-control,
    .open-modal-button {
      width: 100%;
    }

    .preview-stage {
      align-items: start;
      width: 100%;
      min-height: 0;
      padding: 0.75rem 0 0;
      overflow: visible;
      background: transparent;
      border: 0;
      box-shadow: none;
    }

    .stage-context {
      display: none;
    }

    .preview-meta {
      display: none;
    }
  }

  @media (max-height: 35rem) and (min-width: 48rem) {
    .lab-shell {
      padding: 0.5rem;
    }

    .lab-header {
      grid-template-columns: minmax(16rem, 1fr) minmax(31rem, auto);
      gap: 1rem;
      margin-bottom: 0.5rem;
      padding: 0.65rem 0.85rem;
    }

    .lab-kicker,
    .lab-heading > p:last-child {
      display: none;
    }

    h1 {
      font-size: 1.35rem;
    }

    .preview-stage {
      min-height: calc(100dvh - 6.25rem);
      padding: 0.5rem;
    }

    .preview-meta {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .open-modal-button {
      transition: none;
    }

    .open-modal-button:hover {
      transform: none;
    }
  }
</style>
