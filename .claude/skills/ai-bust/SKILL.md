<!-- managed by @austencloud/claude-skills — do not edit manually, run: npx @austencloud/claude-skills sync -->

---
description: Use while writing or reviewing user-facing text to catch AI writing patterns, including structural repetition across pages
---

# AI Writing Buster

**Args:** `$ARGUMENTS` (file path, glob pattern, or paste text directly)

Scans user-facing text for AI writing tells. Apply it while drafting as well as when reviewing. Two passes: a mechanical script for anything regex can catch, then a judgment pass for the tells that need context. Read sibling pages together when the text is part of a series.

## Usage

```
/ai-bust src/routes/+page.svelte
/ai-bust src/lib/components/**/*.svelte
/ai-bust "Your text to check here"
```

## Workflow

1. **Run the mechanical pre-pass first.** The script ships next to this file.

   ```
   python .claude/skills/ai-bust/ai_bust.py FILE [FILE ...]
   python .claude/skills/ai-bust/ai_bust.py src/routes/notation/*/+page.svelte
   echo "pasted text" | python .claude/skills/ai-bust/ai_bust.py -
   python .claude/skills/ai-bust/ai_bust.py --json --min-severity HIGH FILE
   python .claude/skills/ai-bust/ai_bust.py --self-test
   ```

   Pass sibling pages in one run. The template and rhythm checks compare the
   pages with each other, so a box repeated across five prop pages only shows
   up when all five are scanned together.

   Markup files (`.svelte`, `.html`, `.vue`, `.astro`, `.jsx`, `.tsx`) are read
   the way a visitor sees them: visible text plus prose strings in `<script>`.
   Comments, styles, code, and `{expressions}` are skipped. `.js`, `.ts`, and
   `.py` files contribute their prose string literals only. `--format
   markdown|markup|code` overrides the guess from the extension. Run
   `--self-test` after editing the script.

   Exit 1 means findings. CRITICAL is a machine artifact or a house ban. HIGH
   shows up far more often in model output than in human prose. MEDIUM matters
   when it recurs. LOW is a weak signal. A fix that starts with `JUDGMENT:` is a
   hint for the reviewer to weigh.

2. **Do the judgment pass** against the list below. The script cannot see these.
   Compare the draft with neighboring pages for repeated structure, captions,
   contribution boxes, and endings. Do not add fragments or uneven paragraphs
   merely to improve a rhythm score.
3. **Report violations** grouped by category, script findings first.
4. **Provide a fix** for each violation.
5. **Give an overall assessment:** Clean / Minor issues / Needs rewrite.

## Emails

Run email mode on every email body before it becomes a Gmail draft, a reply, or a send, including wording the user already approved in chat. Fix every CRITICAL and HIGH finding first.

```
python .claude/skills/ai-bust/ai_bust.py --email draft.txt
python .claude/skills/ai-bust/ai_bust.py --email --require-contact "PHONE_REGEX" draft.html
```

Email mode flattens HTML the way a mail client shows it, skips quoted history and the `-- ` signature block, runs the normal pass, and adds:

| Check | Severity | Fix |
|---|---|---|
| Hard-wrapped lines: a paragraph broken into ~70-character lines | CRITICAL | One line per paragraph in `body`, one `<div>` per paragraph in `htmlBody`. The mail client wraps. |
| No sign-off | HIGH | End with a sign-off and the name, or the full signature |
| Markdown in the body | HIGH | Strip `**`, `#`, and `[text](url)`. The recipient sees the raw characters. |
| No contact line (only with `--require-contact`) | MEDIUM | Put the phone number under the name |

Hard wraps are the one that gets noticed. A plain-text body with a newline every 70 characters renders on a phone as ragged half-lines, and it reads as machine-written.

Gmail connector behavior, verified 2026-09-23:

- `update_draft` strips a reply draft's threading headers, so the draft leaves its thread, and it rewrites links (https to `google.com/url` redirects, `tel:` to `javascript:void(0)`). Make a fresh draft with `create_draft` instead and ask the user to discard the old one. The connector cannot trash or delete drafts.
- `create_draft` with `replyToMessageId` keeps the thread and appends the quoted history on its own. Pass only the new text.
- Drafts made through the API do not get the Gmail signature. Write the sign-off and contact line into the body.

In Claude Code, the PreToolUse hook `~/.claude/hooks/email-ai-bust.py` runs these checks on every Gmail draft, reply, forward, and send, blocks CRITICAL and HIGH findings, and blocks `update_draft` body edits. Codex has no such hook, so in Codex run the script by hand before every draft.

