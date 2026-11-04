# Stop only preview servers belonging to this project, including older versions.
param([switch]$Status, [ValidateRange(0,65535)][int]$Port = 0)

& (Join-Path $PSScriptRoot 'tools/stop-preview.ps1') -Status:$Status -Port $Port
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
