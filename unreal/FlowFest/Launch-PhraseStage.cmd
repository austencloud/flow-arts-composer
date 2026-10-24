@echo off
rem Phrase stage: two staff spinners play the phrase schedule. Add -Watch to record the proof clip.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\launch.ps1" -PhraseStage %*
