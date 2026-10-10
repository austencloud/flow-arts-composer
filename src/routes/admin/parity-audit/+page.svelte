<script lang="ts">
  import { page } from "$app/state";
  import ParityAuditReport from "#lib/features/admin/components/ParityAuditReport.svelte";
  import {
    getAuthSync,
    getFirestoreInstance,
  } from "#lib/shared/auth/firebase.js";
  import { UserNotificationSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";
  import type { ParityAuditNotification } from "#lib/shared/feedback/domain/models/notification-models.js";
  import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
  } from "firebase/firestore";
  import { onMount } from "svelte";

  let notification = $state<ParityAuditNotification | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function parseNotification(id: string, data: Record<string, unknown>) {
    const parsed = UserNotificationSchema.safeParse({ id, ...data });
    if (!parsed.success || parsed.data.type !== "admin-parity-audit") {
      return null;
    }
    return {
      ...parsed.data,
      auditStatus: parsed.data.auditStatus ?? "violations",
      actionUrl:
        parsed.data.actionUrl ??
        `/admin/parity-audit?notification=${encodeURIComponent(id)}`,
      auditReconcileCount: parsed.data.auditReconcileCount ?? 0,
      auditShortcodeCount: parsed.data.auditShortcodeCount ?? 0,
      auditViolations: parsed.data.auditViolations ?? [],
    } as ParityAuditNotification;
  }

  async function loadReport() {
    const user = getAuthSync().currentUser;
    if (!user) {
      error = "Sign in with an admin account to open this report.";
      loading = false;
      return;
    }

    try {
      const firestore = await getFirestoreInstance();
      const requestedId = page.url.searchParams.get("notification");

      if (requestedId) {
        const snapshot = await getDoc(
          doc(firestore, `users/${user.uid}/notifications/${requestedId}`)
        );
        if (snapshot.exists()) {
          notification = parseNotification(snapshot.id, snapshot.data());
        }
      } else {
        const recent = await getDocs(
          query(
            collection(firestore, `users/${user.uid}/notifications`),
            orderBy("createdAt", "desc"),
            limit(50)
          )
        );
        for (const snapshot of recent.docs) {
          const candidate = parseNotification(snapshot.id, snapshot.data());
          if (candidate) {
            notification = candidate;
            break;
          }
        }
      }

      if (!notification) {
        error = "This parity audit report is no longer available.";
      }
    } catch (loadError) {
      console.error(
        "[ParityAuditReport] Failed to load notification",
        loadError
      );
      error = "The parity audit report could not be loaded.";
    } finally {
      loading = false;
    }
  }

  onMount(loadReport);
</script>

{#if loading}
  <main class="report-state" aria-busy="true">
    <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
    <p>Loading parity audit report</p>
  </main>
{:else if error}
  <main class="report-state error-state">
    <i class="fas fa-file-circle-xmark" aria-hidden="true"></i>
    <h1>Report unavailable</h1>
    <p>{error}</p>
    <a href="/create?sheet=inbox&inboxTab=notifications">
      Back to notifications
    </a>
  </main>
{:else if notification}
  <ParityAuditReport {notification} />
{/if}

<style>
  .report-state {
    display: grid;
    min-height: 100dvh;
    padding: 2rem;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    color: var(--theme-text, #f7f7fb);
    background: var(--theme-bg, #0f1015);
    text-align: center;
  }

  .report-state > i {
    color: var(--semantic-warning, #fb923c);
    font-size: 2rem;
  }

  .report-state h1,
  .report-state p {
    margin: 0;
  }

  .report-state a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.65rem 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    border-radius: 0.75rem;
    color: inherit;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    font-weight: 700;
    text-decoration: none;
  }
</style>
