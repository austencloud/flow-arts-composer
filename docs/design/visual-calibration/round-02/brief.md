# Same content, three compositions

Authorized by Austen on 2026-09-21 after the six-reference board mixed reactions
to copy, composition, and product fit. This is an isolated design study of one
About section, not a replacement for `/about` or `/composer`.

## Brief and fixed criteria

Audience: a visitor encountering The Kinetic Alphabet for the first time.
Task: understand that TKA is notation, connect it to its creator and Composer,
and find the Composer link. Owner-review task: compare composition without
changing the words, pictures, type family, or palette.

Rubric: VR-1. Research ledger checked 2026-09-21, current. Reviewer remains
uncalibrated. No authorship classification or taste score is being tested.

Keep the exact strings and asset URLs in `content.json` identical in all three
variants. Use one shared template. Both complete images appear in every variant;
no filters, crops, invented diagrams, stock media, or invented quotes. Image
scale and arrangement may change because those are part of composition.
The photograph is not presented as a performance of the notation sheet.

## Design tokens and boundaries

- Canvas: deep navy `#101625`; surface: `#192131`; text: `#f1f3f8`;
  secondary: `#b9c4d4`; neutral stroke: `#46536a`.
- System sans for both headline and body, following the product's working-tool
  vocabulary. The image already contains the notation's own lettering.
- Headline scale about 32–52px, body 17–19px, labels at least 14px, touch targets
  at least 44px. Text and controls do not grow without bound on wide displays.
- Actual source art supplies the color. No decorative gradients, stars,
  background motion, accent rails, arbitrary numbered ornaments, or new logo.
- This is standalone local review HTML, not a second product component system.
  Native buttons are review controls; an approved composition would later be
  implemented through the production component owners.

## Compositions considered before implementation

### A: Notation first

The large notation sheet leads; explanation and action sit alongside it, with
the creator photograph and its caption grouped below the explanation.

```text
notation sheet          title / lede
notation sheet          explanation / app / action
caption                 smaller portrait + creator caption
```

Recommendation for the first comparison: A gives the notation the strongest
weight. Tradeoff: a complete 16-count sheet may be visually demanding for a new
visitor. It must be readable as a real artifact and openable at full size, not
sold as a complete lesson.

### B: Creator first

The full performance photograph becomes the tall leading region; title and
explanation introduce the project alongside it, with the notation below that
copy. The creator caption remains attached to the photograph.

```text
large portrait          title / lede / explanation
large portrait          notation sheet
creator caption         caption / app / action
```

Tradeoff: a stronger human introduction may initially suggest a performer
portfolio. The heading and notation need enough weight to identify the subject.

### C: Explanation first

A compact reading band opens the section. The two actual artifacts follow as
one aligned composition, with the notation wider than the portrait and the
action attached to the explanation.

```text
title / lede            explanation / app / action
portrait                wider notation sheet
creator caption         sheet caption
```

Tradeoff: the clearest text-first explanation is less immediately artifact-led.
The sheet must remain prominent and not become a tiny supporting illustration.

## Adversarial plan check

Rejected an early idea to give each layout its own typeface or surface color:
that would repeat the confound in the first board. Rejected placing text over
the photograph and cropping it into a hero: it changes legibility and the asset
content along with layout. Rejected three interchangeable marketing-card grids.

The meaningful variable is now the relationship between person, notation, and
explanation. Shared content and theme do not isolate every perceptual variable:
order, scale, reading length, and viewport height still differ by composition.
This is preference elicitation, not a controlled scientific experiment.

## Evidence sources

- Copy: existing `src/routes/(public)/about/+page.svelte`, kept plain and short.
- Photograph: existing `static/images/austen-fire.webp`, also used by
  `src/routes/grant-feature/+page.svelte`.
- Notation: existing `static/guide/level-1/images/16-count-sequences/EΔQY.png`;
  the guide's `SixteenCount.svelte` identifies it as a 16-count sequence.
- The two images are independent artifacts. No movement matching is claimed.

## Review and handoff

Switching A/B/C must retain exactly the same content. A no-script state should
explain that the comparison needs JavaScript. No ratings are prefilled; no
answers or preferences are persisted or uploaded. The reviewer can simply
describe what they would keep or remove in conversation.

Use one independent aesthetic pass with the brief and rendered frames before
sharing the builder's rationale. Main-agent review of a worker's implementation
is separate from construction but not blinded to the plan; disclose that limit.
At most two correction rounds. Production source is out of scope.
