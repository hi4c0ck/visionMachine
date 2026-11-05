# Launch the tauri build DETACHED (survives any shell timeout), poll by MSI timestamp.
Set-Location D:\work\horizonsMachine\VisionMachine
if ($env:CI) { Remove-Item Env:CI }

$buildScript = @"
Set-Location D:\work\horizonsMachine\VisionMachine
if ($env:CI) { Remove-Item Env:CI }
npx tauri build 2>&1 | Out-File -Encoding utf8 C:\Users\user\AppData\Local\Temp\vm_msi.log
\$code = `\$LASTEXITCODE
Add-Content -Path C:\Users\user\AppData\Local\Temp\vm_msi.log -Value ("BUILD_EXIT=" + `\$code)
"@

$psFile = 'D:\work\horizonsMachine\VisionMachine\_detached_build.ps1'
Set-Content -Path $psFile -Value $buildScript -Encoding ascii

# Detach: -WindowStyle Hidden + a NEW process that is NOT a child of this shell,
# so the parent's timeout cannot take it down.
$proc = Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-NonInteractive','-File',$psFile -WindowStyle Hidden -PassThru
Write-Output ('detached build pid ' + $proc.Id)
Write-Output 'polling every 60 s for the MSI timestamp to advance (up to 18 min)…'

$msiPath = 'D:\work\horizonsMachine\VisionMachine\src-tauri\target\release\bundle\msi\VisionMachine_0.7.10_x64_en-US.msi'
$stale = (Get-Item $msiPath).LastWriteTime
$deadline = (Get-Date).AddMinutes(18)
$progress = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 60
  $progress += 1
  $cur = (Get-Item $msiPath).LastWriteTime
  if ($cur -gt $stale) {
    Write-Output ('MSI finished at ' + $cur + ' after ~' + $progress + ' min')
    $log = Get-Content 'C:\Users\user\AppData\Local\Temp\vm_msi.log'
    ($log | Select-String -Pattern 'BUILD_EXIT|error\[|error:|Built|\.msi' | Select-Object -Last 10) | ForEach-Object { Write-Output $_.Line }
    break
  }
  # Abort if the detached process died without producing the MSI.
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -and $progress -ge 2) {
    $log = Get-Content 'C:\Users\user\AppData\Local\Temp\vm_msi.log' -ErrorAction SilentlyContinue
    Write-Output 'detached build process exited early; log tail:'
    ($log | Select-Object -Last 15) | ForEach-Object { Write-Output $_ }
    break
  }
}

Remove-Item $psFile -ErrorAction SilentlyContinue
$final = Get-Item $msiPath
Write-Output ('FINAL MSI: ' + $final.Name + '  ' + [math]::Round($final.Length/1MB,2) + ' MB  ' + $final.LastWriteTime)
$exe = Get-Item 'D:\work\horizonsMachine\VisionMachine\src-tauri\target\release\vision-machine.exe'
Write-Output ('FINAL EXE: ' + $exe.Name + '  ' + [math]::Round($exe.Length/1MB,2) + ' MB  ' + $exe.LastWriteTime)
