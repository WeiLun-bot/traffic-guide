# Keep this launcher ASCII so Windows PowerShell 5.1 reads it in any code page.
param([switch]$NoBrowser, [switch]$Viewer)

$ErrorActionPreference = 'Stop'
function Open-PreviewBrowser([string]$Url) {
  if ($NoBrowser -or $env:TRAFFIC_GUIDE_NO_BROWSER -eq '1') {
    Write-Host 'Automatic browser opening is disabled.'
    return
  }
  try {
    Start-Process -FilePath $Url | Out-Null
    Write-Host 'Opened preview in your default browser.'
  } catch {
    Write-Warning ('Could not open the browser automatically. Open this URL manually: ' + $Url)
  }
}
Write-Host '[1/3] Starting preview tools...'
if ([IntPtr]::Size -eq 4) {
  $nativePowerShell = Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
  if (Test-Path -LiteralPath $nativePowerShell) {
    Write-Host 'Switching to 64-bit Windows PowerShell...'
    $forwardedArguments = @()
    if ($NoBrowser) { $forwardedArguments += '-NoBrowser' }
    if ($Viewer) { $forwardedArguments += '-Viewer' }
    & $nativePowerShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @forwardedArguments | Out-Host
    exit $LASTEXITCODE
  }
}
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
try {
  $previewPort = 4173
  if ($env:PORT) {
    if ($env:PORT -notmatch '^\d+$' -or ![int]::TryParse($env:PORT, [ref]$previewPort) -or $previewPort -lt 1 -or $previewPort -gt 65535) { throw 'PORT must be a number from 1 to 65535.' }
  }
  $serverUrl = 'http://127.0.0.1:' + $previewPort + '/presentation-demo/'
  $previewUrl = $serverUrl
  if ($Viewer) { $previewUrl += 'viewer.html' }
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCommand) { $runtime = $nodeCommand.Source }
  else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    if (!(Test-Path -LiteralPath $runtime)) { $runtime = Join-Path $env:ProgramFiles 'Microsoft VS Code/Code.exe' }
    if (!(Test-Path -LiteralPath $runtime) -and $env:ProgramW6432) { $runtime = Join-Path $env:ProgramW6432 'Microsoft VS Code/Code.exe' }
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Node.js or VS Code is required to start the local preview.' }
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  Write-Host '[2/3] Preparing content, layout and preview files...'
  $ErrorActionPreference = 'Continue'
  & $runtime (Join-Path $PSScriptRoot 'prepare-github-pages.cjs') --quiet --archive-stale-preview-files 2>&1 | ForEach-Object { Write-Host $_ }
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
    $currentServer = $false
    try {
      $previewStatus = Invoke-RestMethod -Uri ($serverUrl + '__preview') -TimeoutSec 3
      $currentServer = $previewStatus.version -eq 1 -and $previewStatus.projectStorage -eq $true
    } catch { }
    if ($currentServer) {
      Write-Host 'This project preview is already running. Its files have been updated.'
      Write-Host 'The original launcher owns the server. Closing this second window will not stop it.'
      Write-Host 'To stop this project preview later, double-click stop-editor.cmd.'
      Write-Host ('Preview: ' + $previewUrl)
      Open-PreviewBrowser $previewUrl
      Write-Host 'Return to Chrome/Edge and press Ctrl+Shift+R.'
      return
    }
    Write-Host 'Restarting this project preview to enable separate content and layout saving...'
    & (Join-Path $PSScriptRoot 'stop-preview.ps1') -Port $previewPort | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not restart the outdated project preview.' }
  }
  Write-Host ('Preview URL: ' + $previewUrl)
  Write-Host 'Keep this window open while using the presentation. Press Ctrl+C to stop.'
  Write-Host 'Closing this launcher also stops its server. To stop it later, use stop-editor.cmd.'
  $ErrorActionPreference = 'Continue'
  $browserAttempted = $false
  & $runtime (Join-Path $PSScriptRoot 'serve-github-pages.cjs') --parent-pid $PID 2>&1 | ForEach-Object {
    $serverLine = [string]$_
    Write-Host $serverLine
    # The server prints this only after its listening callback fires.
    if (!$browserAttempted -and $serverLine.StartsWith('Preview: ' + $serverUrl)) {
      $browserAttempted = $true
      Open-PreviewBrowser $previewUrl
    }
  }
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start the preview server.' }
} catch {
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
