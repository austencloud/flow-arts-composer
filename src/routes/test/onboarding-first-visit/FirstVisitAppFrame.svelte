<script lang="ts">
  import AccountSetupChecklist from "#lib/shared/onboarding/components/account-setup/AccountSetupChecklist.svelte";
  import ConstructGuideEntry from "#lib/features/create/construct/tutorial/components/ConstructGuideEntry.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { AccountSetupTaskId } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import type { FirstVisitSimulationState } from "./simulation-state.svelte";

  let {
    simulation,
    hasToast,
    onOpenProfile,
    onChooseStart,
    onAddFirstMove,
    onShowReminder,
  }: {
    simulation: FirstVisitSimulationState;
    hasToast: boolean;
    onOpenProfile: () => void;
    onChooseStart: () => void;
    onAddFirstMove: () => void;
    onShowReminder: () => void;
  } = $props();

  const sampleStarts = [1, 2, 3, 4] as const;
  const setupDestinations: Record<
    AccountSetupTaskId,
    { kicker: string; title: string; action: string; icon: string }
  > = {
    "display-name": {
      kicker: "Display name editor",
      title: "What should people call you?",
      action: "Save display name",
      icon: "fa-signature",
    },
    "profile-photo": {
      kicker: "Profile photo picker",
      title: "Choose a profile photo",
      action: "Use this photo",
      icon: "fa-camera",
    },
    props: {
      kicker: "My Props drawer",
      title: "Choose the props you spin",
      action: "Save prop choices",
      icon: "fa-fire",
    },
    theme: {
      kicker: "Theme settings",
      title: "Choose how Construct looks",
      action: "Use Deep Space",
      icon: "fa-palette",
    },
  };
  const activeDestination = $derived(
    simulation.activeSetupTask
      ? setupDestinations[simulation.activeSetupTask]
      : null
  );
</script>

