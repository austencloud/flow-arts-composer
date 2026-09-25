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
   echo "pasted text" | python .claude/skills/ai-bust/ai_bust.py -
   python .claude/skills/ai-bust/ai_bust.py --json --min-severity HIGH FILE
   ```

   Exit 1 means findings. Findings prefixed `JUDGMENT:` are statistical hints, not verdicts.

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
| Em dashes, smart quotes, emoji, unicode arrows | "Input → Output" | write it out, straight quotes |
| Banned openers | "In today's fast-paced world" | cut, start with the content |
| Blacklisted vocabulary | delve, robust, curated, elevate, ecosystem, nestled, utilize, foster, holistic | name the specific thing |
| Hedging and robotic transitions | "It's worth noting", "Furthermore", "In conclusion" | delete, keep the fact |
| Metadiscourse labels | "The key takeaway is", "In other words" | delete the label, keep the claim |
| Sycophantic openers | "Great question!", "You're absolutely right" | answer directly |
| Faux-intimacy transitions | "Here's the thing", "Let's unpack this" | cut it |
| Dressed-up copula | "serves as", "stands as", "is a testament to", "boasts" | use is or has |
| Negative parallelism | "It's not just X. It's Y." / "Not a bug. Not a feature. A flaw." | state the claim once |
| Colon reveals | "The best part: it scales." | drop the setup and the colon |
| Rhetorical question + fragment | "The result? Devastating." | state the answer as a sentence |
| Wh-cleft openers | "What makes this interesting is" | delete the scaffold |
| Weasel attribution | "Experts agree", "Studies show" | name the source or cut |
| False ranges | "from X to Y to Z" | list the real items |
| Unearned stakes | "fundamentally reshape", "change everything" | scale to the evidence |
| Acknowledge-then-dismiss | "Despite these challenges, it thrives" | detail the challenge or cut the beat |
| Compulsive counting | "There are three reasons:" | just list them |
| Perfect threes | "efficient, reliable, and scalable" | two items or break the rhythm |
| Boilerplate endings | "Whether you're...", "Let me know if..." | pick the audience, end on content |
| Signpost paragraph openers (3+ in a row) | "For any of these,", "Since there are kids coming," | start with the content |
| Bold-first bullets (3+ in a row) | `**Security**: ...` on every line | bold one item or none |
| Header on short text | heading over fewer than 40 words | fold into prose |
| Low burstiness | mean 12+ word sentences with stdev under 5 | let length follow the content; never add a fragment to raise the score (see Category 8) |

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

## Output Format

For each violation found:

```
FILE:LINE | PATTERN | QUOTED TEXT
  -> Suggestion: [fix or "delete this"]
```

## Severity Levels

- **CRITICAL:** Banned openers, em dashes, emoji, "Whether you're" (dead giveaways)
- **HIGH:** Blacklisted words, hedging, metadiscourse, faux intimacy, negative parallelism, weasel attribution, service closers
- **MEDIUM:** Copula dodges, colon reveals, perfect threes, counting, signposts, bold-first bullets, burstiness
- **LOW:** False ranges, smart quotes, headers on short text (context-dependent)
- **JUDGMENT:** The Pass 2 list. Flag it, explain it, don't auto-fail on it.
- Categories 6.5, 7, and 8 carry their own severity lines.

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
