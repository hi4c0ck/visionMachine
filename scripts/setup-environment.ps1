# VisionMachine Build Environment Setup
# This script ensures proper PATH configuration

Write-Host "=== Setting up VisionMachine Build Environment ===" -ForegroundColor Cyan
Write-Host ""

# Define tool paths
$cargoBin = "C:\Users\user\.cargo\bin"
$npmGlobal = "C:\Users\user\AppData\Roaming\npm"
$nodePath = "C:\Program Files\nodejs"

# Add to current session PATH (cmd-style executables first)
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$toolsPaths = @($cargoBin, $npmGlobal, $nodePath)

foreach ($toolPath in $toolsPaths) {
    if ($toolPath -notin $currentPath.Split(';')) {
        $newPath = $toolPath + ";" + $currentPath
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Host "[OK] Added $toolPath to PATH" -ForegroundColor Green
    } else {
        Write-Host "[OK] $toolPath already in PATH" -ForegroundColor Gray
    }
}

# Also set for current process
$env:PATH = $toolsPaths -join ";" + ";" + $env:PATH

Write-Host ""
Write-Host "Verifying installations..." -ForegroundColor Cyan
Write-Host ""

# Verify each tool
$checks = @(
    @{ Name="rustc"; Path="$cargoBin\rustc.exe" },
    @{ Name="cargo"; Path="$cargoBin\cargo.exe" },
    @{ Name="node"; Path="$nodePath\node.exe" },
    @{ Name="npm"; Path="$nodePath\npm.cmd" },
    @{ Name="tauri"; Path="$npmGlobal\tauri.cmd" }
)

$allGood = $true
foreach ($check in $checks) {
    if (Test-Path $check.Path) {
        Write-Host "[OK] $($check.Name): $($check.Path)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $($check.Name): Not found at $($check.Path)" -ForegroundColor Red
        $allGood = $false
    }
}

Write-Host ""
if ($allGood) {
    Write-Host "=== Environment Ready! ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "To use in new terminals:" -ForegroundColor Yellow
    Write-Host "  1. Close this terminal" -ForegroundColor White
    Write-Host "  2. Open a NEW terminal" -ForegroundColor White
    Write-Host "  3. Run: cd D:\work\horizonsMachine\VisionMachine" -ForegroundColor White
    Write-Host "  4. Then: cargo tauri dev" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "=== Some tools missing ===" -ForegroundColor Red
    Write-Host "Please install the missing components." -ForegroundColor Yellow
}
