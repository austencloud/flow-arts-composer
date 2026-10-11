<script lang="ts">
  import CopyForAIButton from "#lib/shared/foundation/ui/CopyForAIButton.svelte";
  import type {
    ParityAuditNotification,
    ParityAuditViolation,
  } from "#lib/shared/feedback/domain/models/notification-models.js";
  import { formatParityAuditAgentBrief } from "#lib/features/admin/domain/parity-audit-agent-brief.js";

  interface Props {
    notification: ParityAuditNotification;
  }

  let { notification }: Props = $props();

  const total = $derived(
    notification.auditReconcileCount + notification.auditShortcodeCount
  );
  const title = $derived(
    notification.auditStatus === "failed"
      ? "Parity audit did not finish"
      : "Parity audit needs an agent"
  );
  const agentBrief = $derived(formatParityAuditAgentBrief(notification));

  function classificationLabel(classification: string): string {
    switch (classification) {
      case "SAFE_REPROJECT":
        return "Projection needs refresh";
      case "ORPHAN_PUBLIC":
        return "Public copy has no owner";
      case "PRIVATE_SOURCE_WITH_PUBLIC_MIRROR":
        return "Private sequence is still public";
      case "DUPLICATE_HASH_CONFLICT":
        return "Duplicate public identity";
      case "INCOMPLETE_CANONICAL_DATA":
        return "Source data is incomplete";
      case "SOURCE_CHANGED_DURING_RUN":
        return "Source changed during the audit";
      case "LABEL_CONTRADICTS_PAYLOAD":
        return "QR label does not match its payload";
      case "PAYLOAD_INCOMPLETE":
        return "QR payload is incomplete";
      default:
        return classification.replaceAll("_", " ").toLowerCase();
    }
  }

  function recordId(record: ParityAuditViolation): string {
    return record.code ?? record.id ?? "Unknown record";
  }

  function sourceLabel(source: ParityAuditViolation["source"]): string {
    return source === "reconcile" ? "Sequence projection" : "QR code";
  }

  function reportDate(value?: string): string {
    if (!value) return "Unknown run time";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }
</script>

