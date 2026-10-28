param([switch]$Check, [switch]$OptimizeImages)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($OptimizeImages) { & (Join-Path $PSScriptRoot 'prepare-intersection-assets.ps1') }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  if ($nodeCommand) { $runtime = $nodeCommand.Source }
  else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Node.js or VS Code is required to rebuild this presentation.' }
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  & $runtime (Join-Path $PSScriptRoot 'build-intersection.cjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Presentation build failed.' }
  if ($Check) {
    & $runtime (Join-Path $root 'tests\verify-intersection.cjs') | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Presentation verification failed.' }
  }
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