## Pass 1: Mechanical (the script catches these)

The script is the source of truth for exact patterns. Categories it covers:

| Category | Example | Fix |
|---|---|---|
| Chatbot residue | "As an AI language model", "as of my last knowledge update", `oaicite`, `turn0search0`, `[cite: 3]`, `utm_source=chatgpt.com` | delete it; cite the real source |
| Unfilled placeholders | "[Your Name]", "[insert link]" | fill it in or cut the sentence |
| Em dashes, emoji | a dash standing in for a comma or a colon | a comma, period, or colon. En dashes in ranges (1–5) pass; a spaced en dash does not |
| Smart quotes, arrows between words | "Input → Output" | write it out, straight quotes. A "← Back" link is fine |
| Banned openers | "In today's fast-paced world" | cut, start with the content |
| Blacklisted vocabulary | delve, robust, curated, elevate, ecosystem, nestled, utilize, foster, holistic, bolster, garner, meticulous | name the specific thing |
| Favored-word cluster (3 or more in a page) | practical, deliberate, genuinely, profound, intricate, notably, load-bearing | each is fine alone; swap a cluster for plain, specific words |
| Hedging and robotic transitions | "It's worth noting", "That said,", "Furthermore", "In conclusion" | delete, keep the fact |
| Metadiscourse labels | "The key takeaway is", "Simply put" | delete the label, keep the claim |
| Announced content | "Let's dive in", "In this guide, we'll explore" | start with the first real point |
| Sycophantic openers | "Great question!", "You're absolutely right" | answer directly |
| Faux-intimacy transitions | "Here's the thing", "Let's unpack this" | cut it |
| Meta-narration, performed candor | "This page is short because", "So, plainly:", "the honest version" | see Category 8 |
| Staged setups and slogans | "Good news:", "Less to look at, faster to learn.", "No X, no Y." | lead with the fact and its reason |
| Dressed-up copula | "serves as", "stands as", "boasts" | use is or has |
| Inflated significance | "plays a pivotal role", "a testament to", "leaves a lasting mark", ", highlighting its importance" | say what happened, or cut it |
| Significance explainers and reveals | "which matters because", "The deeper reason", "what really matters" | cut the explainer; show the consequence |
| Negative parallelism, definition by contrast | "It's not just X, it's Y", "Not a bug. Not a feature.", "less like a map and more like a compass", "rather than merely" | state the claim once |
| Colon reveals | "The best part: it scales." | drop the setup and the colon |
| Question then fragment | "The result? Devastating." | state the answer as a sentence |
| Parallel fragments | "Easy to see. Easy to learn." | one sentence that carries the reason |
| Wh-cleft openers | "What makes this interesting is" | delete the scaffold |
| Weasel and vague attribution | "Experts agree", "Studies show", "is widely regarded as" | name the source or cut |
| Intensifiers and stock metaphors | "the single most", "arguably the best", "the backbone of" | give the measurement, or say what it does |
| Knowledge-limit disclaimers | "details remain limited", "based on available information" | find the fact or cut |
| Upbeat endings and future gazing | "The future looks bright", "Looking ahead," | end on the last real fact |
| Summary caboose | "Together, these", "Overall," | end on the last detail |
| False ranges | "from X to Y to Z" | list the real items |
| Unearned stakes | "fundamentally reshape", "change everything" | scale to the evidence |
| Acknowledge-then-dismiss | "Despite these challenges, it thrives" | detail the challenge or cut the beat |
| Compulsive counting | "There are three reasons:" | just list them |
| Perfect threes | "efficient, reliable, and scalable" | two items or break the rhythm |
| Boilerplate endings | "Whether you're...", "Let me know if..." | pick the audience, end on content |
| Stock furniture (LOW) | "No download required", "Trusted by thousands" | keep only a specific, true claim |
| Signpost paragraph openers (4 or more in a row) | "For any of these,", "Since there are kids coming," | start with the content |
| Stock section headings | "Key Takeaways", "Final Thoughts", "Why This Matters" | name the section after its content |
| Bold-first bullets (3 or more in a row) | `**Security**: ...` on every line | bold one item or none |
| Header on short text | heading over fewer than 40 words | fold into prose |
| Low burstiness | mean 12+ word sentences with stdev under 5 | let length follow the content; never add a fragment to raise the score (see Category 8) |
| Contrast flips, punchline fragments | "a scaffold, not a law", "Two pens." | see Category 8 |
| Slot-swapped templates | "If buugeng are your language" on one page, "If clubs are your language" on the next | see Category 7 |

