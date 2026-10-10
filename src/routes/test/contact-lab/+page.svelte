<script lang="ts">
  import { onMount } from "svelte";
  import ContactLabPrototype from "#lib/features/contact-lab/components/ContactLabPrototype.svelte";
  import {
    buildContactPalmspinProfile,
    type ContactPalmspinProfile,
    type ContactTranslationIssue,
  } from "#lib/features/contact-lab/domain/contact-motion-profile.js";
  import { loadContactProofSequence } from "#lib/features/contact-lab/domain/contact-proof-sequence.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";

  let profile = $state<ContactPalmspinProfile | null>(null);
  let translationIssues = $state<readonly ContactTranslationIssue[]>([]);
  let loadError = $state<string | null>(null);

  onMount(() => {
    void loadProof();
  });

  async function loadProof(): Promise<void> {
    try {
      const sequence = await loadContactProofSequence();
      const result = buildContactPalmspinProfile(sequence);
      if (result.status === "unresolved") {
        translationIssues = result.issues;
        return;
      }
      profile = result.profile;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      loadError = "The contact proof could not load its source sequence.";
      getErrorHandler().showUserError({
        message: "Contact proof did not load",
        technicalDetails: error.message,
        error,
        severity: "error",
        context: {
          module: "contact-lab",
          tab: "motion-proof",
          action: "loadProofSequence",
        },
      });
    }
  }
</script>

<svelte:head>
  <title>Contact Lab Motion Proof | TKA</title>
  <meta
    name="description"
    content="Hand-level contact juggling motion proof for the Kinetic Alphabet."
  />
</svelte:head>

{#if profile}
  <ContactLabPrototype {profile} />
{:else if translationIssues.length > 0}
  <main class="proof-status">
    <p class="kicker">Contact Lab · Translation boundary</p>
    <h1>Unresolved contact motion</h1>
    <p>The source LOOP does not satisfy this palmspin profile.</p>
    <ul>
      {#each translationIssues as issue}
        <li><strong>{issue.code}</strong>: {issue.detail}</li>
      {/each}
    </ul>
  </main>
{:else if loadError}
  <main class="proof-status">
    <p class="kicker">Contact Lab · Load failure</p>
    <h1>Motion proof unavailable</h1>
    <p>{loadError}</p>
  </main>
{:else}
  <main class="proof-status" aria-busy="true">
    <p class="kicker">Contact Lab · Truth Sprint 01</p>
    <h1>Loading the source LOOP</h1>
  </main>
{/if}

<style>
  .proof-status {
    position: fixed;
    inset: 0;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.8rem;
    padding: 2rem;
    color: #f7f9ff;
    text-align: center;
    background: #070b14;
  }

  .kicker {
    margin: 0;
    color: #83adff;
    font-size: 0.78rem;
    font-weight: 760;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(1.8rem, 5vw, 4rem);
  }

  p,
  li {
    color: rgba(230, 236, 250, 0.76);
    font-size: max(var(--font-size-body, 16px), 1rem);
    line-height: 1.5;
  }

  ul {
    display: grid;
    gap: 0.55rem;
    max-width: 54rem;
    padding-left: 1.5rem;
    text-align: left;
  }
</style>
