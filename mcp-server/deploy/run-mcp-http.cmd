@echo off
REM Launcher for the Flow Arts Knowledge MCP server in HTTP mode.
REM Invoked by NSSM as a Windows service. Do not run directly.

set MCP_HTTP_PORT=3333

REM auth.local.cmd (gitignored) names the Cloudflare Access org and app. The
REM server refuses HTTP without it, a loud crash; see deploy\README.md.
if exist "%~dp0auth.local.cmd" call "%~dp0auth.local.cmd"

REM NSSM keeps every rotated log; keep the newest 200. Never blocks the start.
"C:\Program Files\nodejs\node.exe" "%~dp0prune-logs.mjs" "%~dp0logs"

cd /d "E:\tka-platform\mcp-server"
"C:\Program Files\nodejs\npx.cmd" --no-install tsx index.ts
