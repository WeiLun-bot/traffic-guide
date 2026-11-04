# Run the same local preview with the read-only presentation entry.
param([switch]$NoBrowser)

& (Join-Path $PSScriptRoot 'tools/preview-editor.ps1') -Viewer -NoBrowser:$NoBrowser
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
