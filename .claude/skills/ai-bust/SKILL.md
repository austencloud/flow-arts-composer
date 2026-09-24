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
| Low burstiness | mean 12+ word sentences with stdev under 5 | vary sentence length |

## Pass 2: Judgment (you catch these)

- **Unsigned first-person narration.** Flag `I`, `I'd`, `I've`, `me`, `my`, `we`, `our`, and `us` in site copy without a byline or signature. The reader cannot tell who is speaking. Restate the fact in third person; preserve first person in signed writing and attributed quotes.
- **Page self-commentary.** The copy talks about its own length, order, or purpose instead of the subject: "This page is short because..." or "First, what this page is not about." Start with the information.
- **Announced honesty.** "The honest version", "one admission", "plainly", or "this site won't pretend otherwise" perform candor before stating a limit. State the limit directly.
- **Paragraph punchlines.** Repeated clipped fragments or neat one-line endings make factual prose sound staged. Keep a short line when it carries meaning; remove it when it only recaps the paragraph.
- **Contrast flips.** Repeated "X, not Y" and "neither X nor Y" formulations create artificial balance. State the actual relationship once.
- **Staged setups.** "Good news:", "So, plainly:", rhetorical questions, and paired slogan-like headings delay the point. Lead with the fact.
- **Cross-page templates.** Compare sibling pages for the same heading order, section length, caption shape, CTA wording, and closer with nouns swapped. Give each page the structure its subject needs. Shared components may stay shared, but their visible language should not read like a fill-in-the-blank script.
- **Uniform section development.** Every topic gets a heading and one or two similarly sized paragraphs regardless of substance. Combine closely related ideas and give complex ones the space they need. Do not manufacture unevenness for its own sake.
- **Summary-sentence cabooses.** A section ends by restating its own point. End on the useful detail instead.
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
- **JUDGMENT:** Everything in pass 2. Flag it, explain it, don't auto-fail on it.

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

## After Reporting

Ask: "Want me to fix these issues, or just use this as a reference?"
