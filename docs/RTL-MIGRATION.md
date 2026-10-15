# RTL (Right-to-Left) Language Support Migration Guide

## Overview

Flow Arts Composer supports RTL languages like Arabic. Selecting an RTL locale sets right-to-left direction for unpinned application content. Public pages pin document language through `siteCopyLocale()` in `src/routes/+layout.svelte` and the document-language pin in `src/lib/shared/i18n/i18n.svelte.ts`.

**Key mechanism:**

- `<html dir="rtl">` attribute is automatically set by the i18n system
- CSS must use **logical properties** instead of directional properties
- This ensures layouts mirror correctly without duplicating styles

---

## The Problem with Directional Properties

Traditional CSS uses left/right which assumes LTR layout:

```css
/* ❌ WRONG - breaks in RTL */
.card {
  margin-left: 16px;
  padding-right: 8px;
  text-align: left;
}
```

In RTL mode, this card would have spacing on the wrong side.

---

## The Solution: CSS Logical Properties

Logical properties adapt to writing direction automatically:

```css
/* ✅ CORRECT - works in both LTR and RTL */
.card {
  margin-inline-start: 16px;
  padding-inline-end: 8px;
  text-align: start;
}
```

**`inline`** = horizontal axis (left/right in LTR, right/left in RTL)
**`block`** = vertical axis (top/bottom in all languages)
**`start`/`end`** = beginning/end of reading direction

---

## Migration Table

| Directional Property      | Logical Property            | Notes                 |
| ------------------------- | --------------------------- | --------------------- |
| `margin-left`             | `margin-inline-start`       | Start of inline axis  |
| `margin-right`            | `margin-inline-end`         | End of inline axis    |
| `padding-left`            | `padding-inline-start`      |                       |
| `padding-right`           | `padding-inline-end`        |                       |
| `left`                    | `inset-inline-start`        | Position context only |
| `right`                   | `inset-inline-end`          | Position context only |
| `border-left`             | `border-inline-start`       |                       |
| `border-right`            | `border-inline-end`         |                       |
| `border-left-width`       | `border-inline-start-width` |                       |
| `border-right-width`      | `border-inline-end-width`   |                       |
| `border-top-left-radius`  | `border-start-start-radius` | Corner radius         |
| `border-top-right-radius` | `border-start-end-radius`   | Corner radius         |
| `text-align: left`        | `text-align: start`         | Value change          |
| `text-align: right`       | `text-align: end`           | Value change          |

---

## Audit Your CSS

Run the audit script to find all directional properties in the codebase:

```bash
npm run css:rtl              # Full report with locations
npm run css:rtl:summary      # Summary only
```

The script categorizes issues by severity:

- 🔴 **High**: Layout-breaking (margins, padding, position, text-align)
- 🟡 **Medium**: Visual inconsistencies (borders)
- 🟢 **Low**: Minor (corner radius)

---

## Migration Priority

**Phase 1: Core Layouts (High Priority)**

- Navigation components
- Panel/drawer layouts
- Grid systems
- Text alignment in cards

**Phase 2: Visual Polish (Medium Priority)**

- Border decorations
- Icon positioning
- Button layouts

**Phase 3: Fine Details (Low Priority)**

- Border radius symmetry
- Decorative elements

---

## Testing RTL Layout

### 1. Switch to Arabic Locale

In Settings → Language, select العربية (Arabic).

The `<html dir="rtl">` attribute is automatically applied by the i18n system.

### 2. Visual Inspection Checklist

- [ ] Navigation mirrors correctly (hamburger on right, back button on left)
- [ ] Cards and panels flip horizontally
- [ ] Text aligns to the right
- [ ] Icons appear on correct side
- [ ] Drawers slide from correct direction
- [ ] Modal positioning mirrors
- [ ] Scroll direction feels natural

### 3. Common Issues to Check

**Absolute positioning:**

```css
/* ❌ Breaks in RTL */
.icon {
  position: absolute;
  left: 10px;
}

/* ✅ Works in RTL */
.icon {
  position: absolute;
  inset-inline-start: 10px;
}
```

**Transform origins:**

```css
/* ❌ Hardcoded origin */
.menu {
  transform-origin: left top;
}

/* Physical origins selected by document direction */
[dir="ltr"] .menu {
  transform-origin: left top;
}
[dir="rtl"] .menu {
  transform-origin: right top;
}
```

**Flexbox ordering:**

- `flex-direction: row` automatically reverses in RTL
- `flex-direction: row-reverse` becomes normal order in RTL
- Use `flex-direction: row` and let RTL flip it naturally

---

## Browser Support

CSS Logical Properties are supported in:

- Chrome 89+
- Firefox 66+
- Safari 12.1+
- Edge 89+

**Historical estimate:** 96%+ global browser usage (2025 data); not reverified as current coverage.

---

## Resources

- [MDN: CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties)
- [CSS Tricks: Logical Properties Guide](https://css-tricks.com/css-logical-properties/)
- [RTL Styling Best Practices](https://rtlstyling.com/)

---

## Automatic Tools

- **Audit script:** `npm run css:rtl` finds all directional properties
- **i18n system:** Automatically sets `<html dir>` attribute
- **Future:** Auto-fix flag will migrate properties automatically
