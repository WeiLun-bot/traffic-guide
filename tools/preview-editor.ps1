# Keep this launcher ASCII so Windows PowerShell 5.1 reads it in any code page.
$ErrorActionPreference = 'Stop'
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $runtime = $nodeCommand.Source }
  else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Node.js or VS Code is required to start the local preview.' }
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  & $runtime (Join-Path $PSScriptRoot 'prepare-github-pages.cjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the preview files.' }
  & $runtime (Join-Path $PSScriptRoot 'serve-github-pages.cjs') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start the preview server.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
