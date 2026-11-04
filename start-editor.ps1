# Run from PowerShell, or use start-editor.cmd for double-click startup.
param([switch]$NoBrowser)

& (Join-Path $PSScriptRoot 'tools/preview-editor.ps1') -NoBrowser:$NoBrowser
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
