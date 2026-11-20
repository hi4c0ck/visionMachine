Write-Output '=== killing stray node processes from orphaned builds (0:17 batch) ==='
$procs = Get-Process -Name 'node' -ErrorAction SilentlyContinue
foreach ($p in $procs) {
  Write-Output ('killing node pid ' + $p.Id + ' (started ' + $p.StartTime + ')')
  $p | Stop-Process -Force -ErrorAction SilentlyContinue
}
Write-Output '=== killing any cargo/rustc/makensis/nupkg ==='
Get-Process -Name 'cargo','rustc','makensis','nupkg' -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ('killing ' + $_.ProcessName + ' pid ' + $_.Id)
  $_ | Stop-Process -Force -ErrorAction SilentlyContinue
}
Write-Output '=== confirm clean ==='
$left = Get-Process -Name 'node','cargo','rustc','vision-machine' -ErrorAction SilentlyContinue
if ($left) { $left | ForEach-Object { Write-Output ('still: ' + $_.ProcessName + ' ' + $_.Id) } } else { Write-Output 'all clean' }
Remove-Item D:\work\horizonsMachine\VisionMachine\probe.ps1, D:\work\horizonsMachine\VisionMachine\wait_msi.ps1, D:\work\horizonsMachine\VisionMachine\_detached_build.ps1 -ErrorAction SilentlyContinue
Write-Output 'scratch scripts cleaned'
