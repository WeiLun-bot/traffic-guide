# Keep this script ASCII for Windows PowerShell 5.1.
param([switch]$Status, [ValidateRange(0,65535)][int]$Port = 0)

$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -eq 4) {
  $nativePowerShell = Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
  if (Test-Path -LiteralPath $nativePowerShell) {
    $forwardedArguments = @()
    if ($Status) { $forwardedArguments += '-Status' }
    if ($Port) { $forwardedArguments += @('-Port', [string]$Port) }
    & $nativePowerShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @forwardedArguments | Out-Host
    exit $LASTEXITCODE
  }
}
try {
  $serverScript = Join-Path $PSScriptRoot 'serve-github-pages.cjs'
  $serverPattern = '(?:^|[\s"])' + [regex]::Escape($serverScript) + '(?:[\s"]|$)'
  function Test-ProjectPreview($Process) {
    return $Process -and $Process.CommandLine -and $Process.CommandLine -match $serverPattern
  }
  $previews = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'Code.exe'" | Where-Object { Test-ProjectPreview $_ })
  if (!$previews.Count) {
    Write-Host 'No preview is running for this project.'
    exit 0
  }
  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  $matchedPreview = $false
  foreach ($preview in $previews) {
    $previewPid = [int]$preview.ProcessId
    $ports = @($listeners | Where-Object { $_.OwningProcess -eq $previewPid } | Select-Object -ExpandProperty LocalPort -Unique)
    if ($Port -and $ports -notcontains $Port) { continue }
    $matchedPreview = $true
    Write-Host ('Project preview: PID ' + $previewPid + '; listening ports: ' + ($ports -join ', '))
    if ($Status) { continue }
    # Recheck identity immediately before stopping, in case Windows reused a PID.
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $previewPid)
    if (!$current) { continue }
    if (!(Test-ProjectPreview $current) -or $current.CreationDate -ne $preview.CreationDate) { throw ('Process identity changed; left PID ' + $previewPid + ' running.') }
    $ownedProcess = Get-Process -Id $previewPid -ErrorAction SilentlyContinue
    if ($ownedProcess) {
      $control = New-Object System.IO.Pipes.NamedPipeClientStream('.', ('traffic-guide-preview-' + $previewPid), ([System.IO.Pipes.PipeDirection]::Out))
      try {
        $control.Connect(500)
        $commandBytes = [System.Text.Encoding]::ASCII.GetBytes("stop`n")
        $control.Write($commandBytes, 0, $commandBytes.Length)
        $control.Flush()
      } catch {
        Write-Host ('No stop control for PID ' + $previewPid + '; stopping the verified project process directly.')
      } finally { $control.Dispose() }
      if (!$ownedProcess.WaitForExit(3000)) { Stop-Process -InputObject $ownedProcess -ErrorAction Stop }
      if (!$ownedProcess.WaitForExit(5000)) { throw ('Timed out stopping PID ' + $previewPid) }
    }
    $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.OwningProcess -eq $previewPid })
    if ($remaining.Count) { throw ('Preview PID ' + $previewPid + ' still has listening ports.') }
    Write-Host ('Stopped PID ' + $previewPid + '. Its listening ports have been released.')
  }
  if (!$matchedPreview) { Write-Host 'No preview is running for the requested project port.' }
  elseif ($Status) { Write-Host 'To stop these previews, double-click stop-editor.cmd.' }
  elseif ($Port) { Write-Host ('Project preview servers on port ' + $Port + ' have stopped.') }
  else { Write-Host 'All preview servers for this project have stopped.' }
  exit 0
} catch {
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
