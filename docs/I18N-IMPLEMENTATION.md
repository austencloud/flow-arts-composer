# i18n Implementation Guide

This document consolidates the practical implementation details for Flow Arts Composer's internationalization system.

---

## Quick Start

```svelte
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<h1>{t("app_name")}</h1>
<p>{t("nav_create")}</p>
```

TypeScript autocomplete shows all 1,398 available keys.

---

## Adding New Translation Keys

### Step 1: Add to English

Edit `messages/en.json`:

```json
{
  "my_new_feature_title": "My Cool Feature",
  "my_new_feature_description": "This feature does {action}."
}
```

### Step 2: Regenerate types

```bash
npm run i18n:types
```

### Step 3: Add to all other locales

```bash
npm run i18n:validate:fix
```

Auto-adds `[NEEDS TRANSLATION]` placeholders to all locales.

---

## Adding a New Locale

### Step 1: Create translation file

```bash
cp messages/en.json messages/hi.json
```

### Step 2: Register in i18n system

Edit `src/lib/shared/i18n/i18n.svelte.ts`:

```typescript
export const locales = [
  "en", "es", "fr", "de", "pt", "zh", "ja", "ko", "ar", "ru", "it",
  "hi", // Add here
] as const;
```

### Step 3: Add dynamic import

Same file:

```typescript
async function loadLocaleMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    // ... existing cases
    case "hi":
      return (await import("../../../../messages/hi.json")).default as Messages;
  }
}
```

### Step 4: Add to language selector

Edit `src/lib/shared/settings/components/tabs/LanguageTab.svelte`:

```typescript
const languageNames: Record<Locale, { native: string; english: string }> = {
  // ... existing
  hi: { native: "हिन्दी", english: "Hindi" },
};
```

---

## Common Patterns

### With Parameters

```svelte
<p>{t("library_sequence_count", { count: 42 })}</p>
<!-- Output: "You have 42 sequences" -->
```

**Security:** Only pass trusted values. Never unsanitized user input.

### Dynamic Keys

```svelte
<script lang="ts">
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  let moduleId = $state("create");
</script>

<h2>{tDynamic(`module_${moduleId}`)}</h2>
```

**Trade-off:** Loses TypeScript autocomplete. Use sparingly.

### Locale Switching

```svelte
<script lang="ts">
  import { setLocale } from "#lib/shared/i18n/i18n.svelte.js";

  async function switchToSpanish() {
    await setLocale("es");
    // UI automatically updates
  }
</script>
```

### Getting Current Locale

```svelte
<script lang="ts">
  import { getLocale } from "#lib/shared/i18n/i18n.svelte.js";
  const currentLocale = getLocale(); // Reactive
</script>
```

---

## Locale Fallback Chains

Regional locales fall back to base locales, which fall back to English.

**Fallback chain:**
```
es-MX → es → en
```

### Supported Regional Locales

| Regional Locale | Base Locale | Description |
|-----------------|-------------|-------------|
| `es-MX` | `es` | Spanish (Mexico) |
| `es-AR` | `es` | Spanish (Argentina) |
| `pt-BR` | `pt` | Portuguese (Brazil) |
| `pt-PT` | `pt` | Portuguese (Portugal) |
| `zh-CN` | `zh` | Chinese (Simplified) |
| `zh-TW` | `zh` | Chinese (Traditional) |
| `fr-CA` | `fr` | French (Canada) |

### Adding a Regional Locale

1. Register in `regionalLocales` array
2. Create override file (only keys that differ): `messages/es-CL.json`
3. Add to language selector

Regional files only need keys that differ from the base locale.

---

## Pluralization

### Current Approach (Simple)

Use separate keys:

```json
{
  "library_one_sequence": "1 sequence",
  "library_many_sequences": "{count} sequences"
}
```

```svelte
<p>
  {count === 1
    ? t("library_one_sequence")
    : t("library_many_sequences", { count })}
</p>
```

### Languages with Complex Plural Rules

| Language | Plural Forms |
|----------|--------------|
| English | 2 (one, other) |
| Russian | 3 (one, few, many) |
| Arabic | 6 (zero, one, two, few, many, other) |
| Chinese | 1 (no plurals) |

**Current status:** Simple approach works for all supported languages. Consider ICU MessageFormat if Russian/Arabic speakers request full plural support.

---

## RTL Languages

If adding RTL locale, register it:

```typescript
export const rtlLocales: ReadonlyArray<Locale> = ["ar", "he", "ur"] as const;
```

The `<html dir="rtl">` attribute is automatically applied.

**CSS:** Use logical properties (`margin-inline-end` not `margin-right`). See [RTL Migration Guide](./RTL-MIGRATION.md).

---

## Validation Commands

```bash
npm run i18n:validate      # Check for missing translations
npm run i18n:validate:fix  # Auto-fix missing keys
npm run i18n:types         # Regenerate TypeScript types
npm run i18n:coverage      # Check adoption rate
```

---

## Naming Conventions

**Prefix by module/feature:**

```json
{
  "generator_level": "Level",
  "browse_title": "Browse",
  "settings_profile": "Profile"
}
```

**Use snake_case:** `generator_level_no_turns`

---

## Patterns to Avoid

### ❌ Hardcoded Strings

```svelte
<!-- DON'T -->
<h1>Welcome to Flow Arts Composer</h1>

<!-- DO -->
<h1>{t("app_welcome_title")}</h1>
```

### ❌ String Concatenation

```svelte
<!-- DON'T -->
<p>{t("welcome")} + " " + userName}</p>

<!-- DO -->
<p>{t("welcome_message", { name: userName })}</p>
```

### ❌ Untrusted Parameters

```svelte
<!-- DON'T - XSS RISK -->
<p>{t("message_from_user", { content: userInput })}</p>

<!-- DO -->
<p>{t("message_from_label")}: {userInput}</p>
```

---

## Quick Reference

| Task | Import | Usage |
|------|--------|-------|
| Translate | `import { t }` | `{t("key")}` |
| With params | `import { t }` | `{t("key", { name: "X" })}` |
| Dynamic key | `import { tDynamic }` | `{tDynamic(\`prefix_${id}\`)}` |
| Get locale | `import { getLocale }` | `const locale = getLocale()` |
| Switch locale | `import { setLocale }` | `await setLocale("es")` |
| RTL direction | `import { getLocaleDirection }` | `const dir = getLocaleDirection()` |

---

## Related Documentation

- [RTL Migration Guide](./RTL-MIGRATION.md) - CSS for right-to-left languages
- [ADR 001](./adr/001-json-based-i18n.md) - Why JSON over Paraglide