<main class="audit-page">
  <section class="handoff" aria-labelledby="audit-title">
    <a class="back-button" href="/create?sheet=inbox&inboxTab=notifications">
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      Back to notifications
    </a>

    <div class="status-line">
      <span
        class:error={notification.auditStatus === "failed"}
        class="status-badge"
      >
        <i
          class:fa-triangle-exclamation={notification.auditStatus === "failed"}
          class:fa-shield-halved={notification.auditStatus !== "failed"}
          class="fas"
          aria-hidden="true"
        ></i>
        {notification.auditStatus === "failed"
          ? "Audit failed"
          : "Action required"}
      </span>
      <span>{reportDate(notification.reportGeneratedAt)}</span>
    </div>

    <header>
      <h1 id="audit-title">{title}</h1>
      {#if notification.auditStatus === "failed"}
        <p>
          The audit stopped before it could verify the data.
          {notification.auditError ?? notification.message}
        </p>
      {:else}
        <p>
          The report found {total}
          {total === 1 ? "mismatch" : "mismatches"}:
          {notification.auditReconcileCount} sequence
          {notification.auditReconcileCount === 1
            ? "projection"
            : "projections"}
          and {notification.auditShortcodeCount} QR
          {notification.auditShortcodeCount === 1 ? "code" : "codes"}.
        </p>
      {/if}
    </header>

    <section class="agent-action" aria-labelledby="agent-action-title">
      <div class="action-icon" aria-hidden="true">
        <i class="fas fa-terminal"></i>
      </div>
      <div class="action-copy">
        <span class="section-label">Recommended action</span>
        <h2 id="agent-action-title">Hand this incident to an agent</h2>
        <p>
          The packet includes the affected records, repair guardrails, and the
          command that proves the audit is clean.
        </p>
      </div>
      <div class="copy-action">
        <CopyForAIButton
          getData={() => agentBrief}
          ariaLabel="Copy parity audit incident for an agent"
          variant="icon-text"
          size="lg"
          idleIcon="fa-copy"
          labels={{
            idle: "Copy agent brief",
            loading: "Preparing brief",
            success: "Agent brief copied",
            error: "Copy failed",
          }}
          useToast
        />
        <span>Paste it into Codex or Claude.</span>
      </div>
    </section>

    <details class="technical-details">
      <summary>
        <span>
          <i class="fas fa-code" aria-hidden="true"></i>
          Technical details
        </span>
        <i class="fas fa-chevron-down chevron" aria-hidden="true"></i>
      </summary>

      <div class="details-content">
        <dl class="report-meta">
          <div>
            <dt>Source report</dt>
            <dd><code>{notification.reportFile ?? "Not recorded"}</code></dd>
          </div>
          <div>
            <dt>Notification</dt>
            <dd><code>{notification.id}</code></dd>
          </div>
        </dl>

        {#if notification.auditViolations.length > 0}
          <ol class="record-list">
            {#each notification.auditViolations as record}
              <li>
                <div class="record-heading">
                  <span>{sourceLabel(record.source)}</span>
                  <span>{classificationLabel(record.classification)}</span>
                </div>
                <code class="record-id">{recordId(record)}</code>
                {#if record.ownerId}
                  <p><strong>Owner:</strong> <code>{record.ownerId}</code></p>
                {/if}
                {#if record.detail}
                  <p>{record.detail}</p>
                {/if}
                {#if record.changedKeys?.length}
                  <p>
                    <strong>Changed fields:</strong>
                    {record.changedKeys.join(", ")}
                  </p>
                {/if}
                {#if record.storedWord || record.expectedWord}
                  <p>
                    <strong>Stored / expected:</strong>
                    {record.storedWord ?? "Unknown"} / {record.expectedWord ??
                      "Unknown"}
                  </p>
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          <p class="empty-details">
            This notification does not contain record details. The agent brief
            includes the available report metadata and error information.
          </p>
        {/if}
      </div>
    </details>
  </section>
</main>

<style>
  .audit-page {
    min-height: 100dvh;
    padding: clamp(1rem, 3vw, 3rem);
    color: var(--theme-text, #f7f7fb);
    background: var(--theme-bg, #0f1015);
    font-size: clamp(1rem, 0.35vw + 0.78rem, 1.5rem);
  }

  .handoff {
    width: min(100%, clamp(58em, 68vw, 86em));
    margin: 0 auto;
  }

  .back-button {
    display: inline-flex;
    min-height: var(--min-touch-target, 3rem);
    margin-bottom: 2.5em;
    padding: 0.65em 1em;
    align-items: center;
    gap: 0.65em;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 0.75em;
    color: inherit;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-weight: 700;
    text-decoration: none;
  }

  .back-button:hover {
    border-color: var(--theme-accent, #f97316);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f97316) 12%,
      transparent
    );
  }

  .back-button:focus-visible,
  summary:focus-visible {
    outline: 3px solid var(--theme-accent, #f97316);
    outline-offset: 3px;
  }

  .status-line {
    display: flex;
    margin-bottom: 1.25em;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: 0.82em;
  }

  .status-badge {
    display: inline-flex;
    min-height: 2.25em;
    padding: 0.35em 0.75em;
    align-items: center;
    gap: 0.5em;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #fb923c) 48%, transparent);
    border-radius: 999px;
    color: var(--semantic-warning, #fb923c);
    background: color-mix(
      in srgb,
      var(--semantic-warning, #fb923c) 10%,
      transparent
    );
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .status-badge.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 48%,
      transparent
    );
    color: var(--semantic-error, #f87171);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  header {
    margin-bottom: 2em;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.4em;
    font-size: clamp(2.35em, 6vw, 4.4em);
    line-height: 0.98;
    letter-spacing: -0.05em;
  }

  header p {
    margin-bottom: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.72));
    font-size: 1.08em;
    line-height: 1.65;
  }

  .agent-action {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 1.5em;
    align-items: center;
    gap: 1.25em;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #f97316) 45%, transparent);
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-accent, #f97316) 8%,
      var(--theme-panel-bg, #171820)
    );
  }

  .action-icon {
    display: grid;
    width: 3.25em;
    aspect-ratio: 1;
    place-items: center;
    border-radius: 0.9em;
    color: var(--semantic-warning, #fb923c);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f97316) 16%,
      transparent
    );
    font-size: 1.1em;
  }

  .section-label,
  dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: 0.74em;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25em 0 0.45em;
    font-size: 1.35em;
    line-height: 1.15;
  }

  .action-copy p {
    margin-bottom: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
  }

  .copy-action {
    display: grid;
    justify-items: end;
    gap: 0.55em;
  }

  .copy-action > span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: 0.75em;
  }

  .copy-action :global(.copy-btn) {
    border-color: var(--theme-accent, #f97316);
    color: #fff;
    background: var(--theme-accent, #c2410c);
    font-weight: 800;
  }

  .technical-details {
    margin-top: 1em;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.13));
    border-radius: 1em;
    background: var(--theme-panel-bg, rgba(21, 23, 31, 0.92));
  }

  summary {
    display: flex;
    min-height: var(--min-touch-target, 3rem);
    padding: 1em 1.25em;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    border-radius: inherit;
    cursor: pointer;
    font-weight: 750;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary > span {
    display: inline-flex;
    align-items: center;
    gap: 0.65em;
  }

  summary .chevron {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    transition: transform var(--duration-fast, 150ms);
  }

  details[open] summary .chevron {
    transform: rotate(180deg);
  }

  .details-content {
    padding: 0 1.25em 1.25em;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .report-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1em;
    margin: 0;
    padding: 1.25em 0;
  }

  .report-meta div {
    min-width: 0;
  }

  dd {
    min-width: 0;
    margin: 0.45em 0 0;
  }

  code {
    overflow-wrap: anywhere;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .record-list {
    display: grid;
    gap: 0.75em;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .record-list li {
    min-width: 0;
    padding: 1em;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75em;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
  }

  .record-heading {
    display: flex;
    margin-bottom: 0.75em;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  .record-heading span {
    padding: 0.3em 0.6em;
    border-radius: 999px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.74));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    font-size: 0.75em;
    font-weight: 750;
  }

  .record-id {
    display: block;
    margin-bottom: 0.75em;
  }

  .record-list p,
  .empty-details {
    margin-bottom: 0.4em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
  }

  .record-list p:last-child,
  .empty-details {
    margin-bottom: 0;
  }

  @media (max-width: 52rem) {
    .agent-action {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .copy-action {
      grid-column: 1 / -1;
      width: 100%;
      justify-items: stretch;
    }

    .copy-action :global(.copy-btn) {
      width: 100%;
    }

    .copy-action > span {
      text-align: center;
    }
  }

  @media (max-width: 34rem) {
    .audit-page {
      padding: 1rem 0.75rem 2rem;
    }

    .back-button {
      margin-bottom: 1.5em;
    }

    .status-line {
      align-items: flex-start;
      flex-direction: column;
    }

    .agent-action {
      grid-template-columns: 1fr;
      padding: 1.1em;
    }

    .action-icon {
      width: 2.8em;
    }

    .copy-action {
      grid-column: 1;
    }

    .report-meta {
      grid-template-columns: 1fr;
    }
  }

  @media (max-height: 32rem) and (min-width: 40rem) {
    .audit-page {
      padding-block: 0.75rem;
    }

    .back-button {
      margin-bottom: 0.75em;
    }

    .status-line,
    header {
      margin-bottom: 0.75em;
    }

    h1 {
      font-size: 2.2em;
    }

    .agent-action {
      padding: 1em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    summary .chevron {
      transition: none;
    }
  }
</style>
