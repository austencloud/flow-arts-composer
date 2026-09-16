<script lang="ts">
  /**
   * Admin Migration Tool: Normalize Sequence Start Positions
   *
   * Browser-based tool to migrate local IndexedDB sequences to normalized format.
   * Access at: /admin/migrate-sequences
   */

  import { db } from "$lib/shared/persistence/database/tka-database";
  import { onMount } from "svelte";

  // Debug: Log database info
  console.log("🔍 Database version:", db.verno);
  console.log("🔍 Database name:", db.name);

  let status = $state<
    "idle" | "analyzing" | "migrating" | "complete" | "error"
  >("idle");
  let totalSequences = $state(0);
  let needsMigrationCount = $state(0);
  let alreadyCleanCount = $state(0);
  let migratedCount = $state(0);
  let errorCount = $state(0);
  let currentSequence = $state("");
  let errors = $state<string[]>([]);
  let migrationLog = $state<
    Array<{ id: string; word: string; before: number; after: number }>
  >([]);

  /**
   * Normalize sequence data - same logic as SequenceNormalizationService
   */
  function separateStepsFromStartPlacement(sequence: any) {
    // Modern format - already normalized
    if (sequence.startPlacement && Array.isArray(sequence.steps)) {
      const hasStartInBeats = sequence.steps.some(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );

      if (!hasStartInBeats) {
        return {
          steps: sequence.steps,
          startPlacement: sequence.startPlacement,
        };
      }
    }

    // Legacy format 2: startingPlacement field
    if (sequence.startingPlacement) {
      const steps = Array.isArray(sequence.steps)
        ? sequence.steps.filter(
            (beat: any) =>
              beat && beat.stepNumber !== 0 && !beat.isStartPlacement
          )
        : [];

      return {
        steps,
        startPlacement: sequence.startingPlacement,
      };
    }

    // Legacy format 1: Beat 0 in steps array
    if (Array.isArray(sequence.steps) && sequence.steps.length > 0) {
      const startPlacementStep = sequence.steps.find(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );

      if (startPlacementStep) {
        const steps = sequence.steps.filter(
          (step: any) => step && step.stepNumber !== 0 && !step.isStartPlacement
        );

        return {
          steps,
          startPlacement: startPlacementStep,
        };
      }
    }

    // No start position found - return as-is
    return {
      steps: sequence.steps || [],
      startPlacement: sequence.startPlacement || null,
    };
  }

  /**
   * Check if sequence needs migration
   */
  function needsMigration(sequence: any): boolean {
    // Has legacy startingPlacement field
    if (sequence.startingPlacement) {
      return true;
    }

    // Has beat 0 or isStartPlacement in steps array
    if (Array.isArray(sequence.steps)) {
      const hasStartInBeats = sequence.steps.some(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );
      if (hasStartInBeats) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze sequences without making changes
   */
  async function analyzeSequences() {
    status = "analyzing";
    errors = [];
    migrationLog = [];
    needsMigrationCount = 0;
    alreadyCleanCount = 0;

    try {
      const sequences = await db.sequences.toArray();
      totalSequences = sequences.length;

      console.log(`📊 Found ${sequences.length} total sequences in IndexedDB`);

      for (const sequence of sequences) {
        if (needsMigration(sequence)) {
          needsMigrationCount++;
          const normalized = separateStepsFromStartPlacement(sequence);
          migrationLog.push({
            id: sequence.id,
            word: sequence.word || sequence.name || "Untitled",
            before: sequence.steps?.length || 0,
            after: normalized.steps.length,
          });
        } else {
          alreadyCleanCount++;
        }
      }

      status = "idle";
    } catch (error: any) {
      status = "error";
      errors.push(`Analysis failed: ${error.message}`);
    }
  }

  /**
   * Run the actual migration
   */
  async function runMigration() {
    status = "migrating";
    errors = [];
    migratedCount = 0;
    errorCount = 0;

    try {
      const sequences = await db.sequences.toArray();

      for (const sequence of sequences) {
        if (needsMigration(sequence)) {
          currentSequence = sequence.word || sequence.name || sequence.id;

          try {
            const normalized = separateStepsFromStartPlacement(sequence);

            // Update the sequence
            await db.sequences.update(sequence.id, {
              steps: normalized.steps,
              startPlacement: normalized.startPlacement,
              startingPlacement: undefined, // Remove legacy field
            });

            migratedCount++;
          } catch (error: any) {
            errorCount++;
            errors.push(`Failed to migrate ${sequence.id}: ${error.message}`);
          }
        }
      }

      status = "complete";
    } catch (error: any) {
      status = "error";
      errors.push(`Migration failed: ${error.message}`);
    }
  }

  onMount(() => {
    analyzeSequences();
  });
</script>

<div class="migration-tool">
  <header>
    <h1>🔧 Sequence Migration Tool</h1>
    <p>Normalize start position data in local sequences</p>
  </header>

  <section class="status-card">
    <h2>Status</h2>

    {#if status === "analyzing"}
      <p class="analyzing">🔍 Analyzing sequences...</p>
    {:else if status === "idle"}
      <div class="stats">
        <div class="stat">
          <span class="label">Total Sequences:</span>
          <span class="value">{totalSequences}</span>
        </div>
        <div class="stat success">
          <span class="label">Already Clean:</span>
          <span class="value">{alreadyCleanCount}</span>
        </div>
        <div class="stat warning">
          <span class="label">Needs Migration:</span>
          <span class="value">{needsMigrationCount}</span>
        </div>
      </div>
    {:else if status === "migrating"}
      <p class="migrating">✍️ Migrating: {currentSequence}...</p>
      <p>Progress: {migratedCount} / {needsMigrationCount}</p>
    {:else if status === "complete"}
      <div class="stats success">
        <p>✅ Migration Complete!</p>
        <div class="stat">
          <span class="label">Migrated:</span>
          <span class="value">{migratedCount}</span>
        </div>
        <div class="stat error">
          <span class="label">Errors:</span>
          <span class="value">{errorCount}</span>
        </div>
      </div>
    {:else if status === "error"}
      <p class="error">❌ Migration failed</p>
    {/if}
  </section>

  {#if status === "idle" && needsMigrationCount > 0}
    <section class="preview">
      <h2>Sequences to Migrate</h2>
      <div class="sequence-list">
        {#each migrationLog as item}
          <div class="sequence-item">
            <span class="word">{item.word}</span>
            <span class="change"
              >{item.before} items → {item.after} steps + start position</span
            >
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if errors.length > 0}
    <section class="errors">
      <h2>Errors</h2>
      {#each errors as error}
        <div class="error-item">{error}</div>
      {/each}
    </section>
  {/if}

  <section class="actions">
    <button
      onclick={analyzeSequences}
      disabled={status === "analyzing" || status === "migrating"}
      class="analyze-btn"
    >
      🔍 Re-analyze
    </button>

    {#if needsMigrationCount > 0}
      <button
        onclick={runMigration}
        disabled={status !== "idle"}
        class="migrate-btn"
      >
        ✍️ Run Migration ({needsMigrationCount} sequences)
      </button>
    {/if}
  </section>

  <section class="info">
    <h3>What this does:</h3>
    <ul>
      <li>Separates start position from steps array</li>
      <li>
        Converts <code>startingPlacement</code> → <code>startPlacement</code>
      </li>
      <li>Removes beat 0 from steps array</li>
      <li>Preserves all other sequence data</li>
    </ul>
  </section>
</div>

<style>
  .migration-tool {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
  }

  h2 {
    font-size: 1.5rem;
    margin: 0 0 1rem 0;
  }

  h3 {
    font-size: 1.2rem;
    margin: 0 0 0.5rem 0;
  }

  section {
    background: #f5f5f5;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
  }

  .stat.success {
    background: #d4edda;
    color: #155724;
  }

  .stat.warning {
    background: #fff3cd;
    color: #856404;
  }

  .stat.error {
    background: #f8d7da;
    color: #721c24;
  }

  .label {
    font-weight: 600;
  }

  .value {
    font-size: 1.2rem;
  }

  .analyzing,
  .migrating {
    font-size: 1.2rem;
    color: #0066cc;
  }

  .sequence-list {
    max-height: 400px;
    overflow-y: auto;
    background: white;
    padding: 1rem;
    border-radius: 4px;
  }

  .sequence-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }

  .sequence-item:last-child {
    border-bottom: none;
  }

  .word {
    font-weight: 600;
  }

  .change {
    color: #666;
    font-size: 0.9rem;
  }

  .errors {
    background: #f8d7da;
  }

  .error-item {
    padding: 0.5rem;
    background: white;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    color: #721c24;
  }

  .actions {
    display: flex;
    gap: 1rem;
  }

  button {
    flex: 1;
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .analyze-btn {
    background: #0066cc;
    color: white;
  }

  .analyze-btn:hover:not(:disabled) {
    background: #0052a3;
  }

  .migrate-btn {
    background: #28a745;
    color: white;
  }

  .migrate-btn:hover:not(:disabled) {
    background: #218838;
  }

  .info {
    background: #e7f3ff;
  }

  .info ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .info li {
    margin-bottom: 0.5rem;
  }

  code {
    background: white;
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: monospace;
    color: #e83e8c;
  }
</style>
