<!--
  VillageControls - The lab's side panel: the village's story so far, one
  plain sentence per thing that happened, newest first, and the few controls
  that matter (pause, speed, a new village). The Visitor section stands in
  for the museum visitor: pick what they carry and teach it to someone, and
  the story speaks to "you" about it. In the lab it can also leave and come
  back: keep the input log, rebuild the village from it, save or load it as
  a file, or load one of the two museum fixtures. Numbers and the list of people
  sit behind a disclosure; picking someone there shows their name in the
  scene.
-->
<script lang="ts" module>
  import type { VillageInputLog } from "../domain/village-input-log";

  /** What VillageLabTab gives the panel for leaving and coming back. */
  export interface VillageLabReturn {
    readonly keptLog: VillageInputLog | null;
    leave(): void;
    comeBack(): void;
    load(log: VillageInputLog): void;
  }
</script>

<script lang="ts">
  import { flip } from "svelte/animate";
  import { growFade, flipDuration } from "#lib/shared/transitions/motion.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    getVillageContext,
    getVillageVisualContext,
  } from "../state/village-context";
  import { villageSeedWord } from "../services/village-sequence-catalogue";
  import { villageWord } from "../state/village-visual-state.svelte";
  import {
    LAB_FIXTURES,
    labLogFileName,
    memoryFacts,
    readLabLog,
    teachNearestIdle,
    type LabFixture,
  } from "../village-lab-visitor";

  const { lab }: { lab?: VillageLabReturn } = $props();

  const villageState = getVillageContext();
  const visualState = getVillageVisualContext();

  const snapshot = $derived(villageState.snapshot);
  const stats = $derived(snapshot.world.stats);
  const living = $derived(
    snapshot.avatars.filter((a) => a.state !== "passing")
  );
  const story = $derived(visualState.story);

  let showVillage = $state(false);

  // The visitor: what is in their pocket, and their lesson while it runs.
  const pocketOptions = villageState.rules.visitor.sequences.map(
    ({ sequenceId }) => ({
      value: sequenceId,
      label: villageSeedWord(sequenceId),
    })
  );
  let pocket = $state(pocketOptions[0]?.value ?? "");
  let teachNote = $state<string | null>(null);
  const visitor = $derived(snapshot.world.visitor ?? null);
  const visitorLearner = $derived(
    visitor
      ? (snapshot.avatars.find((a) => a.id === visitor.learnerId)?.name ??
          "someone")
      : null
  );
  const visitorStatus = $derived(
    visitor
      ? `Teaching ${villageSeedWord(visitor.sequenceId)} to ${visitorLearner}.`
      : (teachNote ?? `Carrying ${villageSeedWord(pocket)}.`)
  );

  function teachNearest(): void {
    const result = teachNearestIdle(villageState, pocket);
    teachNote = result.started
      ? null
      : result.learner
        ? `${result.learner.name} could not learn it just now.`
        : `Nobody is free to learn ${villageSeedWord(pocket)} right now.`;
  }

  function stopTeaching(): void {
    villageState.cancelVisitorLesson();
    teachNote = null;
  }

  // Leave and come back.
  let logNote = $state<string | null>(null);
  let logError = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  // What became of the visitor's sequence, in a village they came back to.
  const memory = $derived(lab ? (snapshot.world.memory ?? null) : null);

  function describeLog(log: VillageInputLog): string {
    const lessons = log.entries.filter((e) => e.type === "teach").length;
    return lessons === 0
      ? "Log kept. You taught nothing yet."
      : `Log kept: ${lessons === 1 ? "1 lesson" : `${lessons} lessons`}.`;
  }

  function leave(): void {
    if (!lab) return;
    lab.leave();
    logError = null;
    logNote = lab.keptLog ? describeLog(lab.keptLog) : null;
  }

  function download(): void {
    const log = lab?.keptLog;
    if (!log) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(log, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = labLogFileName(log);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !lab) return;
    const read = readLabLog(await file.text());
    if (!read.ok) {
      logError = read.error;
      return;
    }
    logError = null;
    lab.load(read.log);
  }

  function loadFixture(name: LabFixture): void {
    logError = null;
    lab?.load(LAB_FIXTURES[name]);
  }

  const speedOptions = [
    { value: "0.5", label: "½×", ariaLabel: "Half speed" },
    { value: "1", label: "1×", ariaLabel: "Normal speed" },
    { value: "2", label: "2×", ariaLabel: "Double speed" },
    { value: "5", label: "5×", ariaLabel: "Five times speed" },
    { value: "10", label: "10×", ariaLabel: "Ten times speed" },
  ];

  function toggleOpening(): void {
    visualState.clearStory();
    villageState.setOpeningEnabled(!villageState.openingEnabled);
  }

  function newVillage(): void {
    visualState.clearStory();
    villageState.reset(
      `village-${Math.floor(Math.random() * 1e9).toString(36)}`
    );
  }
