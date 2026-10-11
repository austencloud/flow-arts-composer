<script lang="ts">
  import type { Festival } from "../../domain/models/festival";
  import type { UserFestivalTracker, TrackerStatus } from "../../domain/models/festival-tracker";
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";

  interface Props {
    festival: Festival;
    tracker: UserFestivalTracker | undefined;
  }
  const props: Props = $props();

  const { state: festivalState } = getFestivalContext();

  const STATUS_STEPS: { value: TrackerStatus; label: string }[] = [
    { value: "interested", label: "Interested" },
    { value: "applying", label: "Applying" },
    { value: "applied", label: "Applied" },
    { value: "accepted", label: "Accepted" },
    { value: "attending", label: "Attending" },
  ];

  const currentStatusIndex = $derived.by(() => {
    const t = props.tracker;
    return t ? STATUS_STEPS.findIndex(s => s.value === t.status) : -1;
  });

  // Initialize from tracker prop via $effect to keep in sync - access through props to track reactively
  let notes = $state("");
  let stipend = $state("");
  $effect(() => {
    notes = props.tracker?.notes ?? "";
    stipend = props.tracker?.stipendRequested != null ? String(props.tracker.stipendRequested) : "";
  });

  async function setStatus(status: TrackerStatus) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await festivalState.updateTracker(uid, props.festival.id, { status });
  }

  function isAppliedAs(role: "instructor" | "performer"): boolean {
    return props.tracker?.appliedAs?.includes(role) ?? false;
  }

  async function toggleAppliedAs(role: "instructor" | "performer") {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const current = props.tracker?.appliedAs ?? [];
    const next = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    await festivalState.updateTracker(uid, props.festival.id, { appliedAs: next });
  }

  function isWorkshopSubmitted(title: string): boolean {
    return props.tracker?.workshopsSubmitted?.includes(title) ?? false;
  }

  async function toggleWorkshop(title: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const current = props.tracker?.workshopsSubmitted ?? [];
    const next = current.includes(title)
      ? current.filter(t => t !== title)
      : [...current, title];
    await festivalState.updateTracker(uid, props.festival.id, { workshopsSubmitted: next });
  }

  async function saveNotes() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await festivalState.updateTracker(uid, props.festival.id, { notes });
  }

  async function saveStipend() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const value = stipend !== "" ? Number(stipend) : undefined;
    await festivalState.updateTracker(uid, props.festival.id, { stipendRequested: value });
  }
</script>

<div class="tracker-controls">
  <h3 class="section-title">My Application</h3>

  <!-- Status progression -->
  <div class="status-row" role="group" aria-label="Application status">
    {#each STATUS_STEPS as step, i}
      {@const isPast = i < currentStatusIndex}
      {@const isCurrent = i === currentStatusIndex}
      <button
        class="status-btn"
        class:past={isPast}
        class:current={isCurrent}
        onclick={() => setStatus(step.value)}
        aria-pressed={isCurrent}
        aria-label={`Set status to ${step.label}`}
      >
        {#if isPast}
          <i class="fas fa-check check-icon" aria-hidden="true"></i>
        {/if}
        {step.label}
      </button>
      {#if i < STATUS_STEPS.length - 1}
        <span class="step-arrow" aria-hidden="true">›</span>
      {/if}
    {/each}
  </div>

  <!-- Declined is a separate action -->
  {#if props.tracker && props.tracker.status !== "declined"}
    <button
      class="decline-btn"
      onclick={() => setStatus("declined")}
      aria-label="Mark as declined"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
      Mark declined
    </button>
  {:else if props.tracker?.status === "declined"}
    <button
      class="decline-btn active"
      onclick={() => setStatus("interested")}
      aria-label="Clear declined status"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
      Declined - click to reset
    </button>
  {/if}

  <!-- Applied as -->
  <div class="field-group">
    <span class="field-label">Applying as</span>
    <div class="toggle-row">
      <button
        class="toggle-btn"
        class:active={isAppliedAs("instructor")}
        onclick={() => toggleAppliedAs("instructor")}
        aria-pressed={isAppliedAs("instructor")}
      >
        <i class="fas fa-chalkboard-teacher" aria-hidden="true"></i>
        Instructor
      </button>
      <button
        class="toggle-btn"
        class:active={isAppliedAs("performer")}
        onclick={() => toggleAppliedAs("performer")}
        aria-pressed={isAppliedAs("performer")}
      >
        <i class="fas fa-theater-masks" aria-hidden="true"></i>
        Performer
      </button>
    </div>
  </div>

  <!-- Stipend requested -->
  <div class="field-group">
    <label class="field-label" for="stipend-input">Stipend requested ($)</label>
    <input
      id="stipend-input"
      class="text-input"
      type="number"
      placeholder="e.g. 200"
      min="0"
      bind:value={stipend}
      onblur={saveStipend}
    />
  </div>

  <!-- Notes -->
  <div class="field-group">
    <label class="field-label" for="notes-input">Private notes</label>
    <textarea
      id="notes-input"
      class="text-area"
      placeholder="Application notes, contacts, reminders..."
      rows="3"
      bind:value={notes}
      onblur={saveNotes}
    ></textarea>
  </div>

  <!-- Workshops submitted -->
  {#if festivalState.portfolio && festivalState.portfolio.classes.length > 0}
    <div class="field-group">
      <span class="field-label">Workshops submitted</span>
      <div class="workshop-list">
        {#each festivalState.portfolio.classes as workshop}
          <button
            class="toggle-btn workshop-btn"
            class:active={isWorkshopSubmitted(workshop.title)}
            onclick={() => toggleWorkshop(workshop.title)}
            aria-pressed={isWorkshopSubmitted(workshop.title)}
          >
            {#if isWorkshopSubmitted(workshop.title)}
              <i class="fas fa-check-circle" aria-hidden="true"></i>
            {:else}
              <i class="far fa-circle" aria-hidden="true"></i>
            {/if}
            {workshop.title}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .tracker-controls {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* Status progression */
  .status-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .status-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: transparent;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.45));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .status-btn:hover {
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #ffffff);
  }

  .status-btn.past {
    border-color: var(--semantic-success, #22c55e);
    color: var(--semantic-success, #22c55e);
    opacity: 0.6;
  }

  .status-btn.current {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #ffffff);
    font-weight: 600;
  }

  .check-icon {
    font-size: 10px;
  }

  .step-arrow {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.3));
    font-size: 16px;
    line-height: 1;
    user-select: none;
  }

  /* Decline button */
  .decline-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    background: transparent;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    align-self: flex-start;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .decline-btn:hover,
  .decline-btn.active {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    color: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
  }

  /* Fields */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .toggle-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: transparent;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .toggle-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, #ffffff);
  }

  .toggle-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #ffffff);
  }

  .workshop-btn {
    font-size: var(--font-size-compact, 12px);
    padding: 5px 12px;
  }

  .workshop-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }

  .text-input,
  .text-area {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    padding: 10px 12px;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
    font-family: inherit;
    resize: vertical;
  }

  .text-input {
    max-width: 160px;
    resize: none;
  }

  .text-input:focus,
  .text-area:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
  }

  .text-input::placeholder,
  .text-area::placeholder {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.35));
  }

  /* Number input: remove spinners */
  .text-input[type="number"]::-webkit-inner-spin-button,
  .text-input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .text-input[type="number"] {
    appearance: textfield;
    -moz-appearance: textfield;
  }
</style>
