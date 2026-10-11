<script lang="ts">
  import MyPropsDrawer from "#lib/shared/navigation/components/account/MyPropsDrawer.svelte";
  import type { PropPreferenceState } from "#lib/shared/community/state/prop-preference-state.svelte.js";
  import type { CatdogCombo } from "#lib/shared/community/services/types.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let isOpen = $state(true);
  let selectedProps = $state<PropType[]>([
    PropType.BIGSTAFF,
    PropType.BIGFAN,
    PropType.TORCH,
  ]);
  let favoriteProp = $state<PropType | null>(PropType.TORCH);
  let favoriteCatdog = $state<CatdogCombo | null>(null);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let failNextSave = $state(false);
  let writeCount = $state(0);

  // Review-only adapter for the production drawer. It keeps the real component
  // and state transitions while replacing Firebase writes with local state.
  const propState = {
    get propsISpinWith() {
      return selectedProps;
    },
    get favoriteProp() {
      return favoriteProp;
    },
    get favoriteCatdog() {
      return favoriteCatdog;
    },
    get loading() {
      return false;
    },
    get saving() {
      return saving;
    },
    get error() {
      return error;
    },
    async saveProfileSelection(
      props: readonly PropType[],
      profileProp: PropType | null
    ) {
      saving = true;
      error = null;
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (failNextSave) {
        failNextSave = false;
        saving = false;
        error =
          "Your changes weren't saved. The editor kept your choices so you can retry.";
        throw new Error("Simulated profile preference write failure");
      }
      selectedProps = [...props];
      favoriteProp = profileProp;
      writeCount += 1;
      saving = false;
    },
    async toggleProp(prop: PropType) {
      if (selectedProps.includes(prop)) {
        selectedProps = selectedProps.filter((selected) => selected !== prop);
        if (favoriteProp === prop) favoriteProp = null;
      } else {
        selectedProps = [...selectedProps, prop];
      }
    },
    async setFavorite(prop: PropType | null) {
      if (prop === null) {
        favoriteProp = null;
        return;
      }
      if (!selectedProps.includes(prop)) {
        selectedProps = [...selectedProps, prop];
      }
      favoriteProp = prop;
    },
    async setCatdogFavorite(combo: CatdogCombo | null) {
      favoriteCatdog = combo;
    },
    async reload() {},
    clearError() {
      error = null;
    },
  } satisfies PropPreferenceState;
</script>

<main class="review-page">
  <section class="review-card">
    <p class="kicker">Production component review</p>
    <h1>Prop picker, isolated</h1>
    <p>
      This is the real My Props drawer with disposable data. Nothing selected
      here reaches Firebase or changes the signed-in account.
    </p>
    <dl>
      <div>
        <dt>Selected</dt>
        <dd>{selectedProps.length}</dd>
      </div>
      <div>
        <dt>Favorite</dt>
        <dd>{favoriteProp ?? "None"}</dd>
      </div>
      <div>
        <dt>Writes</dt>
        <dd>{writeCount}</dd>
      </div>
      <div>
        <dt>Next save</dt>
        <dd>{failNextSave ? "Fail" : "Succeed"}</dd>
      </div>
    </dl>
    <div class="simulation-controls" aria-label="Review save behavior">
      <button
        type="button"
        class:active={!failNextSave}
        onclick={() => (failNextSave = false)}>Next save succeeds</button
      >
      <button
        type="button"
        class:active={failNextSave}
        onclick={() => (failNextSave = true)}>Fail next save</button
      >
    </div>
    <button class="open-button" onclick={() => (isOpen = true)}>
      Open prop picker
    </button>
  </section>
</main>

<MyPropsDrawer
  bind:isOpen
  {propState}
  onclose={() => {
    isOpen = false;
  }}
/>

<style>
  .review-page {
    display: grid;
    min-height: 100dvh;
    place-items: center;
    padding: clamp(1rem, 4vw, 4rem);
    color: var(--theme-text, #f8fafc);
    background: radial-gradient(
        circle at 18% 12%,
        color-mix(in srgb, var(--prop-blue, #3b82f6) 18%, transparent),
        transparent 32%
      ),
      #080a0f;
  }

  .review-card {
    width: min(100%, 36rem);
    padding: clamp(1.25rem, 3vw, 2rem);
    background: var(--theme-panel-bg, #11141c);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-xl, 1.25rem);
  }

  .kicker,
  h1,
  p,
  dl {
    margin: 0;
  }

  .kicker {
    color: color-mix(in srgb, var(--prop-blue, #3b82f6) 72%, white);
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 0.35rem;
    font-size: clamp(1.75rem, 5vw, 2.75rem);
    line-height: 1.05;
  }

  p:not(.kicker) {
    margin-top: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.6;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  dl div {
    padding: 0.85rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
  }

  dt {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
  }

  dd {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .open-button {
    min-height: var(--min-touch-target, 44px);
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
    color: white;
    background: var(--theme-accent, #6366f1);
    border: 0;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .simulation-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .simulation-controls button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.6rem 0.8rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.65rem;
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
  }

  .simulation-controls button.active {
    color: var(--theme-text, white);
    border-color: var(--theme-accent, #6366f1);
  }

  .open-button:focus-visible {
    outline: 3px solid white;
    outline-offset: 3px;
  }
</style>
