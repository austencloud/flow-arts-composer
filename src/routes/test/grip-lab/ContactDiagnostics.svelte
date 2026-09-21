<script lang="ts">
  let {
    report,
    audit,
    onAudit,
  }: { report: unknown; audit: string | null; onAudit: () => void } = $props();
  const renderedReport = $derived(
    report == null
      ? "No contact report has arrived from the performer."
      : JSON.stringify(report, null, 2)
  );
</script>

<section class="diagnostics" aria-label="Contact diagnostics">
  <p>
    Raw solver output is useful for inspection, but it does not establish
    posed-mesh clearance or a passing contact result.
  </p>
  <button type="button" onclick={onAudit}>Check this frame</button>
  {#if audit}<p class="audit" role="status">{audit}</p>{/if}
  <pre>{renderedReport}</pre>
</section>

<style>
  .diagnostics {
    padding: 0 1.25rem 1.5rem;
    color: var(--theme-text);
  }
  p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }
  button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.65rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
  }
  .audit {
    color: var(--theme-text);
  }
  pre {
    margin: 1rem 0 0;
    padding: 1rem;
    overflow: auto;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font:
      0.75rem/1.45 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
</style>
