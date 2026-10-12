<script lang="ts">
  /**
   * AdminFormField
   * Form input wrapper with label and validation
   */

  import type {
    AdminFormFieldType,
    SelectOption,
  } from "../types/admin-component-types";

  interface AdminFormFieldProps {
    label: string;
    type?: AdminFormFieldType;
    value: string | number | boolean;
    onChange: (value: string | number | boolean) => void;
    error?: string;
    helpText?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    options?: SelectOption[];
    class?: string;
  }

  let {
    label,
    type = "text",
    value = $bindable(),
    onChange,
    error,
    helpText,
    required = false,
    disabled = false,
    placeholder,
    options = [],
    class: className = "",
  }: AdminFormFieldProps = $props();

  // Stable unique ID for accessibility - generated once per component instance.
  // Using $props.id() (Svelte 5) avoids the re-derive churn of Math.random().
  const baseId = $props.id();
  const fieldId = baseId;
  const errorId = `${baseId}-error`;
  const helpId = `${baseId}-help`;

  // Build aria-describedby value from available descriptions
  const describedBy = $derived.by(() => {
    const ids: string[] = [];
    if (error) ids.push(errorId);
    if (helpText) ids.push(helpId);
    return ids.length > 0 ? ids.join(" ") : undefined;
  });

  function handleChange(e: Event) {
    const target = e.target as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;

    if (type === "number") {
      const num = Number(target.value);
      value = num;
      onChange(num);
    } else {
      value = target.value;
      onChange(target.value);
    }
  }

  function handleToggle() {
    if (disabled) return;
    const next = !value;
    value = next;
    onChange(next);
  }
</script>

<div class="admin-form-field {className}" class:has-error={error}>
  <label class="field-label" for={fieldId}>
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  {#if type === "text" || type === "number"}
    <input
      id={fieldId}
      class="field-input"
      {type}
      bind:value
      {placeholder}
      {required}
      {disabled}
      aria-required={required}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      onchange={handleChange}
    />
  {:else if type === "textarea"}
    <textarea
      id={fieldId}
      class="field-textarea"
      bind:value
      {placeholder}
      {required}
      {disabled}
      aria-required={required}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      onchange={handleChange}
      rows="3"
    ></textarea>
  {:else if type === "select"}
    <select
      id={fieldId}
      class="field-select"
      bind:value
      {disabled}
      onchange={handleChange}
    >
      {#each options as option}
        <option value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      {/each}
    </select>
  {:else if type === "toggle"}
    <button
      id={fieldId}
      type="button"
      class="field-toggle"
      class:checked={value}
      role="switch"
      aria-checked={!!value}
      aria-label={label}
      aria-describedby={describedBy}
      {disabled}
      onclick={handleToggle}
    >
      <span class="toggle-slider" aria-hidden="true"></span>
    </button>
  {/if}

  {#if helpText}
    <span id={helpId} class="field-help">{helpText}</span>
  {/if}

  {#if error}
    <span id={errorId} class="field-error" role="alert" aria-live="assertive"
      >{error}</span
    >
  {/if}
</div>

<style>
  .admin-form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text);
  }

  .required {
    color: var(--semantic-error);
  }

  .field-input,
  .field-textarea,
  .field-select {
    padding: 10px 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .field-input:focus,
  .field-textarea:focus,
  .field-select:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }

  .field-textarea {
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .field-select {
    cursor: pointer;
  }

  /* Toggle */
  .field-toggle {
    position: relative;
    display: inline-block;
    width: var(--min-touch-target);
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    align-self: flex-start;
  }

  .field-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-toggle:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
    border-radius: 24px;
  }

  .toggle-slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--theme-card-bg);
    transition: var(--duration-emphasis);
    border-radius: 24px;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: var(--duration-emphasis);
    border-radius: 50%;
  }

  .field-toggle.checked .toggle-slider {
    background-color: var(--semantic-success);
  }

  .field-toggle.checked .toggle-slider:before {
    transform: translateX(24px);
  }

  /* Help and error text */
  .field-help {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .field-error {
    font-size: var(--font-size-compact);
    color: color-mix(in srgb, var(--semantic-error) 60%, white);
  }

  .has-error .field-input,
  .has-error .field-textarea,
  .has-error .field-select {
    border-color: var(--semantic-error);
  }

  /* Disabled state */
  .field-input:disabled,
  .field-textarea:disabled,
  .field-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
