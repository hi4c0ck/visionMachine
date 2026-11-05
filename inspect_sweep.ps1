Set-Location D:\work\horizonsMachine\VisionMachine
Write-Output '=== 1/4 SVELTE CHECK ==='
npm run check 2>&1 | Select-String -Pattern 'svelte-check found' | ForEach-Object { Write-Output $_.Line }
Write-Output '=== 2/4 VITEST ==='
npx vitest run 2>&1 | Out-File -Encoding utf8 C:\Users\user\AppData\Local\Temp\vm_vitest.log
Write-Output ('VITEST EXIT: ' + $LASTEXITCODE)
Select-String -Path C:\Users\user\AppData\Local\Temp\vm_vitest.log -Pattern 'Test Files|Tests ' | Select-Object -Last 2 | ForEach-Object { Write-Output $_.Line }
Write-Output '=== 3/4 CARGO TEST --lib ==='
Set-Location D:\work\horizonsMachine\VisionMachine\src-tauri
cargo test --lib 2>&1 | Out-File -Encoding utf8 C:\Users\user\AppData\Local\Temp\vm_cargo.log
Write-Output ('CARGO EXIT: ' + $LASTEXITCODE)
Select-String -Path C:\Users\user\AppData\Local\Temp\vm_cargo.log -Pattern 'test result|error' | ForEach-Object { Write-Output $_.Line }
Write-Output '=== 4/4 BUILD STATE ==='
Set-Location D:\work\horizonsMachine\VisionMachine
$msi = Get-Item 'src-tauri\target\release\bundle\msi\VisionMachine_0.7.10_x64_en-US.msi' -ErrorAction SilentlyContinue
Write-Output ('MSI: ' + $msi.LastWriteTime + '  ' + [math]::Round($msi.Length/1MB,2) + ' MB')
