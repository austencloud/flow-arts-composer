<script lang="ts">
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { DEPLOYED_CHARACTER_DEFINITIONS } from "#lib/shared/3d/config/deployed-characters.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import {
    FLOW_FEST_CAR_CATALOG,
    type FlowFestCarSpec,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-car.js";
  import {
    FLOW_FEST_DEPARTURES,
    createFlowFestDefaultLoadout,
    flowFestBudgetFor,
    flowFestCargoFits,
    flowFestDaylightLeftLabel,
    flowFestDepartureProfile,
    isFlowFestLoadoutDrivable,
    type FlowFestDeparture,
    type FlowFestLoadout,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-loadout.js";
  import { flowFestParkedCarModel } from "./flow-fest-parked-car-catalog";

  /**
   * Thursday before you leave: who you are, what you drive, and when you go.
   * Every control here has a consequence on the road already. The budget is
   * derived from the choices rather than edited, and the wheel is the only
   * cargo, so the car has to have room for it.
   */
  interface Props {
    onDepart: (loadout: FlowFestLoadout) => void;
  }

  const props: Props = $props();

  let loadout = $state<FlowFestLoadout>(createFlowFestDefaultLoadout());

  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const budget = $derived(flowFestBudgetFor(loadout.carModelId));
  const drivable = $derived(isFlowFestLoadoutDrivable(loadout));
  const departure = $derived(flowFestDepartureProfile(loadout.departure));
  const paints = $derived(
    flowFestParkedCarModel(loadout.carModelId).paint?.variants ?? []
  );
  const departureOptions = FLOW_FEST_DEPARTURES.map((profile) => ({
    value: profile.id,
    label: profile.label,
  }));

  function carShortfallUsd(spec: FlowFestCarSpec): number {
    return Math.max(0, -flowFestBudgetFor(spec.modelId).remainingUsd);
  }

  function carAvailable(spec: FlowFestCarSpec): boolean {
    return carShortfallUsd(spec) === 0 && flowFestCargoFits(spec.modelId);
  }

  function chooseCharacter(characterId: CharacterId): void {
    loadout = { ...loadout, characterId };
  }

  function chooseCar(spec: FlowFestCarSpec): void {
    if (!carAvailable(spec) || loadout.carModelId === spec.modelId) return;
    loadout = { ...loadout, carModelId: spec.modelId, paintIndex: 0 };
  }

  function choosePaint(paintIndex: number): void {
    loadout = { ...loadout, paintIndex };
  }

  function chooseDeparture(departureId: FlowFestDeparture): void {
    loadout = { ...loadout, departure: departureId };
  }

  function queueLabel(cars: number): string {
    if (cars === 0) return "Gate empty";
    return cars === 1 ? "1 car ahead" : `${cars} cars ahead`;
  }

  /** The row already says "daylight"; the value keeps only the time. */
  function daylightValue(minutes: number): string {
    return flowFestDaylightLeftLabel(minutes).replace(" of daylight", "");
  }

  function depart(): void {
    if (!drivable) return;
    props.onDepart({ ...loadout, props: [...loadout.props] });
  }
</script>

<div class="loadout">
  <header class="loadout-heading">
    <span>Thursday · before you leave</span>
    <h2>Pack the car</h2>
    <p>
      Who you are, what you drive, and when you leave. The budget is what it is.
    </p>
  </header>

  <section aria-labelledby="flow-fest-loadout-character">
    <div class="section-heading">
      <span>Who</span>
      <h3 id="flow-fest-loadout-character">Your character</h3>
    </div>
    <div
      class="characters"
      role="radiogroup"
      aria-labelledby="flow-fest-loadout-character"
    >
      {#each DEPLOYED_CHARACTER_DEFINITIONS as character (character.id)}
        <button
          type="button"
          role="radio"
          aria-checked={loadout.characterId === character.id}
          class:selected={loadout.characterId === character.id}
          onclick={() => chooseCharacter(character.id as CharacterId)}
        >
          <i class="fas {character.icon ?? 'fa-user'}" aria-hidden="true"></i>
          <strong>{character.name}</strong>
        </button>
      {/each}
    </div>
  </section>

  <section aria-labelledby="flow-fest-loadout-car">
    <div class="section-heading">
      <span>What you drive</span>
      <h3 id="flow-fest-loadout-car">The car</h3>
    </div>
    <div class="cars" role="radiogroup" aria-labelledby="flow-fest-loadout-car">
      {#each FLOW_FEST_CAR_CATALOG as spec (spec.modelId)}
        {@const shortfall = carShortfallUsd(spec)}
        {@const available = carAvailable(spec)}
        <button
          type="button"
          role="radio"
          aria-checked={loadout.carModelId === spec.modelId}
          aria-disabled={!available}
          class:selected={loadout.carModelId === spec.modelId}
          class:unavailable={!available}
          onclick={() => chooseCar(spec)}
        >
          <strong>{spec.label}</strong>
          <span class="price">{usd.format(spec.priceUsd)}</span>
          <small>{spec.cargoLitres} L cargo · {spec.massKilograms} kg</small>
          {#if shortfall > 0}
            <em>{usd.format(shortfall)} short</em>
          {:else if !flowFestCargoFits(spec.modelId)}
            <em>No room for the wheel</em>
          {/if}
        </button>
      {/each}
    </div>
    {#if paints.length > 1}
      <div class="paint" role="radiogroup" aria-label="Paint">
        {#each paints as paint, index (paint)}
          <button
            type="button"
            role="radio"
            aria-checked={loadout.paintIndex === index}
            aria-label={`Paint ${index + 1} of ${paints.length}`}
            style:--paint={paint}
            onclick={() => choosePaint(index)}
          ></button>
        {/each}
      </div>
    {/if}
  </section>

  <section aria-labelledby="flow-fest-loadout-departure">
    <div class="section-heading">
      <span>When you leave</span>
      <h3 id="flow-fest-loadout-departure">Departure</h3>
    </div>
    <SegmentedControl
      options={departureOptions}
      value={loadout.departure}
      onchange={chooseDeparture}
      color="accent"
      semantics="radiogroup"
      ariaLabelledby="flow-fest-loadout-departure"
    />
    <dl class="departure-facts">
      <div>
        <dt>Arrive</dt>
        <dd>{departure.clockLabel}</dd>
      </div>
      <div>
        <dt>Gate</dt>
        <dd>{queueLabel(departure.gateQueueCars)}</dd>
      </div>
      <div>
        <dt>Daylight left</dt>
        <dd>{daylightValue(departure.daylightLeftMinutes)}</dd>
      </div>
      <div>
        <dt>Energy</dt>
        <dd>{departure.startingEnergyPercent}%</dd>
      </div>
    </dl>
    <p class="departure-detail">{departure.detail}</p>
  </section>

  <footer class="loadout-foot">
    <p class="budget">
      <strong>{usd.format(budget.remainingUsd)}</strong>
      <span
        >left of {usd.format(budget.savingsUsd)} after the {usd.format(
          budget.ticketUsd
        )} ticket and the {usd.format(budget.carUsd)} car</span
      >
    </p>
    <ActionButton
      label="Hit the road"
      icon="fa-road"
      color="fuse"
      disabled={!drivable}
      onclick={depart}
    />
  </footer>
</div>

<style>
  .loadout {
    display: grid;
    gap: 1.1rem;
    color: var(--sim-text);
  }

  .loadout-heading {
    text-align: center;
  }

  .loadout-heading span,
  .section-heading span {
    color: var(--sim-accent);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .loadout-heading h2 {
    margin: 0.2rem 0 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    font-weight: 560;
  }

  .loadout-heading p,
  .departure-detail {
    margin: 0.35rem 0 0;
    color: var(--sim-muted);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  section {
    display: grid;
    gap: 0.6rem;
  }

  .section-heading {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }

  .section-heading h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .characters,
  .cars {
    display: grid;
    gap: 0.5rem;
  }

  .characters {
    grid-template-columns: repeat(auto-fill, minmax(7.25rem, 1fr));
  }

  .cars {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  }

  .characters button,
  .cars button {
    display: grid;
    gap: 0.25rem;
    justify-items: start;
    min-block-size: var(--min-touch-target, 3rem);
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--sim-stroke);
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.055);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }

  .characters button {
    justify-items: center;
    text-align: center;
  }

  .characters i {
    color: var(--sim-accent);
    font-size: 1.2rem;
  }

  .characters button:hover,
  .characters button:focus-visible,
  .cars button:hover,
  .cars button:focus-visible {
    border-color: rgba(255, 180, 95, 0.6);
    outline: none;
  }

  .characters button.selected,
  .cars button.selected {
    border-color: rgba(255, 180, 95, 0.85);
    background: rgba(255, 180, 95, 0.13);
  }

  .cars .price {
    color: var(--sim-mint);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .cars small {
    color: var(--sim-muted);
    font-size: 0.75rem;
  }

  .cars em {
    color: #f0a08c;
    font-size: 0.75rem;
    font-style: normal;
    font-weight: 700;
  }

  .cars button.unavailable {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .paint {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .paint button {
    inline-size: var(--min-touch-target, 3rem);
    block-size: var(--min-touch-target, 3rem);
    padding: 0;
    border: 2px solid var(--sim-stroke);
    border-radius: 50%;
    background: var(--paint);
    cursor: pointer;
  }

  .paint button[aria-checked="true"] {
    border-color: var(--sim-accent);
    box-shadow: 0 0 0 2px rgba(255, 180, 95, 0.35);
  }

  .paint button:focus-visible {
    outline: 2px solid var(--sim-accent);
    outline-offset: 2px;
  }

  .departure-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }

  .departure-facts div {
    padding: 0.5rem 0.65rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .departure-facts dt {
    color: var(--sim-muted);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .departure-facts dd {
    margin: 0.15rem 0 0;
    font-weight: 700;
  }

  .loadout-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block-start: 0.6rem;
    border-block-start: 1px solid var(--sim-stroke);
  }

  .budget {
    display: grid;
    margin: 0;
  }

  .budget strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }

  .budget span {
    color: var(--sim-muted);
    font-size: 0.78rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .characters button,
    .cars button {
      transition: none;
    }
  }
</style>
