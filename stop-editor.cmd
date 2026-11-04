@echo off
setlocal
title Traffic Guide - Stop Preview
set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "TRAFFIC_GUIDE_POWERSHELL=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%TRAFFIC_GUIDE_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-editor.ps1" %*
set "TRAFFIC_GUIDE_EXIT=%ERRORLEVEL%"
echo.
if not "%TRAFFIC_GUIDE_NO_PAUSE%"=="1" pause
exit /b %TRAFFIC_GUIDE_EXIT%
