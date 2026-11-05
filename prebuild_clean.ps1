$p = Get-Process -Id 22520 -ErrorAction SilentlyContinue
if ($p) { $p | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Output 'killed 22520' }
# Belt-and-braces: any remaining node/cargo/rustc from orphaned builds
Get-Process -Name 'node','cargo','rustc','nupkg','makensis','vision-machine' -ErrorAction SilentlyContinue | ForEach-Object {
  try { $_ | Stop-Process -Force } catch {}
  Write-Output ('killed ' + $_.ProcessName + ' ' + $_.Id)
}
Start-Sleep -Seconds 2
$left = Get-Process -Name 'node','cargo','rustc','vision-machine' -ErrorAction SilentlyContinue
if ($left) { $left | ForEach-Object { Write-Output ('STILL: ' + $_.ProcessName + ' ' + $_.Id) } } else { Write-Output 'all clean, safe to build' }
