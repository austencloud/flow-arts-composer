<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type {
    StudioIntent,
    StudioLibraryEntry,
  } from "./studio-library-entry.js";

  let {
    open,
    intent = null,
    entries,
    onclose,
    onopen,
    onfeature,
  }: {
    open: boolean;
    intent?: StudioIntent | null;
    entries: StudioLibraryEntry[];
    onclose: () => void;
    onopen: (id: string, footage?: File) => void;
    onfeature: (slug: string) => void;
  } = $props();
  let chosen = $state<StudioIntent | null>(null);
  let name = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let picker = $state(false);
  let pickRequested = $state(false);
  let footageInput = $state<HTMLInputElement>();
  const options = [
    {
      id: "tutorial" as const,
      icon: "fas fa-person-chalkboard",
      title: "Tutorial video",
      description: "Teach a sequence. Reuse an edit or choose a new sequence.",
    },
    {
      id: "showcase" as const,
      icon: "fas fa-display",
      title: "Software showcase",
      description:
        "Show what the app can do with footage, captures and titles.",
    },
    {
      id: "arrangement" as const,
      icon: "fas fa-table-cells",
      title: "Sequence arrangement",
      description:
        "Put sequences side by side, layer them and set their timing.",
    },
  ];
  const option = $derived(options.find((item) => item.id === chosen));
  const templates = $derived(entries.filter((entry) => entry.kind === chosen));

  $effect(() => {
    if (open) {
      chosen = intent;
      name = "";
      error = null;
      picker = false;
      pickRequested = false;
    }
  });
  async function create(sequence: SequenceData): Promise<void> {
    picker = false;
    busy = true;
    error = null;
    try {
      let id: string;
      if (chosen === "arrangement") {
        const service =
          await import("../services/studio-arrangement-projects.js");
        id = await service.createStudioArrangement(sequence, name);
      } else {
        const service = await import("../services/studio-project-library.js");
        id = await service.createStudioTutorial(sequence, name);
      }
      onclose();
      onopen(id);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "The project could not be created.";
    } finally {
      busy = false;
    }
  }
  async function createShowcase(footage?: File): Promise<void> {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const service = await import("../services/studio-project-library.js");
      const title =
        name.trim() ||
        footage?.name.replace(/\.[^.]+$/, "").slice(0, 100) ||
        "Software showcase";
      const id = await service.createSoftwareProject(title);
      onclose();
      onopen(id, footage);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "The project could not be created.";
    } finally {
      busy = false;
    }
  }
  async function copy(entry: StudioLibraryEntry): Promise<void> {
    busy = true;
    error = null;
    try {
      const service = await import("../services/studio-project-library.js");
      const title = name.trim() || `${entry.title} copy`;
      if (entry.featureSlug) {
        const result = await service.duplicateSoftwareFeatureVideo(
          entry.featureSlug,
          title
        );
        onclose();
        onfeature(result);
      } else if (entry.sequenceId) {
        const id = await service.duplicateStudioProject(
          entry.sequenceId,
          title
        );
        onclose();
        onopen(id);
      }
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "The project could not be copied.";
    } finally {
      busy = false;
    }
  }
</script>

<BaseModal
  open={open && !pickRequested && !picker}
  size="lg"
  labelledBy="studio-create-title"
  onclose={() => !busy && onclose()}
  closeOnBackdrop={!busy}
  closeOnEscape={!busy}
  onclosed={() => {
    if (pickRequested) {
      pickRequested = false;
      picker = true;
    }
  }}
