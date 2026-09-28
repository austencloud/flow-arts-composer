---
paths:
  - "src/**/*.{svelte,css}"
---

# Action Affordance Contract

Primary and standalone actions look interactive without hover:

- use a semantic `<button>`, or a semantic `<a>` styled as a button when it
  navigates;
- use the existing button primitive, visible focus, sufficient contrast, and a
  44px touch-target floor;
- links are pills, never text: `LinkChip` for standalone links and
  `LinkChip size="inline"` for mentions inside a sentence. See
  `no-text-links.md`.

Do not add a faint standalone text action, an affordance-free clickable, an
underlined or colored text link, or a duplicate text CTA beside an existing
button for the same action.
