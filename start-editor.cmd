@echo off
setlocal
title Traffic Guide - Local Preview
echo Traffic Guide - Local Preview
echo Starting preview tools. Please keep this window open.
echo Your browser will open automatically when the preview is ready.
echo.
set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%TRAFFIC_GUIDE_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-editor.ps1"
set "TRAFFIC_GUIDE_EXIT=%ERRORLEVEL%"
echo.
if not "%TRAFFIC_GUIDE_EXIT%"=="0" echo Preview could not start. Please read the error above.
if not "%TRAFFIC_GUIDE_NO_PAUSE%"=="1" pause
exit /b %TRAFFIC_GUIDE_EXIT%
