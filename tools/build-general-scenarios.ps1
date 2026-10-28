$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  if ($nodeCommand) { $runtime = $nodeCommand.Source }
  else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Node.js or VS Code is required to rebuild this presentation.' }
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  & $runtime (Join-Path $PSScriptRoot 'build-general-scenarios.cjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'General road presentation build failed.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
