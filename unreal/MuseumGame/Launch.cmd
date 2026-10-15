@echo off
setlocal
set "PROJECT=%~dp0MuseumGame.uproject"
set "EDITOR=C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe"
if not exist "%EDITOR%" (echo Unreal Engine 5.8 missing & exit /b 1)
"%EDITOR%" "%PROJECT%" -game -windowed -ResX=1600 -ResY=900 -NoSplash
