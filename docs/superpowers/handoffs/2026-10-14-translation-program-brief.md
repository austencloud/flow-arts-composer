# Translation Program — Kickoff Brief (2026-10-14)

Written by the Codex Swarm Backlog session for a separate Fable session that
will own this program end to end. Austen's decisions on 2026-10-14: a
separate coordinator owns it; scope is **catalog first, then externalize**.
Codex workers do the bulk; the coordinator holds the glossary and the gates.

## Where things stand (measured 2026-10-14 on main a9b7f882e7)

| Measure | Value |
| --- | --- |
| English keys in `messages/en.json` | 9,590 flat keys, about 43,000 words |
| German (`de.json`) | 8,862 keys; 739 missing; 342 values still identical to English |
| es, fr, it, pt, ja, ru | about 890 keys each, about 8,700 missing |
| ar, ko, zh | 685 keys each, 8,916 missing |
| Svelte components with visible text and no i18n import | about 712 (rough grep, includes some internal tools) |
| `t(...)` call sites in src | about 7,400 |

Key prefixes by size (keys / words): create 1129/5069, learn 892/4058,
guide 801/8261, browse 627/2111, viewer 588/1613, verified 437/4478,
settings 408/1257, effect 399/660, share 343/1393, inbox 295/1025,
tab 288/1010, auth 265/1782, feedback 255/886, post 245/787, shape 239/932,
train 181/501, nav 178/666, keyboard 174/637.

## Mechanics you must respect

- Catalog is flat JSON, one file per locale in `messages/`, keys like
  `create_generate_title`; the prefix before the first underscore is the
  module. `$schema` is a key; leave it.
- Loader: `src/lib/shared/i18n/i18n.svelte.ts` imports `en.json` statically
  and lazy-loads the others. Missing keys fall back to English at runtime, so
  a missing key is silent in the UI.
- Placeholders are `{name}`; keep the same names and braces. Markup inside a
  message is limited to `<strong>`, `<em>`, `<br>`; each locale places them
  itself (`src/lib/shared/i18n/message-markup.ts` explains why).
- Scope rule: translate only released prefixes. The authoritative list is
  `~/.claude/skills/translate/SKILL.md` (released and NOT-released tables).
  Unreleased prefixes (voice, moderation, connect, hall, skel2tka, poi,
  mandala, arena, community, watch, premium, gamification, admin, clip,
  attribution, beta, duet, viewer3d, audience, scheduler, avatar, background,
  sessions, events, warning) stay untranslated. For `tab_*` keys translate
  only tabs of released modules.
- Never translate user data: sequence words, letters, user names, titles,
  canonical filter values, effect identifiers. `docs/reports/2026-09-25-german-audit.md`
  lists the display-time-translation pattern that keeps those intact.
- Validator: `node scripts/validate-i18n.cjs`. Tests: `tests/unit/i18n-*.test.ts`,
  `tests/unit/german-catalog-contract.test.ts` (German parity; generalize it
  to every locale as the first gate of this program), and
  `tests/unit/i18n-t-import-contract.test.ts` (every component calling `t()`
  imports it; this is the externalization guard).

## Lessons from the German pass (September 2026)

The report at `docs/reports/2026-09-25-german-audit.md` is required reading.
Omissions kept reappearing for four reasons, none of them translation
quality: hardcoded component text, display labels taken from saved data,
English defaults captured before a locale change, and dynamically built keys
(`auth_nudge_module_${x}`) that no key check could see. The fix for the last
one was an exhaustive typed mapping plus an enumerating test. Expect the same
families again in phase 2.

## Phase 1: catalog translation (text only, no code)

1. **Glossary first.** Build `docs/reference/i18n-glossary.md`: TKA terms
   (letters stay Latin, LOOP and CAP names, prop names, Alpha/Beta/Gamma,
   Type 1..6, "beat", "turn", "placement", "diamond"/"box" grid, prop
   orientations) with the chosen rendering per locale and a "do not
   translate" column. Source the definitions from the Flow Arts MCP
   (`get_term_definition`, `get_alphabet_info`) and the existing German
   choices in `de.json`, which Austen has already seen in the app.
2. **One Codex worker per locale**, never two on the same JSON file (merge
   conflicts in a 9,000-line JSON are not worth it). Each worker gets: the
   glossary, the released-prefix list, the placeholder and markup rules, and
   the batch of keys to translate as a file inside its worktree (prompts over
   about 30 KB fail on Windows with "Argument list too long"; put lists in a
   file and reference it). Batch by prefix group so a worker commits every
   600 to 1,000 keys and a crash loses little.
3. **Gates per batch:** `node scripts/validate-i18n.cjs`, the generalized
   catalog contract test (placeholder parity, no empty values, no
   English-identical values for keys longer than three words), JSON parse,
   and a key-count delta that matches the batch.
4. **Quality pass:** a second Codex pass on `gpt-6-astra` per locale that
   back-translates a 5% sample and flags meaning drift, formality mismatches
   (German du/Sie is already decided in `de.json`; follow it), and glossary
   violations. Native review is Austen's or the community's; record who
   reviewed what in the glossary doc.
5. Order: finish German (739 keys, 342 identical-to-English to review),
   then es, fr, pt, it (closest to English), then ja, ko, zh, then ar
   (RTL: natural phrasing only, the browser handles direction).

## Phase 2: externalize hardcoded strings (code, module by module)

- Work one released module at a time (browse, create, learn, library,
  settings, viewer, share). For each: list components without an i18n
  import that contain visible text, extract to `*_` keys following the
  existing naming in that prefix, add English to `en.json`, then run the
  locale workers for the new keys.
- This changes markup, so every module needs a visual check at the
  viewport tiers in `.claude/rules/verification-protocol.md` after
  extraction. Codex does the extraction; a Claude session or Austen does
  the look. Watch for text that must stay single-line (chips, buttons) and
  for German length growth (about 30%).
- Dynamic keys: replace template-built keys with typed mappings and an
  enumerating test, as the German pass did.

## Codex dispatch recipe (verified 2026-10-14)

- CLI 0.162.1; models `gpt-6.1-sol` (bulk) and `gpt-6-astra` (review).
  5.6 models are not to be used. A stale CLI rejects 6.x Sol with a
  misleading "not supported with a ChatGPT account" error; update the CLI.
- Run `scripts/codex-ask.sh` **from the worker's worktree** so `-C`
  resolves there: `cd E:/worktrees/tka-platform/<wt> && CODEX_ASK_MODEL=gpt-6.1-sol
  CODEX_ASK_EFFORT=medium CODEX_ASK_TIMEOUT=10800 bash scripts/codex-ask.sh <prompt> <out>`.
- Each worker: own worktree under `E:/worktrees/tka-platform/`, a
  `node_modules` junction (`mklink /J`), explicit-pathspec commits, never
  install, never svelte-check, never push. The swarm session's common
  preamble is a good template; it lives in that session's scratchpad under
  `briefs/_common.md` and the same rules are in `AGENTS.md`.
- Integrate doc and catalog branches with
  `npm run wt:finish -- <branch> --nonvisual` from `E:/tka-platform`.

## Not in scope

Marketing site copy outside the catalog, the MCP server's own strings,
PDF or print assets, and anything under `src/routes/test`.
