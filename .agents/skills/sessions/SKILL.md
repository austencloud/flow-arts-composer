---
name: sessions
description: Use when reviewing real user sessions for bugs and friction patterns, checking what users are hitting in production, or when the user says $sessions
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# User Session Triage

When explicitly invoked, treat the text after `$sessions` as `<arguments>`. Expected shape: `[analyze|stats|<session-id>]`.

**Args:** `<arguments>`

Reviews real user sessions from PostHog, clusters recurring problems into the
Firestore `sessionIssues` register, and files feedback items for the ones worth
fixing.

Two ranking layers, do not confuse them:

- **Sessions** rank by friction score — that only picks candidates to read.
- **Issues** rank by **distinct users affected** — that is the priority signal.

The register is what makes recurrence visible. A bug seen by six people
outranks a nastier one seen by one, and that is deliberate.

---

## Workflow (default, no args)

### 1. Read the watermark

```powershell
TKA_ADMIN=1 npx tsx -e "import('./scripts/lib/session-issue-store.ts').then(async m => { const x = await m.loadMeta(); console.log(JSON.stringify(x)); })"
```

Gives `reviewedThrough`, `reviewedSessionIds`, and the `aliases` map.

### 2. Analyze everything since

```powershell
npx tsx scripts/triage-sessions.ts analyze --since <reviewedThrough> --limit 20 --json
```

Skip any session already in `reviewedSessionIds`.

`analyze` and `stats` drop likely crawlers first: one page view, never
identified, `zh-CN` browser language, and no referrer (on 2026-10-22, 30 of
the top 40 friction slots were this shape). Pass `--include-crawlers` to see
them. Nothing changes in PostHog; the rule is `isLikelyCrawlerSession` in
`session-triage-queries.ts`.

Each surfaced session carries its score AND the reasons that produced it, so
you can see whether the ranking is behaving. If the reasons look wrong, say so
rather than trusting the number.

### 3. Read the top sessions

```powershell
npx tsx scripts/triage-sessions.ts <sessionId>
```

Read the event stream and decide what actually went wrong. The score is a
candidate finder; this step is where the judgment happens.

**Find the code site.** Grep the route and the exception message against the
codebase. A pinned site (`AccountPopover.svelte:114`) is what makes recurrence
matching reliable across runs, so spend real effort here.

**Never invent one.** If you cannot find it, leave `codeSite: null` and let
route matching handle it. A wrong code site silently merges two different bugs
and poisons every future run.

### 4. Cluster into the register

```powershell
TKA_ADMIN=1 npx tsx -e "import('./scripts/lib/session-issue-store.ts').then(async m => console.log(JSON.stringify(await m.loadIssues())))"
```

Use `matchIssue` and `applySighting` from
`src/lib/server/analytics/session-issue-register.ts`. Do not reimplement the
matching rules — they encode decisions that are easy to get subtly wrong
(dismissed issues never match; resolved issues DO match so they can reopen).

- Match found → recurrence. `applySighting` handles uids, evidence, and dates.
- No match → new issue via `nextIssueId()`. Title it by what the USER
  experienced ("Sign-in click does nothing, silently"), not by the stack trace.
- Fewer than 2 users and no code site → `status: "watching"`. Do not file
  feedback for these yet.

### 5. Resolve-on-silence

For each open issue with a linked feedback item:

```powershell
node scripts/fetch-feedback.js <feedbackId>
```

Apply `shouldResolveOnSilence`. It resolves ONLY when quiet 14+ days AND the
feedback is `completed`. **Silence alone never resolves anything** — low
traffic looks exactly like a fix.

This is the highest-value output here: production confirmation that a fix
actually worked, which is otherwise invisible.

### 6. Write the register

Save issues with `saveIssue`, then advance the watermark LAST with
`nextWatermark` + `saveMeta`. Order matters: if a write fails partway, a stale
watermark makes the next run re-read rather than silently skip sessions.

Append the reviewed session ids to `reviewedSessionIds`.

### 7. Report

Ordered by distinct users affected:

```
## Session Triage · <N> sessions since <date>

### Needs a decision
[issue · N users / M sessions · code site · feedback status]

### Closed this run
[resolved-on-silence, citing both the quiet period and the completed feedback]

### Watching
[single-sighting patterns, no action]
```

Name users with `resolveDisplayNames`, never raw uids.

### 8. File feedback — ASK FIRST

Never file without confirmation; this writes to the shared feedback queue.

```powershell
node scripts/fetch-feedback.js add \
  --title "<user-facing title>" \
  --description "<what happens, N users affected, session ids, code site>" \
  --type bug --priority <low|medium|high> --module <module> --user austen
```

Write the returned id back to the issue's `feedbackId`.

---

## Web vitals

```powershell
npx tsx scripts/triage-web-vitals.ts --days 30 [--min 10] [--json]
```

Read-only. Ranks route patterns by p75 LCP (mobile first), then INP, then CLS,
from PostHog `$web_vitals` events, with the same crawler rule as `analyze`.
LCP groups by the hard-load URL, INP and CLS by where they were reported.
The events carry no LCP element or INP target until the client sets
`capture_performance.web_vitals_attribution`. First report:
`docs/reports/web-vitals-2026-10-22.md`.

---

## For `stats`

```powershell
npx tsx scripts/triage-sessions.ts stats --days 30
```

Report the numbers, flag anything anomalous. Does not touch the register.

## For `<session-id>`

```powershell
npx tsx scripts/triage-sessions.ts <session-id>
```

Read it in detail. Does not touch the register unless asked.

---

## Known state of the signals (measured 2026-08-05, 200 sessions / 30 days)

| Signal | Status |
|---|---|
| `$exception` | Live, ~34% of sessions. Strongest signal. |
| `$rageclick` | Live but rare, ~4%. |
| `$dead_click` | **Never fires** — not enabled for this PostHog project. Contributes nothing until it is. |
| content actions | ~14%. Event list may still be incomplete. |
| bounce | ~51%. Very common, so it is weighted low on purpose. |

Excluded from all results: localhost, `192.168.*`, `dev.tkaflowarts.com`,
Austen's two admin UIDs, and any `agent-*` identity (automation browsing
production scored as a struggling user until it was filtered).

---

## Rules

- **Never invent a code site.** `null` is honest; a guess is corruption.
- **Never file feedback without confirmation.**
- **Never resolve on silence alone.**
- **Watch for one uid across many issues** — that is a single frustrated user,
  not N independent problems, and it should be reported as such.
- A high score is a reason to LOOK, never a finding on its own. Report what the
  event stream shows, not what the score implied.
