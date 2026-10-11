<script lang="ts">
  import { Timestamp } from "firebase/firestore";
  import { submit as submitFestival } from "../../services/festival-submission-reviewer";
  import { getGeocodingService } from "#lib/features/community/get-geocoding-service.js";
  import { auth } from "#lib/shared/auth/firebase.js";
  import { getFestivalContext } from "../../context/festival-context";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";

  // Destructure as festivalState to avoid conflict with Svelte 5 $state rune
  const { state: festivalState } = getFestivalContext();

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  const { open, onclose }: Props = $props();

  // Services
  const geocodingService = getGeocodingService();

  // Form fields
  let name = $state("");
  let city = $state("");
  let country = $state("");
  let venue = $state("");
  let startDate = $state("");
  let endDate = $state("");
  let websiteUrl = $state("");
  let applicationUrl = $state("");
  let description = $state("");
  let tagsInput = $state("");
  let seekingInstructors = $state(false);
  let seekingPerformers = $state(false);

  // Form state
  let isSubmitting = $state(false);
  let submitError = $state("");
  let submitSuccess = $state(false);
  let validationErrors = $state<Record<string, string>>({});

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = "Festival name is required.";
    if (!city.trim()) errors.city = "City is required.";
    if (!country.trim()) errors.country = "Country is required.";
    if (!startDate) errors.startDate = "Start date is required.";
    if (!endDate) errors.endDate = "End date is required.";
    else if (endDate < startDate) errors.endDate = "End date must be after start date.";
    if (!websiteUrl.trim()) {
      errors.websiteUrl = "Website URL is required.";
    } else {
      try {
        new URL(websiteUrl.trim());
      } catch {
        errors.websiteUrl = "Enter a valid URL (include https://).";
      }
    }
    if (applicationUrl.trim()) {
      try {
        new URL(applicationUrl.trim());
      } catch {
        errors.applicationUrl = "Enter a valid URL (include https://).";
      }
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    submitError = "";
    if (!validate()) return;

    const uid = auth.currentUser?.uid;
    if (!uid) {
      submitError = "You need to be signed in to submit a festival.";
      return;
    }

    isSubmitting = true;

    try {
      // Geocode the city + country into coordinates. Falls back to (0, 0) if
      // the Maps API key isn't configured - the moderator can correct it later.
      const coords = await geocodingService.forwardGeocode(city.trim(), country.trim())
        ?? { lat: 0, lng: 0 };

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await submitFestival({
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        venue: venue.trim() || undefined,
        dates: {
          start: Timestamp.fromDate(new Date(startDate)),
          end: Timestamp.fromDate(new Date(endDate)),
        },
        websiteUrl: websiteUrl.trim(),
        applicationUrl: applicationUrl.trim() || undefined,
        description: description.trim() || undefined,
        seekingInstructors,
        seekingPerformers,
        tags,
        submittedBy: uid,
        // Coordinates aren't part of FestivalSubmission but the form collects
        // them so the reviewer's approve() can use them in the future.
        // For now they're attached as extra metadata on the submission doc.
        ...({ coordinates: coords } as object),
      });

      submitSuccess = true;
    } catch (err) {
      submitError = err instanceof Error ? err.message : "Submission failed. Check your connection and try again.";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<BaseModal
  {open}
  onclose={() => onclose()}
  size="fit"
  animation="pop"
  labelledBy="submit-festival-title"
>
  {#snippet header()}
    {#if !submitSuccess}
      <ModalHeader
        title="Submit a festival"
        icon="fa-paper-plane"
        iconColor="#22c55e"
        onClose={() => onclose()}
        id="submit-festival-title"
      />
    {/if}
  {/snippet}

  {#if submitSuccess}
    <div class="success-state" data-animate="2">
      <div class="success-icon">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
      </div>
      <h2>Festival submitted</h2>
      <p>Thanks. We'll review it and add it to the directory soon.</p>
      <button type="button" class="done-btn" onclick={onclose}>Done</button>
    </div>
  {:else}
    <div class="form-body" data-animate="3">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <form onsubmit={(e) => e.preventDefault()} onkeydown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          handleSubmit();
        }
      }}>

        <!-- Name -->
        <div class="field">
          <label for="sf-name">Festival name <span class="required">*</span></label>
          <input
            id="sf-name"
            type="text"
            bind:value={name}
            placeholder="e.g. Fire Groove Festival"
            class:error={!!validationErrors.name}
          />
          {#if validationErrors.name}
            <span class="field-error">{validationErrors.name}</span>
          {/if}
        </div>

        <!-- City + Country -->
        <div class="field-row">
          <div class="field">
            <label for="sf-city">City <span class="required">*</span></label>
            <input
              id="sf-city"
              type="text"
              bind:value={city}
              placeholder="Portland"
              class:error={!!validationErrors.city}
            />
            {#if validationErrors.city}
              <span class="field-error">{validationErrors.city}</span>
            {/if}
          </div>

          <div class="field">
            <label for="sf-country">Country <span class="required">*</span></label>
            <input
              id="sf-country"
              type="text"
              bind:value={country}
              placeholder="USA"
              class:error={!!validationErrors.country}
            />
            {#if validationErrors.country}
              <span class="field-error">{validationErrors.country}</span>
            {/if}
          </div>
        </div>

        <!-- Venue (optional) -->
        <div class="field">
          <label for="sf-venue">Venue <span class="optional">(optional)</span></label>
          <input
            id="sf-venue"
            type="text"
            bind:value={venue}
            placeholder="e.g. Oaks Park"
          />
        </div>

        <!-- Dates -->
        <div class="field-row">
          <div class="field">
            <label for="sf-start">Start date <span class="required">*</span></label>
            <input
              id="sf-start"
              type="date"
              bind:value={startDate}
              class:error={!!validationErrors.startDate}
            />
            {#if validationErrors.startDate}
              <span class="field-error">{validationErrors.startDate}</span>
            {/if}
          </div>

          <div class="field">
            <label for="sf-end">End date <span class="required">*</span></label>
            <input
              id="sf-end"
              type="date"
              bind:value={endDate}
              class:error={!!validationErrors.endDate}
            />
            {#if validationErrors.endDate}
              <span class="field-error">{validationErrors.endDate}</span>
            {/if}
          </div>
        </div>

        <!-- Website URL -->
        <div class="field">
          <label for="sf-website">Website <span class="required">*</span></label>
          <input
            id="sf-website"
            type="url"
            bind:value={websiteUrl}
            placeholder="https://myfestival.com"
            class:error={!!validationErrors.websiteUrl}
          />
          {#if validationErrors.websiteUrl}
            <span class="field-error">{validationErrors.websiteUrl}</span>
          {/if}
        </div>

        <!-- Application URL (optional) -->
        <div class="field">
          <label for="sf-apply">Application URL <span class="optional">(optional)</span></label>
          <input
            id="sf-apply"
            type="url"
            bind:value={applicationUrl}
            placeholder="https://myfestival.com/apply"
            class:error={!!validationErrors.applicationUrl}
          />
          {#if validationErrors.applicationUrl}
            <span class="field-error">{validationErrors.applicationUrl}</span>
          {/if}
        </div>

        <!-- Description (optional) -->
        <div class="field">
          <label for="sf-desc">Description <span class="optional">(optional)</span></label>
          <textarea
            id="sf-desc"
            bind:value={description}
            rows="3"
            placeholder="A few sentences about the event, vibe, what to expect..."
          ></textarea>
        </div>

        <!-- Tags (optional) -->
        <div class="field">
          <label for="sf-tags">Tags <span class="optional">(optional, comma-separated)</span></label>
          <input
            id="sf-tags"
            type="text"
            bind:value={tagsInput}
            placeholder="fire, flow arts, poi, staves"
          />
        </div>

        <!-- Seeking toggles -->
        <div class="toggles-row">
          <button
            type="button"
            class="toggle-btn"
            class:active={seekingInstructors}
            onclick={() => (seekingInstructors = !seekingInstructors)}
            aria-pressed={seekingInstructors}
          >
            <i class="fas fa-chalkboard-teacher" aria-hidden="true"></i>
            Seeking instructors
          </button>

          <button
            type="button"
            class="toggle-btn"
            class:active={seekingPerformers}
            onclick={() => (seekingPerformers = !seekingPerformers)}
            aria-pressed={seekingPerformers}
          >
            <i class="fas fa-fire" aria-hidden="true"></i>
            Seeking performers
          </button>
        </div>

        {#if submitError}
          <div class="submit-error" role="alert">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            {submitError}
          </div>
        {/if}
      </form>
    </div>
  {/if}

  {#snippet footer()}
    {#if !submitSuccess}
      <ModalFooter align="end">
        <button class="secondary" onclick={onclose} disabled={isSubmitting}>
          Cancel
        </button>
        <button class="primary" onclick={handleSubmit} disabled={isSubmitting}>
          {#if isSubmitting}
            <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
            Submitting application...
          {:else}
            <i class="fas fa-paper-plane" aria-hidden="true"></i>
            Submit festival
          {/if}
        </button>
      </ModalFooter>
    {/if}
  {/snippet}
</BaseModal>

<style>

  .form-body {
    padding: 20px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  label {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
  }

  .required {
    color: var(--semantic-error, #ef4444);
  }

  .optional {
    color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
  }

  input[type="text"],
  input[type="url"],
  input[type="date"],
  textarea {
    width: 100%;
    padding: 9px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    font-family: inherit;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }

  input[type="date"] {
    color-scheme: dark;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--theme-text-tertiary, rgba(255, 255, 255, 0.35));
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--theme-accent, #3b82f6);
  }

  input.error {
    border-color: var(--semantic-error, #ef4444);
  }

  textarea {
    resize: vertical;
    min-height: 72px;
  }

  .field-error {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
  }


  .toggles-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .toggle-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 15%, transparent);
    border-color: var(--theme-accent, #3b82f6);
    color: var(--theme-accent, #3b82f6);
  }


  .submit-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md, 8px);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
  }


  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px 24px;
    text-align: center;
  }

  .success-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(34, 197, 94, 0.12);
    border-radius: 50%;
    color: var(--semantic-success, #22c55e);
    font-size: 30px;
  }

  .success-state h2 {
    margin: 0;
    font-size: var(--font-size-xl, 20px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .success-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    max-width: 320px;
  }

  /* ---- Done button (success state) ---- */

  .done-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: var(--radius-md, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    min-height: 40px;
    background: var(--theme-accent, #3b82f6);
    border: none;
    color: #ffffff;
    transition: background 0.15s ease;
  }

  .done-btn:hover {
    background: var(--theme-accent-hover, #2563eb);
  }


  @media (prefers-reduced-motion: reduce) {
    .toggle-btn,
    .done-btn,
    input,
    textarea {
      transition: none;
    }
  }
</style>