</script>

<aside class="controls" aria-label="Village">
  <div class="actions">
    <button
      type="button"
      class="control-btn"
      onclick={() => villageState.togglePlay()}
    >
      {villageState.isRunning ? "Pause" : "Play"}
    </button>
    <button type="button" class="control-btn" onclick={newVillage}
      >New village</button
    >
  </div>

  <SegmentedControl
    options={speedOptions}
    value={String(villageState.speed)}
    onchange={(value) => villageState.setSpeed(Number(value))}
    size="sm"
    density="compact"
    ariaLabel="Speed"
  />

  <p class="seed" title="The same seed always grows the same village">
    Seed <span class="seed-value">{villageState.seed}</span>
  </p>

  <section class="visitor" aria-labelledby="village-visitor-title">
    <h3 id="village-visitor-title">Visitor</h3>
    {#if pocketOptions.length > 1}
      <SegmentedControl
        options={pocketOptions}
        value={pocket}
        onchange={(value) => {
          pocket = value;
          teachNote = null;
        }}
        size="sm"
        density="compact"
        ariaLabel="In the visitor's pocket"
      />
    {/if}
    <p class="visitor-status" aria-live="polite">{visitorStatus}</p>
    <button
      type="button"
      class="control-btn wide"
      onclick={visitor ? stopTeaching : teachNearest}
    >
      {visitor ? "Stop teaching" : "Teach nearest idle"}
    </button>
    {#if lab}
      <div class="actions">
        <button type="button" class="control-btn" onclick={leave}>Leave</button>
        <button
          type="button"
          class="control-btn"
          disabled={!lab.keptLog}
          onclick={() => lab?.comeBack()}>Come back</button
        >
        <button
          type="button"
          class="control-btn"
          disabled={!lab.keptLog}
          onclick={download}>Download log</button
        >
        <button
          type="button"
          class="control-btn"
          onclick={() => fileInput?.click()}>Load log file</button
        >
      </div>
      <input
        bind:this={fileInput}
        class="file-input"
        type="file"
        accept="application/json,.json"
        tabindex="-1"
        aria-hidden="true"
        onchange={loadFile}
      />
      <div class="fixtures" role="group" aria-label="Load a fixture">
        <span class="fixtures-label">Load a fixture</span>
        <button
          type="button"
          class="control-btn"
          onclick={() => loadFixture("kept")}>Kept</button
        >
        <button
          type="button"
          class="control-btn"
          onclick={() => loadFixture("lost")}>Lost</button
        >
      </div>
      {#if logError}
        <p class="log-error" role="alert" transition:growFade>{logError}</p>
      {:else if logNote}
        <p class="quiet" transition:growFade>{logNote}</p>
      {/if}
      {#if memory}
        <dl
          class="memory"
          aria-label="What you came back to"
          transition:growFade
        >
          {#each memoryFacts(memory, villageWord(memory.sequenceId)) as [label, value] (label)}
            <dt>{label}</dt>
            <dd>{value}</dd>
          {/each}
        </dl>
      {/if}
    {/if}
  </section>

  <section class="story" aria-labelledby="village-story-title">
    <div class="story-head">
      <h3 id="village-story-title">What happened</h3>
      <FilterChipBase
        label="Start from the opening"
        mode="toggle"
        size="sm"
        active={villageState.openingEnabled}
        onclick={toggleOpening}
      />
    </div>
    {#if story.length === 0}
      <p class="quiet">Nothing yet. The village is gathering round the fire.</p>
    {:else}
      <ol class="story-lines" aria-live="polite">
        {#each story as line (line.id)}
          <li
            class="story-line"
            class:loss={line.kind === "loss"}
            animate:flip={{ duration: flipDuration() }}
            in:growFade
          >
            {line.text}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section class="village">
    <button
      type="button"
      class="control-btn disclosure"
      aria-expanded={showVillage}
      aria-controls="village-details"
      onclick={() => (showVillage = !showVillage)}
    >
      {showVillage ? "Hide the village" : "Show the village"}
    </button>
    {#if showVillage}
      <div id="village-details" class="details" transition:growFade>
        <dl class="stats">
          <dt>Living</dt>
          <dd>{stats.alive}</dd>
          <dt>Oldest generation</dt>
          <dd>{stats.currentGeneration}</dd>
          <dt>Sequences known</dt>
          <dd>{stats.uniqueSequences}</dd>
          <dt>Lost so far</dt>
          <dd>{stats.extinctionCount}</dd>
        </dl>
        <div class="people" role="group" aria-label="People">
          {#each living as person (person.id)}
            <FilterChipBase
              label={person.name}
              mode="toggle"
              size="sm"
              active={villageState.selectedAvatarId === person.id}
              onclick={() =>
                villageState.selectAvatar(
                  villageState.selectedAvatarId === person.id ? null : person.id
                )}
            />
          {/each}
        </div>
      </div>
    {/if}
  </section>
</aside>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-sm, 12px);
    padding: var(--space-2026-sm, 12px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow-y: auto;
    width: 300px;
    min-width: 300px;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #fff);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2026-xs, 6px);
  }

  .control-btn {
    min-height: 44px;
    padding: 0 var(--space-2026-sm, 12px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }

  .control-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .control-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #e8a87c);
    outline-offset: 2px;
  }

  .wide {
    width: 100%;
  }

  .visitor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-xs, 6px);
  }

  .visitor h3 {
    margin: 0;
  }

  /* Two lines reserved, so a longer status never moves the button. */
  .visitor-status {
    margin: 0;
    min-height: 2.8em;
    line-height: 1.4;
  }

  .control-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .file-input {
    display: none;
  }

  .fixtures {
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    align-items: center;
    gap: var(--space-2026-xs, 6px);
  }

  .fixtures-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .log-error {
    margin: 0;
    color: var(--semantic-error, #ff8a7a);
  }

  .memory {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--space-2026-sm, 12px);
    margin: 0;
  }

  .memory dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .memory dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .seed {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .seed-value {
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: 0 0 var(--space-2026-xs, 6px);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .story-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2026-xs, 6px);
    margin-bottom: var(--space-2026-xs, 6px);
  }

  .story-head h3 {
    margin: 0;
  }

  .story {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .quiet {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .story-lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-xs, 6px);
    line-height: 1.4;
  }

  .story-line {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }

  .story-line.loss {
    color: var(--theme-text, #fff);
    font-style: italic;
  }

  .disclosure {
    width: 100%;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-2026-sm, 12px);
    padding-top: var(--space-2026-sm, 12px);
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--space-2026-sm, 12px);
    margin: 0;
    font-size: var(--font-size-compact, 12px);
  }

  .stats dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .stats dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .people {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2026-xs, 6px);
  }
</style>
