<script lang="ts">
  import type {
    CAPSegment,
    TrochoidFrame,
    TrochoidParameters,
  } from "@caps/domain";

  let {
    kind,
    layer,
    classificationLabel,
    notation,
    parameters,
    segments,
    frame,
    activeSegmentIndex,
    isCustom,
    onparameter,
  }: {
    kind: "elementary" | "assembly";
    layer: "trace" | "assembly" | "mechanism";
    classificationLabel: string;
    notation: string;
    parameters: TrochoidParameters;
    segments: CAPSegment[];
    frame: TrochoidFrame;
    activeSegmentIndex: number;
    isCustom: boolean;
    onparameter: (key: keyof TrochoidParameters, value: number) => void;
  } = $props();

  const TAU = 2 * Math.PI;

  function scalar(value: number): string {
    if (Math.abs(value - Math.round(value)) < 1e-8) {
      return String(Math.round(value));
    }
    for (const denominator of [2, 3, 4, 5, 8]) {
      const numerator = Math.round(value * denominator);
      if (Math.abs(value - numerator / denominator) < 1e-8) {
        return `${numerator}/${denominator}`;
      }
    }
    return String(Number(value.toFixed(2)));
  }

  function segmentNotation(segment: CAPSegment): string {
    return `${scalar(segment.theta1)} ${scalar(segment.theta2)} ; ${scalar(segment.rho1)} ${scalar(segment.rho2)} ; ${scalar(segment.d)}`;
  }

  function rangeValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<aside class="rail" aria-label="Construction explanation">
  {#if layer === "trace"}
    <div class="layer-copy">
      <span class="rail-kicker">Trace</span>
      <h4>Follow E</h4>
      <p>
        The bright point is the prop tip. Its path is the curve. Pause or scrub
        to inspect any instant without the construction marks in the way.
      </p>
      <dl class="curve-facts">
        <div>
          <dt>Family</dt>
          <dd>{classificationLabel}</dd>
        </div>
        <div>
          <dt>Path</dt>
          <dd>
            {kind === "assembly"
              ? `${segments.length} joined fragments`
              : "one elementary curve"}
          </dd>
        </div>
        <div>
          <dt>Notation</dt>
          <dd><code>{notation}</code></dd>
        </div>
      </dl>
    </div>
  {:else if layer === "assembly"}
    <div class="layer-copy">
      <span class="rail-kicker">Assembly</span>
      <h4>One after the other</h4>
      <p>
        The first fragment ends exactly where the second begins. Both the hand
        point M and the prop tip E meet at the join, so the physical path stays
        continuous.
      </p>
      <ol class="fragment-list">
        {#each segments as segment, index (index)}
          <li class:active-fragment={index === activeSegmentIndex}>
            <span>Fragment {index + 1}</span>
            <code>{segmentNotation(segment)}</code>
          </li>
        {/each}
      </ol>
    </div>
  {:else}
    <div class="layer-copy mechanism-copy">
      <span class="rail-kicker">Mechanism</span>
      <h4>Two rotating vectors</h4>
      <p>
        O stays fixed. M circles O at θ₁. E circles M at θ₁ + θ₂ in the ground
        frame. Together they place the prop tip at E.
      </p>

      <div
        class="equation"
        role="math"
        aria-label="P of t equals rho one times cosine and sine of two pi theta one t, plus rho two times cosine and sine of two pi times theta one plus theta two times t"
      >
        <span aria-hidden="true">
          <i>P</i>(t) = ρ₁(cos 2πθ₁t, sin 2πθ₁t)<br />
          + ρ₂(cos 2π(θ₁ + θ₂)t, sin 2π(θ₁ + θ₂)t)
        </span>
      </div>

      <div class="instant-readout">
        <span>At this instant</span>
        <dl>
          {#if kind === "assembly"}
            <div>
              <dt>Fragment</dt>
              <dd>{activeSegmentIndex + 1} of {segments.length}</dd>
            </div>
          {/if}
          <div>
            <dt>Local t</dt>
            <dd>{frame.t.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Arm angle</dt>
            <dd>{(frame.armAngle / TAU).toFixed(2)} turns</dd>
          </div>
          <div>
            <dt>Prop angle</dt>
            <dd>{(frame.propAngle / TAU).toFixed(2)} turns</dd>
          </div>
        </dl>
      </div>

      {#if kind === "elementary"}
        <details class="parameter-disclosure">
          <summary>
            <span
              ><strong>Adjust parameters</strong><small
                >{isCustom
                  ? "Custom curve active"
                  : "Detach from the atlas"}</small
              ></span
            >
            <i class="fas fa-plus" aria-hidden="true"></i>
          </summary>
          <div class="control-list">
            <label class="parameter arm-turns">
              <span class="parameter-name"
                ><b>θ₁</b><small>Arm turns</small></span
              >
              <output>{scalar(parameters.theta1)}</output>
              <input
                type="range"
                min="-3"
                max="3"
                step="1"
                value={parameters.theta1}
                oninput={(event) => onparameter("theta1", rangeValue(event))}
              />
            </label>
            <label class="parameter prop-turns">
              <span class="parameter-name"
                ><b>θ₂</b><small>Prop turns, relative</small></span
              >
              <output>{scalar(parameters.theta2)}</output>
              <input
                type="range"
                min="-8"
                max="8"
                step="1"
                value={parameters.theta2}
                oninput={(event) => onparameter("theta2", rangeValue(event))}
              />
            </label>
            <label class="parameter arm-radius">
              <span class="parameter-name"
                ><b>ρ₁</b><small>Arm radius</small></span
              >
              <output>{scalar(parameters.rho1)}</output>
              <input
                type="range"
                min="0.25"
                max="1.25"
                step="0.05"
                value={parameters.rho1}
                oninput={(event) => onparameter("rho1", rangeValue(event))}
              />
            </label>
            <label class="parameter prop-radius">
              <span class="parameter-name"
                ><b>ρ₂</b><small>Prop radius</small></span
              >
              <output>{scalar(parameters.rho2)}</output>
              <input
                type="range"
                min="0.1"
                max="1.25"
                step="0.05"
                value={parameters.rho2}
                oninput={(event) => onparameter("rho2", rangeValue(event))}
              />
            </label>
            <label class="parameter cycle-division">
              <span class="parameter-name"
                ><b>d</b><small>Cycle used</small></span
              >
              <output>{scalar(parameters.d)}</output>
              <input
                type="range"
                min="0.25"
                max="1"
                step="0.25"
                value={parameters.d}
                oninput={(event) => onparameter("d", rangeValue(event))}
              />
            </label>
          </div>
        </details>
      {:else}
        <p class="inspect-note">
          Published assemblies stay inspect-only. Choose an elementary curve to
          change its geometry.
        </p>
      {/if}

      <details class="model-source">
        <summary>
          <span
            ><strong>Damien's 2009 O/M/E diagram</strong><small
              >The source model behind this construction</small
            ></span
          >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </summary>
        <figure>
          <img
            src="/caps/original/model.jpg"
            alt="Damien's 2009 O, M, and E construction diagram"
            width="427"
            height="305"
            loading="lazy"
          />
          <figcaption>
            O is the shoulder, M the hand, and E the prop extremity.
          </figcaption>
        </figure>
      </details>
    </div>
  {/if}
</aside>

<style>
  .rail {
    min-width: 0;
    padding: clamp(1.15rem, 2.2cqi, 2rem);
    border-left: 1px solid var(--construction-border);
    background: color-mix(in srgb, var(--construction-panel) 92%, transparent);
  }

  .layer-copy {
    display: grid;
    align-content: start;
    gap: 0.85rem;
  }

  .rail-kicker,
  .instant-readout > span {
    color: color-mix(in srgb, var(--construction-trace-b) 86%, white);
    font-size: 0.75rem;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h4 {
    margin: -0.5rem 0 0;
    color: var(--construction-text);
    font-size: clamp(1.25rem, 1rem + 0.8cqi, 1.85rem);
    letter-spacing: -0.025em;
  }

  p {
    margin: 0;
    color: var(--construction-muted);
    font-size: clamp(0.875rem, 0.82rem + 0.15cqi, 1rem);
    line-height: 1.55;
  }

  .curve-facts,
  .instant-readout dl {
    display: grid;
    gap: 0.45rem;
    margin: 0.25rem 0 0;
    padding: 0.9rem;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 0.8rem;
    background: rgb(255 255 255 / 0.025);
  }

  .curve-facts div,
  .instant-readout dl div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  dt {
    color: var(--construction-muted);
    font-size: 0.8rem;
  }
  dd {
    min-width: 0;
    margin: 0;
    color: var(--construction-text);
    font-size: 0.8rem;
    text-align: right;
  }
  dd code {
    white-space: normal;
  }
  code,
  output,
  dd {
    font-variant-numeric: tabular-nums;
  }

  .fragment-list {
    display: grid;
    gap: 0.55rem;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    counter-reset: none;
  }
  .fragment-list li {
    display: grid;
    gap: 0.3rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 0.025);
    opacity: 0.68;
    transition:
      opacity 160ms ease,
      border-color 160ms ease;
  }
  .fragment-list li.active-fragment {
    border-color: color-mix(
      in srgb,
      var(--construction-trace-b) 48%,
      transparent
    );
    opacity: 1;
  }
  .fragment-list span {
    color: var(--construction-text);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .fragment-list code {
    color: var(--construction-muted);
    font-size: 0.75rem;
    white-space: normal;
  }
  .equation {
    padding: 0.8rem;
    overflow-x: auto;
    border-block: 1px solid
      color-mix(in srgb, var(--construction-border) 75%, transparent);
    color: color-mix(
      in srgb,
      var(--construction-text) 88%,
      var(--construction-trace-b)
    );
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: clamp(0.72rem, 0.67rem + 0.15cqi, 0.85rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.6;
  }

  .instant-readout {
    padding: 0;
  }

  .parameter-disclosure,
  .model-source {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 0.8rem;
    background: rgb(255 255 255 / 0.02);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 52px;
    padding: 0.7rem 0.85rem;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary span {
    display: grid;
    gap: 0.12rem;
  }
  summary strong {
    color: var(--construction-text);
    font-size: 0.85rem;
  }
  summary small {
    color: var(--construction-muted);
    font-size: 0.72rem;
  }
  summary i {
    color: var(--construction-trace-b);
    transition: transform 160ms ease;
  }
  details[open] summary i {
    transform: rotate(45deg);
  }
  summary:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -3px;
    border-radius: 0.8rem;
  }

  .control-list {
    display: grid;
    gap: 0.2rem;
    padding: 0 0.85rem 0.85rem;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }
  .parameter {
    --slider-color: var(--construction-trace-b);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3rem;
    align-items: center;
    column-gap: 0.7rem;
    padding-top: 0.55rem;
  }
  .parameter.arm-turns,
  .parameter.arm-radius {
    --slider-color: var(--construction-arm);
  }
  .parameter.prop-turns,
  .parameter.prop-radius {
    --slider-color: var(--construction-prop);
  }
  .parameter-name {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    min-width: 0;
  }
  .parameter-name b {
    min-width: 1.45rem;
    color: var(--slider-color);
  }
  .parameter-name small {
    overflow: hidden;
    color: var(--construction-muted);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .parameter output {
    color: var(--construction-text);
    font-family: ui-monospace, monospace;
    font-size: 0.78rem;
    text-align: right;
  }
  .parameter input {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 44px;
    margin: 0;
    accent-color: var(--slider-color);
    cursor: pointer;
  }
  .parameter input:focus-visible {
    outline: 2px solid var(--slider-color);
    outline-offset: 2px;
    border-radius: 0.5rem;
  }

  .inspect-note {
    padding: 0.75rem 0.85rem;
    border-left: 3px solid
      color-mix(in srgb, var(--construction-trace-b) 56%, transparent);
    background: rgb(255 255 255 / 0.025);
    font-size: 0.8rem;
  }

  .model-source figure {
    margin: 0;
    padding: 0 0.85rem 0.85rem;
  }
  .model-source img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 0.65rem;
  }
  .model-source figcaption {
    margin-top: 0.45rem;
    color: var(--construction-muted);
    font-size: 0.75rem;
    line-height: 1.45;
  }

  @container (max-width: 55rem) {
    .rail {
      border-top: 1px solid var(--construction-border);
      border-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fragment-list li,
    summary i {
      transition: none;
    }
  }
</style>