>
  <div class="create-project">
    <header>
      <div>
        <h2 id="studio-create-title">
          {option?.title ?? "What are you making?"}
        </h2>
        <p>
          {option
            ? "Start fresh or build on an existing project."
            : "Choose a starting point. Everything opens in Studio."}
        </p>
      </div>
      <button
        class="icon-button"
        type="button"
        disabled={busy}
        onclick={onclose}
        aria-label="Close new project"
        ><i class="fas fa-xmark" aria-hidden="true"></i></button
      >
    </header>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if busy}<p class="status" role="status">Creating your project…</p>{/if}
    {#if !chosen}
      <div class="intents">
        {#each options as item}
          <button
            type="button"
            onclick={() => {
              chosen = item.id;
              error = null;
            }}
          >
            <i class={item.icon} aria-hidden="true"></i>
            <span
              ><strong>{item.title}</strong><span>{item.description}</span
              ></span
            >
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </button>
        {/each}
      </div>
    {:else}
      <button
        class="back"
        type="button"
        disabled={busy}
        onclick={() => (chosen = null)}
        ><i class="fas fa-arrow-left" aria-hidden="true"></i> Change project type</button
      >
      <label class="name"
        >Project name <span>Optional</span><input
          bind:value={name}
          disabled={busy}
          maxlength="100"
          placeholder={option?.title}
        /></label
      >
      {#if chosen === "showcase"}
        <div class="showcase-starts">
          <button
            type="button"
            disabled={busy}
            onclick={() => footageInput?.click()}
          >
            <i class="fas fa-film" aria-hidden="true"></i>
            <span
              ><strong>Import footage</strong><span
                >Start with a screen recording or video from your device.</span
              ></span
            >
          </button>
          <button
            type="button"
            disabled={busy}
            onclick={() => void createShowcase()}
          >
            <i class="far fa-file" aria-hidden="true"></i>
            <span
              ><strong>Start blank</strong><span
                >Add footage, images and text as you go.</span
              ></span
            >
          </button>
        </div>
        <input
          bind:this={footageInput}
          class="footage-input"
          type="file"
          accept="video/*,.mp4,.mov,.webm,.m4v"
          aria-label="Choose footage for your showcase"
          onchange={() => {
            const file = footageInput.files?.[0];
            footageInput.value = "";
            if (file) void createShowcase(file);
          }}
        />
      {/if}
      {#if templates.length && chosen !== "arrangement"}
        <div class="reuse-heading">
          <h3>Reuse an edit</h3>
          <p>Make a separate copy with its clips, timing and layout.</p>
        </div>
        <ul class="templates">
          {#each templates as entry (entry.id)}
            <li>
              <button
                type="button"
                disabled={busy}
                onclick={() => void copy(entry)}
                aria-label={`Create a copy of ${entry.title}${entry.subtitle ? `, ${entry.subtitle}` : ""}`}
              >
                <i class="far fa-copy" aria-hidden="true"></i><span
                  >{entry.title}{#if entry.subtitle}<small class="template-subtitle"
                      >{entry.subtitle}</small
                    >{/if}</span
                ><span class="copy-label"
                  >Create copy <i class="fas fa-arrow-right" aria-hidden="true"
                  ></i></span
                >
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if chosen !== "showcase"}<div class="fresh">
          <div>
            <h3>
              {chosen === "arrangement"
                ? "Choose the first sequence"
                : "Start with a sequence"}
            </h3>
            <p>
              {chosen === "arrangement"
                ? "Add more sequences and adjust the grid in the editor."
                : "Add your recording and build the tutorial around it."}
            </p>
          </div>
          <button
            class="choose"
            type="button"
            disabled={busy}
            onclick={() => (pickRequested = true)}
            >Choose a sequence <i class="fas fa-arrow-right" aria-hidden="true"
            ></i></button
          >
        </div>{/if}
    {/if}
  </div>
</BaseModal>
{#if picker}
  {#await import("#lib/shared/components/sequence-picker/SequencePickerModal.svelte") then module}
    <module.default
      open={picker}
      onSelect={create}
      onClose={() => (picker = false)}
    />
  {/await}
{/if}

<style>
  .create-project {
    padding: clamp(18px, 3vw, 30px);
    color: var(--theme-text);
  }
  header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }
  h2 {
    margin: 0;
    font-size: 26px;
    line-height: 1.2;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  p {
    margin: 8px 0 0;
    color: var(--theme-text-secondary);
    font-size: 14px;
    line-height: 1.5;
  }
  button,
  input {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .icon-button {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 6px;
    background: var(--theme-card-bg);
  }
  .intents {
    display: grid;
    gap: 12px;
    margin-top: 26px;
  }
  .intents button {
    display: flex;
    align-items: center;
    gap: 20px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--theme-card-bg);
    padding: 22px;
    text-align: left;
  }
  .intents button:hover,
  .templates button:hover {
    border-color: var(--theme-text-secondary);
    background: var(--theme-panel-bg);
  }
  .intents button > i:first-child {
    width: 32px;
    font-size: 24px;
    color: var(--theme-accent);
    text-align: center;
  }
  .intents button > span {
    flex: 1;
    display: grid;
    gap: 7px;
  }
  .intents strong {
    font-size: 18px;
  }
  .intents span span {
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .back {
    padding: 10px 0;
    margin: 18px 0 10px;
    border: 0;
    background: transparent;
    font-size: 14px;
    color: var(--theme-text-secondary);
  }
  .name {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .name span {
    margin-left: 8px;
    font-size: 12px;
    font-weight: 400;
    color: var(--theme-text-secondary);
  }
  input {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--theme-card-bg);
    font-size: 16px;
  }
  .reuse-heading {
    margin-top: 28px;
  }
  .showcase-starts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 12px;
    margin-top: 24px;
  }
  .showcase-starts button {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 20px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    text-align: left;
  }
  .showcase-starts button:hover {
    border-color: var(--theme-accent);
  }
  .showcase-starts i {
    padding-top: 2px;
    font-size: 20px;
    color: var(--theme-accent);
  }
  .showcase-starts button > span {
    display: grid;
    gap: 8px;
  }
  .showcase-starts strong {
    font-size: 16px;
  }
  .showcase-starts span span {
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .footage-input {
    display: none;
  }
  .templates {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  .templates button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--theme-card-bg);
    text-align: left;
    font-size: 14px;
  }
  .templates button > span:first-of-type {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .template-subtitle {
    display: block;
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .copy-label {
    color: var(--theme-text-secondary);
    font-size: 12px;
    flex: none;
  }
  .fresh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 18px;
    padding-top: 24px;
    margin-top: 24px;
    border-top: 1px solid var(--theme-stroke);
  }
  .fresh > div {
    flex: 1 1 220px;
  }
  .choose {
    min-height: 44px;
    padding: 10px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 7px;
    background: var(--theme-card-bg);
    font-size: 14px;
  }
  .choose:hover {
    border-color: var(--theme-text-secondary);
  }
  .error {
    color: var(--semantic-error, #ee8989);
  }
  .status {
    padding: 14px 0;
  }
  @media (max-width: 450px) {
    .intents button {
      gap: 12px;
      padding: 16px;
    }
    .copy-label {
      display: none;
    }
  }
</style>
