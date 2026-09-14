<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import {
    EVIDENCE_BASIS_LABELS,
    activityLabel,
    type ArchiveEntry,
  } from "./_lib/archive-ledger";
  import {
    archiveSections,
    archiveReadingSources,
    type ArchiveSection,
  } from "./_lib/archive-sections";

  let {
    entry,
    selectedId = $bindable<string | null>(null),
  }: {
    entry: ArchiveEntry;
    selectedId?: string | null;
  } = $props();
  const sections = $derived(archiveSections(entry));
  const citations = $derived(archiveReadingSources(entry));
  const activity = $derived(activityLabel(entry));
  let mode = $state<"browse" | "sources" | "full">("browse");
  const selected = $derived(
    sections.find((section) => section.id === selectedId) ?? sections[0]
  );
  const groupLabel = $derived(
    entry.catalogEntry?.applications?.length
      ? "From notation to software"
      : entry.catalogEntry?.videos?.length
        ? "Original lessons"
        : "Works & releases"
  );
  const options = $derived(
    sections.map((section) => ({ value: section.id, label: section.label }))
  );

  function selectSection(id: string) {
    selectedId = id;
    mode = "browse";
  }
</script>

{#snippet sectionContent(section: ArchiveSection)}
  <section class="work" aria-label={section.title}>
    {#if section.kind === "product" || section.kind === "tool"}
      <p class="work-kind">
        {section.kind === "product"
          ? "Main application"
          : "Tool within Flow Arts Composer"}
      </p>
    {/if}
    <h4>{section.title}</h4>
    <p class="description">{section.description}</p>
    <ul class="work-links">
      {#each section.links as link (link.href)}
        <li>
          <a
            href={link.href}
            target={link.href.startsWith("/") ? undefined : "_blank"}
            rel={link.href.startsWith("/") ? undefined : "noopener noreferrer"}
            >{link.label}
            <span aria-hidden="true"
              >{link.href.startsWith("/") ? "→" : "↗"}</span
            ></a
          >
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

{#snippet sources()}
  <section aria-labelledby={`sources-${entry.id}`}>
    <h3 id={`sources-${entry.id}`}>Sources</h3>
    <ol class="source-list">
      {#each citations as citation (citation.href)}
        <li>
          <a
            href={citation.href}
            target={citation.href.startsWith("/") ? undefined : "_blank"}
            rel={citation.href.startsWith("/")
              ? undefined
              : "noopener noreferrer"}
            >{citation.label}
            <span aria-hidden="true"
              >{citation.href.startsWith("/") ? "→" : "↗"}</span
            ></a
          >
          <p>{citation.supports}</p>
          <small>{EVIDENCE_BASIS_LABELS[citation.basis]}</small>
        </li>
      {/each}
    </ol>
    {#if entry.evidenceNote || activity}
      <div class="source-note">
        {#if entry.evidenceBasis !== "unresolved" && entry.evidenceNote}<p>
            {entry.evidenceNote}
          </p>{/if}
        {#if activity}<p>
            <strong>{activity}.</strong>
            {entry.activity?.note}
          </p>{/if}
      </div>
    {/if}
  </section>
{/snippet}

<div class="entry-resources" class:explorable={sections.length > 0}>
  {#if sections.length && selected}
    <div class="resource-navigation">
      <h3 id={`works-${entry.id}`}>{groupLabel}</h3>
      <SegmentedControl
        {options}
        value={mode === "browse" ? selected.id : ""}
        onchange={selectSection}
        columns={2}
        color="accent"
        ariaLabelledby={`works-${entry.id}`}
        semantics="radiogroup"
      />
      <div class="reading-actions">
        <PanelButton
          ariaPressed={mode === "sources"}
          onclick={() => (mode = mode === "sources" ? "browse" : "sources")}
        >
          All sources ({citations.length})
        </PanelButton>
        <PanelButton
          ariaPressed={mode === "full"}
          onclick={() => (mode = mode === "full" ? "browse" : "full")}
        >
          Read full entry
        </PanelButton>
      </div>
    </div>
    <Crossfade key={`${mode}:${selected.id}`} animateHeight mode="swap">
      <div class="resource-content" class:full-entry={mode === "full"}>
        {#if mode === "browse"}
          {@render sectionContent(selected)}
        {:else if mode === "sources"}
          {@render sources()}
        {:else}
          {#each sections as section (section.id)}{@render sectionContent(
              section
            )}{/each}
          {@render sources()}
        {/if}
      </div>
    </Crossfade>
  {:else}
    {@render sources()}
  {/if}
</div>

<style>
  .entry-resources {
    border-top: 1px solid var(--theme-stroke);
    padding-top: 1.25rem;
    min-width: 0;
    container-type: inline-size;
  }
  h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 650;
  }
  h4 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    line-height: 1.5;
    font-weight: 650;
  }
  .resource-navigation {
    display: grid;
    gap: 0.75rem;
  }
  .resource-navigation h3 {
    margin: 0;
  }
  .reading-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .reading-actions :global([aria-pressed="true"]) {
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg);
  }
  .resource-content {
    padding-top: 1.5rem;
    min-width: 0;
  }
  .full-entry {
    display: grid;
    gap: 2rem;
  }
  .full-entry > :global(section + section) {
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .description,
  .source-list p,
  .source-note {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.65;
    max-width: 68ch;
  }
  .description {
    margin: 0;
  }
  .work-kind {
    margin: 0 0 0.35rem;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-accent);
    font-weight: 650;
  }
  .work-links,
  .source-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .work-links {
    margin-top: 0.65rem;
    display: grid;
    gap: 0.25rem;
  }
  a {
    color: var(--theme-text);
    text-underline-offset: 0.25em;
    text-decoration-thickness: 1px;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    line-height: 1.5;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }
  a span {
    flex-shrink: 0;
  }
  a:hover {
    color: var(--theme-accent);
  }
  a:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
    border-radius: 2px;
  }
  .source-list {
    display: grid;
    gap: 1.15rem;
    counter-reset: source;
  }
  .source-list li {
    position: relative;
    padding-left: 1.75rem;
    counter-increment: source;
  }
  .source-list li::before {
    content: counter(source, decimal-leading-zero);
    position: absolute;
    left: 0;
    top: 0.8rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim);
  }
  .source-list p {
    margin: 0.15rem 0 0;
  }
  .source-list small {
    display: block;
    margin-top: 0.35rem;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim);
    line-height: 1.5;
  }
  .source-note {
    margin-top: 1.25rem;
  }
  .source-note p {
    margin: 0.5rem 0 0;
  }
  @container (min-width: 620px) {
    .source-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem 2rem;
    }
  }
</style>
