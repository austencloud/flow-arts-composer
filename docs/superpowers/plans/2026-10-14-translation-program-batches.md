# Translation program: batch plan (2026-10-14)

Coordinator plan for phase 1 (catalog translation) of the program described in
`docs/superpowers/handoffs/2026-10-14-translation-program-brief.md`. The
glossary every worker follows is `docs/reference/i18n-glossary.md`. The gate
every batch passes is `tests/unit/i18n-catalog-contract.test.ts`.

## Measured scope (main a9b7f882e7 plus this branch)

Released prefixes are the 46 in `scripts/i18n-released-prefixes.json`; the
file also lists the 33 prefixes awaiting Austen's call ("pending"), which the
skill's tables never classified. Words are English source words.

| Locale                 | Released keys missing | Words  | Pending keys missing | Words  |
| ---------------------- | --------------------- | ------ | -------------------- | ------ |
| de                     | 41                    | 146    | 53                   | 214    |
| es, fr, it, pt, ja, ru | 4,467 each            | 18,370 | 3,579                | 20,263 |
| ko, zh, ar             | 4,604 each            | 18,774 | 3,579                | 20,263 |

`tab_*` keys count only for released modules (86 of 288 keys).

German also carries 380 values identical to English (mostly legitimate
notation labels; the 16 with more than three prose words are letter lists),
26 Sie-forms in a du catalog, "Gitter" beside "Raster" for the grid and
"Level" beside "Stufe" and "Ebene". Those are the German finishing batch.

## Batches per locale

One worker per locale, one batch per Codex run, one commit per batch. The
key list for a batch is a JSON file the coordinator writes outside the repo
(`<scratchpad>/briefs/i18n/<locale>/batch-N.json`, `{ key: english }`) and
names in the prompt by absolute path, because prompts over about 30 KB fail.

| Batch | Prefixes                                                                                                                                         | Keys (es) | Words |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ----- |
| R1    | create                                                                                                                                           | 1,121     | 5,060 |
| R2    | learn                                                                                                                                            | 871       | 4,000 |
| R3    | viewer, browse                                                                                                                                   | 1,107     | 3,506 |
| R4    | share, settings, auth                                                                                                                            | 852       | 3,980 |
| R5    | nav, keyboard, module, profile, landing, library, tab (released modules), export, action, compose, sequence, app, common, error, search, loading | 516       | 1,600 |

If Austen releases the pending prefixes, four more batches follow:

| Batch | Prefixes                                                                                                                                                                                                                                    | Keys  | Words |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| P1    | guide (first half by key order)                                                                                                                                                                                                             | 400   | 4,100 |
| P2    | guide (second half)                                                                                                                                                                                                                         | 401   | 4,160 |
| P3    | verified, shape                                                                                                                                                                                                                             | 676   | 5,410 |
| P4    | effect, inbox, post, feedback                                                                                                                                                                                                               | 1,150 | 3,180 |
| P5    | train, animation, tunnel, shared, site, composer, playback, color, pattern, gallery, loop, pictograph, onboarding, notifications, tutorial, letter, fullscreen, bridge, character, preview, slide, guest, connection, toast, prop, assembly | 1,000 | 3,000 |

The guide and verified prose is the Level 1 and Level 2 textbook rendered
through `{@html}`; it keeps its `<span class>` and `<sup>` markup, and the
contract test checks that no locale introduces a tag its English source
lacks.

## Worker recipe

- Worktree `E:/worktrees/tka-platform/i18n-<locale>` on branch
  `codex/i18n-<locale>` from local `main`, `node_modules` junction via
  `cmd /c mklink /J`. The worker owns exactly `messages/<locale>.json` and
  its ledger `docs/reports/i18n/<locale>-ledger.md`. Never two workers on
  one JSON file.
- Dispatch from the worker's worktree:
  `CODEX_ASK_MODEL=gpt-6.1-sol CODEX_ASK_EFFORT=medium CODEX_ASK_TIMEOUT=10800 bash scripts/codex-ask.sh <prompt-file> <answer-file>`.
  Review pass: `CODEX_ASK_MODEL=gpt-6-astra`. CLI 0.162.1 verified today.
- The locale files are **not sorted**; keys sit in `en.json` order with
  later additions appended near their prefix. Workers insert each new key
  where `en.json` has it (after the nearest preceding key the locale already
  has) and never run `validate-i18n.cjs --fix`, which would rewrite 9,000
  lines and make the branch unmergeable.
- Rules in every prompt: glossary sections 1 and 11, `{placeholder}` parity,
  `<strong>/<em>/<br>` only unless the English value has more, no user data,
  released prefixes only, the locale's address form, one-line chips.
- Commit per batch with explicit pathspecs, message
  `i18n(<locale>): <batch> (<n> keys)`.

## Gates per batch (coordinator runs them, worker reports them)

1. `JSON.parse` of the file.
2. `npx vitest run --config tests/config/vitest.config.ts tests/unit/i18n-catalog-contract.test.ts`
   (no extra keys, no empty values, placeholder parity, markup parity, no
   untranslated prose, coverage ratchet).
3. Key-count delta equals the batch size; no key outside the batch changed
   (`git diff --stat` and a key diff against the batch file).
4. The coverage floor for the locale in the contract test rises in the same
   commit.
5. After the last batch: the astra review pass back-translates a 5% sample
   and lists meaning drift, formality slips and glossary violations; the
   worker fixes what it flags and commits again.

Integration: `npm run wt:finish -- codex/i18n-<locale> --nonvisual` from
`E:/tka-platform` after each wave, so `main` moves while later waves run.

## Waves

| Wave | Workers            | What                                                                                                       |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1    | de, es, fr, it, pt | German finishing batch (41 keys, Sie, Gitter, Level, identical review); R1–R5 for the four Romance locales |
| 2    | ja, ru, ko         | R1–R5                                                                                                      |
| 3    | zh, ar             | R1–R5                                                                                                      |
| 4    | all nine           | P1–P5 if the pending prefixes are released                                                                 |

Five concurrent Codex runs is the first wave's load. Each run is one batch
(about 1,000 keys, 4,000 to 5,000 source words); the first run's wall time
sets the estimate for the rest. Codex runs on the ChatGPT Pro subscription,
so the cost is plan usage, not a per-token bill; the plan's rate window is
the limit to watch.

## Phase 2 (after phase 1 is on main)

Externalize hardcoded strings one released module at a time (browse, create,
learn, library, settings, viewer, share): list components without an i18n
import that contain visible text, extract to keys in the module's prefix,
add English, run the locale workers for the new keys, and check every
touched surface at the verification-protocol viewport tiers. Replace
template-built keys with typed mappings and an enumerating test, as the
guest-nudge fix did.

## Open questions for Austen (asked 2026-10-14)

1. Which of the 33 pending prefixes are released.
2. Box grid in es/fr/it/pt: the literal box words now in the files
   (Caja, Boîte, Box, Caixa) or the square sense the German uses (Cuadrado,
   Carré, Quadrato, Quadrado).
3. Address form: tu/tú/você across the Romance locales with вы in Russian,
   or vous in French as well.
4. Go for wave 1.
