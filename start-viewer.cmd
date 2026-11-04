@echo off
setlocal
title Traffic Guide - View Presentation
echo Traffic Guide - View Presentation
echo Your browser will open automatically when the presentation is ready.
echo Keep this window open. To stop later, use stop-editor.cmd.
echo.
set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%TRAFFIC_GUIDE_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-viewer.ps1"
set "TRAFFIC_GUIDE_EXIT=%ERRORLEVEL%"
echo.
if not "%TRAFFIC_GUIDE_EXIT%"=="0" echo Presentation could not start. Please read the error above.
if not "%TRAFFIC_GUIDE_NO_PAUSE%"=="1" pause
exit /b %TRAFFIC_GUIDE_EXIT%
