# Composer presentation guardrails

**Status:** Governs the public `/composer` presentation

**Updated:** 2026-09-28

**Scope:** Public Composer presentation copy, page structure, demonstrations, and route-local styling
**Feature truth:** [feature-truth-matrix.md](./feature-truth-matrix.md)

## The standard

The page should feel arranged by someone who understands this product. It should
not feel assembled from a landing-page recipe.

That distinction matters more than any single word, punctuation mark, color, or
component. AI tells are cumulative. A purple accent is not an AI tell by itself.
Neither is a card or a centered line of text. The tell appears when familiar
defaults pile up with no clear reason: centered hero, pill label, gradient glow,
two buttons, three equal cards, another heading, another three cards, and a final
summary that repeats the page.

Composer already has a visual language worth keeping:

- the dark cosmic field;
- serif display type paired with the app's practical body type;
- blue, purple, cyan, and prop colors used with intent;
- real pictographs, sequence cards, mandalas, and movement surfaces;
- dark app controls and restrained motion.

The redesign should edit and arrange that language. It should not replace it
with a generic startup style or overcorrect into a different visual identity.

## What the replaced page revealed

The replaced page contained fourteen main sections. Every one of them used the
same small kicker followed by a large section title. That repeated grammar is
the main reason it read as machine-made. Rewriting the headings would have left
the same cadence in place.

That page also ran for roughly:

- 19 phone screens at 375px wide;
- 25 short-landscape screens at 960 x 412;
- 11 to 12 screens on common desktop and large-monitor viewports;
- 9 screens even at 3840 x 2160.

The first phone and short-landscape screens do not complete the introduction or
reach the main action. Later, features with very different importance receive
similar amounts of space. The result reads as a catalogue of claims instead of
a demonstration of one product.

This diagnosis is consistent with an earlier TKA notation-page review, which
identified repeated heading-plus-paragraph units as a structural AI tell and
recommended varying the shape of the evidence instead of merely changing the
copy.

## The tells we will actively prevent

| Tell                    | How it appears                                                                             | Composer rule                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Section factory         | Each topic gets a label, headline, paragraph, demo, and equal padding                      | Let the subject decide the shape. Some beats may be mostly product, a short caption, or a transition with no new heading.                                          |
| Header per thought      | Every small point is promoted into its own titled section                                  | Group related ideas into a continuous product story. Use headings only where the visitor is genuinely changing subjects.                                           |
| Card soup               | Every fact lives in a rounded translucent box                                              | Use a surface when it represents a real app surface, an interactive control, or a bounded object such as a card. Let ordinary copy and media sit in the page flow. |
| Perfect symmetry        | Three equal columns, equal word counts, equal spacing, repeated indefinitely               | Give more room to the parts that matter. Allow an important demo to dominate and a supporting fact to remain small.                                                |
| Generic SaaS opening    | Badge, giant promise, vague subtitle, two buttons, decorative glow                         | Open with the product's name, a plain definition, a visible working sequence, and a clear way into the app.                                                        |
| Decorative proof        | Mock interfaces, fictional people, preview tiles, or motion that imply more than they do   | Show real product behavior. Label a limited demo as limited. Remove a visual when it cannot prove its nearby claim.                                                |
| Feature inflation       | A registry entry or internal screen becomes a public promise                               | Every public claim must agree with the feature truth matrix and with the path a visitor can use today.                                                             |
| Equal-status catalogue  | Released work, account-only work, beta work, and unavailable ideas sit together            | Keep released features in the product story. Put meaningful conditions beside the claim. Keep roadmap material out of the main pitch.                              |
| Generic uplift          | Copy promises transformation, potential, community, or creativity without naming an action | Say what the visitor can make, change, watch, save, export, or share.                                                                                              |
| Faux correction         | “Not just X, but Y,” “more than X,” and similar reveal formulas                            | State the useful fact directly. Do not manufacture a misconception so the sentence can overturn it.                                                                |
| Perfect threes          | Three adjectives, three benefits, or three examples used as a reflex                       | Use the number the subject requires. Vary sentence and list length naturally.                                                                                      |
| Mechanical formatting   | Bold label plus colon for every bullet, title case everywhere, constant subheads           | Use prose when prose is clearer. Reserve labels for real names, states, and controls.                                                                              |
| Uniform sentence rhythm | Every sentence has the same polished medium length and clause pattern                      | Mix short statements with longer explanations. Read the copy aloud and keep the phrasing Austen would actually use at a fire jam.                                  |
| Empty authority         | “Artists love,” “experts say,” invented usage counts, or fictional social proof            | Name a verifiable source or remove the claim. Do not invent creators, followers, testimonials, or activity.                                                        |
| Relentless positivity   | Constraints disappear so every capability sounds complete                                  | State account, device, viewport, browser, and support boundaries where they affect the decision to try a feature.                                                  |
| Superficial analysis    | A fact is followed by an abstract claim about its significance                             | Let a concrete example carry the meaning. Delete sentences that only announce why the previous sentence was important.                                             |
| Repeated reveal motion  | Every block fades and rises on scroll                                                      | Motion belongs to movement, playback, state change, and transitions that explain the product. Static information stays still. The stage moves whole sections only. |
| Ultrawide phone strip   | Text and cards stay in a narrow centered column on a 4K display                            | Keep prose readable while allowing demonstrations and compositions to claim the available width. Do not enlarge everything to fill space.                          |
| Mobile afterthought     | The opening consumes the viewport before the action or proof appears                       | At 375px and 960 x 412, the first screen should identify the product and expose a useful next action. Heavy or unsupported demos must step aside cleanly.          |

