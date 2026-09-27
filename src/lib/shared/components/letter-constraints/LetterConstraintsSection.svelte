<!--
LetterConstraintsSection.svelte - Section for letter must-contain/must-not-contain constraints
50px touch targets, modern Material 2026 design
-->
<script lang="ts">
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import LetterChip from "./LetterChip.svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  let {
    mustContainLetters,
    mustNotContainLetters,
    onMustContainChange,
    onMustNotContainChange,
  } = $props<{
    mustContainLetters: Letter[];
    mustNotContainLetters: Letter[];
    onMustContainChange: (letters: Letter[]) => void;
    onMustNotContainChange: (letters: Letter[]) => void;
  }>();

  let isExpanded = $state(false);
  let activeTab = $state<"include" | "exclude">("include");

  // All kinetic alphabet letters organized by type
  const letterGroups = [
    {
      nameKey: "letter_constraints_type_1",
      letters: [
        Letter.A,
        Letter.B,
        Letter.C,
        Letter.D,
        Letter.E,
        Letter.F,
        Letter.G,
        Letter.H,
        Letter.I,
        Letter.J,
        Letter.K,
        Letter.L,
        Letter.M,
        Letter.N,
        Letter.O,
        Letter.P,
        Letter.Q,
        Letter.R,
        Letter.S,
        Letter.T,
        Letter.U,
        Letter.V,
      ],
    },
    {
      nameKey: "letter_constraints_type_2",
      letters: [
        Letter.W,
        Letter.X,
        Letter.Y,
        Letter.Z,
        Letter.SIGMA,
        Letter.DELTA,
        Letter.THETA,
        Letter.OMEGA,
        Letter.MU,
        Letter.NU,
      ],
    },
    {
      nameKey: "letter_constraints_type_3",
      letters: [
        Letter.W_DASH,
        Letter.X_DASH,
        Letter.Y_DASH,
        Letter.Z_DASH,
        Letter.SIGMA_DASH,
        Letter.DELTA_DASH,
        Letter.THETA_DASH,
        Letter.OMEGA_DASH,
      ],
    },
    {
      nameKey: "letter_constraints_type_4",
      letters: [Letter.PHI, Letter.PSI, Letter.LAMBDA],
    },
    {
      nameKey: "letter_constraints_type_5",
      letters: [Letter.PHI_DASH, Letter.PSI_DASH, Letter.LAMBDA_DASH],
    },
    {
      nameKey: "letter_constraints_type_6",
      letters: [
        Letter.ALPHA,
        Letter.BETA,
        Letter.GAMMA,
        Letter.ZETA,
        Letter.ETA,
        Letter.TAU,
        Letter.TERRA,
      ],
    },
  ];

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }

  function handleToggleMustContain(letter: Letter) {
    const current = [...mustContainLetters];
    const index = current.indexOf(letter);

    if (index >= 0) {
      // Deselect if already selected
      current.splice(index, 1);
    } else {
      // LIMIT: Only allow ONE letter in must-contain
      // Clear any existing selection and add this one
      const updated = [letter];

      // Remove from must-not-contain if present
      const excludeIndex = mustNotContainLetters.indexOf(letter);
      if (excludeIndex >= 0) {
        const excludeUpdated = [...mustNotContainLetters];
        excludeUpdated.splice(excludeIndex, 1);
        onMustNotContainChange(excludeUpdated);
      }

      onMustContainChange(updated);
      return;
    }

    onMustContainChange(current);
  }

  function handleToggleMustNotContain(letter: Letter) {
    const current = [...mustNotContainLetters];
    const index = current.indexOf(letter);

    if (index >= 0) {
      current.splice(index, 1);
    } else {
      // Remove from must-contain if present
      const includeIndex = mustContainLetters.indexOf(letter);
      if (includeIndex >= 0) {
        const updated = [...mustContainLetters];
        updated.splice(includeIndex, 1);
        onMustContainChange(updated);
      }
      current.push(letter);
    }

    onMustNotContainChange(current);
  }

  const totalConstraints = $derived(
    mustContainLetters.length + mustNotContainLetters.length
  );

  const summaryText = $derived.by(() => {
    if (totalConstraints === 0) return tDynamic("letter_constraints_none");
    const parts: string[] = [];
    if (mustContainLetters.length > 0) {
      parts.push(`+${mustContainLetters.length}`);
    }
    if (mustNotContainLetters.length > 0) {
      parts.push(`-${mustNotContainLetters.length}`);
    }
    return parts.join(" / ");
  });
</script>