{#snippet startChoices()}
  <div class="start-grid" aria-label="Sample start positions">
    {#each sampleStarts as sample}
      <button
        class="start-choice"
        type="button"
        onclick={onChooseStart}
        aria-label={`Choose sample start ${sample}`}
      >
        <span class="start-glyph" aria-hidden="true">
          <i class="fas fa-arrows-up-down-left-right"></i>
          <span>{sample}</span>
        </span>
        <span>Use this start</span>
      </button>
    {/each}
  </div>
{/snippet}

<section class="app-frame" aria-label="First visit app simulation">
  <header class="app-bar">
    <div class="app-identity">
      <span class="app-mark" aria-hidden="true">Flow</span>
      <span class="app-divider" aria-hidden="true"></span>
      <span class="module-name">Construct</span>
    </div>

    <button
      class="account-chip"
      type="button"
      onclick={onOpenProfile}
      aria-label={`Open sandbox profile. ${simulation.accountSetup.completedCount} of ${simulation.accountSetup.totalCount} setup steps complete`}
    >
      <span
        class:photo-complete={simulation.hasProfilePhoto}
        class="avatar"
        aria-hidden="true"
      >
        {simulation.hasProfilePhoto ? "S" : "?"}
      </span>
      <span class="account-copy">
        <span class="account-name">
          <span class="account-sizer" aria-hidden="true">New account</span>
          <span>{simulation.displayName ?? "New account"}</span>
        </span>
        <span class="account-status">
          <span class="account-sizer" aria-hidden="true">
            4 setup steps left
          </span>
          <span>
            {simulation.stepsLeft === 0
              ? "Account set"
              : `${simulation.stepsLeft} setup ${simulation.stepsLeft === 1 ? "step" : "steps"} left`}
          </span>
        </span>
      </span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </header>

  <div class="app-stage">
    <Crossfade key={simulation.scene} duration={DURATION.emphasis} fill>
      {#if simulation.scene === "arrival"}
        <div class="scene construct-scene themed-scrollbar">
          <div class="scene-heading">
            <span class="scene-kicker">Empty workspace</span>
            <h3>Pick a starting point</h3>
          </div>
          <ConstructGuideEntry
            offerVisible={true}
            onShowGuide={simulation.startGuide}
            onDismiss={simulation.dismissGuide}
          />
          {@render startChoices()}
          <p class="workspace-caption">
            The workspace stays active while the offer is visible.
          </p>
        </div>
      {:else if simulation.scene === "guide"}
        <div class="scene guide-scene themed-scrollbar">
          <div class="guide-board" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="guide-callout">
            <span class="scene-kicker">Guide requested</span>
            <h3>Choose a start</h3>
            <p>The Construct lesson is active because Show guide was chosen.</p>
            <PanelButton variant="primary" onclick={onChooseStart}>
              Use the highlighted start
            </PanelButton>
          </div>
        </div>
      {:else if simulation.scene === "workspace"}
        <div class="scene construct-scene themed-scrollbar">
          <div class="scene-heading">
            <span class="scene-kicker">Construct</span>
            <h3>Pick a starting point</h3>
          </div>
          <ConstructGuideEntry offerVisible={false} />
          {@render startChoices()}
          <p class="workspace-caption">
            No modal follows Not now. The next click belongs to Construct.
          </p>
        </div>
      {:else if simulation.scene === "compose"}
        <div class="scene compose-scene themed-scrollbar">
          <div class="scene-heading">
            <span class="scene-kicker">Start chosen</span>
            <h3>Build the first move</h3>
          </div>
          <div class="sequence-strip" aria-label="Sandbox sequence">
            <div class="sequence-cell start-cell">
              <i class="fas fa-arrows-up-down-left-right" aria-hidden="true"
              ></i>
              <span>Start</span>
            </div>
            <button
              class="sequence-cell add-cell"
              type="button"
              onclick={onAddFirstMove}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>Add first move</span>
            </button>
            <div class="sequence-cell empty-cell" aria-hidden="true"></div>
            <div class="sequence-cell empty-cell" aria-hidden="true"></div>
          </div>
          <p class="workspace-caption">
            Account setup remains quiet until this intentional action.
          </p>
        </div>
      {:else if simulation.scene === "reminder"}
        <div class="scene reminder-scene themed-scrollbar">
          <div class="move-result">
            <span class="result-icon" aria-hidden="true">
              <i class="fas fa-check"></i>
            </span>
            <div>
              <span class="scene-kicker">Move added</span>
              <h3>Keep building</h3>
              <p>The setup reminder uses the toast layer, outside the work.</p>
            </div>
          </div>

          <div class="persistent-path">
            <div>
              <span>Account menu</span>
              <strong>
                {simulation.accountSetup.completedCount} of
                {simulation.accountSetup.totalCount} done
              </strong>
            </div>
            <div
              class="mini-progress"
              role="progressbar"
              aria-label="Sandbox account setup progress"
              aria-valuemin="0"
              aria-valuemax={simulation.accountSetup.totalCount}
              aria-valuenow={simulation.accountSetup.completedCount}
            >
              <span
                style:width={`${(simulation.accountSetup.completedCount / simulation.accountSetup.totalCount) * 100}%`}
              ></span>
            </div>
            <PanelButton variant="secondary" onclick={onOpenProfile}>
              Open profile
            </PanelButton>
          </div>

          {#if !hasToast}
            <PanelButton variant="secondary" onclick={onShowReminder}>
              {simulation.reminderDismissed
                ? "Replay snoozed reminder"
                : "Show reminder now"}
            </PanelButton>
          {/if}
        </div>
      {:else}
        <div class="scene profile-scene themed-scrollbar">
          <div class="profile-heading">
            <div>
              <span class="scene-kicker">Profile settings</span>
              <h3>{simulation.displayName ?? "New account"}</h3>
            </div>
            <span class="sandbox-badge">
              <i class="fas fa-flask" aria-hidden="true"></i>
              Sandbox
            </span>
          </div>
          <AccountSetupChecklist
            state={simulation.accountSetup}
            onTaskAction={simulation.openSetupDestination}
          />
          {#if simulation.activeSetupTask && activeDestination}
            <section
              class="setup-destination"
              aria-labelledby="sandbox-destination-title"
            >
              <header class="destination-header">
                <div>
                  <span class="scene-kicker">{activeDestination.kicker}</span>
                  <h3 id="sandbox-destination-title">
                    {activeDestination.title}
                  </h3>
                </div>
                <button
                  class="destination-close"
                  type="button"
                  onclick={simulation.closeSetupDestination}
                  aria-label="Close setup destination"
                >
                  <i class="fas fa-xmark" aria-hidden="true"></i>
                </button>
              </header>

              <div class="destination-preview">
                {#if simulation.activeSetupTask === "display-name"}
                  <label class="sandbox-field">
                    <span>Display name</span>
                    <input
                      value="Sky"
                      readonly
                      aria-label="Sandbox display name"
                    />
                  </label>
                {:else if simulation.activeSetupTask === "profile-photo"}
                  <div
                    class="photo-picker-preview"
                    aria-label="Profile photo choices"
                  >
                    <span class="chosen-photo"
                      ><i class="fas fa-user-astronaut" aria-hidden="true"
                      ></i></span
                    >
                    <span
                      ><i class="fas fa-wand-magic-sparkles" aria-hidden="true"
                      ></i></span
                    >
                    <span><i class="fas fa-upload" aria-hidden="true"></i></span
                    >
                  </div>
                {:else if simulation.activeSetupTask === "props"}
                  <div class="prop-drawer-preview" aria-label="Prop choices">
                    <span class="chosen-prop"
                      ><i class="fas fa-wand-sparkles" aria-hidden="true"></i> Staff</span
                    >
                    <span
                      ><i class="fas fa-circle-notch" aria-hidden="true"></i> Hoop</span
                    >
                    <span
                      ><i class="fas fa-fan" aria-hidden="true"></i> Fans</span
                    >
                  </div>
                {:else}
                  <div class="theme-preview" aria-label="Theme choices">
                    <span class="theme-choice deep-space">Deep Space</span>
                    <span class="theme-choice daylight">Daylight</span>
                    <span class="theme-choice ember">Ember</span>
                  </div>
                {/if}
              </div>

              <PanelButton
                variant="primary"
                onclick={() => void simulation.finishSetupDestination()}
              >
                <i class="fas {activeDestination.icon}" aria-hidden="true"></i>
                {activeDestination.action}
              </PanelButton>
            </section>
          {/if}
          {#if simulation.accountSetup.isComplete}
            <div class="completion-message" role="status">
              <i class="fas fa-circle-check" aria-hidden="true"></i>
              <span>
                Setup prompts are finished. Construct remains the next
                destination.
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </Crossfade>
  </div>
</section>

<style>
  .app-frame {
    --simulation-blue: var(--prop-blue, #3b82f6);
    --simulation-red: var(--prop-red, #ef3340);

    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    flex-direction: column;
    background: var(--theme-panel-bg, rgba(15, 17, 24, 0.97));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-xl, 1.25rem);
  }

  .app-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.25rem;
    padding: 0.65rem clamp(0.75rem, 1.5vw, 1.4rem);
    background: rgba(6, 8, 13, 0.96);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .app-identity {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .app-mark {
    font-family: Georgia, serif;
    font-size: 1.1rem;
    font-style: italic;
    font-weight: 700;
  }

  .app-divider {
    width: 1px;
    height: 1.5rem;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .module-name {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .account-chip {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 13.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.45rem 0.7rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .account-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .account-chip:focus-visible,
  .start-choice:focus-visible,
  .sequence-cell:focus-visible {
    outline: 2px solid var(--simulation-blue);
    outline-offset: 2px;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    background: color-mix(in srgb, var(--theme-text, white) 8%, transparent);
    border: 1px dashed var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    border-radius: 50%;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 800;
  }

  .avatar.photo-complete {
    color: white;
    background: linear-gradient(135deg, var(--simulation-blue), #8b5cf6);
    border-style: solid;
  }

  .account-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    text-align: left;
  }

  .account-name,
  .account-status {
    display: inline-grid;
  }

  .account-name > span,
  .account-status > span {
    grid-area: 1 / 1;
  }

  .account-name {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .account-status {
    color: color-mix(in srgb, var(--simulation-blue) 68%, white);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .account-sizer {
    visibility: hidden;
  }

  .app-stage {
    position: relative;
    height: clamp(34rem, 68dvh, 54rem);
    min-height: 0;
    container-type: inline-size;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 18% 22%,
        color-mix(in srgb, var(--simulation-blue) 12%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 78% 74%,
        color-mix(in srgb, var(--simulation-red) 8%, transparent),
        transparent 24%
      ),
      #0d1018;
  }

  .scene {
    display: flex;
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
  }

  .construct-scene,
  .compose-scene,
  .reminder-scene {
    align-items: center;
    flex-direction: column;
    justify-content: center;
    gap: clamp(1rem, 3cqi, 2rem);
    padding: clamp(1rem, 4cqi, 3.5rem);
  }

  .scene-heading {
    text-align: center;
  }

  .scene-kicker {
    color: color-mix(in srgb, var(--simulation-blue) 70%, white);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .scene-heading h3,
  .guide-callout h3,
  .move-result h3,
  .profile-heading h3 {
    margin: 0.25rem 0 0;
    font-size: clamp(1.35rem, 3.2cqi, 2.35rem);
    line-height: 1.08;
  }

  .start-grid,
  .sequence-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: clamp(0.55rem, 1.5cqi, 1rem);
    width: min(100%, 64rem);
  }

  .start-choice,
  .sequence-cell {
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    gap: 0.65rem;
    min-height: 9rem;
    padding: 0.85rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .start-choice,
  button.sequence-cell {
    cursor: pointer;
    transition:
      transform var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .start-choice:hover,
  button.sequence-cell:hover {
    transform: translateY(-2px);
    background: color-mix(in srgb, var(--simulation-blue) 12%, transparent);
    border-color: var(--simulation-blue);
  }

  .start-glyph {
    position: relative;
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    color: color-mix(in srgb, var(--simulation-blue) 74%, white);
    background: color-mix(in srgb, var(--simulation-blue) 12%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--simulation-blue) 28%, transparent);
    border-radius: 50%;
  }

  .start-glyph > span {
    position: absolute;
    right: -0.15rem;
    bottom: -0.15rem;
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    color: #fff;
    background: #10131b;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .workspace-caption {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    text-align: center;
  }

  .guide-scene {
    position: relative;
    align-items: center;
    justify-content: center;
    padding: clamp(1rem, 4cqi, 3rem);
  }

  .guide-board {
    position: absolute;
    inset: 8%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    opacity: 0.32;
  }

  .guide-board span {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
  }

  .guide-board span:first-child {
    border-color: var(--simulation-blue);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--simulation-blue) 24%, transparent);
  }

  .guide-callout {
    position: relative;
    z-index: 1;
    width: min(100%, 28rem);
    padding: clamp(1rem, 3cqi, 2rem);
    text-align: center;
    background: var(--theme-panel-bg, rgba(15, 17, 24, 0.98));
    border: 1px solid
      color-mix(in srgb, var(--simulation-blue) 45%, transparent);
    border-radius: var(--radius-xl, 1.25rem);
    box-shadow: 0 1.25rem 4rem rgba(0, 0, 0, 0.42);
  }

  .guide-callout p,
  .move-result p {
    margin: 0.75rem 0 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
  }

  .sequence-cell {
    min-height: 11rem;
  }

  button.sequence-cell {
    border-style: dashed;
  }

  .start-cell {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 45%,
      transparent
    );
  }

  .empty-cell {
    opacity: 0.42;
  }

  .move-result,
  .persistent-path {
    width: min(100%, 42rem);
    box-sizing: border-box;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
  }

  .move-result {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: clamp(1rem, 3cqi, 1.5rem);
  }

  .result-icon {
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    flex-shrink: 0;
    color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 12%,
      transparent
    );
    border-radius: 50%;
  }

  .persistent-path {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(7rem, 0.8fr) auto;
    align-items: center;
    gap: 1rem;
    padding: clamp(1rem, 3cqi, 1.5rem);
  }

  .persistent-path > div:first-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
  }

  .persistent-path span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .persistent-path strong {
    font-size: var(--font-size-min, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .mini-progress {
    height: 0.45rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
    border-radius: 999px;
  }

  .mini-progress > span {
    display: block;
    height: 100%;
    background: var(--simulation-blue);
    border-radius: inherit;
  }

  .profile-scene {
    flex-direction: column;
    gap: 1rem;
    padding: clamp(1rem, 3cqi, 2.5rem);
  }

  .profile-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }

  .setup-destination {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: clamp(1rem, 2.5cqi, 1.5rem);
    background: var(--theme-panel-elevated-bg, rgba(22, 25, 36, 0.98));
    border: 1px solid
      color-mix(in srgb, var(--simulation-blue) 35%, transparent);
    border-radius: var(--radius-lg, 1rem);
  }

  .destination-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .destination-header h3 {
    margin: 0.25rem 0 0;
  }

  .destination-close {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
    cursor: pointer;
  }

  .destination-close:focus-visible {
    outline: 2px solid var(--simulation-blue);
    outline-offset: 2px;
  }

  .destination-preview {
    min-width: 0;
  }

  .sandbox-field {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .sandbox-field input {
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 0.9rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--simulation-blue);
    border-radius: var(--radius-md, 0.75rem);
    font: inherit;
  }

  .photo-picker-preview,
  .prop-drawer-preview,
  .theme-preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .photo-picker-preview span,
  .prop-drawer-preview span,
  .theme-choice {
    display: flex;
    min-height: 4.5rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .photo-picker-preview .chosen-photo,
  .prop-drawer-preview .chosen-prop,
  .theme-preview .deep-space {
    border-color: var(--simulation-blue);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--simulation-blue) 22%, transparent);
  }

  .photo-picker-preview i {
    font-size: 1.5rem;
  }

  .theme-choice {
    align-items: end;
    justify-content: start;
  }

  .theme-choice.deep-space {
    background: linear-gradient(145deg, #111827, #312e81);
  }

  .theme-choice.daylight {
    color: #111827;
    background: linear-gradient(145deg, #f8fafc, #bae6fd);
  }

  .theme-choice.ember {
    background: linear-gradient(145deg, #451a03, #dc2626);
  }

  .sandbox-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2rem;
    padding: 0.35rem 0.65rem;
    color: color-mix(in srgb, var(--simulation-blue) 68%, white);
    background: color-mix(in srgb, var(--simulation-blue) 10%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--simulation-blue) 24%, transparent);
    border-radius: 999px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
  }

  .completion-message {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 60%, white);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 24%, transparent);
    border-radius: var(--radius-md, 0.75rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
  }

  @media (max-width: 44rem) {
    .app-bar {
      min-height: 3.75rem;
      padding: 0.45rem 0.6rem;
    }

    .app-divider,
    .module-name,
    .account-name {
      display: none;
    }

    .account-chip {
      min-width: 0;
      padding: 0.35rem 0.5rem;
    }

    .account-status {
      min-width: 7.9rem;
    }

    .app-stage {
      height: 35rem;
    }

    .construct-scene,
    .compose-scene,
    .reminder-scene {
      justify-content: start;
      padding: 1rem;
    }

    .start-grid,
    .sequence-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .start-choice,
    .sequence-cell {
      min-height: 7.25rem;
    }

    .persistent-path {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .mini-progress {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .profile-scene {
      padding: 0.8rem;
    }
  }

  @media (max-height: 35rem) and (min-width: 48rem) {
    .app-bar {
      min-height: 3.2rem;
      padding-block: 0.25rem;
    }

    .app-stage {
      height: calc(100dvh - 5.4rem);
      min-height: 19rem;
    }

    .construct-scene,
    .compose-scene,
    .guide-scene,
    .reminder-scene {
      gap: 0.55rem;
      padding: 0.65rem;
    }

    .scene-heading h3,
    .guide-callout h3,
    .move-result h3 {
      font-size: 1.1rem;
    }

    .start-choice,
    .sequence-cell {
      min-height: 5.8rem;
    }

    .workspace-caption {
      display: none;
    }
  }

  @media (min-width: 105rem) {
    .app-stage {
      height: min(72dvh, 64rem);
    }

    .start-grid,
    .sequence-strip {
      width: min(100%, 88rem);
    }

    .start-choice,
    .sequence-cell {
      min-height: 11rem;
      font-size: 1rem;
    }

    .start-glyph {
      width: 4rem;
      height: 4rem;
    }
  }

  @media (min-width: 162.5rem) {
    .app-frame {
      height: 100%;
      border-radius: 2rem;
    }

    .app-bar {
      min-height: 7.5rem;
      padding-inline: 2.5rem;
    }

    .app-mark {
      font-size: 2rem;
    }

    .app-divider {
      height: 2.5rem;
    }

    .module-name,
    .account-name {
      font-size: 1.25rem;
    }

    .app-stage {
      height: auto;
      min-height: 0;
      flex: 1;
    }

    .account-chip {
      min-width: 23rem;
      min-height: 5rem;
      gap: 1rem;
      padding: 0.8rem 1.1rem;
      border-radius: 1rem;
    }

    .avatar {
      width: 3.5rem;
      height: 3.5rem;
      font-size: 1.25rem;
    }

    .account-status,
    .scene-kicker {
      font-size: 1rem;
    }

    .construct-scene,
    .compose-scene,
    .reminder-scene {
      gap: 3rem;
      padding: 5rem;
    }

    .scene-heading h3,
    .guide-callout h3,
    .move-result h3,
    .profile-heading h3 {
      font-size: 3.5rem;
    }

    .start-choice,
    .sequence-cell {
      min-height: 22rem;
      gap: 1.25rem;
      padding: 1.5rem;
      border-radius: 1.5rem;
      font-size: 1.4rem;
    }

    .start-grid,
    .sequence-strip {
      width: min(92%, 140rem);
      gap: 1.5rem;
    }

    .start-glyph {
      width: 6.5rem;
      height: 6.5rem;
      font-size: 1.75rem;
    }

    .start-glyph > span {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }

    .workspace-caption,
    .guide-callout p,
    .move-result p {
      font-size: 1.35rem;
    }

    .construct-scene :global(.guide-offer) {
      max-width: 100rem;
      gap: 2rem;
      padding: 1.5rem 2rem;
      border-radius: 1.5rem;
    }

    .construct-scene :global(.offer-title) {
      font-size: 2rem;
    }

    .construct-scene :global(.offer-description) {
      margin-top: 0.35rem;
      font-size: 1.35rem;
    }

    .construct-scene :global(.offer-actions) {
      gap: 1rem;
    }

    .construct-scene :global(.offer-actions .panel-btn),
    .guide-callout :global(.panel-btn),
    .reminder-scene :global(.panel-btn),
    .setup-destination :global(.panel-btn) {
      min-height: 4.5rem;
      padding: 1.1rem 1.5rem;
      font-size: 1.25rem;
    }

    .guide-callout {
      width: min(100%, 54rem);
      padding: 3rem;
      border-radius: 2rem;
    }

    .move-result,
    .persistent-path {
      width: min(100%, 72rem);
      padding: 2rem;
      border-radius: 1.5rem;
    }

    .persistent-path span {
      font-size: 1rem;
    }

    .persistent-path strong {
      font-size: 1.25rem;
    }

    .profile-scene {
      gap: 2rem;
      padding: 3rem;
    }

    .sandbox-badge,
    .completion-message,
    .sandbox-field,
    .photo-picker-preview span,
    .prop-drawer-preview span,
    .theme-choice {
      font-size: 1.1rem;
    }

    .setup-destination {
      gap: 1.5rem;
      padding: 2rem;
      border-radius: 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .account-chip,
    .start-choice,
    .sequence-cell {
      transition: none;
    }

    .start-choice:hover,
    button.sequence-cell:hover {
      transform: none;
    }
  }
</style>
