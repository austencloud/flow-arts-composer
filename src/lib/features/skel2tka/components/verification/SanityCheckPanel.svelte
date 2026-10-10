<!--
  SanityCheckPanel - Display automated pre-verification check results

  Shows pass/warning/fail for each sanity check before
  the user proceeds to manual verification.
  Acts as a gate: if any check fails, warns the user
  that manual verification may not be productive.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SanityCheckReport, SanityCheckResult } from "../../domain/verification-models";

  let {
    report,
  }: {
    report: SanityCheckReport;
  } = $props();

  function severityIcon(severity: string): string {
    switch (severity) {
      case "pass":
        return "fa-check-circle";
      case "warning":
        return "fa-exclamation-triangle";
      case "fail":
        return "fa-times-circle";
      default:
        return "fa-question-circle";
    }
  }

  function severityColor(severity: string): string {
    switch (severity) {
      case "pass":
        return "var(--semantic-success, #22c55e)";
      case "warning":
        return "var(--semantic-warning, #f59e0b)";
      case "fail":
        return "var(--semantic-error, #ef4444)";
      default:
        return "var(--theme-text-muted, #6b7280)";
    }
  }

  const passCount = $derived(report.checks.filter((c) => c.severity === "pass").length);
  const warnCount = $derived(report.checks.filter((c) => c.severity === "warning").length);
  const failCount = $derived(report.checks.filter((c) => c.severity === "fail").length);
</script>

<div class="sanity-panel">
  <div class="panel-header">
    <i
      class="fas {severityIcon(report.overallSeverity)}"
      style="color: {severityColor(report.overallSeverity)};"
    ></i>
    <h4>{t('skel2tka_sanity_checks')}</h4>
    <span class="summary">
      {t('skel2tka_sanity_pass', { count: String(passCount) })}
      {#if warnCount > 0}, {t('skel2tka_sanity_warn', { count: String(warnCount) })}{/if}
      {#if failCount > 0}, {t('skel2tka_sanity_fail', { count: String(failCount) })}{/if}
    </span>
  </div>

  {#if report.overallSeverity === "fail"}
    <div class="overall-warning">
      {t('skel2tka_sanity_overall_warning')}
    </div>
  {/if}

  <div class="checks-list">
    {#each report.checks as check}
      <div class="check-row {check.severity}">
        <i
          class="fas {severityIcon(check.severity)}"
          style="color: {severityColor(check.severity)};"
        ></i>
        <div class="check-content">
          <span class="check-name">{check.name}</span>
          <span class="check-message">{check.message}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .sanity-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-header h4 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .summary {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .overall-warning {
    padding: 8px 12px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, transparent);
    line-height: 1.4;
  }

  .checks-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .check-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
  }

  .check-row.fail {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 5%, transparent);
  }

  .check-row.warning {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 5%, transparent);
  }

  .check-row i {
    margin-top: 2px;
    flex-shrink: 0;
    font-size: 12px;
  }

  .check-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .check-name {
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .check-message {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    line-height: 1.3;
  }
</style>
