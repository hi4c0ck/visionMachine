Set-Location D:\work\horizonsMachine\VisionMachine
if () { Remove-Item Env:CI }
npx tauri build 2>&1 | Out-File -Encoding utf8 C:\Users\user\AppData\Local\Temp\vm_msi.log
\ = \
Add-Content -Path C:\Users\user\AppData\Local\Temp\vm_msi.log -Value ("BUILD_EXIT=" + \)
