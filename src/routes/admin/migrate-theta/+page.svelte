<script lang="ts">
  /**
   * Admin Migration Tool: Fix Greek Letter Case Issues
   *
   * - Lowercase theta (θ) → Uppercase Theta (Θ)
   * - Uppercase gamma (Γ) → Lowercase gamma (γ)
   *
   * Scans ALL users' sequences and fixes any incorrect Greek letter cases.
   * Requires admin privileges.
   */

  import { getAuthSync, getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import {
    collection,
    getDocs,
    doc,
    updateDoc,
  } from "firebase/firestore";
  import { onMount } from "svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

  let status = $state<
    "idle" | "checking-auth" | "analyzing" | "migrating" | "complete" | "error"
  >("checking-auth");
  let totalUsers = $state(0);
  let totalSequences = $state(0);
  let sequencesNeedingFix = $state(0);
  let thetaCount = $state(0);
  let gammaCount = $state(0);
  let migratedCount = $state(0);
  let errorCount = $state(0);
  let currentUser = $state("");
  let errors = $state<string[]>([]);
  let affectedSequences = $state<
    Array<{ userId: string; userName: string; sequenceId: string; word: string; issues: string[] }>
  >([]);

  const isAdmin = $derived(authState.isAdmin);

  /**
   * Check if a value contains lowercase theta (θ) - should be uppercase Θ
   */
  function containsLowercaseTheta(value: unknown): boolean {
    if (typeof value === "string") {
      return value.includes("θ");
    }
    if (Array.isArray(value)) {
      return value.some(containsLowercaseTheta);
    }
    if (value && typeof value === "object") {
      return Object.values(value).some(containsLowercaseTheta);
    }
    return false;
  }

  /**
   * Check if a value contains uppercase gamma (Γ) - should be lowercase γ
   */
  function containsUppercaseGamma(value: unknown): boolean {
    if (typeof value === "string") {
      return value.includes("Γ");
    }
    if (Array.isArray(value)) {
      return value.some(containsUppercaseGamma);
    }
    if (value && typeof value === "object") {
      return Object.values(value).some(containsUppercaseGamma);
    }
    return false;
  }

  /**
   * Check if data needs any fixes
   */
  function needsFix(value: unknown): { theta: boolean; gamma: boolean } {
    return {
      theta: containsLowercaseTheta(value),
      gamma: containsUppercaseGamma(value),
    };
  }

  /**
   * Fix all Greek letter case issues:
   * - θ → Θ (lowercase theta to uppercase)
   * - Γ → γ (uppercase gamma to lowercase)
   */
  function fixGreekLetters(value: unknown): unknown {
    if (typeof value === "string") {
      return value
        .replace(/θ/g, "Θ")  // Fix theta
        .replace(/Γ/g, "γ"); // Fix gamma
    }
    if (Array.isArray(value)) {
      return value.map(fixGreekLetters);
    }
    if (value && typeof value === "object") {
      const fixed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        fixed[key] = fixGreekLetters(val);
      }
      return fixed;
    }
    return value;
  }

  async function analyzeAllUsers() {
    if (!isAdmin) {
      errors = ["You must be an admin to run this migration"];
      status = "error";
      return;
    }

    status = "analyzing";
    errors = [];
    affectedSequences = [];
    totalUsers = 0;
    totalSequences = 0;
    sequencesNeedingFix = 0;
    thetaCount = 0;
    gammaCount = 0;

    try {
      const firestore = await getFirestoreInstance();
      console.log("🔍 Scanning all users for Greek letter case issues...");

      const usersSnapshot = await getDocs(collection(firestore, "users"));
      totalUsers = usersSnapshot.size;
      console.log(`Found ${totalUsers} users`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const userName =
          userData.displayName || userData.email || userId.slice(0, 8);
        currentUser = userName;

        // Get user's sequences
        const sequencesRef = collection(
          firestore,
          `users/${userId}/sequences`
        );
        const sequencesSnapshot = await getDocs(sequencesRef);

        for (const seqDoc of sequencesSnapshot.docs) {
          totalSequences++;
          const data = seqDoc.data();
          const issues = needsFix(data);

          if (issues.theta || issues.gamma) {
            sequencesNeedingFix++;
            const issueList: string[] = [];
            if (issues.theta) {
              thetaCount++;
              issueList.push("θ→Θ");
            }
            if (issues.gamma) {
              gammaCount++;
              issueList.push("Γ→γ");
            }
            affectedSequences.push({
              userId,
              userName,
              sequenceId: seqDoc.id,
              word: data.word || data.name || seqDoc.id,
              issues: issueList,
            });
          }
        }
      }

      currentUser = "";
      status = "idle";
      console.log(
        `✅ Analysis complete: ${sequencesNeedingFix} sequences need fixes (${thetaCount} theta, ${gammaCount} gamma)`
      );
    } catch (error: any) {
      status = "error";
      errors.push(`Analysis failed: ${error.message}`);
      console.error("❌ Analysis error:", error);
    }
  }

  async function runMigration() {
    if (!isAdmin) {
      errors = ["You must be an admin"];
      status = "error";
      return;
    }

    if (affectedSequences.length === 0) {
      errors = ["No sequences to migrate"];
      return;
    }

    status = "migrating";
    errors = [];
    migratedCount = 0;
    errorCount = 0;

    try {
      const firestore = await getFirestoreInstance();
      console.log(`✍️ Migrating ${affectedSequences.length} sequences...`);

      for (const item of affectedSequences) {
        currentUser = `${item.userName} / ${item.word}`;

        try {
          const docRef = doc(
            firestore,
            `users/${item.userId}/sequences/${item.sequenceId}`
          );

          // Get fresh data
          const sequencesRef = collection(
            firestore,
            `users/${item.userId}/sequences`
          );
          const sequencesSnapshot = await getDocs(sequencesRef);
          const seqDoc = sequencesSnapshot.docs.find(
            (d) => d.id === item.sequenceId
          );

          if (seqDoc) {
            const data = seqDoc.data();
            const fixedData = fixGreekLetters(data) as Record<string, unknown>;
            await updateDoc(docRef, fixedData);
            migratedCount++;
            console.log(`✅ Fixed: ${item.userName}/${item.word} (${item.issues.join(", ")})`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`Failed: ${item.userName}/${item.word}: ${error.message}`);
          console.error(`❌ Error fixing ${item.word}:`, error);
        }
      }

      currentUser = "";
      status = "complete";
      console.log(`✅ Migration complete: ${migratedCount} migrated, ${errorCount} errors`);
    } catch (error: any) {
      status = "error";
      errors.push(`Migration failed: ${error.message}`);
      console.error("❌ Migration failed:", error);
    }
  }

  onMount(() => {
    const unsubscribe = getAuthSync().onAuthStateChanged((user) => {
      if (user && authState.isAdmin) {
        status = "idle";
        analyzeAllUsers();
      } else if (user) {
        errors = ["You must be an admin to use this tool"];
        status = "error";
      } else {
        errors = ["Please log in"];
        status = "error";
      }
    });

    return unsubscribe;
  });
</script>

<div class="migration-tool">
  <header>
    <h1>🔧 Greek Letter Case Migration</h1>
    <p>Fix incorrect Greek letter cases in all user sequences</p>
    <div class="fixes-list">
      <span class="fix-item theta">θ → Θ</span>
      <span class="fix-item gamma">Γ → γ</span>
    </div>
  </header>

  {#if !isAdmin && status !== "checking-auth"}
    <div class="error-banner">
      ⚠️ Admin access required. You are not logged in as an admin.
    </div>
  {/if}

  <section class="status-card">
    <h2>Status</h2>

    {#if status === "checking-auth"}
      <p class="analyzing">🔐 Checking authentication...</p>
    {:else if status === "analyzing"}
      <p class="analyzing">🔍 Scanning: {currentUser || "..."}</p>
      <p>Found {totalSequences} sequences so far...</p>
    {:else if status === "idle"}
      <div class="stats">
        <div class="stat">
          <span class="label">Total Users:</span>
          <span class="value">{totalUsers}</span>
        </div>
        <div class="stat">
          <span class="label">Total Sequences:</span>
          <span class="value">{totalSequences}</span>
        </div>
        <div class="stat" class:warning={sequencesNeedingFix > 0}>
          <span class="label">Need Fixing:</span>
          <span class="value">{sequencesNeedingFix}</span>
        </div>
        {#if sequencesNeedingFix > 0}
          <div class="stat-breakdown">
            <span class="breakdown-item theta">θ→Θ: {thetaCount}</span>
            <span class="breakdown-item gamma">Γ→γ: {gammaCount}</span>
          </div>
        {/if}
      </div>
    {:else if status === "migrating"}
      <p class="migrating">✍️ Migrating: {currentUser}...</p>
      <p>Progress: {migratedCount} / {sequencesNeedingFix}</p>
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

  {#if status === "idle" && affectedSequences.length > 0}
    <section class="preview">
      <h2>Affected Sequences ({affectedSequences.length})</h2>
      <div class="sequence-list">
        {#each affectedSequences.slice(0, 100) as item}
          <div class="sequence-item">
            <span class="user">{item.userName}</span>
            <span class="word">{item.word}</span>
            <span class="issues">{item.issues.join(", ")}</span>
          </div>
        {/each}
        {#if affectedSequences.length > 100}
          <p class="more">...and {affectedSequences.length - 100} more</p>
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
    </section>
  {/if}

  <section class="actions">
    <button
      onclick={analyzeAllUsers}
      disabled={status === "analyzing" || status === "migrating" || !isAdmin}
      class="analyze-btn"
    >
      🔍 Re-analyze All Users
    </button>

    {#if sequencesNeedingFix > 0}
      <button
        onclick={runMigration}
        disabled={status !== "idle" || !isAdmin}
        class="migrate-btn"
      >
        ✍️ Fix {sequencesNeedingFix} Sequences
      </button>
    {/if}
  </section>

  <section class="info">
    <h3>What this does:</h3>
    <ul>
      <li>Scans ALL users' sequences in Firestore</li>
      <li>Finds sequences with incorrect Greek letter cases</li>
      <li><strong>θ → Θ</strong>: Lowercase theta to uppercase (Type2 letter)</li>
      <li><strong>Γ → γ</strong>: Uppercase gamma to lowercase (Type6 static letter)</li>
      <li>Updates the word field, step data, and any other affected fields</li>
    </ul>
  </section>
</div>

<style>
  .migration-tool {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
    font-family: system-ui, -apple-system, sans-serif;
    background: #1a1a2e;
    color: #eee;
    min-height: 100vh;
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

  .fixes-list {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .fix-item {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: bold;
    font-size: 1.1rem;
  }

  .fix-item.theta {
    background: #4a3a1a;
    color: #ffd700;
  }

  .fix-item.gamma {
    background: #1a4a3a;
    color: #7fff7f;
  }

  section {
    background: #252540;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .error-banner {
    background: #ff6b6b;
    color: white;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-weight: bold;
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
    background: #1a1a2e;
    border-radius: 4px;
  }

  .stat.warning {
    background: #856404;
    color: #fff3cd;
  }

  .stat.error {
    background: #721c24;
    color: #f8d7da;
  }

  .stat-breakdown {
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
  }

  .breakdown-item {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .breakdown-item.theta {
    background: #4a3a1a;
    color: #ffd700;
  }

  .breakdown-item.gamma {
    background: #1a4a3a;
    color: #7fff7f;
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
    color: #6eb5ff;
  }

  .sequence-list {
    max-height: 400px;
    overflow-y: auto;
    background: #1a1a2e;
    padding: 1rem;
    border-radius: 4px;
  }

  .sequence-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    border-bottom: 1px solid #333;
    gap: 1rem;
  }

  .user {
    color: #aaa;
    font-size: 0.9rem;
    flex: 1;
  }

  .word {
    font-weight: 600;
    color: #ffd700;
    flex: 1;
  }

  .issues {
    font-size: 0.85rem;
    color: #7fff7f;
    background: #1a3a2a;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .more {
    text-align: center;
    color: #888;
    margin-top: 1rem;
  }

  .errors {
    background: #4a1a1a;
  }

  .error-item {
    padding: 0.5rem;
    background: #1a1a2e;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
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
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .analyze-btn {
    background: #0066cc;
    color: white;
  }

  .migrate-btn {
    background: #28a745;
    color: white;
  }

  .info {
    background: #1a3a4a;
  }

  .info ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .info li {
    margin-bottom: 0.5rem;
  }

  p.error {
    color: #ff6b6b;
    font-weight: bold;
  }
</style>
