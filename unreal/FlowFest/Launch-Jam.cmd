@echo off
rem Jam polish: the "Dusk at Middle Earth" slice. Add -Watch to record it to Saved\Polish\Jam.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\launch.ps1" -Jam %*
exit /b %ERRORLEVEL%
