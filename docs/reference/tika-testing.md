# TIKA Testing - Programmatic Interaction

**Repository status (2026-10-15):** `scripts/tika/run-evaluation.mjs` is the one scenario runner; `npm run tika:evaluate` and `tika:evaluate:dry` call it. The older `scripts/tika/evaluate.ts` was retired because its scenario module and JSON reply contract no longer exist. `/api/tika/ask` requires a Firebase bearer token, and none of these scripts send one yet, so live runs fail with `Missing Authorization Bearer token` until that is added. HTTP examples below predate that requirement.

## Quick Health Check (No Options Needed)

```bash
node scripts/tika/test-run.mjs
```

Checks that the scenario file, knowledge graph, glossary, and letter types exist, then confirms the dev server answers on `/api/tika/ask`. It sends no token and no question, so it never starts a model call.

## Full Validator (Structural)

```bash
node --import tsx scripts/tika-validator.ts [options]
```

- `--category <name>` - Run specific category
- `--limit <n>` - First N scenarios
- `--stop-on <n>` - Stop after N consecutive failures
- `--dry-run` - Preview without running
- **Requires dev server on localhost:5173**

## Full Evaluator (With Opus Review)

```bash
node scripts/tika/run-evaluation.mjs [options]
```

- `--category <name>` - Run one category from `scenarios.json`
- `--limit <n>` - First N scenarios
- `--opus` - Opus review of responses scoring under 70 (paid API)
- `--dry-run` - Show scenarios only
- Output: `scripts/tika/reports/`, summarized by `node scripts/tika/analyze-results.mjs`

## Manual API Call

```bash
curl -X POST http://localhost:5173/api/tika/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is alpha?","userId":"test-user","language":"en"}'
```

Returns SSE stream. Parse `data: ` lines, JSON each.

## Key Files

- API route: `src/routes/api/tika/ask/+server.ts`
- System prompt: `src/lib/features/tika/ai/system-prompts.ts`
- Tools: `src/lib/features/tika/services/tika-tool-executor.ts`
- Scenarios: `scripts/tika/scenarios.json`, loaded by `scripts/tika/run-evaluation.mjs`
- Components: `src/lib/features/tika/components/TikaConversation.svelte`

## SSE Response Format

```
data: {"type":"text-delta","textDelta":"Some text"}
data: {"type":"tool-input-available","toolName":"get_letter_explanation","input":{"letter":"A"}}
data: {"type":"tool-output-available","output":{"inlinePictograph":{"letter":"A",...}}}
data: [DONE]
```
