# Keep this launcher ASCII so Windows PowerShell 5.1 reads it in any code page.
$ErrorActionPreference = 'Stop'
Write-Host '[1/3] Starting preview tools...'
if ([IntPtr]::Size -eq 4) {
  $nativePowerShell = Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
  if (Test-Path -LiteralPath $nativePowerShell) {
    Write-Host 'Switching to 64-bit Windows PowerShell...'
    & $nativePowerShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath | Out-Host
    exit $LASTEXITCODE
  }
}
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  $previewPort = 4173
  if ($env:PORT) {
    if ($env:PORT -notmatch '^\d+$' -or ![int]::TryParse($env:PORT, [ref]$previewPort) -or $previewPort -lt 1 -or $previewPort -gt 65535) { throw 'PORT must be a number from 1 to 65535.' }
  }
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCommand) { $runtime = $nodeCommand.Source }
  else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    if (!(Test-Path -LiteralPath $runtime)) { $runtime = Join-Path $env:ProgramFiles 'Microsoft VS Code/Code.exe' }
    if (!(Test-Path -LiteralPath $runtime) -and $env:ProgramW6432) { $runtime = Join-Path $env:ProgramW6432 'Microsoft VS Code/Code.exe' }
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Node.js or VS Code is required to start the local preview.' }
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  Write-Host '[2/3] Updating images and preview files...'
  $ErrorActionPreference = 'Continue'
  & $runtime (Join-Path $PSScriptRoot 'prepare-github-pages.cjs') --quiet 2>&1 | ForEach-Object { Write-Host $_ }
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the preview files.' }
  Write-Host '[3/3] Checking the preview server...'
  $listeners = @(Get-NetTCPConnection -LocalPort $previewPort -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    $serverScript = Join-Path $PSScriptRoot 'serve-github-pages.cjs'
    $sameProject = $false
    foreach ($listener in $listeners) {
      $listenerProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess) -ErrorAction SilentlyContinue
      if ($listenerProcess.CommandLine -and $listenerProcess.CommandLine.IndexOf($serverScript, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $sameProject = $true }
    }
    if (!$sameProject) { throw ('Port ' + $previewPort + ' is in use by another program. Close its preview window or choose another PORT, then try again.') }
    Write-Host 'This project preview is already running. Its files have been updated.'
    Write-Host ('Preview: http://127.0.0.1:' + $previewPort + '/presentation-demo/')
    Write-Host 'Return to Chrome/Edge and press Ctrl+Shift+R.'
    return
  }
  Write-Host ('Open in Chrome/Edge: http://127.0.0.1:' + $previewPort + '/presentation-demo/')
  Write-Host 'Keep this window open while using the presentation. Press Ctrl+C to stop.'
  $ErrorActionPreference = 'Continue'
  & $runtime (Join-Path $PSScriptRoot 'serve-github-pages.cjs') 2>&1 | ForEach-Object { Write-Host $_ }
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start the preview server.' }
} catch {
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
