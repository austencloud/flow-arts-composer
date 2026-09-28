---
paths:
  - "src/**/*.{svelte,css,ts}"
  - "messages/**/*.json"
---

# No Text Links (Austen, enforced)

A link on this site is a pill, never underlined or colored text. Austen finds
his way around a page by what visibly looks pressable, and text links read as
a 1990s website. He set this on 2026-09-28 after the Prospin and Inspin and
Ratios pages shipped underlined "Keep reading" and source links.

## The rule

- **Every `<a>` that shows text uses `LinkChip`**
  (`src/lib/shared/ui/components/LinkChip.svelte`), or is itself a box or
  button owned by another primitive (a card, a nav item, a button styled `<a>`).
- **Standalone links** (reading lists, sources, "open this" beside a figure,
  next steps) use `<LinkChip href=...>`. Group several in a wrapping row.
- **Mentions inside a sentence** use `<LinkChip size="inline" href=...>`. This
  replaces the old allowance for inline text links in running prose.
- **External links** need nothing extra: LinkChip sees `http(s)://`, opens a
  new tab, shows the out-of-box arrow and names the new tab to screen readers.
  Pass `newTabLabel` when the page has a translated phrase.
- **Never** add `text-decoration: underline` to a link, a `.page a { color:
  accent }` rule, an `a::after` arrow, or a local pill class that copies
  LinkChip. Extend LinkChip when it lacks something.
- **Translations** hold words, not markup: split a sentence around the link
  with before/after keys and render the LinkChip between them. No `<a>` inside
  a message string.

## Existing copies

These predate the rule and move to LinkChip when their file is next touched:
`a.td-chip` in `atlas/_components/GlossaryTermDetail.svelte`,
`a.resource-chip` in `roots/software/+page.svelte`, and any remaining
underlined link a page styles itself.

## Before finishing UI work

Search the changed files for `<a` and `text-decoration: underline`. Each hit is
a LinkChip, a primitive-owned box or button, or a bug.
