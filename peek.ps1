Write-Output '=== ALL setInterval / setTimeout loops in components ==='
$hits = Get-ChildItem -Path 'D:\work\horizonsMachine\VisionMachine\src' -Recurse -Include *.svelte,*.ts -File | Select-String -Pattern 'setInterval'
foreach ($h in $hits) { Write-Output ($h.Path.Replace('D:\work\horizonsMachine\VisionMachine\','') + ':' + $h.LineNumber + ': ' + $h.Line.Trim()) }
Write-Output ''
Write-Output '=== RamMonitor render in Workspace? ==='
Select-String -Path 'D:\work\horizonsMachine\VisionMachine\src\components\Workspace.svelte' -Pattern 'RamMonitor' | ForEach-Object { Write-Output ($_.LineNumber + ': ' + $_.Line.Trim()) }