One existing repository ban applies directly: never use a colored bar on one
edge of a box to indicate selection. The whole selected object should change.

## How the Composer story behaves

The public page has an internal sequence, not a visible stack of equally
announced chapters:

1. Identify Composer and show a real sequence moving.
2. Let the visitor see how a sequence is made or generated.
3. Carry that same sequence into the views that genuinely change how it is seen.
4. Show what can be kept, collected, exported, or shared, with account limits stated plainly.
5. Place Composer in relation to The Kinetic Alphabet and end at the app.

These are editorial beats. They do not require five matching headings or five
matching boxes. The sequence itself should provide continuity. A visitor should
feel that one piece of work is moving through the product, rather than watching
unrelated feature advertisements.

The page should have deliberate quiet spots. A full-width demonstration may be
followed by one sentence. A compact capability may share space with the next
one. One section can be dense if the interaction earns it. Another can disappear
entirely when its only job was to complete a feature list.

## The stage on large windows

On a window at least 1100 by 700 pixels, with a mouse or trackpad and motion
allowed, the page is a stage. One section rests on it at a time. Scrolling past
a section, Next, the section rail, an in-page link, or Tab starts one glide to
the next section: the section drifts toward the reader as it fades, and the
next arrives from just beyond it. A section taller than the stage scrolls
within it first, and one scroll gesture either finishes a section or leaves it,
never both. Back, Forward, and reload return to the section the reader left.
Austen chose this calm glide on 2026-09-28 over a winding fly-through and a
parallax version.

The stage keeps these limits:

- It moves whole sections. Nothing inside a section fades or rises on scroll.
- Only the reader moves it. A demonstration that moves focus by itself never
  starts a glide.
- Sections off the stage stay in the page for screen readers and Tab.
- Phones, tablets, small or zoomed-in windows, and reduced motion get the plain
  page, which must read completely on its own.

## Copy rules for this page

Start with the object or action:

- “Build a sequence one beat at a time.”
- “Generate a sequence from a few movement choices.”
- “Save it to your library.”
- “Image and video downloads require a full account.”

Avoid copy that could be pasted onto a music app, drawing tool, or project
manager without changing a noun. Avoid words that simulate confidence while
hiding the action: seamless, robust, comprehensive, cutting-edge, unlock,
empower, elevate, harness, journey, landscape, realm, and tapestry.

Also remove these habits:

- “Whether you're a beginner or an expert...”
- “It is important to note...”
- “In today's fast-paced world...”
- “More than a tool...”
- a neat conclusion that summarizes everything the visitor just saw;
- em dashes in public copy;
- semicolons in buttons, labels, or short marketing lines;
- bold labels followed by a colon in every list item;
- made-up quotes, handles, counts, or endorsements.

Specificity is the voice. The copy does not need forced slang, deliberate typos,
or fake roughness to sound human.

## TKA visual language, used with intent

Purple and blue remain. They belong to this product. The redesign will keep them
from turning into the common violet-gradient landing-page template by grounding
them in the existing cosmic field, prop colors, pictographs, and app surfaces.

Cards remain where the object is actually a card. Glass remains where it matches
an app panel or creates readable depth over the cosmic background. Pills remain
for compact states or controls. None of these becomes the default container for
ordinary information.

