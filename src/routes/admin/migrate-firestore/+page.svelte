<script lang="ts">
  /**
   * Firestore Sequence Migration Tool
   *
   * Migrates sequences stored in Firebase Firestore at users/{uid}/sequences
   * to normalize start position data.
   */

  import { getAuthSync, getFirestoreInstance } from "$lib/shared/auth/firebase";
  import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
  import { onMount } from "svelte";

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
  let userId = $state<string | null>(null);

  /**
   * Normalize sequence data
   */
  function separateStepsFromStartPlacement(sequence: any) {
    if (sequence.startPlacement && Array.isArray(sequence.steps)) {
      const hasStartInBeats = sequence.steps.some(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );
      if (!hasStartInBeats) {
        return { steps: sequence.steps, startPlacement: sequence.startPlacement };
      }
    }

    if (sequence.startingPlacement) {
      const steps = Array.isArray(sequence.steps)
        ? sequence.steps.filter(
            (beat: any) =>
              beat && beat.stepNumber !== 0 && !beat.isStartPlacement
          )
        : [];
      return { steps, startPlacement: sequence.startingPlacement };
    }

    if (Array.isArray(sequence.steps) && sequence.steps.length > 0) {
      const startPlacementStep = sequence.steps.find(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );
      if (startPlacementStep) {
        const steps = sequence.steps.filter(
          (step: any) => step && step.stepNumber !== 0 && !step.isStartPlacement
        );
        return { steps, startPlacement: startPlacementStep };
      }
    }

    return {
      steps: sequence.steps || [],
      startPlacement: sequence.startPlacement || null,
    };
  }

  function needsMigration(sequence: any): boolean {
    if (sequence.startingPlacement) return true;
    if (Array.isArray(sequence.steps)) {
      return sequence.steps.some(
        (beat: any) => beat?.stepNumber === 0 || beat?.isStartPlacement === true
      );
    }
    return false;
  }

  async function analyzeSequences() {
    const user = getAuthSync().currentUser;
    if (!user) {
      errors = ["You must be logged in to run this migration"];
      status = "error";
      return;
    }

    status = "analyzing";
    errors = [];
    migrationLog = [];
    needsMigrationCount = 0;
    alreadyCleanCount = 0;
    userId = user.uid;

    try {
      const firestore = await getFirestoreInstance();
      console.log(
        `🔍 Fetching sequences from Firestore for user ${user.uid}...`
      );
      const sequencesRef = collection(firestore, `users/${user.uid}/sequences`);
      const snapshot = await getDocs(sequencesRef);

      totalSequences = snapshot.size;
      console.log(`📊 Found ${snapshot.size} sequences in Firestore`);

      for (const docSnapshot of snapshot.docs) {
        const sequence = docSnapshot.data();
        if (needsMigration(sequence)) {
          needsMigrationCount++;
          const normalized = separateStepsFromStartPlacement(sequence);
          migrationLog.push({
            id: docSnapshot.id,
            word: sequence.word || sequence.name || "Untitled",
            before: sequence.steps?.length || 0,
            after: normalized.steps.length,
          });
        } else {
          alreadyCleanCount++;
        }
      }

      status = "idle";
      console.log(
        `✅ Analysis complete: ${needsMigrationCount} need migration, ${alreadyCleanCount} already clean`
      );
    } catch (error: any) {
      status = "error";
      errors.push(`Analysis failed: ${error.message}`);
      console.error("❌ Analysis error:", error);
    }
  }

  async function runMigration() {
    const user = getAuthSync().currentUser;
    if (!user) {
      errors = ["You must be logged in"];
      status = "error";
      return;
    }

    status = "migrating";
    errors = [];
    migratedCount = 0;
    errorCount = 0;

    try {
      const firestore = await getFirestoreInstance();
      console.log(`✍️  Starting migration for user ${user.uid}...`);
      const sequencesRef = collection(firestore, `users/${user.uid}/sequences`);
      const snapshot = await getDocs(sequencesRef);

      for (const docSnapshot of snapshot.docs) {
        const sequence = docSnapshot.data();
        if (needsMigration(sequence)) {
          currentSequence = sequence.word || sequence.name || docSnapshot.id;

          try {
            const normalized = separateStepsFromStartPlacement(sequence);
            const docRef = doc(
              firestore,
              `users/${user.uid}/sequences/${docSnapshot.id}`
            );

            await updateDoc(docRef, {
              steps: normalized.steps,
              startPlacement: normalized.startPlacement,
              startingPlacement: null, // Remove legacy field
            });

            migratedCount++;
            console.log(`✅ Migrated: ${currentSequence}`);
          } catch (error: any) {
            errorCount++;
            errors.push(
              `Failed to migrate ${docSnapshot.id}: ${error.message}`
            );
            console.error(`❌ Migration error for ${docSnapshot.id}:`, error);
          }
        }
      }

      status = "complete";
      console.log(
        `✅ Migration complete: ${migratedCount} migrated, ${errorCount} errors`
      );
    } catch (error: any) {
      status = "error";
      errors.push(`Migration failed: ${error.message}`);
      console.error("❌ Migration failed:", error);
    }
  }

  onMount(() => {
    // Wait for auth to be ready
    const unsubscribe = getAuthSync().onAuthStateChanged((user) => {
      if (user) {
        analyzeSequences();
      } else {
        errors = ["Please log in to use this tool"];
        status = "error";
      }
    });

    return unsubscribe;
  });