Word lists age faster than structure. Graphite's 2026 comparison of model
versions found the best-known tells fell 41% in GPT models and 86% in Claude
models from one release to the next, and only 45% of tells carried over
between versions. Give the stance and structure checks (Categories 7 and 8)
more weight than any single banned word.

The em dash is banned here as a house rule, and it proves little either way.
Graphite measured Claude Opus 5 at about the human rate, GPT-6 Astra at 0.12
times it, and Gemini 3.1 Pro at 0.05 times. Text without em dashes can still be
generated. Remove them because this house bans them.

## Pass 2: Judgment (you catch these)

- **Staged setups.** "Good news:", rhetorical questions, and paired slogan-like headings delay the point. Lead with the fact.
- **Manufactured intimacy.** A personal "take" the writer has no standing to hold. "For 50 people at 8:30, this is the one I'd pick." State the fact and the tradeoff, don't perform preference.
- **Restating the reader's situation** back to them before answering. Answer first.
- **Praise of the reader's plan** or unsolicited reassurance. "Now you're pushing up against the part that matters most." Cut unless specific and earned.
- **Explaining why it matters right after stating it.** "X happened, which matters because..." Trust the reader or fold the why into the sentence.
- **Self-described tone.** The text calls itself quiet, honest, gentle, no-fluff, no-nonsense. Cut the description; let word choice show it.
- **Superficial -ing analysis.** A trailing clause claiming significance: "...enhancing its role as a dynamic hub." Delete or replace with a concrete consequence.
- **Anaphora abuse.** Same opener three sentences running for rhythm alone. Keep repetition only when it does work.
- **Identical-brick paragraphs.** Every paragraph 3 to 4 sentences regardless of content. Let length follow the idea.
- **Fractal summaries.** Tell-them-what-you'll-tell-them at sentence, paragraph, and document level. Say it once.
- **Listicle in a trench coat.** "The first wall is... The second wall is..." Make it a real list or connected prose.
- **Relentless balance.** Equal enthusiasm and equal hedge for every section, symmetric pros and cons. Let priorities show in emphasis and length.
- **Forced figurative language.** An analogy that doesn't fit. Cut it.
- **Self-echo.** Reusing a phrase from earlier in the same document.
- **Markdown leaking into plain text.** Asterisks and hashes in an email body or UI string.
- **Synthetic testimonials and pseudo-specific examples.** Invented quotes, names, and round numbers: "Sarah, a marketing lead, saved 10 hours a week." Use a real, attributable case or none.
- **Template page skeleton.** Hero, three feature cards, social proof, call to action, with nothing that could only belong to this product. Shape the page around what is specific to it.
- **Personification.** The data "tells us", the page "wants" something, the tool "understands" the user. Say who does what.
- **Synonym cycling.** One thing renamed in each sentence to avoid repeating a word: the tool, the platform, the solution. Pick one name and keep it.
- **Treadmill padding.** A paragraph that restates the one before it in new words. Cut the second one.
- **Heading echo.** The first sentence under a heading repeats the heading. Start with the next fact.
- **Name-dropping.** A famous name or institution cited for its aura when no specific claim depends on it. Cite the claim or drop the name.
- **Overcorrection.** A rewrite that trades banned words for equally generic synonyms, or scatters fragments, slang, and asides to look human. The fix is specific content.
- **Missing messiness.** Everything flows too smoothly. Flag only; never insert fake imperfection.

Categories 6.5 and 7 keep the numbers they had in the older version of this
skill, where Categories 1-6 were the sentence-level patterns now covered by
Pass 1 and the list above. Category 8 continues that numbering.

### Category 6.5: Unsigned First Person

Added 2026-07-17 (Austen): *"We should stick with facts. Avoid using anything
with I as a pronoun — the user shouldn't have to ask who is writing this."*

