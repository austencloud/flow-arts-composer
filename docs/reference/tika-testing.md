# TIKA Testing - Programmatic Interaction

**Repository status (2026-10-15):** `scripts/tika/run-evaluation.mjs` is the one scenario runner; `npm run tika:evaluate` and `tika:evaluate:dry` call it. It posts to `https://localhost:5173/api/tika/ask` with a Firebase bearer token from `TIKA_ID_TOKEN` and reads the AI SDK UI message stream. The `--opus` review still cannot run: `scripts/tika/opus-reviewer.ts` imports `@anthropic-ai/sdk`, which only `mcp-server/` installs, and it names the retired `claude-sonnet-4-20250514` model. `scripts/tika-validator.ts` still posts over plain HTTP without a token, so it fails too.

**Cost:** every live scenario is a paid model call, and `--opus` adds a paid review call per flagged answer. Ask Austen, with the expected cost, before any live run. `--dry-run` and `test-run.mjs` make no model calls.

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

To check a token without a model call, post an empty body: `400 Missing messages or question` means sign-in passed, and `500 Invalid or expired token` means get a new one. The route reports sign-in failures as 500, not 401.

## Full Evaluator

```bash
node scripts/tika/run-evaluation.mjs [options]
```

- `--category <name>` - Run one category from `scenarios.json`
- `--limit <n>` - First N scenarios
- `--opus` - Opus review of responses scoring under 70 (paid API; blocked, see status)
- `--dry-run` - Show scenarios only; needs no token, server, or installed packages
- Output: `scripts/tika/reports/`, summarized by `node scripts/tika/analyze-results.mjs`

Environment:

- `TIKA_ID_TOKEN` (required for live runs) - Firebase ID token, with or without a `Bearer ` prefix
- `TIKA_BASE_URL` (optional) - Origin to test; defaults to `https://localhost:5173`

A live run without `TIKA_ID_TOKEN` stops before the first request. A rejected or expired token stops the run at the first scenario and saves no report. The endpoint allows 30 requests a minute per user.

## Structural Validator

```bash
node --import tsx scripts/tika-validator.ts [options]
```

- `--category <name>` - Run specific category
- `--limit <n>` - First N scenarios
- `--stop-on <n>` - Stop after N consecutive failures
- `--dry-run` - Preview without running
- Live runs fail until it uses HTTPS and sends a token (see status)

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
