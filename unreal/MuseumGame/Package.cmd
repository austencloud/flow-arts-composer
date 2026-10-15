@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\package.ps1" %*
exit /b %ERRORLEVEL%
