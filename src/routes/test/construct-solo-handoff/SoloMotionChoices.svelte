<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    turnValuesForLevel,
    turnValueToKey,
    keyToTurnValue,
    formatTurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { getSoloAuthoringContext } from "./solo-authoring-state.svelte.js";
  import { handName } from "./construct-solo-proposal";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  const authoring = getSoloAuthoringContext();
  let settingsOpen = $state(false);
  const palette = $derived(
    turnValuesForLevel(authoring.level).map((value) => ({
      value: turnValueToKey(value),
      label: formatTurnValue(value),
    }))
  );
  const tone = $derived(authoring.activeHand === "left" ? "blue" : "red");
  const labels = {
    pro: "Pro",
    anti: "Anti",
    float: "Float",
    dash: "Dash",
    static: "Static",
  };
  function label(option: StepData) {
    const motion = option.motions[authoring.activeHand];
    return labels[motion.motionType] + " · " + motion.endLocation.toUpperCase();
  }
  // Avoid passing step-number presentation into a catalog choice.
  function picture(option: StepData) {
    return {
      id: option.id,
      motions: option.motions,
      gridMode: option.gridMode,
      letter: null,
    };
  }
</script>

<div class="motion-tools">
  <span>Motion choices</span>
  <PanelButton
    ariaExpanded={settingsOpen}
    onclick={() => (settingsOpen = !settingsOpen)}
  >
    {settingsOpen ? "Done" : `Turns · ${formatTurnValue(authoring.turns)}`}
  </PanelButton>
</div>
{#if settingsOpen}
  <section
    class="turn-settings"
    aria-label={`${handName(authoring.activeHand)} turns settings`}
  >
    <h3>{handName(authoring.activeHand)} turns</h3>
    <span>Choose the level, then the turns for your next motion.</span>
    <SegmentedControl
      color={tone}
      semantics="radiogroup"
      ariaLabel="Difficulty level"
      value={String(authoring.level)}
      onchange={(value) => authoring.setLevel(Number(value))}
      options={[
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ]}
    />
    <SegmentedControl
      color={tone}
      semantics="radiogroup"
      ariaLabel={`${handName(authoring.activeHand)} turns`}
      columns={4}
      value={turnValueToKey(authoring.turns)}
      onchange={(value) => authoring.setTurns(keyToTurnValue(value))}
      options={palette}
    />
    {#if typeof authoring.turns === "number" && authoring.turns > 0}
      <span>Dash / static spin direction</span>
      <SegmentedControl
        color={tone}
        semantics="radiogroup"
        ariaLabel="Dash and static spin direction"
        value={authoring.direction}
        onchange={authoring.setDirection}
        options={[
          { value: RotationDirection.CLOCKWISE, label: "Clockwise" },
          {
            value: RotationDirection.COUNTER_CLOCKWISE,
            label: "Counterclockwise",
          },
        ]}
      />
    {/if}
  </section>
{:else if authoring.loading}
  <div class="message" role="status">Loading motion choices…</div>
{:else if authoring.error}
  <div class="message" role="alert">
    <p>{authoring.error}</p>
    <PanelButton onclick={authoring.loadCatalog}>Retry loading</PanelButton>
  </div>
{:else if !authoring.options.length}
  <div class="message">
    No motions match these turns. <PanelButton
      onclick={() => (settingsOpen = true)}>Change turns</PanelButton
    >
  </div>
{:else}
  <div
    class="motion-grid"
    aria-label={`${handName(authoring.activeHand)} motion choices`}
    style:--rows={Math.ceil(authoring.options.length / 3)}
    style:--phone-rows={Math.ceil(authoring.options.length / 2)}
  >
    {#each authoring.options as option (option.id)}
      <button
        class="motion-choice"
        onclick={() => authoring.append(option)}
        aria-label={`Add ${label(option)} as ${handName(authoring.activeHand).toLowerCase()} step ${option.stepNumber}`}
      >
        <span class="picture"
          ><PictographContainer
            pictographData={picture(option)}
            disableTransitions
            stepNumberOverride={false}
          /></span
        >
        <span>{label(option)}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .motion-tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .turn-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px;
    font-size: 14px;
  }
  h3 {
    margin: 0;
    font-size: 18px;
  }
  .motion-grid {
    display: grid;
    min-height: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
    gap: 10px;
  }
  .motion-choice {
    width: 100%;
    aspect-ratio: 1 / 1.12;
    max-height: 100%;
    align-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    overflow: hidden;
  }
  .motion-choice:hover {
    background: var(--theme-hover-bg, #26262d);
    border-color: var(--theme-text-dim);
  }
  .motion-choice:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }
  .picture {
    display: block;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 320px;
    position: relative;
  }
  .message {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 12px;
    text-align: center;
  }
  @media (max-width: 600px) {
    .motion-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(var(--phone-rows), minmax(0, 1fr));
      gap: 6px;
    }
    .motion-choice {
      padding: 4px;
      gap: 2px;
    }
  }
  @media (max-height: 550px) and (min-width: 701px) {
    .motion-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
      gap: 6px;
    }
    .motion-choice {
      padding: 4px;
      gap: 2px;
    }
  }
</style>
