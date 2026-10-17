[CmdletBinding()]
param(
  [ValidateRange(5,60)][int]$Seconds = 30,
  [string]$DeviceSerial,
  [string]$AdbPath,
  [string]$OutputPath
)

# Read-only diagnostics apart from a temporary Android log-level property.
# Does not build, install, tap controls, change permissions, clear logs, send
# emails, or access Supabase. App names in this local trace may be private.
$ErrorActionPreference = 'Stop'
if (-not $AdbPath) {
  $installedAdb = Get-Command adb -ErrorAction SilentlyContinue
  if ($installedAdb) { $AdbPath = $installedAdb.Source }
  else { $AdbPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
}
if (-not (Test-Path -LiteralPath $AdbPath)) { throw 'ADB not found. Pass the Android SDK adb.exe path with -AdbPath.' }
$devices = @(& $AdbPath devices)
if ($LASTEXITCODE -ne 0) { throw 'Could not list Android devices.' }
$authorized = @($devices | ForEach-Object { if ($_ -match '^(\S+)\s+device(?:\s|$)') { $matches[1] } })
if ($DeviceSerial) {
  if ($DeviceSerial -notin $authorized) { throw 'The selected phone is not connected and authorized for USB debugging.' }
} elseif ($authorized.Count -eq 1) { $DeviceSerial = $authorized[0] }
else { throw 'Connect and authorize one Android phone, or choose it with -DeviceSerial.' }
$deviceArgs = @('-s', $DeviceSerial)
$tag = 'LifeRPGProtection'
$property = 'log.tag.' + $tag
$previousLevel = ((& $AdbPath @deviceArgs shell getprop $property) -join '').Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read the phone logging setting.' }
$marker = 'capture-start-' + [Guid]::NewGuid().ToString('N')
if (-not $OutputPath) { $OutputPath = Join-Path ([IO.Path]::GetTempPath()) ('liferpg-protection-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log') }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
try {
  & $AdbPath @deviceArgs shell setprop $property DEBUG
  if ($LASTEXITCODE -ne 0) { throw 'Could not enable opt-in protection logging.' }
  & $AdbPath @deviceArgs shell log -p d -t $tag $marker
  if ($LASTEXITCODE -ne 0) { throw 'Could not mark the capture window.' }
  Write-Output 'Use the native repair build with event logging included. Start a protected session and open a blocked app.'
  Write-Output 'During this capture: partially swipe up and cancel; open Recents and return; then go Home. Do not call emergency numbers.'
  for ($remaining = $Seconds; $remaining -gt 0; $remaining--) {
    Write-Progress -Activity 'Capturing protection gesture events locally' -Status "$remaining seconds remaining" -PercentComplete ((1 - $remaining / $Seconds) * 100)
    Start-Sleep -Seconds 1
  }
  $lines = @(& $AdbPath @deviceArgs logcat -d -v threadtime -s 'LifeRPGProtection:D' '*:S')
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the phone event log.' }
  $start = -1
  for ($index = 0; $index -lt $lines.Count; $index++) { if ($lines[$index].Contains($marker)) { $start = $index } }
  if ($start -lt 0) { throw 'Capture marker was not returned; no older event history has been saved.' }
  $captured = @($lines | Select-Object -Skip ($start + 1))
  [IO.File]::WriteAllLines($OutputPath, [string[]]$captured, [Text.UTF8Encoding]::new($false))
  Write-Output "Trace saved locally: $OutputPath"
  if (-not ($captured -match 'event type=')) { Write-Warning 'No native usage events were captured. Check the installed build and repeat while a protected session is covering an app.' }
} finally {
  $restoreLevel = if ($previousLevel) { $previousLevel } else { 'INFO' }
  & $AdbPath @deviceArgs shell setprop $property $restoreLevel
  Write-Progress -Activity 'Capturing protection gesture events locally' -Completed
}
