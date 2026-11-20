Write-Output '=== build processes ==='
Get-Process -Name 'cargo','rustc','node','vision-machine' -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | Format-Table | Out-String | Write-Output
Write-Output '=== last lines of the tauri build log ==='
$log = 'C:\Users\user\AppData\Local\Temp\vm_msi.log'
if (Test-Path $log) {
  (Get-Content $log)[-12..-1] | ForEach-Object { Write-Output $_ }
} else {
  Write-Output 'log not found'
}