<section class="letter-section">
  <button
    class="section-header"
    onclick={toggleExpanded}
    aria-expanded={isExpanded}
    aria-controls="letter-constraints-content"
  >
    <div class="header-content">
      <h3 class="section-title">{tDynamic("letter_constraints_heading")}</h3>
      <p class="section-description">
        {tDynamic("letter_constraints_description")}
      </p>
    </div>
    <div class="header-value">
      {#if totalConstraints > 0}
        <span class="value-badge">{summaryText}</span>
      {:else}
        <span class="value-any">{tDynamic("letter_constraints_none")}</span>
      {/if}
      <svg
        class="chevron"
        class:expanded={isExpanded}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  </button>

  {#if isExpanded}
    <div id="letter-constraints-content" class="section-content">
      <!-- Tab switcher -->
      <div class="tab-switcher">
        <button
          class="tab-button"
          class:active={activeTab === "include"}
          onclick={() => (activeTab = "include")}
        >
          <span class="tab-icon">+</span>
          {tDynamic("letter_constraints_must_include")}
          {#if mustContainLetters.length > 0}
            <span class="tab-count">{mustContainLetters.length}</span>
          {/if}
        </button>
        <button
          class="tab-button exclude"
          class:active={activeTab === "exclude"}
          onclick={() => (activeTab = "exclude")}
          disabled
          title={tDynamic("letter_constraints_coming_soon")}
        >
          <span class="tab-icon">−</span>
          {tDynamic("letter_constraints_must_exclude")}
          {#if mustNotContainLetters.length > 0}
            <span class="tab-count">{mustNotContainLetters.length}</span>
          {/if}
        </button>
      </div>

      <!-- Letter groups -->
      <div class="letter-groups">
        {#each letterGroups as group}
          <div class="letter-group">
            <h4 class="group-title">{tDynamic(group.nameKey)}</h4>
            <div class="letter-grid">
              {#each group.letters as letter}
                {#if activeTab === "include"}
                  <LetterChip
                    {letter}
                    isSelected={mustContainLetters.includes(letter)}
                    mode="include"
                    onClick={() => handleToggleMustContain(letter)}
                  />
                {:else}
                  <LetterChip
                    {letter}
                    isSelected={mustNotContainLetters.includes(letter)}
                    mode="exclude"
                    onClick={() => handleToggleMustNotContain(letter)}
                  />
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Selected summary -->
      {#if mustContainLetters.length > 0 || mustNotContainLetters.length > 0}
        <div class="selection-summary">
          {#if mustContainLetters.length > 0}
            <div class="summary-row include">
              <span class="summary-label"
                >{tDynamic("letter_constraints_include_label")}</span
              >
              <span class="summary-letters">
                {mustContainLetters.map((l: Letter) => l.toString()).join(", ")}
              </span>
            </div>
          {/if}
          {#if mustNotContainLetters.length > 0}
            <div class="summary-row exclude">
              <span class="summary-label"
                >{tDynamic("letter_constraints_exclude_label")}</span
              >
              <span class="summary-letters">
                {mustNotContainLetters
                  .map((l: Letter) => l.toString())
                  .join(", ")}
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .letter-section {
    background: var(--theme-card-bg);
  }

  .section-header {
    width: 100%;
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    transition: background var(--duration-normal) ease;
    text-align: left;
  }

  .section-header:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
  }

  .section-header:active {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .section-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin: 0 0 4px 0;
    color: white;
  }

  .section-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    margin: 0;
  }

  .header-value {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .value-badge {
    padding: 6px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.2));
    border-radius: 16px;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .value-any {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .chevron {
    width: 24px;
    height: 24px;
    transition: transform var(--duration-normal) ease;
  }

  .chevron.expanded {
    transform: rotate(180deg);
  }

  .section-content {
    padding: 0 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tab-switcher {
    display: flex;
    gap: 8px;
  }

  .tab-button {
    flex: 1;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;

    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 12px;

    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-sm);
    font-weight: 600;

    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .tab-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
  }

  .tab-button.active {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.6);
    color: white;
  }

  .tab-button.exclude.active {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.6);
  }

  .tab-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: var(--theme-card-bg);
  }

  .tab-icon {
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .tab-count {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.2));
    padding: 2px 8px;
    border-radius: 10px;
    font-size: var(--font-size-compact);
  }

  .letter-groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 300px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .letter-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-title {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .letter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
    gap: 8px;
  }

  .selection-summary {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact);
  }

  .summary-label {
    font-weight: 600;
    min-width: 60px;
  }

  .summary-row.include .summary-label {
    color: #4ade80;
  }

  .summary-row.exclude .summary-label {
    color: var(--semantic-error);
  }

  .summary-letters {
    color: var(--theme-text);
    font-family: monospace;
    letter-spacing: 0.05em;
  }

  /* Mobile responsiveness */
  @media (max-width: 380px) {
    .section-header {
      padding: 14px 20px;
    }

    .section-content {
      padding: 0 20px 16px;
      gap: 12px;
    }

    .tab-button {
      padding: 10px 12px;
      font-size: var(--font-size-compact);
    }
  }
</style>
