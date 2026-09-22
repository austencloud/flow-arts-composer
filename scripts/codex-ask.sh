#!/usr/bin/env bash
# Ask Codex (OpenAI CLI) a question about this repo, non-interactively.
#
# Usage:
#   scripts/codex-ask.sh <prompt-file> [output-file]
#   echo "some prompt" | scripts/codex-ask.sh - [output-file]
#
# Prints the path to the answer file on success.
#
# Why the flags, since every one of them is load-bearing:
#
#   --ignore-user-config
#       ~/.codex/config.toml registers plugin marketplaces for the Codex
#       DESKTOP APP, one of them at a `/mnt/c/...` WSL path that cannot resolve
#       on Windows. The CLI hands those to its tool host at startup, the host
#       dies with "code-mode host exited during handshake", and the run ends
#       having read zero files. This flag skips that config; auth.json is still
#       read from CODEX_HOME, so it stays signed in. Do NOT "fix" this by
#       editing ~/.codex/config.toml -- that file belongs to the desktop app.
#
#   -o <file>
#       codex exec drops its final message on long runs: the work happens, the
#       report never arrives, exit code is 0. Four separate runs died this way.
#       This writes the last message to a file instead of relying on stdout.
#
#   -m
#       --ignore-user-config also discards the model setting, so it has to be
#       named here or the CLI falls back to its own default.
#
# Trust levels are also discarded by --ignore-user-config, which does not
# matter: --dangerously-bypass-approvals-and-sandbox already bypasses approval.

set -euo pipefail

MODEL="${CODEX_ASK_MODEL:-gpt-5.6-terra}"

# Defaults favor bounded, routine review. Set either environment variable for a
# task that needs a different model or effort.
EFFORT="${CODEX_ASK_EFFORT:-medium}"
EFFORT_ARGS=(-c "model_reasoning_effort=\"${EFFORT}\"")
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -lt 1 ]; then
	echo "usage: $0 <prompt-file|-> [output-file]" >&2
	exit 64
fi

PROMPT_FILE="$1"
OUT="${2:-$REPO/.codex-answer.md}"

if [ "$PROMPT_FILE" = "-" ]; then
	PROMPT="$(cat)"
elif [ -f "$PROMPT_FILE" ]; then
	PROMPT="$(cat "$PROMPT_FILE")"
else
	echo "no such prompt file: $PROMPT_FILE" >&2
	exit 66
fi

#   </dev/null on the exec below
#       The prompt is already in $PROMPT by this point, so codex needs nothing
#       from stdin -- but if stdin is an open pipe it does not know that, and
#       parks on "Reading additional input from stdin..." forever. That is not
#       hypothetical: one run sat for three hours having burned 0.03s of CPU
#       and read zero files. Closing stdin makes the hang unrepresentable.
#
#   timeout
#       So a wedged or pathologically slow run fails loudly with a transcript
#       instead of looking identical to one that is still thinking.

STATUS=0
timeout "${CODEX_ASK_TIMEOUT:-2700}" codex exec \
	--ignore-user-config \
	-m "$MODEL" \
	${EFFORT_ARGS[@]+"${EFFORT_ARGS[@]}"} \
	-o "$OUT" \
	--dangerously-bypass-approvals-and-sandbox \
	-C "$REPO" \
	"$PROMPT" </dev/null >"${OUT%.md}.log" 2>&1 || STATUS=$?

if [ "$STATUS" -eq 124 ]; then
	echo "codex timed out after ${CODEX_ASK_TIMEOUT:-2700}s; transcript: ${OUT%.md}.log" >&2
	exit 124
fi

if [ ! -s "$OUT" ]; then
	echo "codex produced no answer (exit $STATUS); transcript: ${OUT%.md}.log" >&2
	exit 70
fi

echo "$OUT"