Flag `I / I'd / I've / my / me / we / our / us` in site copy that carries no
byline or signature. The reader can't tell who "I" is, so the voice reads as
an anonymous narrator (another generation tell). Fix: restate as fact
("I trained double staves" → "The Kinetic Alphabet was developed on double
staves"; "how we teach staves" → "how staves are taught"). First person is
fine only in signed content (about page, quoted testimony, bylined posts).
Severity: **HIGH**.

### Category 7: Structural / Template Tells (page- and site-level)

Added 2026-07-17 after Austen caught the per-prop notation pages reading as
"mini bite-size episodes." Detector literature names these (Forbes 2026,
StationX): *"if every subsection feels exactly as developed as the last,
mechanical generation becomes likely"* + "low burstiness."

| Pattern | Tell | Fix |
|---------|------|-----|
| Header-per-topic episodes | Every idea wrapped in an H2 + 1-2 same-size paragraphs | Continuous prose; zero or one internal header per page; let figures/demos punctuate instead |
| Uniform section development | All sections the same weight | Let each passage run as long as its content needs: merge thin sections, give the substantial ones room. Do not add a one-line paragraph or a fragment to create variety; that produces the Category 8 aphorism closer |
| Cross-page template reuse | Same page shape, caption sentence, CTA wording, or closer repeated across sibling pages | Every page gets its own shape (essay / short note / figure-led / stub / single Q-and-A answer); vary shared furniture |
| Fill-in-the-blank boxes | A callout or contribution box repeated across sibling pages with only the noun swapped: "The ___ chapter is waiting for its author" / "If ___ are your language…" | Write each box for its own page, or use one shared box whose plain wording doesn't pretend to be page-specific, or drop it |
| "Here's..." pivots | "Here's what changes...", "Here's where the line is" | State the thing directly |
| Label headers | H2s that are topic labels ("The Translation Rule") | Oblique or voice-carrying headers, or none |
| Summary-sentence caboose | Each section closing by restating itself | End on the detail, not the recap |

Question headings are fine on an FAQ page, where the reader arrives with that
question. Elsewhere a question heading is a staged setup.

The script catches one of these on its own: a slot-swapped template. When
sibling pages run together, it reports a clause they share whose only change
is each page's own subject, taken from the file path, the first heading, or a
title string ("If buugeng are your language" / "If clubs are your language").
Phrasing that stays the same without swapping the subject, such as "To delete a
___" across a manual's chapters, is consistency and is not reported. Page
titles and meta descriptions are exempt because they follow a template by
design. The other rows in this table still need the judgment pass.

Severity: **CRITICAL** for header-per-topic episodes and cross-page template
reuse, including fill-in-the-blank boxes. These read as generated even when
every sentence individually passes Pass 1 and the sentence-level checks above.

### Category 8: Narrator Tells (voice and rhythm)

Added 2026-09-24 after the /notation prop pages passed every rule above and
still read as AI. These live in the narrator's stance and the paragraph's
rhythm, not in any banned word.

| Pattern | Tell | Fix |
|---------|------|-----|
| Meta-narration about the page | "This page is short because…", "First, what this page is not about", "it's worth a moment", "this site won't pretend otherwise" | Start with the subject. Cut any sentence whose subject is the page, the site, or the reader's attention |
| Performed candor | "One admission, better stated here than discovered later", "the honest version", "So, plainly:" | State the limit or fact without announcing that it is honest |
| Aphorism closers and manufactured burstiness | A punchy fragment after a long sentence: "That's the whole trick. Less to look at, faster to learn.", "Two pens.", "Some of it." | Fold the point into the sentence before it, or delete it. Keep a short sentence only when it adds information the paragraph lacks, never to vary rhythm |
| "X, not Y" appositive flips | "a scaffold, not a law", "family, not rivals"; also "neither X nor Y" used for balance | Say what the thing is. If the contrast matters, name the specific difference once |

Severity: **HIGH**. One short sentence or one "X, not Y" can be fine; flag
the move when it recurs within a page or across sibling pages.

The script checks all four. Meta-narration and performed candor are phrase
rules. Contrast flips and punchline fragments are counted and reported when
they recur: two or more in one page at a rate of at least 1 flip or 3
punchlines per 1000 words, or three or more pages in the same run that have
them at a combined rate of 0.5 flips or 1 punchline per 1000 words. Short
sentences that carry a reference, a code literal, or an exclamation are not
counted as punchlines.

Measured 2026-09-24 with the script's prose word counts: "X, not Y" flips ran
0.07 per 1000 words across 147,000 words of the git and vim manuals, 1.48 in
twelve agent-written tka docs, and 2.10 on the /notation pages before their
rewrite. Punchline fragments ran 0.17 in the manuals and 2.45 on the
/notation pages. The rewritten pages had none of either.

## Output Format

For each violation found:

```
FILE:LINE | PATTERN | QUOTED TEXT
  -> Suggestion: [fix or "delete this"]
```

## Severity Levels

- **CRITICAL:** Machine artifacts (chatbot residue, unfilled placeholders) and house bans (banned openers, em dashes, emoji, "Whether you're", slot-swapped templates)
- **HIGH:** Measured far more often in model output than in human prose: blacklisted words, hedging, metadiscourse, faux intimacy, negative parallelism, significance tails, meta-narration, performed candor, recurring flips and punchlines, weasel attribution, service closers
- **MEDIUM:** Matters when it recurs: copula dodges, colon reveals, perfect threes, counting, signposts, bold-first bullets, burstiness, favored-word clusters, stock headings
- **LOW:** Weak signals: false ranges, smart quotes, headers on short text, "In other words", trade-off reassurance, stock furniture
- **JUDGMENT:** The Pass 2 list. Flag it, explain it, don't auto-fail on it.
- Categories 6.5, 7, and 8 carry their own severity lines.

## What Not to Flag

Human writers use every pattern above now and then. The git and vim manuals,
written before chatbots, still contain "In other words", "Moreover", "Let's
break this down", and the occasional perfect three. One hit is not evidence.
Before reporting, check:

- **Recurrence.** A single short sentence, a single "X, not Y", a lone transition, or one perfect three is normal. Report the pattern when it repeats or clusters.
- **Precision contrasts.** "local to the script, not global" names a real distinction. The tell is a flip used for cadence: "family, not rivals".
- **Register.** Formal, plain, or bland prose with clean grammar is not a tell. Technical manuals and non-native writers often write this way.
- **Consistent phrasing.** Chapters that reuse "To delete a ___" are consistent. A template swaps the page's own subject into the slot.
- **Quoted material.** Flag only the writer's own words. Quotes, code, and names are exempt.
- **A clean result.** Passing every check means nothing was found, not that a person wrote it.

## Sources

Checked 2026-09-24. Model output drifts with each release, so re-check a ratio
before leaning on it.

- Graphite, [2026 study of AI tells across model versions](https://graphite.io/five-percent/research/ai-tells): phrase ratios against pre-ChatGPT human text ("matters because" at 357 times the human rate for GPT-6 Astra and 132 times for Claude Opus 5, "not simply" 157 times, "rather than relying" 187 times), em dash rates by model, and how fast known tells fade between versions.
- Wikipedia, [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): chatbot residue, placeholders, knowledge-limit disclaimers, notability puffery, significance tails, vague attribution.
- Reinhart et al., "Do LLMs write like humans?", PNAS 2025 ([arXiv:2410.16107](https://arxiv.org/abs/2410.16107)): GPT-4o used present participial clauses at 5.3 times the human rate.
- Kobak et al., [excess vocabulary in biomedical abstracts](https://www.science.org/doi/10.1126/sciadv.adt3813), Science Advances 2025: the word list behind the blacklist and the favored-word cluster.
- [arXiv:2604.19768](https://arxiv.org/pdf/2604.19768): 7.13 tricolons per document in model output against 3.73 for human experts.
- [arXiv:2502.09606](https://arxiv.org/pdf/2502.09606): the best-known words (delve, intricate, showcasing, pivotal) became less frequent after April 2024 as vendors tuned against them.
- Pangram, [walking through AI phrases](https://www.pangram.com/blog/walking-through-ai-phrases): phrase-level variants of the vocabulary list.
- The humanizer skill (v2.11.2, built on the Wikipedia page above): synonym cycling, heading echo, overcorrection.
- Local measurement, 2026-09-24: the git (20 documents) and vim (35 chapters) manuals as human controls, twelve agent-written tka docs, and the /notation prop pages before and after their human rewrite. `--self-test` holds the regression cases.

## What to Scan

Focus on user-facing text:
- Landing pages, marketing copy
- Documentation, help text
- UI labels, button text, error messages
- Release notes, changelogs
- About pages, descriptions
- Client emails and proposals

Skip:
- Code comments (unless they're user-visible)
- Variable names
- Test files
- Config files

## Proactive Mode (writing, not just reviewing)

Standing directive from Austen (2026-07-17): invoke this skill automatically
whenever WRITING user-facing copy, not only when asked to review. Run the
full pattern set (Pass 1, Pass 2, and Categories 6.5-8) against your own draft
before showing it, and design the page shape (Category 7) before drafting a
word.

## After Reporting

Ask: "Want me to fix these issues, or just use this as a reference?"
