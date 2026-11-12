/**
 * Read the command text out of a PreToolUse payload.
 *
 * Claude Code sends { tool_name, tool_input: { ... }, cwd, ... } on stdin. The
 * three guards used to read `payload.command`, which does not exist, so every
 * command passed. Bash and PowerShell carry the text in tool_input.command;
 * desktop-commander's start_process uses `command` too and
 * interact_with_process sends the typed text as `input`.
 */
export function readHookCommand(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { command: '', cwd: '', toolName: '' };
  }
  const toolInput = payload.tool_input || {};
  const command =
    typeof toolInput.command === 'string' ? toolInput.command
    : typeof toolInput.input === 'string' ? toolInput.input
    : typeof payload.command === 'string' ? payload.command
    : '';
  return { command, cwd: payload.cwd || '', toolName: payload.tool_name || '' };
}

