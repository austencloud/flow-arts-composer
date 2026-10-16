<script lang="ts">
  /**
   * AdminFormField
   * Form input wrapper with label and validation
   */

  import type {
    AdminFormFieldType,
    SelectOption,
  } from "../types/admin-component-types";
  import { FormField } from "@austencloud/ui";

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

<FormField
  {label}
  help={helpText}
  {error}
  {required}
  {disabled}
  class="admin-form-field {className}"
>
  {#snippet children(field)}
    {#if type === "text" || type === "number"}
      <input
        id={field.id}
        class="field-input"
        {type}
        bind:value
        {placeholder}
        {required}
        {disabled}
        aria-required={field.required}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
        onchange={handleChange}
      />
    {:else if type === "textarea"}
      <textarea
        id={field.id}
        class="field-textarea"
        bind:value
        {placeholder}
        {required}
        {disabled}
        aria-required={field.required}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
        onchange={handleChange}
        rows="3"
      ></textarea>
    {:else if type === "select"}
      <select
        id={field.id}
        class="field-select"
        bind:value
        {required}
        {disabled}
        aria-required={field.required}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
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
        id={field.id}
        type="button"
        class="field-toggle"
        class:checked={value}
        role="switch"
        aria-checked={!!value}
        aria-label={label}
        aria-invalid={field.invalid}
        aria-required={field.required}
        aria-describedby={field.describedBy}
        {disabled}
        onclick={handleToggle}
      >
        <span class="toggle-slider" aria-hidden="true"></span>
      </button>
    {/if}
  {/snippet}
</FormField>

<style>
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
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
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
    top: 50%;
    left: 0;
    right: 0;
    height: 24px;
    transform: translateY(-50%);
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

  .field-input[aria-invalid="true"],
  .field-textarea[aria-invalid="true"],
  .field-select[aria-invalid="true"] {
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