The pictographs are the strongest identity on the page. They should be real,
legible, and connected to the demonstration. Generic sparkle icons, anonymous
line-icon grids, decorative browser frames, and stock dashboard furniture do
not belong here.

Asymmetry should come from the product story. A working composer surface can
occupy most of a row because it is the subject. A caption can sit beside it at a
readable measure. Random overlaps and off-grid decoration do not create human
authorship by themselves.

## Review gates

Before the redesign is approved, it must pass these checks:

**Truth read**  
Can every promise be demonstrated through a public path? If a condition changes
the visitor's experience, is it stated next to the promise?

**Silhouette read**  
Blur or squint at the page. Does the composition have a recognizable rhythm, or
does it reduce to a centered hero followed by equal rectangles?

**Heading read**  
List the visible headings in order. If several consecutive headings use the
same grammatical shape or merely label the next component, combine or remove
them.

**Swap read**  
Could a sentence describe another creative app after replacing “sequence”? If
yes, rewrite it around a real Composer action or delete it.

**Product read**  
Interact with every demonstration. Does it do what the adjacent copy claims?
Does it still make sense when motion is reduced, input is touch, or 3D is
unavailable?

**Fire-jam read**  
Read the page aloud. Cut any line Austen would not naturally say to another flow
artist.

**Viewport read**  
Inspect 375, 960 x 412, tablet, 1440, 1920, 2560, and 3840 widths. Check the
opening, the transitions between unlike section shapes, the end of the page,
and every interactive state. From 1440 up, also check the stage: every way into
a glide, a tall section's pan, and the hand-off to the footer. Random
screenshots are unnecessary when these known pressure points are covered
deliberately.

**Final AI-bust read**  
Scan the finished public copy for the repository patterns, then do a human read
for repetition that a word list cannot catch.

## Evidence and source notes

These sources guide the review. They are not authorship detectors. A single tell
does not prove that AI made a page.

Repository evidence:

- `.agents/skills/ai-bust/SKILL.md` catalogs TKA's banned wording, formatting habits, and uniform-rhythm check.
- `docs/reference/ai-writing-guide.md` records real TKA copy failures and the fire-jam test.
- `.claude/rules/no-left-edge-accent-bar.md` records the selected-state treatment already banned in this product.
- `docs/superpowers/specs/2026-07-17-notation-roots-merge-design.md` documents the earlier TKA finding that structural variety is the fix for repeated heading-and-paragraph rhythm.
- The pre-promotion `/composer` source in Git history contains the fourteen repeated kicker-and-title pairs described above.

Outside research:

- [Wikipedia's Signs of AI writing field guide](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) catalogs inflated significance, superficial analysis, vague attribution, negative parallel constructions, perfect threes, repetitive headings, mechanical bold lists, and em-dash overuse. Its own warning is important: these are clues, not proof.
- [People who frequently use ChatGPT for writing tasks](https://aclanthology.org/2025.acl-long.267/) reports that human reviewers notice repetitive headings, formal and uniformly complex sentences, bold-label lists, forced positivity, stock conclusions, and low specificity. The study also found that automated detection remained unreliable at a controlled false-positive rate.
- [The Last Fingerprint: How Markdown Training Shapes LLM Prose](https://arxiv.org/abs/2603.27006) connects model output's tendency toward headings, bullets, boldface, and em dashes to a broader formatting habit. It also cautions that em-dash frequency varies by model and is not a universal authorship test.
- [Interrogating Design Homogenization in Web Vibe Coding](https://www.microsoft.com/en-us/research/publication/interrogating-design-homogenization-in-web-vibe-coding/) describes the risk that frictionless generation reproduces dominant design conventions and recommends deliberate friction that challenges default output.
- [Design Theater: A Benchmark for Generative UI](https://arxiv.org/abs/2607.22928) found visual and layout convergence across generated interfaces. It also found that stated design reasoning frequently failed to appear in the working result, especially for functional requirements. This supports testing the demonstration instead of trusting the explanation.
- [AI or Humans: Who Designs Better Dashboard Layouts?](https://visva.cs.uni-koeln.de/publikationen/ai-or-humans-who-designs-better-dashboard-layouts-an-initial-study) found that AI could quickly create simple layouts while people did better at connecting components into a meaningful whole.
- [Why Do AI-Generated Websites All Look the Same?](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/) is a practitioner catalogue of the currently recognizable default cluster: centered hero, violet gradient, glass cards, and equal feature rows. It is useful as a visual checklist, not as academic evidence.
