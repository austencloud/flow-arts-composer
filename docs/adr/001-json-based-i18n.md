# ADR 001: JSON-Based i18n System

**Repository status (2026-10-14):** English has 9,654 keys, German 8,976; 678 English keys are absent from German. The 1,398-key examples and benchmark table are historical. The recorded 2025-01-15 decision date is retained; the actual decision date was not established from this tree.

**Status:** Accepted
**Date:** 2025-01-15
**Deciders:** Austen Cloud
**Tags:** i18n, performance, architecture

---

## Context and Problem Statement

TKA Scribe required internationalization to support multiple languages. The initial implementation used Paraglide, which generated 1,114 separate JavaScript files (one per translation key) with barrel exports. This caused severe performance degradation:

- **1,200+ network requests** on dev server page load
- **3-5 second cold start** times
- **~40KB bundle overhead** from barrel export machinery
- **Poor tree-shaking** - importing one key loaded all 1,114 files

The question: Can we maintain type safety and developer experience while dramatically reducing complexity?

---

## Decision Drivers

1. **Performance** - Dev server speed and bundle size
2. **Type Safety** - Compile-time validation of translation keys
3. **Developer Experience** - IDE autocomplete, fast HMR
4. **Simplicity** - Maintainability and ease of understanding
5. **Extensibility** - Easy to add new locales and keys

---

## Considered Options

### Option 1: Keep Paraglide

**Pros:**

- Built-in type safety via code generation
- Mature ecosystem and documentation
- ICU MessageFormat support

**Cons:**

- 1,114 files per locale = build complexity
- Barrel exports break tree-shaking
- 1,000+ network requests in dev mode
- 3-5 second cold starts
- ~40KB bundle overhead
- Complex build setup

### Option 2: Custom JSON-Based System

**Pros:**

- One JSON file per locale (99.9% fewer files)
- Native JSON parsing (extremely fast)
- Full control over loading strategy
- Lazy loading support built-in
- Minimal bundle overhead (~2KB)
- Simple mental model

**Cons:**

- Need to build type generation ourselves
- Need to build validation ourselves
- No built-in ICU MessageFormat (can add later if needed)

### Option 3: i18next or react-i18next

**Pros:**

- Industry standard
- Rich ecosystem

**Cons:**

- React-focused (not ideal for Svelte)
- ~20KB bundle size
- Overkill for our needs
- Less control over implementation

---

## Decision Outcome

**Chosen option:** Custom JSON-Based System

**Rationale:**

- **99.9% reduction** in files (1,114 → 1)
- **99.8% reduction** in network requests (1,200+ → 1-2)
- **6-10x faster** cold start (3-5s → 0.4s)
- **95% reduction** in bundle overhead (40KB → 2KB)
- **Full type safety maintained** via generated types
- **Complete control** over loading and caching

The tradeoff is building our own validation and type generation, but this is straightforward and gives us exactly what we need without the bloat.

---

## Implementation

### Architecture

```
messages/
  en.json          ← Default locale (inline)
  es.json          ← Lazy loaded
  fr.json          ← Lazy loaded
  ...

src/lib/shared/i18n/
  i18n.svelte.ts         ← Core system (reactive state, loader)
  i18n-types.ts          ← Auto-generated types
  locale-state.svelte.ts ← Backwards compatibility

scripts/
  generate-i18n-types.cjs  ← Type generator
  validate-i18n.cjs        ← Build-time validation
```

### Type Generation

```bash
npm run i18n:types
```

Generates TypeScript union from `messages/en.json`:

```typescript
export type TranslationKey =
  | "app_name"
  | "dashboard_welcome"
  | ... 1,398 more keys;

export function t(key: TranslationKey, params?: Record<string, string | number>): string;
```

### Lazy Loading

```typescript
// Only English is bundled initially
import enMessages from "../../../../messages/en.json";

// Other locales lazy load on demand
async function loadLocaleMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    case "es":
      return (await import("../../../../messages/es.json")).default;
    // ...
  }
}
```

### Reactive State (Svelte 5)

```typescript
let currentLocale = $state<Locale>(getInitialLocale());
let messages = $state<Messages>(enMessages);

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  let text = messages[key];
  // ... interpolation
  return text;
}
```

Components automatically re-render when `currentLocale` changes.

---

## Consequences

### Positive

- **Instant dev server** - No more waiting for 1,000+ module evaluations
- **Fast HMR** - Only 1 file to reload on translation changes
- **Tiny bundles** - 95% reduction in i18n overhead
- **Simple debugging** - One JSON file to inspect, not 1,114 .js files
- **Easy extensibility** - Adding locales is trivial
- **Full type safety** - TypeScript validates all keys at compile time
- **IDE autocomplete** - All 1,398 keys show in IntelliSense

### Negative

- **Custom validation required** - Built `scripts/validate-i18n.cjs`
- **Type generation required** - Built `scripts/generate-i18n-types.cjs`
- **No ICU MessageFormat** - Can add later if needed (haven't needed it)

### Neutral

- **Migration effort** - One-time cost to extract Paraglide translations to JSON
- **Learning curve** - Team needs to learn new system (but it's simpler)

---

## Validation

Measured with Chrome DevTools Performance profiler:

| Metric              | Before (Paraglide) | After (JSON) | Improvement |
| ------------------- | ------------------ | ------------ | ----------- |
| Dev server requests | 1,200+             | 2            | **600x**    |
| Cold start time     | 3.2s               | 0.4s         | **8x**      |
| Bundle overhead     | 40KB               | 2KB          | **20x**     |
| Files per locale    | 1,114              | 1            | **1,114x**  |

All while maintaining 100% type safety.

---

## References

- [Vite Performance: Tree-shaking barrel exports](https://vitejs.dev/guide/performance.html)
- [Svelte 5 Runes](https://svelte-5-preview.vercel.app/docs/runes)
- [Native JSON performance](https://v8.dev/blog/cost-of-javascript-2019)
- [Original Paraglide issue discussion](https://github.com/inlang/inlang/issues/...)

---

## Future Considerations

### Possible Enhancements

1. **ICU MessageFormat** - Add if pluralization/gender needed
   - Current simple interpolation covers 100% of current needs
   - Can integrate `@formatjs/intl` (~10KB) if needed

2. **Translation Management UI** - Admin panel for translators
   - Side-by-side editing (English + target locale)
   - Real-time preview
   - Export to JSON

3. **Locale fallback chains** - implemented: regional locale, base locale, then English.
   - `src/lib/shared/i18n/i18n.svelte.ts` owns fallback and regional registration.
   - Translation coverage is incomplete; see the current catalog note above.

4. **Automatic translation via AI** - First draft for translators
   - Use Claude API to translate en.json → es.json
   - Human review before commit

None of these are urgent - the current system handles all requirements.

---

## Notes

This ADR documents one of the highest-impact architectural decisions in TKA Scribe's history. The 600x reduction in dev server requests transformed the development experience from frustrating to instant.

The key insight: **Not all i18n solutions are created equal.** Paraglide's file-per-key approach works for some projects, but for Vite + Svelte, native JSON + dynamic imports is vastly superior.

**Lesson learned:** Don't assume industry-standard libraries are optimal. Measure, profile, and be willing to build custom solutions when the tradeoffs are favorable.