</script>

<div class="migration-tool">
  <header>
    <h1>🔧 Firestore Sequence Migration</h1>
    <p>Normalize start position data in Firebase Firestore</p>
    {#if userId}
      <p class="user-id">User ID: <code>{userId}</code></p>
    {/if}
  </header>

  <section class="status-card">
    <h2>Status</h2>

    {#if status === "analyzing"}
      <p class="analyzing">🔍 Analyzing Firestore sequences...</p>
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
        {#if errorCount > 0}
          <div class="stat error">
            <span class="label">Errors:</span>
            <span class="value">{errorCount}</span>
          </div>
        {/if}
      </div>
    {:else if status === "error"}
      <p class="error">❌ Error occurred</p>
    {/if}
  </section>

  {#if status === "idle" && needsMigrationCount > 0}
    <section class="preview">
      <h2>Sequences to Migrate ({migrationLog.length})</h2>
      <div class="sequence-list">
        {#each migrationLog.slice(0, 50) as item}
          <div class="sequence-item">
            <span class="word">{item.word}</span>
            <span class="change"
              >{item.before} items → {item.after} steps + start</span
            >
          </div>
        {/each}
        {#if migrationLog.length > 50}
          <p class="more">...and {migrationLog.length - 50} more</p>
        {/if}
      </div>
    </section>
  {/if}

  {#if errors.length > 0}
    <section class="errors">
      <h2>Errors ({errors.length})</h2>
      {#each errors.slice(0, 10) as error}
        <div class="error-item">{error}</div>
      {/each}
      {#if errors.length > 10}
        <p>...and {errors.length - 10} more errors</p>
      {/if}
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
      <li>Migrates sequences in Firebase Firestore (not IndexedDB)</li>
      <li>Separates start position from steps array</li>
      <li>
        Converts <code>startingPlacement</code> → <code>startPlacement</code>
      </li>
      <li>Removes beat 0 from steps array</li>
      <li>Updates at <code>users/{"{uid}"}/sequences</code></li>
    </ul>
  </section>
</div>

<style>
  .migration-tool {
    max-width: 900px;
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
    color: #1a1a1a;
  }

  h2 {
    font-size: 1.5rem;
    margin: 0 0 1rem 0;
    color: #333;
  }

  h3 {
    font-size: 1.2rem;
    margin: 0 0 0.5rem 0;
  }

  .user-id {
    color: #666;
    font-size: 0.9rem;
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
    padding: 0.75rem;
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
    font-size: 1.3rem;
    font-weight: bold;
  }

  .analyzing,
  .migrating {
    font-size: 1.2rem;
    color: #0066cc;
  }

  .sequence-list {
    max-height: 500px;
    overflow-y: auto;
    background: white;
    padding: 1rem;
    border-radius: 4px;
  }

  .sequence-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem;
    border-bottom: 1px solid #eee;
  }

  .sequence-item:last-child {
    border-bottom: none;
  }

  .word {
    font-weight: 600;
    color: #333;
  }

  .change {
    color: #666;
    font-size: 0.9rem;
  }

  .more {
    text-align: center;
    color: #666;
    font-style: italic;
    margin-top: 1rem;
  }

  .errors {
    background: #f8d7da;
  }

  .error-item {
    padding: 0.75rem;
    background: white;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    color: #721c24;
    font-family: monospace;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
  }

  button {
    flex: 1;
    padding: 1.25rem 2rem;
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
    transform: translateY(-1px);
  }

  .migrate-btn {
    background: #28a745;
    color: white;
  }

  .migrate-btn:hover:not(:disabled) {
    background: #218838;
    transform: translateY(-1px);
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
    font-family: "Courier New", monospace;
    color: #e83e8c;
  }

  p.error {
    color: #721c24;
    font-weight: bold;
  }
</style>
