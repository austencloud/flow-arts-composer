# TIKA Testing - Programmatic Interaction

**Repository status (2026-10-15):** `scripts/tika/run-evaluation.mjs` is the one scenario runner; `npm run tika:evaluate` and `tika:evaluate:dry` call it. It and `scripts/tika-validator.ts` both post through `scripts/tika/lib/stream-client.mjs`: HTTPS to `https://localhost:5173/api/tika/ask`, a Firebase bearer token from `TIKA_ID_TOKEN`, and the AI SDK UI message stream read by the `ai` package. `scripts/tika/opus-reviewer.ts` runs on the root's `ai` + `@ai-sdk/anthropic` with Claude Opus 5.5. All three load and dry-run without a model call; none has had a live run since these changes.

**Cost:** every live scenario is a paid model call, and `--opus` adds a paid review call per flagged answer (see [Opus Review](#opus-review)). Ask Austen, with the expected cost, before any live run. `--dry-run` and `test-run.mjs` make no model calls.

## Quick Health Check (No Options Needed)

```bash
node scripts/tika/test-run.mjs
```

Checks that the scenario file, knowledge graph, glossary, and letter types exist, then confirms the dev server answers on `/api/tika/ask`. It sends no token and no question, so it never starts a model call.

## Sign-in Token

`/api/tika/ask` checks a Firebase ID token before anything else. The runner reads one from `TIKA_ID_TOKEN`; never write a token into a file or commit it. ID tokens expire after an hour, so get a fresh one before each run.

Use the shared agent account (`Codex + Claude`, see `docs/reference/agent-browser-profile.md`), signed in on `https://dev.tkaflowarts.com` in the agent Chrome. On a freshly loaded page, run this in the DevTools console:

```js
copy(
  await (
    await import("/src/lib/shared/auth/firebase.ts")
  ).auth.currentUser.getIdToken()
);
```

Then, in PowerShell:

```powershell
$env:TIKA_ID_TOKEN = Get-Clipboard
Set-Clipboard -Value $null
```

A page that has taken a hot update imports the auth module under a `?t=` URL, so the bare import can return a second copy; reload first. The token belongs to the Firebase project, so a token from `dev.tkaflowarts.com` also works against `https://localhost:5173`.

To check a token without a model call, post an empty body: `400 Missing messages or question` means sign-in passed, and `401 Invalid or expired token` means get a new one. Servers running code from before 2026-10-15 answer that case with 500; `stream-client.mjs` treats both as a rejected token.

## Full Evaluator

```bash
node scripts/tika/run-evaluation.mjs [options]
```

- `--category <name>` - Run one category from `scenarios.json`
- `--limit <n>` - First N scenarios
- `--opus` - Opus review of responses scoring under 70 (paid; needs `ANTHROPIC_API_KEY`)
- `--dry-run` - Show scenarios only; needs no token, server, or installed packages. With `--opus` it also loads the reviewer and prints its model, key status, and data counts, still without a model call
- Output: `scripts/tika/reports/`, summarized by `node scripts/tika/analyze-results.mjs`

Environment:

- `TIKA_ID_TOKEN` (required for live runs) - Firebase ID token, with or without a `Bearer ` prefix
- `TIKA_BASE_URL` (optional) - Origin to test; defaults to `https://localhost:5173`

A live run without `TIKA_ID_TOKEN` stops before the first request. A rejected or expired token stops the run at the first scenario and saves no report. The endpoint allows 30 requests a minute per user.

## Opus Review

```bash
npm run tika:opus -- --dry-run
npm run tika:opus:demo
```

`opus-reviewer.ts` grades one answer with `claude-opus-5-5` (provider default effort, `medium`). The model can call seven lookup tools; the script answers them locally from `mcp-server-pkg/data` and the pictograph CSV, and `read_codebase_file` refuses paths outside the repository and `.env*` files, since its output goes to the API. The tool loop is the SDK's `generateText` with `stopWhen: stepCountIs(8)`.

- `--dry-run` - Prints the model, whether `ANTHROPIC_API_KEY` is set, the data counts, and sample tool answers. No model call.
- `--demo` - One paid review of a deliberately wrong sample answer; prints the tokens used and their cost.

Cost per review at $4 / $20 per million input / output tokens: the prompt is about 1,000 tokens plus the tool definitions, each verification round re-sends the conversation, and thinking counts as output. A typical review of two or three rounds is roughly 8,000 to 12,000 input and 1,500 to 3,000 output tokens, about $0.06 to $0.11. The eight-round cap bounds a review near $0.30. `run-evaluation.mjs --opus` reviews only answers scoring under 70, so the 35 scenarios add at most about $4, usually far less. These are estimates; `--demo` prints the measured figure, and every `reviewWithOpus` result carries `usage` and `costUsd`.

## Structural Validator

```bash
node --import tsx scripts/tika-validator.ts [options]
```

Checks the 33 level-1 scenarios from `scripts/tika/scenarios.json` for a tool call, a pictograph, at most 50 words, and no raw JSON. Scenarios with no expected tools skip the tool and pictograph checks. It uses the same `TIKA_ID_TOKEN` and `TIKA_BASE_URL` as the evaluator, stops before the first request without a token, and stops the run when the token is rejected. Each live scenario is a paid model call.

- `--category <name>` - Run specific category
- `--limit <n>` - First N scenarios
- `--stop-on <n>` - Stop after N consecutive failures
- `--delay <ms>` - Pause between requests (default 500)
- `--dry-run` - Preview without running

## Manual API Call

```bash
curl -k -X POST https://localhost:5173/api/tika/ask -H "Content-Type: application/json" -H "Authorization: Bearer $TIKA_ID_TOKEN" -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"What is alpha?"}]}],"language":"en"}'
```

This is a paid model call. The route also accepts a legacy `{"question": "..."}` body.

## Key Files

- API route: `src/routes/api/tika/ask/+server.ts`
- System prompt: `src/lib/features/tika/ai/system-prompts.ts`
- Tools: `src/lib/features/tika/services/tika-tool-executor.ts`
- Scenarios: `scripts/tika/scenarios.json`, loaded by `scripts/tika/run-evaluation.mjs`
- Stream client: `scripts/tika/lib/stream-client.mjs`, tested by `tests/unit/scripts/tika-stream-client.test.ts`
- Opus reviewer: `scripts/tika/opus-reviewer.ts`, tested with the SDK's mock model by `tests/unit/scripts/tika-opus-reviewer.test.ts`
- Structural validator: `scripts/tika-validator.ts`
- Components: `src/lib/features/tika/components/TikaConversation.svelte`

## SSE Response Format

The route returns `result.toUIMessageStreamResponse()` from `ai` 6: one Server-Sent Event per chunk, closed by `[DONE]`. Abridged:

```
data: {"type":"start","messageId":"..."}
data: {"type":"text-start","id":"t1"}
data: {"type":"text-delta","id":"t1","delta":"Some text"}
data: {"type":"text-end","id":"t1"}
data: {"type":"tool-input-available","toolCallId":"c1","toolName":"get_letter_explanation","input":{"letter":"A"}}
data: {"type":"tool-output-available","toolCallId":"c1","output":{"inlinePictograph":{"letter":"A"}}}
data: {"type":"finish","finishReason":"stop"}
data: [DONE]
```

`stream-client.mjs` reads it with the package's own `parseJsonEventStream`, `uiMessageChunkSchema`, and `readUIMessageStream`, so it follows the installed SDK instead of a hand-written parser.
